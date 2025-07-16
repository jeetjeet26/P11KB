# P11KB - AI-Powered Ad Agency Knowledge Base v1.0

A production-ready internal knowledge base platform designed specifically for ad agencies to manage client information, assets, and documents using AI-powered vector embeddings and retrieval-augmented generation (RAG).

## 🚀 Features

### Core Functionality
- **Client Management**: Organize knowledge by individual clients
- **Document Processing**: Upload and process documents with semantic chunking
- **Manual Intake**: Add client onboarding information and brand guidelines
- **AI Copywriting**: Generate ad copy, headlines, and descriptions using client-specific context
- **Vector Search**: Semantic search through all client documents and information
- **Analytics Ready**: Designed to support Looker report analysis (future feature)

### AI Capabilities
- **OpenAI Integration**: Uses `text-embedding-3-small` for embeddings and `gpt-4o` for generation
- **RAG System**: Retrieval-Augmented Generation for contextually relevant responses
- **Semantic Search**: Find relevant information using meaning, not just keywords
- **Copy Generation**: Specialized prompts for ad agency use cases

## 🛠️ Technology Stack

### Frontend
- **Next.js 14** (App Router)
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Supabase Auth UI** for authentication

### Backend
- **Supabase** (PostgreSQL with pgvector extension)
- **Supabase Edge Functions** (Deno runtime)
- **Vector Database** for semantic search

### AI/ML
- **OpenAI API** (GPT-4o, text-embedding-3-small)
- **Vector Embeddings** for semantic similarity
- **RAG Architecture** for context-aware generation

### Document Processing
- **PDF parsing** with pdf-parse
- **Word document processing** with mammoth
- **OCR capabilities** with tesseract.js

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key

### 1. Clone the Repository
```bash
git clone https://github.com/jeetjeet26/P11KB.git
cd P11KB
```

### 2. Setup Supabase Project
1. Create a new project at [supabase.com](https://supabase.com)
2. Navigate to SQL Editor and run the database schema (see Database Schema section)
3. Deploy the Edge Functions from the `supabase/functions/` directory
4. Get your project URL and anon key from Project Settings > API

### 3. Setup Environment Variables
Create `.env.local` in the `ad-agency-kb` directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Set up Supabase Edge Function secrets:
- `SUPABASE_URL`: Your project URL
- `SUPABASE_ANON_KEY`: Your project anon key  
- `OPENAI_API_KEY`: Your OpenAI API key

### 4. Install Dependencies
```bash
cd ad-agency-kb
npm install
```

### 5. Run the Application
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

## 📖 Usage Guide

### Getting Started
1. **Authentication**: Sign in using the Supabase Auth UI (supports Google OAuth)
2. **Create Client**: Add a new client from the dashboard
3. **Add Knowledge**: Use manual intake to add client information
4. **Generate Copy**: Use the AI copywriter to create content based on client context

### Adding Client Knowledge
- **Manual Intake**: Paste onboarding information, brand guidelines, target audience details
- **Document Upload**: Upload PDFs, Word docs, or text files (processed automatically)
- **Web Crawling**: Add website URLs for automatic content extraction (future feature)

### Generating Copy
- Input natural language requests like:
  - "Write 5 Google Ad headlines for their new product launch"
  - "Create Facebook ad copy targeting millennials"
  - "Generate email newsletter content about their holiday sale"

## 🏗️ Project Structure

```
P11KB/
├── ad-agency-kb/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/                  # App Router pages
│   │   │   ├── api/              # API routes
│   │   │   ├── globals.css       # Global styles
│   │   │   ├── layout.tsx        # Root layout
│   │   │   └── page.tsx          # Main page
│   │   ├── components/           # React components
│   │   │   ├── ClientDashboard.tsx
│   │   │   └── ClientDetail.tsx
│   │   └── lib/                  # Utilities
│   │       └── supabase/         # Supabase clients
│   ├── package.json
│   └── tsconfig.json
├── supabase/                     # Supabase configuration
│   ├── functions/                # Edge Functions
│   │   ├── generate-copy/        # AI copy generation
│   │   ├── process-document/     # Document processing
│   │   └── shared/               # Shared utilities
│   └── migrations/               # Database migrations
├── instructions.txt              # Project specification
└── README.md                     # This file
```

## 🗄️ Database Schema

### Tables
- **clients**: Store client information
- **sources**: Track document/data sources  
- **chunks**: Store text chunks with vector embeddings

### Key Functions
- **match_chunks()**: Vector similarity search function
- Supports pgvector extension for efficient similarity queries

## 🔌 API Endpoints

### Supabase Edge Functions

#### `/functions/v1/process-document`
- **Method**: POST
- **Purpose**: Process uploaded documents into searchable chunks
- **Input**: `{ textContent, clientId, sourceId }`
- **Output**: Processed chunks with embeddings

#### `/functions/v1/generate-copy`
- **Method**: POST  
- **Purpose**: Generate AI copy using RAG
- **Input**: `{ query, clientId }`
- **Output**: AI-generated content with context

## 🎯 Use Cases

### Primary
- **Google Ads**: Generate headlines and descriptions
- **Social Media**: Create platform-specific copy
- **Email Marketing**: Generate newsletter content
- **Brand Guidelines**: Store and retrieve brand voice information

### Future Enhancements
- **Analytics Reports**: Process and summarize Looker reports
- **Web Crawling**: Automatic website content extraction
- **Asset Management**: Store and organize creative assets
- **Campaign Performance**: Track and analyze copy performance

## 🔧 Configuration

### OpenAI Settings
- **Embedding Model**: text-embedding-3-small (1536 dimensions)
- **Generation Model**: gpt-4o
- **Similarity Threshold**: 0.75 (configurable)
- **Max Chunks**: 5 per query (configurable)

### Supabase Settings
- **Authentication**: Email/password + Google OAuth
- **Storage**: For file uploads
- **Edge Functions**: For AI processing
- **Vector Extension**: pgvector for semantic search

## 🚦 Development Status

### ✅ Completed (v1.0)
- Client management system
- Manual data intake
- Document processing pipeline
- AI copy generation
- Vector search implementation
- Authentication system
- Responsive UI

### 🔄 In Progress
- File upload interface
- Enhanced document parsing
- Copy performance tracking

### 📋 Planned
- Web crawling functionality
- Looker report processing
- Asset management system
- Advanced analytics
- Team collaboration features

## 🤝 Contributing

This is an internal tool for ad agency use. For feature requests or bug reports, please contact the development team.

## 📝 License

Proprietary - Internal use only

## 🔧 Support

For technical support or questions:
- Check the instructions.txt file for detailed implementation guidance
- Review Supabase Edge Function logs for debugging
- Verify OpenAI API key configuration

---

**Version**: 1.0  
**Last Updated**: December 2024  
**Maintainer**: Ad Agency Development Team 