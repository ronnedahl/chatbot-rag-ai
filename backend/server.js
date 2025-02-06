import express from 'express';
import cors from 'cors';
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as cheerio from 'cheerio';
import axios from 'axios';
import dotenv from 'dotenv';
import { FirebaseVectorStore } from './firebaseVectorStore.js';
import { firebaseConfig } from './firebaseConfig.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4",
  temperature: 0.7,
  maxTokens: 500
});

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
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

async function initializeVectorStore(content, sourceType, sourceUrl = '') {
  try {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const metadata = sourceType === 'url' ? { source: sourceUrl } : { source: 'text-input' };
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

app.post('/api/load-documents', async (req, res) => {
  try {
    const { content, type, url } = req.body;
    let documentContent;

    if (type === 'url') {
      if (!url) {
        return res.status(400).json({ error: 'URL is required for type "url"' });
      }
      documentContent = await fetchUrlContent(url);
    } else {
      if (!content) {
        return res.status(400).json({ error: 'Content is required for type "text"' });
      }
      documentContent = content;
    }

    await initializeVectorStore(documentContent, type, url);
    res.json({ 
      message: 'Documents loaded successfully',
      source: type === 'url' ? url : 'text input'
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

    const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());
    const response = await chain.call({
      query: question,
    });

    res.json({ answer: response.text });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});