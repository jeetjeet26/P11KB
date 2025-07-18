# Campaign Service

A focused campaign generation service that creates marketing copy using AI and retrieval-augmented generation (RAG).

## Features

- **Campaign Generation**: Create Facebook ads, Google search ads, email newsletters, and social media posts
- **AI-Powered Copy**: Uses OpenAI Assistant API for intelligent content generation
- **Context-Aware**: Retrieves relevant context from knowledge base for personalized campaigns
- **Campaign Management**: Store and manage generated campaigns

## Architecture

This service connects to the same Supabase database as the Knowledge Base Service to:
- Query vector embeddings for relevant content chunks
- Store generated campaigns in the `campaigns` table
- Access client information for context

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
   OPENAI_ASSISTANT_ID=your_openai_assistant_id
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```
   Runs on http://localhost:3001

## API Routes

- `POST /api/campaigns/generate` - Generate new campaign copy

## Database Tables Used

- `chunks` - Vector embeddings for context retrieval (read-only)
- `sources` - Document metadata (read-only)
- `clients` - Client information (read-only)
- `campaigns` - Generated campaigns (read/write)

## Integration

This service is designed to work alongside the Knowledge Base Service:
- Knowledge Base handles document upload and processing
- Campaign Service handles content generation using the processed knowledge
- Both services share the same Supabase database

## Technology Stack

- **Framework**: Next.js 14
- **Database**: Supabase (PostgreSQL + Vector)
- **AI**: OpenAI Assistant API
- **Styling**: Tailwind CSS
- **Language**: TypeScript 