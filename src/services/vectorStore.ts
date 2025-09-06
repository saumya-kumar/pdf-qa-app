import { Pinecone } from '@pinecone-database/pinecone';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredChunk {
  id: string;
  text: string;
  source: string;
  embedding: number[];
}

export interface VectorStore {
  upsertMany(namespace: string, items: StoredChunk[]): Promise<void>;
  query(namespace: string, embedding: number[], topK: number): Promise<StoredChunk[]>;
}

/**
 * Pinecone-based vector store implementation
 */
export class PineconeVectorStore implements VectorStore {
  private pinecone: Pinecone;
  private indexName: string;

  constructor(apiKey: string, environment: string, indexName: string) {
    this.pinecone = new Pinecone({
      apiKey
    });
    this.indexName = indexName;
  }

  async upsertMany(namespace: string, items: StoredChunk[]): Promise<void> {
    const index = this.pinecone.index(this.indexName);
    
    // Convert to Pinecone format
    const vectors = items.map(item => ({
      id: item.id,
      values: item.embedding,
      metadata: {
        text: item.text,
        source: item.source
      }
    }));

    // Batch upsert (Pinecone handles batching internally)
    await index.namespace(namespace).upsert(vectors);
  }

  async query(namespace: string, embedding: number[], topK: number): Promise<StoredChunk[]> {
    const index = this.pinecone.index(this.indexName);
    
    const queryResponse = await index.namespace(namespace).query({
      vector: embedding,
      topK,
      includeMetadata: true
    });

    return queryResponse.matches?.map(match => ({
      id: match.id,
      text: match.metadata?.text as string || '',
      source: match.metadata?.source as string || '',
      embedding: [] // Not returned by Pinecone queries
    })) || [];
  }
}

/**
 * Local JSON-based vector store implementation for development
 */
export class LocalJsonVectorStore implements VectorStore {
  private dataDir: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data', 'vectors');
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private getNamespaceFile(namespace: string): string {
    return path.join(this.dataDir, `${namespace}.json`);
  }

  async upsertMany(namespace: string, items: StoredChunk[]): Promise<void> {
    const filePath = this.getNamespaceFile(namespace);
    
    // Load existing data
    let existingData: StoredChunk[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch (error) {
        console.warn(`Failed to read existing data for namespace ${namespace}:`, error);
      }
    }

    // Merge with new items (replace if ID exists)
    const existingIds = new Set(existingData.map(item => item.id));
    const newItems = items.filter(item => !existingIds.has(item.id));
    const updatedItems = existingData.map(existing => {
      const update = items.find(item => item.id === existing.id);
      return update || existing;
    });

    const finalData = [...updatedItems, ...newItems];

    // Save to file
    fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2));
  }

  async query(namespace: string, embedding: number[], topK: number): Promise<StoredChunk[]> {
    const filePath = this.getNamespaceFile(namespace);
    
    if (!fs.existsSync(filePath)) {
      return [];
    }

    let data: StoredChunk[];
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(fileContent);
    } catch (error) {
      console.error(`Failed to read namespace ${namespace}:`, error);
      return [];
    }

    // Calculate cosine similarity for each item
    const similarities = data.map(item => ({
      item,
      similarity: this.cosineSimilarity(embedding, item.embedding)
    }));

    // Sort by similarity (descending) and return top-k
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities
      .slice(0, topK)
      .map(result => result.item);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

/**
 * Factory function to create the appropriate vector store based on environment
 */
export function createVectorStore(): VectorStore {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const pineconeEnvironment = process.env.PINECONE_ENVIRONMENT;
  const pineconeIndex = process.env.PINECONE_INDEX;

  if (pineconeApiKey && pineconeEnvironment && pineconeIndex) {
    console.log('Using Pinecone vector store');
    return new PineconeVectorStore(pineconeApiKey, pineconeEnvironment, pineconeIndex);
  } else {
    console.log('Using local JSON vector store');
    return new LocalJsonVectorStore();
  }
}
