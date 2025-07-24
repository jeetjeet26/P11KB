# P11RAG System Enhancement and Refactoring Plan

## 1. Introduction

This document outlines a strategic plan to refactor and enhance the P11RAG system. The primary goals of this initiative are:

1.  **Improve Robustness:** Replace the brittle, regex-based content chunking system with a more resilient and intelligent solution powered by a large language model.
2.  **Increase Maintainability:** Consolidate redundant logic by unifying the campaign context builders into a single, streamlined class.

This plan is divided into three parts: the chunking system refactor, the context builder unification, and instructions for managing the required secrets in Supabase.

---

## 2. Part 1: Transition to a Fully LLM-Powered Dual Chunking System

**Objective:** Completely replace the existing logic-based chunking system with a single, intelligent call to **Gemini 2.5 Pro**. This new system will create both rich `narrative` chunks and precise `atomic` chunks from the source document text.

**Affected Component:**
*   `supabase/functions/process-document/index.ts`

**Implementation Strategy:**

### Step 2.1: Redesign the `process-document` Edge Function
The core logic of the function will be refactored to call a new primary function, `generateDualChunksWithLLM`. All legacy functions related to the old chunking method (`createDualChunkingSystem`, `extractAtomicComponents`, `createFocusedNarrativeChunks`, etc.) will be removed to eliminate complexity.

### Step 2.2: Engineer a "Dual Chunking" Prompt for Gemini 2.5 Pro
A new, sophisticated prompt will be engineered specifically for Gemini 2.5 Pro. The prompt will instruct the model to act as an expert marketing analyst, reading the provided document and deconstructing it into two distinct types of marketing content: high-level narratives and specific atomic ingredients.

### Step 2.3: Define LLM Tools for Structured Output
To guarantee perfectly structured and validated output from the model, two "tools" will be defined that Gemini 2.5 Pro will be required to use for its response.

**Tool 1: `create_narrative_chunk`**
- **Purpose:** To create substantial, paragraph-like chunks that provide broad context and tell a story.
- **Parameters:**
    - `content` (string): The full text of the narrative paragraph (target: 300-800 characters).
    - `narrative_type` (enum): The model will classify the chunk as `NARRATIVE_AMENITIES`, `NARRATIVE_LOCATION`, `NARRATIVE_LIFESTYLE`, or `NARRATIVE_COMMUNITY`.
    - `campaign_focus` (array of strings): The model will identify the chunk's suitability for campaigns focused on 'luxury', 'location', 'value', etc.

**Tool 2: `create_atomic_chunk`**
- **Purpose:** To extract small, potent, and reusable marketing phrases or "ingredients."
- **Parameters:**
    - `content` (string): The text of the atomic component (target: 15-150 characters, a more flexible and useful range for marketing copy).
    - `atomic_category` (enum): The model will classify the component as `amenity`, `feature`, `location`, `pricing`, `lifestyle`, `special`, etc.

### Step 2.4: Execute the New Chunking Process
The `generateDualChunksWithLLM` function will pass the entire sanitized document text to the Gemini 2.5 Pro model. It will then collect the resulting `create_narrative_chunk` and `create_atomic_chunk` tool calls to assemble the final array of `DualChunk` objects, which will then be embedded and stored in the database.

---

## 3. Part 2: Unify and Streamline Campaign Context Builders

**Objective:** Consolidate the multiple, overlapping context-building classes in the `campaign-service` into a single, unified builder.

**Affected Component:**
*   `campaign-service/`

**Implementation Strategy:**

### Step 3.1: Create the `UnifiedCampaignContextBuilder`
A new file, `src/lib/context/UnifiedCampaignContextBuilder.ts`, will be created. This class will merge all logic from the legacy `CampaignContextBuilder`, `EnhancedContextBuilder`, and the inline `MultifamilyContextBuilder`.

### Step 3.2: Implement an Intelligent `buildContext` Method
This class will feature a single entry point method, `buildContext`.
- **Smart Path Selection:** The method will first query the `chunks` table to determine if the client has dual-chunking data (i.e., chunks with `atomic` and `narrative` subtypes).
- **Enhanced Path:** If dual-chunking data exists, it will follow the "enhanced" logic, assembling a rich context from atomic ingredients and narrative chunks.
- **Standard Path:** If not, it will gracefully fall back to the "standard" logic, building the context from the six structured sections (Brand Voice, Property Highlights, etc.).
- **Consistent Output:** The method will always return a single, consistently formatted context object.

### Step 3.3: Refactor the Campaign Generation API Route
The primary API route (`campaign-service/src/app/api/campaigns/real-estate/generate/route.ts`) will be greatly simplified. All inline context builders and chained calls will be replaced with one call to `UnifiedCampaignContextBuilder.buildContext()`.

### Step 3.4: Deprecate and Remove Old Code
Once the new unified builder is implemented and validated, the old `CampaignContextBuilder.ts` file and the inline `MultifamilyContextBuilder` can be safely removed.

---

## 4. Part 3: Edge Function and Secrets Management

**Objective:** Formalize and document the process for managing the secrets required by the system's Edge Functions and API services.

**Context:** The application requires several API keys to function. These must be stored securely and not be hardcoded in the source code. The Supabase "Edge Function Secrets" dashboard is the correct location for these.

### Step 4.1: Establish Required Secrets
The following secrets must be set in the Supabase dashboard under `Project Settings > Edge Functions`.

| Key                   | Required By              | Description                                        |
| --------------------- | ------------------------ | -------------------------------------------------- |
| `GEMINI_API_KEY`      | `process-document` (Edge Function) & `campaign-service` | For all LLM-powered generation and chunking.    |
| `OPENAI_API_KEY`      | `process-document` (Edge Function) | Still required for generating text embeddings.     |
| `GOOGLE_MAPS_API_KEY` | `campaign-service`       | For real-time proximity searches.                  |

The existing secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, etc.) are managed by Supabase and should remain.

### Step 4.2: Accessing Secrets in Edge Functions
Secrets are securely injected into the Deno runtime environment. To access a secret within an Edge Function, use the `Deno.env.get()` method.

**Example (`supabase/functions/process-document/index.ts`):**
```typescript
// Deno runtime provides access to environment variables
const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

// Use the keys to initialize API clients
const genAI = new GoogleGenerativeAI(geminiApiKey);
const openai = new OpenAI({ apiKey: openAIApiKey });
```

### Step 4.3: Local Development
For local development using the Supabase CLI (`supabase start`), create a file named `.env` in the `supabase` directory (`supabase/.env`). This file **must** be included in your `.gitignore` file to prevent committing secrets.

**Example (`supabase/.env`):**
```
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```
The Supabase CLI will automatically load these variables when running your functions locally.

### Step 4.4: Deployment
When you deploy your Edge Functions to production (`supabase functions deploy`), the secrets you set in the Supabase Dashboard will be automatically and securely used. The local `.env` file is ignored during deployment. 