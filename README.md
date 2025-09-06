# PDF Q&A Application

**IMPORTANT:** To understand, download, and run this code, please read this README file fully. All setup instructions and a summary of the approach are included below.

A Next.js 14 application that enables users to upload PDF documents and ask questions about their content using AI-powered Retrieval-Augmented Generation (RAG).

## Features

- **PDF Upload & Processing**: Upload PDF files up to 20MB, extract text content
- **Intelligent Chunking**: Token-aware text chunking with overlap for better context retention
- **Vector Embeddings**: Uses OpenAI's `text-embedding-3-small` model for semantic search
- **Flexible Vector Storage**: 
  - Pinecone for production (when configured)
  - Local JSON storage for development
- **RAG Q&A**: Ask questions and receive answers with source citations
- **Bearer Token Authentication**: Secure API endpoints
- **Responsive UI**: Clean, modern interface built with Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, or pnpm
- OpenAI API key

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
# or
pnpm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values:

```env
OPENAI_API_KEY=your_openai_api_key_here
API_AUTH_TOKEN=your_secure_auth_token_here

# Optional: For Pinecone (production vector storage)
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_ENVIRONMENT=your_pinecone_environment_here
PINECONE_INDEX=your_pinecone_index_name_here
```

3. Start the development server:

```bash
npm run dev
# or
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Authentication

1. Enter your API authentication token (the value you set for `API_AUTH_TOKEN`)
2. Click "Connect" to authenticate

### Upload PDF

1. Select a PDF file (up to 20MB)
2. Click "Upload & Process"
3. Wait for the system to extract text, create chunks, and generate embeddings

### Ask Questions

1. After successful upload, enter your question in the text field
2. Click "Ask" to get an AI-generated answer
3. View the answer along with source citations from the document

## API Endpoints

### POST /api/upload

Upload and process a PDF file.

**Headers:**
- `Authorization: Bearer <your_auth_token>`

**Body:** FormData with `file` field containing the PDF

**Response:**
```json
{
  "success": true,
  "namespace": "document-identifier",
  "chunks": 25,
  "vectorCount": 25,
  "metadata": {
    "filename": "document.pdf",
    "numPages": 10
  }
}
```

### POST /api/ask

Ask a question about an uploaded document.

**Headers:**
- `Authorization: Bearer <your_auth_token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "namespace": "document-identifier",
  "question": "What is the main topic?",
  "topK": 5
}
```

**Response:**
```json
{
  "answer": "The main topic is...",
  "citations": [
    {
      "id": "document-chunk-1",
      "text": "Relevant text excerpt..."
    }
  ],
  "metadata": {
    "chunksFound": 5,
    "citationsUsed": 2
  }
}
```

## Vector Storage Options

### Local JSON Storage (Default)

- Stores vectors in `./data/vectors/<namespace>.json`
- Uses in-memory cosine similarity for querying
- Suitable for development and small datasets

### Pinecone (Production)

- Cloud-based vector database
- Optimized for large-scale vector operations
- Automatically enabled when Pinecone environment variables are provided

## Technical Details

### Text Processing

- **PDF Parsing**: Uses `pdf-parse` library to extract text from uploaded PDFs
- **Chunking**: Token-aware chunking (800-1200 tokens per chunk) with 100-150 token overlap
- **Fallback**: Character-based chunking when `js-tiktoken` is unavailable

### Security

- Bearer token authentication for all API endpoints
- File type validation (PDF only)
- File size limits (20MB maximum)
- Input sanitization and validation

### Error Handling

- Comprehensive error handling for PDF processing failures
- Rate limiting protection with exponential backoff
- Detailed error messages in development mode

## Limitations

- **No OCR Support**: Cannot extract text from scanned PDFs or images
- **Text-Only**: Does not process images, tables, or complex formatting
- **Memory Usage**: Large documents may require significant memory for processing
- **Rate Limits**: Subject to OpenAI API rate limits

## Development

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── upload/route.ts    # PDF upload endpoint
│   │   └── ask/route.ts       # Q&A endpoint
│   └── page.tsx               # Main UI
├── lib/
│   └── auth.ts                # Authentication helpers
└── services/
    ├── pdfService.ts          # PDF processing
    ├── embeddingService.ts    # Text chunking & embeddings
    └── vectorStore.ts         # Vector storage implementations
```

### Running Tests

```bash
npm test
# or
pnpm test
```

### Building for Production

```bash
npm run build
# or
pnpm build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
