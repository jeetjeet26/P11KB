# P11RAG - Advanced Microservices RAG System for Real Estate Marketing

A production-ready, AI-powered marketing campaign generation system with sophisticated RAG capabilities, specialized for real estate marketing with advanced prompt engineering and context-aware content creation.

## 🚀 Major Updates & Enhancements

### Phase 3: Enhanced Prompt Engineering ✅ COMPLETED
- **Sophisticated Context Retrieval**: Multi-query vector search with 4 specialized queries
- **Advanced Template System**: Campaign-specific templates with brand voice validation  
- **Structured Client Profiles**: AI-powered extraction and synthesis of client data
- **Example-Driven Generation**: Proven ad copy examples with performance metrics
- **Real Estate Specialization**: Purpose-built for real estate marketing campaigns

### New Supabase Functions
- **extract-client-profile**: AI-powered structured data extraction from client documents
- **Enhanced process-document**: Improved document processing with semantic chunking
- **Advanced generate-copy**: Context-aware campaign generation with template matching

## Architecture Overview

This system is architected as focused microservices with shared intelligence:

### 🗄️ Knowledge Base Service (`ad-agency-kb/`)
**Port: 3000**
- Advanced document processing (PDF, DOCX, TXT, images)
- Semantic text chunking with intelligent overlap
- Vector embedding generation with OpenAI
- Client asset management and organization
- Multi-format file support with OCR capabilities

### 🎯 Campaign Service (`campaign-service/`)
**Port: 3001**
- **AI-Powered Campaign Generation** with GPT-4
- **Multi-Query Context Retrieval** - 4 specialized search queries
- **Template-Based Ad Copy** with performance validation
- **Brand Voice Compliance** - automated tone and style validation
- **Real Estate Campaign Types**: Location, Unit Type, Proximity campaigns
- **Structured Client Profiling** with psychographic analysis

### ⚡ Supabase Edge Functions
- **extract-client-profile**: Structured data extraction from documents
- **process-document**: Enhanced document processing pipeline  
- **generate-copy**: Context-aware campaign generation

## 🎯 Real Estate Marketing Specialization

### Campaign Types Supported
1. **General Location Campaigns** - Broad location-based marketing
2. **Unit Type Campaigns** - Bedroom/bathroom specific targeting
3. **Proximity Campaigns** - Near landmarks, transit, employers, schools

### Advanced Context System
- **Multi-Query Retrieval**: Brand voice, demographics, property features, local insights
- **Chunk Classification**: Intelligent categorization of retrieved content
- **Client Profile Management**: Structured synthesis of intake + document data
- **Template Matching**: Campaign-specific templates with variable substitution

### Example-Driven Generation
- **Proven Templates**: 6+ high-performing ad copy examples
- **Performance Metrics**: CTR, conversion rates, and CPC data
- **Dynamic Selection**: Context-aware template and example matching

## Benefits of This Architecture

✅ **AI-Powered Intelligence** - GPT-4 integration with sophisticated prompt engineering  
✅ **Real Estate Focused** - Purpose-built for property marketing campaigns  
✅ **Context-Aware** - Multi-source data synthesis for relevant content  
✅ **Performance Validated** - Templates based on proven successful campaigns  
✅ **Scalable Microservices** - Independent deployment and scaling  
✅ **Brand Compliant** - Automated validation of tone and messaging  

## Technology Stack

### Core Technologies
- **Framework**: Next.js 14 with TypeScript
- **Database**: Supabase (PostgreSQL + pgvector for semantic search)
- **AI**: OpenAI GPT-4 (embeddings + chat completions)
- **Edge Functions**: Deno-based Supabase functions

### Processing Capabilities
- **Document Processing**: pdf-parse, mammoth, tesseract.js for OCR
- **Vector Search**: pgvector with OpenAI embeddings
- **Template Engine**: Dynamic variable substitution and validation
- **Brand Validation**: Automated compliance checking

### UI/UX
- **Styling**: Tailwind CSS with modern responsive design
- **Components**: Reusable React components with TypeScript
- **Forms**: Advanced client intake with validation

## Quick Start

### 1. Knowledge Base Service
```bash
cd ad-agency-kb
npm install
npm run dev  # Runs on http://localhost:3000
```

### 2. Campaign Service  
```bash
cd campaign-service
npm install
npm run dev  # Runs on http://localhost:3001
```

### 3. Supabase Functions (if developing locally)
```bash
supabase functions serve
```

## Environment Configuration

### Both Services Require
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

### Campaign Service Additional
```env
OPENAI_ASSISTANT_ID=your_openai_assistant_id
```

### Supabase Functions
```env
OPENAI_API_KEY=your_openai_api_key
```

## Database Schema

### Core Tables
- **clients** - Client information and intake data
- **sources** - Document metadata and processing status
- **chunks** - Vector embeddings with semantic content
- **campaigns** - Generated marketing campaigns with metadata

### Enhanced Client Intake Fields
- Community type, address, pricing
- Target audience and demographics  
- Brand voice guidelines and personality
- Unique features and competitive advantages
- Current campaigns and special offers

## Advanced Workflow

### 1. Document Processing Pipeline
1. **Upload** → Multi-format document processing
2. **Extract** → AI-powered structured data extraction  
3. **Chunk** → Semantic text chunking with overlap
4. **Embed** → Vector embedding generation
5. **Store** → Organized storage with metadata

### 2. Campaign Generation Pipeline
1. **Profile Building** → Combine intake + document data
2. **Multi-Query Search** → 4 specialized vector searches
3. **Context Classification** → Intelligent chunk categorization
4. **Template Matching** → Campaign-specific template selection
5. **Brand Validation** → Automated compliance checking
6. **Generate** → AI-powered ad copy creation

## Performance & Quality

### Validation Systems
- **Brand Voice Compliance** - Automated tone checking
- **Template Performance** - Based on proven successful campaigns
- **Context Relevance** - Multi-query retrieval ensures comprehensive coverage
- **Character Limits** - Automatic validation for ad platform requirements

### Metrics Tracking
- Campaign performance data integration
- Template effectiveness scoring
- Context retrieval quality metrics
- Brand compliance rates

## Development Features

### Advanced Context Retrieval
- **Multi-Query System**: 4 specialized queries for comprehensive context
- **Chunk Classification**: AI-powered categorization of retrieved content
- **Relevance Scoring**: Intelligent prioritization of context data

### Template System
- **Dynamic Variables**: `{location}`, `{community}`, `{unit}`, `{amenity}` substitution
- **Performance Data**: Templates include historical CTR and conversion metrics
- **Fallback Logic**: Graceful handling of missing data

### Client Profile Management
- **Structured Extraction**: AI-powered parsing of client documents
- **Data Synthesis**: Intelligent combination of intake + document data
- **Validation**: Automated checking of profile completeness

## Migration & Deployment

This system maintains backward compatibility while adding:
- ✅ Enhanced AI-powered campaign generation
- ✅ Sophisticated context retrieval and classification
- ✅ Real estate marketing specialization
- ✅ Performance-validated templates
- ✅ Advanced brand voice compliance
- ✅ Microservices architecture for scalability

## Future Roadmap

- **Phase 4**: Performance tracking and optimization
- **Phase 5**: Multi-platform campaign adaptation
- **Phase 6**: Advanced analytics and reporting
- **Platform Expansion**: Support for additional real estate markets 