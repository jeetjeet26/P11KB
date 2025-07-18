# Knowledge Base Service

A document processing and vector storage service that enables intelligent content retrieval through semantic search.

## Features

- **Document Upload**: Support for PDF, DOCX, TXT, JPG, PNG files (up to 15MB)
- **Text Extraction**: OCR for images, text parsing for documents
- **Semantic Chunking**: Intelligent text segmentation with overlap for better context
- **Vector Embeddings**: OpenAI embeddings for semantic search
- **Manual Intake**: Direct text input for quick content addition
- **Client Management**: Multi-tenant document organization

## Architecture

This service focuses solely on knowledge base creation and management:
- Document upload and text extraction
- Semantic chunking with improved overlap strategy
- Vector embedding generation
- Storage in Supabase vector database
- Client asset management

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create `.env.local` with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_api_key
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```
   Runs on http://localhost:3000

## API Routes

- `POST /api/process` - Process documents or manual text input

## Edge Functions

- `process-document` - Supabase Edge Function for semantic chunking and embedding

## Database Tables

- `clients` - Client information
- `sources` - Document metadata and tracking
- `chunks` - Semantic text chunks with vector embeddings

## Supported File Types

- **PDF**: Full text extraction (up to 15MB)
- **DOCX**: Microsoft Word documents
- **TXT**: Plain text files
- **JPG/PNG**: OCR text extraction using Tesseract.js

## Chunking Strategy

- **Semantic Boundaries**: Splits on paragraphs and sentences
- **Size Constraints**: 100-1000 character chunks
- **Overlap**: 150-character overlap between chunks
- **Deduplication**: Removes similar chunks (95% threshold)

## Integration

This service provides the knowledge base for:
- Campaign generation services
- Content management systems
- AI-powered search applications

The vector database can be queried by external services using the `match_chunks` RPC function.

## Technology Stack

- **Framework**: Next.js 14
- **Database**: Supabase (PostgreSQL + pgvector)
- **File Processing**: pdf-parse, mammoth, tesseract.js
- **Embeddings**: OpenAI text-embedding-3-small
- **Styling**: Tailwind CSS
- **Language**: TypeScript 