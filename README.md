# Real Estate Campaign Service

A specialized campaign generation service that creates Google Ads campaigns for real estate properties using AI and retrieval-augmented generation (RAG).

## Features

- **3 Real Estate Campaign Types**: General Location, Unit Type, and Proximity Search campaigns
- **Character Limit Enforcement**: Strict validation for Google Ads requirements (15 headlines max 30 chars, 4 descriptions max 90 chars)
- **Ad Group Granularity**: Detailed ad group targeting for specific marketing needs
- **AI-Powered Copy**: Uses OpenAI Assistant API with real estate-specific prompts
- **Vector Database Integration**: Retrieves relevant context from client knowledge base
- **Keyword Generation**: Comprehensive keyword lists with match types (exact, phrase, broad, negative)
- **Campaign Management**: Store and manage generated campaigns with detailed metadata

## Real Estate Campaign Types

### 1. General Location (`re_general_location`)
Broad location-based campaigns targeting general area searches.

**Ad Groups:**
- `location_general`: General location terms
- `location_specific`: Specific neighborhood/area terms  
- `location_amenities`: Location + amenities combinations

### 2. Unit Type (`re_unit_type`)
Unit-specific campaigns focusing on bedroom/bathroom configurations.

**Ad Groups:**
- `studio`: Studio apartments
- `1br`: 1 bedroom units
- `2br`: 2 bedroom units
- `3br`: 3 bedroom units
- `4br_plus`: 4+ bedroom units

### 3. Proximity Search (`re_proximity`)
Location proximity campaigns for "Near X" searches.

**Ad Groups:**
- `near_landmarks`: Near popular landmarks
- `near_transit`: Near transportation hubs
- `near_employers`: Near major employers
- `near_schools`: Near schools and universities

## Architecture

This service connects to the same Supabase database as the Knowledge Base Service to:
- Query vector embeddings for relevant content chunks
- Store generated campaigns in the extended `campaigns` table
- Access client information for context
- Retrieve real estate-specific data from client intake

## Getting Started

### 1. Prerequisites
- Existing Knowledge Base Service with populated client data
- Supabase database with vector embeddings
- OpenAI Assistant configured for real estate copywriting

### 2. Database Setup
Run the schema extension script in your Supabase SQL Editor:
```sql
-- See real-estate-campaigns-schema.sql for full schema
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ad_group_type TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location_data JSONB;
-- ... (additional columns)
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Environment Variables
Copy the provided `.env.local` file or create one with:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_ASSISTANT_ID=your_openai_assistant_id
```

### 5. Run Development Server
```bash
npm run dev
```
Runs on http://localhost:3001

## API Routes

### `POST /api/campaigns/real-estate/generate`

Generate real estate campaign copy.

**Request Body:**
```typescript
{
  clientId: string;
  campaignType: 're_general_location' | 're_unit_type' | 're_proximity';
  adGroupType: string; // Based on campaign type
  location: {
    city: string;
    state: string;
    zipCode?: string;
    county?: string;
  };
  unitDetails?: {
    bedrooms?: number;
    bathrooms?: number;
    sqft?: string;
    unitType?: string;
  };
  proximityTargets?: string[];
  priceRange?: string;
  specialOffers?: string;
  targetDemographic?: string;
  additionalContext?: string;
}
```

**Response:**
```typescript
{
  success: true;
  campaignId: string;
  generatedCopy: {
    headlines: string[]; // Exactly 15, max 30 chars each
    descriptions: string[]; // Exactly 4, max 90 chars each
    keywords: {
      exact_match: string[];
      phrase_match: string[];
      broad_match: string[];
      negative_keywords: string[];
    };
    final_url_paths: string[];
    character_validation: {
      headlines_valid: ValidationResult[];
      descriptions_valid: ValidationResult[];
    };
  };
  contextChunksUsed: number;
  validationSummary: {
    headlinesValid: number;
    descriptionsValid: number;
    totalHeadlines: number;
    totalDescriptions: number;
  };
}
```

## Usage

### Client Selection
1. Launch the application at http://localhost:3001
2. Select a client from the available list (pulled from Knowledge Base)
3. Choose the appropriate campaign type for your marketing goals

### Campaign Generation
1. **Configure Campaign**: Select campaign type and ad group focus
2. **Set Location**: Enter city, state, and optional zip/county
3. **Unit Details** (for Unit Type campaigns): Specify bedrooms, bathrooms, sqft
4. **Proximity Targets** (for Proximity campaigns): Add landmarks, transit, employers
5. **Campaign Context**: Add pricing, offers, demographics, and additional context
6. **Generate**: Click "Generate Campaign" to create AI-powered copy

### Review Results
- **Headlines**: 15 headlines with character validation (30 char limit)
- **Descriptions**: 4 descriptions with character validation (90 char limit)
- **Keywords**: Organized by match type with negative keywords
- **URL Paths**: SEO-optimized landing page suggestions
- **Validation**: Real-time character count and validation status

## Integration with Knowledge Base

The campaign service leverages your existing knowledge base:
- **Vector Search**: Finds relevant property information, brand guidelines, and market data
- **Client Context**: Uses uploaded documents to maintain brand consistency
- **Smart Prompting**: Combines client-specific context with real estate expertise

## Character Limit Validation

Strict enforcement of Google Ads requirements:
- **Headlines**: Maximum 30 characters including spaces
- **Descriptions**: Maximum 90 characters including spaces
- **Real-time Validation**: Shows character count and validity status
- **Truncation Suggestions**: Provides shortened versions for invalid copy

## Technology Stack

- **Framework**: Next.js 14 with TypeScript
- **Database**: Supabase (PostgreSQL + Vector)
- **AI**: OpenAI Assistant API with specialized real estate prompts
- **Styling**: Tailwind CSS
- **State Management**: React Hooks

## Database Schema

### Extended Campaigns Table
```sql
campaigns (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  campaign_type TEXT, -- 're_general_location', 're_unit_type', 're_proximity'
  ad_group_type TEXT, -- Specific ad group within campaign type
  location_data JSONB, -- City, state, zip, county
  unit_details JSONB, -- Bedrooms, bathrooms, sqft, unit type
  proximity_targets TEXT[], -- Array of proximity targets
  price_range TEXT,
  special_offers TEXT,
  target_demographic TEXT,
  generated_copy JSONB, -- Complete generated campaign copy
  character_validation JSONB, -- Validation results
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

## Real Estate Focus

This system is specifically designed for real estate marketing:
- **Property-Specific**: Bedrooms, bathrooms, square footage, unit types
- **Location-Aware**: City, neighborhood, proximity to landmarks
- **Market-Focused**: Pricing, incentives, target demographics
- **Brand-Consistent**: Uses client knowledge base for voice and messaging
- **Compliance-Ready**: Meets Google Ads character and format requirements

## Production Deployment

1. Set up production environment variables
2. Run database migrations in Supabase
3. Configure OpenAI Assistant for production
4. Deploy to your preferred hosting platform
5. Ensure proper CORS settings for API routes

## Support

For issues or questions:
1. Check that clients exist in the Knowledge Base service
2. Verify database schema has been updated
3. Confirm OpenAI Assistant is properly configured
4. Review vector database has client content
5. Check API logs for detailed error messages 