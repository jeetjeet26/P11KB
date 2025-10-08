import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// OpenAI SDK import removed; we'll use direct HTTP calls for compatibility

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// ===== LLM-POWERED DUAL CHUNKING SYSTEM =====

// Enhanced Chunk Types for Multifamily (keeping existing enum structure for database compatibility)
enum ChunkType {
  // Atomic component types (15-150 characters)
  ATOMIC_AMENITY = 'atomic_amenity',
  ATOMIC_FEATURE = 'atomic_feature', 
  ATOMIC_FLOOR_PLAN = 'atomic_floor_plan',
  ATOMIC_LIFESTYLE = 'atomic_lifestyle',
  ATOMIC_LOCATION = 'atomic_location',
  ATOMIC_SPECIAL = 'atomic_special',
  ATOMIC_URGENCY = 'atomic_urgency',
  ATOMIC_CTA = 'atomic_cta',
  ATOMIC_PRICE = 'atomic_price',
  ATOMIC_COMMUNITY = 'atomic_community',
  
  // Narrative context types (300-800 characters)
  NARRATIVE_AMENITIES = 'narrative_amenities',
  NARRATIVE_LOCATION = 'narrative_location', 
  NARRATIVE_LIFESTYLE = 'narrative_lifestyle',
  NARRATIVE_COMMUNITY = 'narrative_community'
}

// Metadata Structure (maintaining database compatibility)
interface MultifamilyChunkMetadata {
  type: ChunkType;
  community_name: string;
  char_count: number;
  atomic_category?: 'amenity' | 'feature' | 'location' | 'pricing' | 'lifestyle' | 'special' | 'community' | 'cta' | 'urgency';
  campaign_focus?: ('luxury' | 'location' | 'amenities' | 'value' | 'lifestyle')[];
  is_pet_related?: boolean;
  offer_expiry?: string;
  floor_plan_bedrooms?: number;
  amenity_category?: 'fitness' | 'social' | 'convenience' | 'outdoor';
  location_type?: 'proximity' | 'neighborhood' | 'transit';
  price_type?: 'starting_at' | 'range' | 'average';
}

// Dual Chunk Structure
interface DualChunk {
  content: string;
  metadata: MultifamilyChunkMetadata;
  embedding?: number[];
}

// ===== LLM-POWERED CHUNKING FUNCTIONS =====

/**
 * Extract community/business name from content when not explicitly provided
 */
function extractCommunityNameFromContent(text: string): string | null {
  const patterns = [
    /Community\/Business Name:\s*([^\n]+)/i,
    /Business Name:\s*([^\n]+)/i,
    /Community Name:\s*([^\n]+)/i,
    /Property Name:\s*([^\n]+)/i,
    /CLIENT ONBOARDING INFORMATION FOR\s+([^\n]+)/i,
    /([A-Z][a-zA-Z\s&]{2,40}(?:Apartments?|Community|Properties|Residences?))(?:\s|$|Type:|Property Type:)/,
    /([A-Z][a-zA-Z\s&]{2,40}at\s+[A-Z][a-zA-Z\s]{2,30})(?:\s|$|Type:|Property Type:)/,
    /(The\s+[A-Z][a-zA-Z\s]{2,40})(?:\s|$|Type:|Property Type:)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let extracted = match[1].trim();
      extracted = extracted.replace(/^(CLIENT ONBOARDING INFORMATION FOR\s+)/i, '');
      extracted = extracted.replace(/\s+(BASIC INFORMATION|INFO|DETAILS).*$/i, '');
      
      if (extracted.length > 200) {
        extracted = extracted.substring(0, 200).trim();
      }
      
      if (!extracted.match(/^(Type|Property|Address|Website|Information|Details)$/i) && extracted.length > 3) {
        console.log(`[EXTRACT] Found community name: "${extracted}"`);
        return extracted;
      }
    }
  }
  
  console.log(`[EXTRACT] No community name found in content`);
  return null;
}

/**
 * Main LLM-powered dual chunking function using OpenAI
 */
async function generateDualChunksWithLLM(text: string, communityName: string): Promise<DualChunk[]> {
  console.log(`[LLM_CHUNKING] Starting intelligent dual chunking for community: ${communityName}`);
  console.log(`[LLM_CHUNKING] Input text length: ${text.length} characters`);

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Craft intelligent dual chunking prompt
  const prompt = `You are an expert marketing analyst specializing in multifamily real estate. Analyze the document below and extract marketing-relevant content as JSON chunks.

**COMMUNITY:** ${communityName}

**YOUR TASK:**
Extract 5-15 high-quality marketing chunks from the document. Return a JSON object with a "chunks" array.

**CHUNK TYPES:**

1. **NARRATIVE CHUNKS** (300-800 characters):
   - Substantial content that tells a story
   - type: "narrative_amenities", "narrative_location", "narrative_lifestyle", or "narrative_community"
   - Include: type, campaign_focus array (values: "luxury", "location", "amenities", "value", "lifestyle")

2. **ATOMIC CHUNKS** (15-150 characters):
   - Small, punchy marketing phrases
   - type: "atomic_amenity", "atomic_feature", "atomic_location", "atomic_price", "atomic_cta", "atomic_special", or "atomic_urgency"
   - Include: type, atomic_category (MUST be one of: "amenity", "feature", "location", "pricing", "lifestyle", "special", "community", "cta", "urgency")

**EXAMPLE OUTPUT:**
{
  "chunks": [
    {
      "content": "Resort-style pool with cabanas and sundeck overlooking downtown skyline",
      "metadata": {
        "type": "narrative_amenities",
        "campaign_focus": ["luxury", "amenities"]
      }
    },
    {
      "content": "Pet-friendly apartments with dog park",
      "metadata": {
        "type": "atomic_amenity",
        "atomic_category": "amenity"
      }
    },
    {
      "content": "Starting at $1,850/month",
      "metadata": {
        "type": "atomic_price",
        "atomic_category": "pricing"
      }
    }
  ]
}

**IMPORTANT:**
- For atomic chunks, atomic_category is REQUIRED and must match the type (atomic_amenity → "amenity", atomic_price → "pricing", atomic_feature → "feature", etc.)
- Extract ONLY content that exists in the document
- Each chunk must be marketing-ready

**DOCUMENT:**
---
${text}
---

Return ONLY valid JSON.`;

  try {
    console.log(`[LLM_CHUNKING] Sending request to OpenAI (chat.completions)...`);
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_CHUNKING_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a senior marketing analyst that returns strict JSON only.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      throw new Error(`OpenAI error: ${chatResponse.status} ${chatResponse.statusText} - ${errText}`);
    }

    const chatJson = await chatResponse.json();
    const content: string = chatJson?.choices?.[0]?.message?.content || '';
    if (!content || content.trim().length === 0) {
      throw new Error('OpenAI returned empty content');
    }

    console.log(`[LLM_CHUNKING] OpenAI response length: ${content.length} characters`);

    // Parse JSON containing chunks
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error(`[LLM_CHUNKING] Failed to parse JSON. Content: ${content.substring(0, 500)}`);
      throw new Error('OpenAI response is not valid JSON');
    }

    const items: any[] = parsed.chunks || [];
    console.log(`[LLM_CHUNKING] Parsed ${items.length} chunk items from OpenAI response`);

    if (items.length === 0) {
      console.error(`[LLM_CHUNKING] No chunks in response. Full response: ${JSON.stringify(parsed).substring(0, 500)}`);
      throw new Error('OpenAI returned zero chunks');
    }

    const dualChunks: DualChunk[] = items.map((item) => {
      const content: string = item.content;
      const md = item.metadata || {};
      const type = (md.type === 'narrative_web' || md.type === 'narrative_amenities' || md.type === 'narrative_location' || md.type === 'narrative_lifestyle' || md.type === 'narrative_community')
        ? (md.type as ChunkType)
        : ((md.type === 'atomic_web' || md.type?.startsWith('atomic_')) ? (md.type as ChunkType) : ChunkType.ATOMIC_FEATURE);
      
      // Derive atomic_category from type if not provided
      let atomicCategory = md.atomic_category;
      if (type.startsWith('atomic_') && !atomicCategory) {
        // Map atomic types to categories
        const typeMap: Record<string, string> = {
          'atomic_amenity': 'amenity',
          'atomic_feature': 'feature',
          'atomic_location': 'location',
          'atomic_price': 'pricing',
          'atomic_cta': 'cta',
          'atomic_special': 'special',
          'atomic_urgency': 'urgency',
          'atomic_lifestyle': 'lifestyle',
          'atomic_community': 'community',
          'atomic_floor_plan': 'feature'
        };
        atomicCategory = typeMap[type] || 'feature';
      }
      
      return {
        content,
        metadata: {
          type,
          community_name: communityName,
          char_count: content.length,
          atomic_category: atomicCategory,
          campaign_focus: md.campaign_focus,
          is_pet_related: md.is_pet_related,
          offer_expiry: md.offer_expiry,
          floor_plan_bedrooms: md.floor_plan_bedrooms,
          amenity_category: md.amenity_category,
          location_type: md.location_type,
          price_type: md.price_type,
        },
      };
    });

    console.log(`[LLM_CHUNKING] Generated ${dualChunks.length} intelligent chunks`);
    return dualChunks;

  } catch (error) {
    console.error(`[LLM_CHUNKING] OpenAI API error:`, error);
    throw new Error(`Failed to generate LLM chunks: ${error}`);
  }
}

// ===== HELPER FUNCTIONS (Simplified) =====

function determineAmenityCategory(text: string): 'fitness' | 'social' | 'convenience' | 'outdoor' {
  if (/gym|fitness|workout|exercise/i.test(text)) return 'fitness';
  if (/pool|clubhouse|lounge|game|social/i.test(text)) return 'social';
  if (/laundry|parking|storage|concierge|package/i.test(text)) return 'convenience';
  return 'outdoor';
}

function determineLocationType(text: string): 'proximity' | 'neighborhood' | 'transit' {
  if (/minutes?|drive|walk|steps/i.test(text)) return 'proximity';
  if (/metro|transit|bus|train|subway/i.test(text)) return 'transit';
  return 'neighborhood';
}

function determinePriceType(text: string): 'starting_at' | 'range' | 'average' {
  if (/starting|from|as\s+low\s+as/i.test(text)) return 'starting_at';
  if (/-|\sto\s/.test(text)) return 'range';
  return 'average';
}

// ===== MAIN EDGE FUNCTION =====

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { textContent, clientId, sourceId, documentType, communityName } = await req.json();

    if (!textContent || !clientId || !sourceId) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters: textContent, clientId, sourceId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const validDocumentTypes = ['looker_report', 'client_brand_asset', 'multifamily_property'];
    const docType = documentType || 'client_brand_asset';
    
    if (!validDocumentTypes.includes(docType)) {
      return new Response(JSON.stringify({
        error: 'Invalid documentType. Must be one of: looker_report, client_brand_asset, multifamily_property'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[PROCESSING] Processing ${docType} document with LLM-powered chunking`);
    console.log(`[PROCESSING] Text length: ${textContent.length} characters`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Determine effective community name
    let effectiveCommunityName = communityName;
    
    if (!effectiveCommunityName) {
      console.log(`[PROCESSING] Querying clients table for community name using clientId: ${clientId}`);
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('name')
        .eq('id', clientId)
        .single();

      if (clientError) {
        console.error(`[PROCESSING] Could not retrieve client name:`, clientError);
        effectiveCommunityName = extractCommunityNameFromContent(textContent) || 'Unknown Community';
      } else {
        effectiveCommunityName = clientData?.name || 'Unknown Community';
        console.log(`[PROCESSING] Using community name from clients table: ${effectiveCommunityName}`);
      }
    }

    // Generate dual chunks using LLM
    let dualChunks: DualChunk[];
    
    try {
      dualChunks = await generateDualChunksWithLLM(textContent, effectiveCommunityName);
    } catch (llmError) {
      console.error(`[LLM_CHUNKING] LLM chunking failed:`, llmError);
      return new Response(JSON.stringify({
        error: 'LLM chunking failed',
        details: llmError instanceof Error ? llmError.message : 'Unknown LLM error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (dualChunks.length === 0) {
      return new Response(JSON.stringify({
        error: `No valid chunks created from ${docType} document`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const chunks = dualChunks.map(chunk => chunk.content);

    // Generate embeddings in batches
    console.log(`[PROCESSING] Generating embeddings for ${chunks.length} chunks`);
    const BATCH_SIZE = 50;
    const allEmbeddings: any[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`[PROCESSING] Processing embedding batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(chunks.length / BATCH_SIZE)}`);

      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: batch,
          model: 'text-embedding-3-small'
        })
      });

      if (!embeddingResponse.ok) {
        const error = await embeddingResponse.text();
        console.error(`[PROCESSING] OpenAI API error:`, error);
        return new Response(JSON.stringify({
          error: 'Failed to generate embeddings',
          details: error
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const batchData = await embeddingResponse.json();
      allEmbeddings.push(...batchData.data);

      // Small delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[PROCESSING] Generated ${allEmbeddings.length} embeddings`);

    // Prepare chunk records with LLM-generated metadata
    // Uses new unified schema with source_type and metadata JSONB
    const chunkRecords = chunks.map((chunk, i) => {
      const metadata = dualChunks[i].metadata;
      
      // Build consolidated metadata JSONB
      const metadataJsonb: any = {};
      if (metadata.atomic_category) metadataJsonb.atomic_category = metadata.atomic_category;
      if (metadata.campaign_focus) metadataJsonb.campaign_focus = metadata.campaign_focus;
      if (metadata.amenity_category) metadataJsonb.amenity_category = metadata.amenity_category;
      if (metadata.location_type) metadataJsonb.location_type = metadata.location_type;
      if (metadata.price_type) metadataJsonb.price_type = metadata.price_type;
      if (metadata.is_pet_related !== undefined) metadataJsonb.is_pet_related = metadata.is_pet_related;
      if (metadata.offer_expiry) metadataJsonb.offer_expiry = metadata.offer_expiry;
      if (metadata.floor_plan_bedrooms) metadataJsonb.floor_plan_bedrooms = metadata.floor_plan_bedrooms;
      if (metadata.char_count) metadataJsonb.char_count = metadata.char_count;
      
      return {
        client_id: clientId,
        source_id: sourceId,
        content: chunk,
        embedding: allEmbeddings[i].embedding,
        
        // New unified schema fields
        document_type: docType,
        chunk_type: 'llm_dual',
        chunk_subtype: metadata.type,
        source_type: 'document', // All chunks from this edge function are documents
        
        // Community
        community_name: metadata.community_name,
        
        // Consolidated metadata (NEW)
        metadata: metadataJsonb,
        
        // Legacy fields for backward compatibility (will be deprecated)
        char_count: metadata.char_count,
        atomic_category: metadata.atomic_category,
        campaign_focus: metadata.campaign_focus,
        is_pet_related: metadata.is_pet_related,
        offer_expiry: metadata.offer_expiry,
        floor_plan_bedrooms: metadata.floor_plan_bedrooms,
        amenity_category: metadata.amenity_category,
        location_type: metadata.location_type,
        price_type: metadata.price_type
      };
    });

    // Insert chunks into database in batches
    const DB_BATCH_SIZE = 25;
    let totalInserted = 0;

    for (let i = 0; i < chunkRecords.length; i += DB_BATCH_SIZE) {
      const batch = chunkRecords.slice(i, i + DB_BATCH_SIZE);
      console.log(`[PROCESSING] Inserting batch ${Math.floor(i / DB_BATCH_SIZE) + 1} of ${Math.ceil(chunkRecords.length / DB_BATCH_SIZE)}`);

      const { error } = await supabase.from('chunks').insert(batch);
      if (error) {
        console.error(`[PROCESSING] Database error:`, error);
        return new Response(JSON.stringify({
          error: 'Database insertion failed',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      totalInserted += batch.length;
    }

    console.log(`[PROCESSING] Successfully stored ${totalInserted} LLM-generated chunks`);

    return new Response(JSON.stringify({
      message: "Document processed with LLM-powered dual chunking",
      documentType: docType,
      chunkingStrategy: "llm_dual_chunking",
      chunksCreated: chunks.length,
      chunksStored: totalInserted,
      communityName: effectiveCommunityName,
      chunkBreakdown: {
        narrative: dualChunks.filter(c => c.metadata.type.startsWith('narrative')).length,
        atomic: dualChunks.filter(c => c.metadata.type.startsWith('atomic')).length
      },
      chunkSizes: {
        min: Math.min(...chunks.map(c => c.length)),
        max: Math.max(...chunks.map(c => c.length)),
        avg: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('LLM-powered processing error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
