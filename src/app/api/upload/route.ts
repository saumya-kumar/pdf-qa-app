import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthErrorResponse } from '@/lib/auth';
import { PdfService, validatePdfFile } from '@/services/pdfService';
import { EmbeddingService } from '@/services/embeddingService';
import { createVectorStore } from '@/services/vectorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    console.log('Upload route called');
    
    // Validate authentication
    const authError = requireAuth(req);
    if (authError) {
      console.log('Auth failed:', authError);
      return createAuthErrorResponse(authError);
    }

    console.log('Auth passed, processing form data');
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      console.log('No file provided');
      return NextResponse.json({ error: 'PDF file required' }, { status: 400 });
    }

    console.log(`File received: ${file.name}, size: ${file.size}, type: ${file.type}`);

    // Validate file type and size
    try {
      validatePdfFile(file);
      console.log('File validation passed');
    } catch (error) {
      console.log('File validation failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'File validation failed' },
        { status: 400 }
      );
    }

    console.log('Converting file to buffer');
    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);
    console.log(`Buffer created: ${buffer.length} bytes`);

    // Optional: quick header check to avoid non-PDFs
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      console.log('Invalid PDF header detected');
      return NextResponse.json({ error: 'Invalid PDF' }, { status: 400 });
    }

    console.log('Calling PdfService.processPdfBuffer');
    const text = await PdfService.processPdfBuffer(buffer, file.name);
    console.log(`Text extracted successfully: ${text.length} characters`);

    // Validate OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Create namespace from filename and timestamp
    const timestamp = Date.now();
    const sanitizedFilename = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '-')
      .replace(/\.pdf$/i, '');
    const namespace = `${sanitizedFilename}-${timestamp}`;

    console.log(`Created namespace: ${namespace}`);

    // Initialize services
    const embeddingService = new EmbeddingService(openaiApiKey);
    const vectorStore = createVectorStore();

    // Chunk the text
    console.log('Chunking text');
    const chunks = await embeddingService.chunkText(text, namespace);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'No text chunks could be extracted from the PDF' },
        { status: 400 }
      );
    }

    console.log(`Created ${chunks.length} chunks`);

    // Generate embeddings
    console.log('Generating embeddings');
    const embeddingResults = await embeddingService.generateEmbeddings(chunks);
    console.log(`Generated ${embeddingResults.length} embeddings`);

    // Prepare data for vector store
    const storedChunks = embeddingResults.map((result, index) => ({
      id: result.chunkId,
      text: chunks[index].text,
      source: file.name,
      embedding: result.embedding
    }));

    // Store in vector database
    console.log('Storing in vector database');
    await vectorStore.upsertMany(namespace, storedChunks);
    console.log('Storage complete');

    // Return success response
    return NextResponse.json({
      ok: true,
      length: text.length,
      success: true,
      namespace,
      chunks: chunks.length,
      vectorCount: embeddingResults.length,
      metadata: {
        filename: file.name,
        textLength: text.length
      }
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Upload failed with error:', e);
    console.error('Error stack:', e instanceof Error ? e.stack : 'No stack');
    return NextResponse.json({ error: `Failed to process upload: ${msg}` }, { status: 500 });
  }
}
