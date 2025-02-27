// mysqlVectorStore.js 
// firebaseVectorStore.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';

export class FirebaseVectorStore {
  constructor(firebaseConfig, embeddings) {
    const app = initializeApp(firebaseConfig);
    this.db = getFirestore(app);
    this.embeddings = embeddings;
    this.collectionName = 'document_embeddings';
  }

  async addDocuments(documents) {
    const documentEmbeddings = await this.embeddings.embedDocuments(
      documents.map(doc => doc.pageContent)
    );

    const batch = documents.map((doc, i) => ({
      content: doc.pageContent,
      embedding: documentEmbeddings[i],
      metadata: doc.metadata
    }));

    for (const item of batch) {
      await addDoc(collection(this.db, this.collectionName), item);
    }
  }

  async similaritySearch(query, k = 4) {
    // Get the embedding for the query
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    // Get all documents from Firebase
    const querySnapshot = await getDocs(collection(this.db, this.collectionName));
    
    // Calculate cosine similarity and sort results
    const results = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const similarity = this.cosineSimilarity(queryEmbedding, data.embedding);
      results.push({
        pageContent: data.content,
        metadata: data.metadata,
        similarity
      });
    });

    // Sort by similarity and return top k results
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .map(({ pageContent, metadata }) => ({
        pageContent,
        metadata
      }));
  }

  cosineSimilarity(vectorA, vectorB) {
    const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);
    const magnitudeA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  asRetriever(k = 4) {
    return {
      getRelevantDocuments: async (query) => this.similaritySearch(query, k)
    };
  }
}