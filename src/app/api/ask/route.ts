import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { requireAuth, createAuthErrorResponse } from '@/lib/auth';
import { EmbeddingService } from '@/services/embeddingService';
import { createVectorStore } from '@/services/vectorStore';

// Force Node.js runtime
export const runtime = 'nodejs';

interface AskRequest {
  namespace: string;
  question: string;
  topK?: number;
}

interface Citation {
  id: string;
  text: string;
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const authError = requireAuth(request);
    if (authError) {
      return createAuthErrorResponse(authError);
    }

    // Validate OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    let body: AskRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { namespace, question, topK = 5 } = body;

    // Validate required fields
    if (!namespace || !question) {
      return NextResponse.json(
        { error: 'Missing required fields: namespace and question' },
        { status: 400 }
      );
    }

    if (typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: 'Question must be a non-empty string' },
        { status: 400 }
      );
    }

    if (topK <= 0 || topK > 20) {
      return NextResponse.json(
        { error: 'topK must be between 1 and 20' },
        { status: 400 }
      );
    }

    // Initialize services
    const embeddingService = new EmbeddingService(openaiApiKey);
    const vectorStore = createVectorStore();
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Generate embedding for the question
    const questionEmbedding = await embeddingService.generateQueryEmbedding(question);

    // Query vector store for relevant chunks
    const relevantChunks = await vectorStore.query(namespace, questionEmbedding, topK);

    if (relevantChunks.length === 0) {
      return NextResponse.json(
        { 
          answer: "I don't have enough information to answer that question. Please make sure you've uploaded a relevant PDF document.",
          citations: []
        }
      );
    }

    // Build context for RAG
    const context = relevantChunks
      .map((chunk) => `[${chunk.id}] ${chunk.text}`)
      .join('\n\n');

    // Create RAG prompt
    const systemPrompt = `You are a helpful assistant that answers questions based only on the provided context from uploaded PDF documents.

Instructions:
- Answer using ONLY the information provided in the context below
- If you cannot answer based on the context, say "I don't have enough information to answer that question"
- Always cite your sources by including the chunk ID in square brackets like [chunk-id]
- Be concise but comprehensive
- Do not make up information that isn't in the context`;

    const userPrompt = `Context from PDF documents:

${context}

Question: ${question}

Please answer the question based on the provided context and cite your sources.`;

    // Generate response using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const answer = completion.choices[0]?.message?.content || 'No response generated';

    // Extract citations from the answer
    const citationMatches = answer.match(/\[([^\]]+)\]/g) || [];
    const citedChunkIds = citationMatches.map(match => match.slice(1, -1));
    
    const citations: Citation[] = relevantChunks
      .filter(chunk => citedChunkIds.includes(chunk.id))
      .map(chunk => ({
        id: chunk.id,
        text: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : '')
      }));

    return NextResponse.json({
      answer,
      citations,
      metadata: {
        chunksFound: relevantChunks.length,
        citationsUsed: citations.length
      }
    });

  } catch (error) {
    console.error('Ask error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process question',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}
