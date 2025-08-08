# P11KB – Client Knowledge Base and AI Campaign Generation (Real Estate)

Production-ready monorepo for processing client documents into a searchable knowledge base and generating Google‑Ads‑ready campaigns using AI. Built around Next.js services, Supabase (PostgreSQL + pgvector + Edge Functions), Google Gemini for generation, OpenAI for embeddings, and optional Google Maps proximity data.


## Monorepo Overview

- `ad-agency-kb/` (port 3000): Knowledge Base service for client intake and document processing
  - Upload and process PDF/DOCX/TXT/Images (OCR) into semantic chunks
  - Store sources and embeddings; manage client profiles and assets
  - API: `POST /api/process` to ingest raw text or files into Supabase
- `campaign-service/` (port 3001): Campaign Generation service for real estate
  - Builds structured campaign context from the knowledge base
  - Generates, validates, and exports ad copy (Google Ads CSV)
  - API: `POST /api/campaigns/real-estate/generate` and `POST /api/campaigns/real-estate/save`
- `supabase/functions/`: Edge functions invoked from services
  - `process-document`: LLM‑powered dual chunking + embeddings and storage
  - `extract-client-profile`: Structured profile extraction into `client_intake`
  - `generate-copy`: Context‑aware copy generation (server-side)
- SQL Utilities
  - `setup-client-intake-table.sql`: Creates/maintains `client_intake` and supporting triggers
  - `campaign-service/real-estate-campaigns-schema.sql`: Extends `campaigns` table for real estate
- Docs
  - Improvement notes and roadmap live in `improvements/`


## Features

- Real document ingestion: PDF, DOCX, TXT, and image OCR (Tesseract.js)
- LLM dual chunking: atomic marketing ingredients + narrative context
- Vector search with pgvector and OpenAI embeddings
- Real estate specialization: general location, unit type, and proximity campaigns
- Google Maps integration for proximity context (when provided)
- Brand voice and Google Ads character‑limit validation
- One‑click CSV export to Google Ads‑compatible format


## Tech Stack

- Next.js 14 + TypeScript, Tailwind CSS
- Supabase (PostgreSQL, pgvector, Edge Functions)
- Google Gemini (generation) + OpenAI (embeddings)
- Google Maps Places API (optional proximity data)


## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (URL + anon key)
- OpenAI API key (embeddings)
- Google Gemini API key (generation)
- Google Maps Places API key (optional proximity)

### Environment Variables

Create `.env.local` in both services with these values.

Common (both services):

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

Campaign Service additional:

```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Edge Functions (Supabase environment variables):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (provided by Supabase runtime)
- `OPENAI_API_KEY`, `GEMINI_API_KEY` (set as project secrets if calling external APIs)

### Run Locally

Terminal 1 – Knowledge Base

```
cd ad-agency-kb
npm install
npm run dev # http://localhost:3000
```

Terminal 2 – Campaign Service

```
cd campaign-service
npm install
npm run dev # http://localhost:3001
```


## Database Setup

Run the provided SQL scripts in the Supabase SQL editor (or via psql):

1) Client intake and chunk metadata columns

```
setup-client-intake-table.sql
```

2) Real estate campaign extensions

```
campaign-service/real-estate-campaigns-schema.sql
```


## Edge Functions

Location: `supabase/functions/<name>/index.ts`

- `process-document`: Parses text, generates LLM dual chunks (Gemini), creates embeddings (OpenAI), stores to `chunks`
- `extract-client-profile`: Extracts structured intake fields into `client_intake`
- `generate-copy`: Combines structured profile + semantic context to draft ad copy

Deploy with Supabase CLI (example):

```
supabase link --project-ref <your-project-ref>
supabase functions deploy process-document
supabase functions deploy extract-client-profile
supabase functions deploy generate-copy
```


## Public API (selected)

- Knowledge Base service
  - `GET /api/process` – health check
  - `POST /api/process` – multipart file upload or JSON `{ textContent, clientId }`; creates `sources`, invokes `process-document`
- Campaign service (real estate)
  - `POST /api/campaigns/real-estate/generate` – body `{ clientId, campaignType, campaignName, adGroupType? }`; returns generated options, validation, and context
  - `POST /api/campaigns/real-estate/save` – persists curated campaign into `campaigns`


## Directory Guide

- `ad-agency-kb/src/app/api/process/route.ts` – file/JSON intake and edge function invocation
- `campaign-service/src/app/api/campaigns/real-estate/generate/route.ts` – context build + generation + validation
- `campaign-service/src/app/api/campaigns/real-estate/save/route.ts` – persistence of curated campaigns
- `campaign-service/src/components/RealEstateCampaignGenerator.tsx` – end‑to‑end UI for generation/curation/export
- `supabase/functions/*` – Edge functions (Deno) for processing and generation


## Notes & Constraints

- Image OCR uses Tesseract.js; ensure adequate resources for large images
- Large document inputs are sanitized and truncated server‑side to avoid timeouts
- Character‑limit validation enforces Google Ads constraints (30/90) before export
- Proximity context requires valid `GOOGLE_MAPS_API_KEY` and reliable address data in `client_intake`


## License

Copyright © P11. All rights reserved. See repository owner for licensing.


## Acknowledgements

This repository corresponds to the public project listing and documentation at the P11KB GitHub repository. See the public repo overview for context and history: `https://github.com/jeetjeet26/P11KB`.