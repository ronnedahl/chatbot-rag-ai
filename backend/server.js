// server.js
import express from 'express';
import cors from 'cors';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Ollama } from '@langchain/community/llms/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import * as cheerio from 'cheerio';
import axios from 'axios';
import dotenv from 'dotenv';
import multer from 'multer';
import { PDFExtract } from 'pdf.js-extract';
import { FirebaseVectorStore } from './firebaseVectorStore.js';
import { firebaseConfig } from './firebaseConfig.js';

dotenv.config();

const app = express();
const pdfExtract = new PDFExtract();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3003', 'http://localhost', 'http://localhost:80'],
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors());

app.use(express.json());
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Endast PDF-filer är tillåtna!'), false);
    }
  }
});

const model = new Ollama({
  baseUrl: "http://ollama:11434", 
  model: "mistral:latest",
  temperature: 0.1,
});

async function createPromptTemplate(context, query) {
  return `
[SYSTEM]
Du är en hjälpsam AI-assistent som svarar på svenska. Du är expert på att analysera information och ge koncisa, korrekta svar.
Använd ENBART informationen i kontexten för att besvara frågan. 
Om du inte hittar relevant information i kontexten, säg "Jag har inte tillräcklig information för att besvara denna fråga." 
Basera ditt svar endast på den givna kontexten och inte på tidigare kunskap.
Var specifik och ge direkta svar när möjligt.
[KONTEXT]
${context}

[FRÅGA]
${query}

[SVAR]
`;
}

const embeddings = new OllamaEmbeddings({
  baseUrl: "http://ollama:11434", 
});

let vectorStore;

async function fetchUrlContent(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    
    const text = $('body').text()
      .replace(/\s+/g, ' ')
      .trim();
    
    return text;
  } catch (error) {
    console.error('Error fetching URL:', error);
    throw new Error(`Failed to fetch content from URL: ${error.message}`);
  }
}

async function extractTextFromPDF(buffer) {
  try {
    const options = {};
    const data = await pdfExtract.extractBuffer(buffer, options);
    
    
    const text = data.pages
      .map(page => page.content.map(item => item.str).join(' '))
      .join('\n');
    
    return text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Kunde inte läsa PDF-filen. Kontrollera att filen är giltig.');
  }
}

async function initializeVectorStore(content, sourceType, sourceUrl = '') {
  try {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 100,
    });

    const metadata = {
      source: sourceType === 'url' ? sourceUrl : 
             sourceType === 'pdf' ? 'pdf-upload' : 
             'text-input'
    };

    const docs = await textSplitter.createDocuments([content], [metadata]);
    
    if (!vectorStore) {
      vectorStore = new FirebaseVectorStore(firebaseConfig, embeddings);
    }
    
    await vectorStore.addDocuments(docs);
    return vectorStore;
  } catch (error) {
    console.error('Error initializing vector store:', error);
    throw error;
  }
}


app.post('/api/load-documents', upload.single('file'), async (req, res) => {
  try {
    let documentContent;
    let sourceType = req.body.type;

    if (sourceType === 'pdf' && req.file) {
      
      documentContent = await extractTextFromPDF(req.file.buffer);
    } else if (sourceType === 'url') {
      
      if (!req.body.url) {
        return res.status(400).json({ error: 'URL is required for type "url"' });
      }
      documentContent = await fetchUrlContent(req.body.url);
    } else {
    
      if (!req.body.content) {
        return res.status(400).json({ error: 'Content is required for type "text"' });
      }
      documentContent = req.body.content;
    }

    await initializeVectorStore(
      documentContent, 
      sourceType, 
      sourceType === 'url' ? req.body.url : ''
    );

    res.json({
      message: 'Documents loaded successfully',
      source: sourceType === 'url' ? req.body.url : 
             sourceType === 'pdf' ? 'PDF upload' : 
             'text input'
    });
  } catch (error) {
    console.error('Error in /api/load-documents:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!vectorStore) {
      vectorStore = new FirebaseVectorStore(firebaseConfig, embeddings);
    }

   
    const retriever = vectorStore.asRetriever(4);
    const relevantDocs = await retriever.getRelevantDocuments(question);
    
   
    const context = relevantDocs
      .map(doc => doc.pageContent)
      .join('\n\n');

    
    const formattedPrompt = await createPromptTemplate(context, question);

    
    const response = await model.call(formattedPrompt);

    res.json({ answer: response });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Serverfel:', err.stack);
  res.status(500).json({ 
    error: 'Ett serverfel inträffade', 
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});