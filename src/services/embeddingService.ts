import { OpenAI } from 'openai';

export interface TextChunk {
  id: string;
  text: string;
  tokens: number;
}

export interface EmbeddingResult {
  embedding: number[];
  chunkId: string;
}

/**
 * Service for text chunking and embedding generation
 */
export class EmbeddingService {
  private openai: OpenAI;
  private readonly model = 'text-embedding-3-small';
  private readonly maxTokensPerChunk = 1000;
  private readonly overlapTokens = 150;
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Split text into chunks with token-aware chunking
   */
  public async chunkText(text: string, source: string): Promise<TextChunk[]> {
    try {
      // Try to use js-tiktoken for accurate token counting
      const tiktoken = await import('js-tiktoken');
      const encoder = tiktoken.encodingForModel('text-embedding-ada-002');
      
      return this.chunkWithTokenizer(text, source, encoder.encode.bind(encoder));
    } catch (error) {
      console.warn('js-tiktoken not available, falling back to character-based chunking:', error);
      return this.chunkWithCharacters(text, source);
    }
  }

  /**
   * Token-aware chunking using js-tiktoken
   */
  private chunkWithTokenizer(
    text: string, 
    source: string, 
    tokenize: (text: string) => number[]
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const sentenceTokens = tokenize(sentence).length;
      
      if (currentTokens + sentenceTokens > this.maxTokensPerChunk && currentChunk) {
        // Save current chunk
        chunks.push({
          id: `${source}-chunk-${chunkIndex}`,
          text: currentChunk.trim(),
          tokens: currentTokens
        });
        
        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.overlapTokens / 4)); // Rough estimate
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
        currentTokens = tokenize(currentChunk).length;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentTokens += sentenceTokens;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `${source}-chunk-${chunkIndex}`,
        text: currentChunk.trim(),
        tokens: currentTokens
      });
    }

    return chunks;
  }

  /**
   * Character-based chunking fallback
   */
  private chunkWithCharacters(text: string, source: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const maxChars = 3500; // Rough estimate for 1000 tokens
    const overlapChars = 600; // Rough estimate for 150 tokens
    
    let chunkIndex = 0;
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxChars, text.length);
      
      // Find sentence boundary to avoid cutting mid-sentence
      if (end < text.length) {
        const lastSentenceEnd = text.lastIndexOf('.', end);
        if (lastSentenceEnd > start) {
          end = lastSentenceEnd + 1;
        }
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        chunks.push({
          id: `${source}-chunk-${chunkIndex}`,
          text: chunkText,
          tokens: Math.ceil(chunkText.length / 3.5) // Rough token estimate
        });
      }

      start = Math.max(start + 1, end - overlapChars);
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Generate embeddings for chunks with batch processing and retry logic
   */
  public async generateEmbeddings(chunks: TextChunk[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const batchSize = 100; // OpenAI's batch limit

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchResults = await this.processBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Process a batch of chunks with retry logic
   */
  private async processBatch(chunks: TextChunk[]): Promise<EmbeddingResult[]> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: chunks.map(chunk => chunk.text),
        });

        if (response.data.length !== chunks.length) {
          throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${response.data.length}`);
        }

        return response.data.map((embedding, index) => ({
          embedding: embedding.embedding,
          chunkId: chunks[index].id
        }));

      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          throw error;
        }

        // Check if it's a rate limit error
        if (error instanceof Error && error.message.includes('429')) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.warn(`Rate limited, retrying in ${delay}ms...`);
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw new Error('Failed to process batch after all retries');
  }

  /**
   * Generate embedding for a single query
   */
  public async generateQueryEmbedding(query: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: query,
    });

    return response.data[0].embedding;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
