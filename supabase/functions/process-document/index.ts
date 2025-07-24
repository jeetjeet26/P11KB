import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0';

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
 * Main LLM-powered dual chunking function using Gemini 2.5 Pro
 */
async function generateDualChunksWithLLM(text: string, communityName: string): Promise<DualChunk[]> {
  console.log(`[LLM_CHUNKING] Starting intelligent dual chunking for community: ${communityName}`);
  console.log(`[LLM_CHUNKING] Input text length: ${text.length} characters`);

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  
  // Define LLM function tools for structured output
  const tools = [
    {
      functionDeclarations: [
        {
          name: "create_narrative_chunk",
          description: "Create substantial narrative chunks that provide broad context and tell a story",
          parameters: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The full text of the narrative paragraph (target: 300-800 characters)"
              },
              narrative_type: {
                type: "string",
                enum: ["NARRATIVE_AMENITIES", "NARRATIVE_LOCATION", "NARRATIVE_LIFESTYLE", "NARRATIVE_COMMUNITY"],
                description: "The type of narrative content"
              },
              campaign_focus: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["luxury", "location", "amenities", "value", "lifestyle"]
                },
                description: "The campaign focuses this chunk supports"
              }
            },
            required: ["content", "narrative_type", "campaign_focus"]
          }
        },
        {
          name: "create_atomic_chunk", 
          description: "Extract small, potent, and reusable marketing phrases or ingredients",
          parameters: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The text of the atomic component (target: 15-150 characters, precise marketing phrase)"
              },
              atomic_category: {
                type: "string",
                enum: ["amenity", "feature", "location", "pricing", "lifestyle", "special", "community", "cta", "urgency"],
                description: "The category of atomic component"
              }
            },
            required: ["content", "atomic_category"]
          }
        }
      ]
    }
  ];

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash-exp",
    tools: tools,
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["create_narrative_chunk", "create_atomic_chunk"]
      }
    }
  });

  // Craft intelligent dual chunking prompt
  const prompt = `You are an expert marketing analyst specializing in multifamily real estate. Your task is to analyze the provided document and deconstruct it into two distinct types of marketing content:

**COMMUNITY:** ${communityName}

**YOUR TASK:**
Carefully read and analyze the document, then create both NARRATIVE chunks and ATOMIC chunks using the provided tools.

**NARRATIVE CHUNKS (create_narrative_chunk):**
- Substantial, paragraph-like content that provides broad context and tells a story
- Target: 300-800 characters each
- Focus on lifestyle, location benefits, amenity experiences, or community positioning
- Choose narrative_type based on primary content focus
- Identify which campaign focuses each chunk supports

**ATOMIC CHUNKS (create_atomic_chunk):**
- Small, potent, reusable marketing phrases and ingredients
- Target: 15-150 characters each
- Specific amenities, features, pricing elements, calls-to-action, etc.
- Perfect for headlines, bullet points, and marketing copy ingredients
- Categorize precisely based on content type

**ANALYSIS GUIDELINES:**
- Extract meaningful content, not random text fragments
- Focus on marketing-relevant information
- Identify the emotional appeal and target audience context
- Preserve specific details like pricing, amenities, and location benefits
- Create content that works for real estate marketing campaigns

**QUALITY STANDARDS:**
- Every chunk must be marketing-ready and professionally written
- Avoid generic or meaningless fragments
- Ensure narrative chunks tell a complete story or paint a picture
- Make atomic chunks punchy and specific
- Prioritize quality over quantity

Now analyze this document and create both narrative and atomic chunks:

---
${text}
---

Begin your analysis and create the chunks using the provided tools.`;

  try {
    console.log(`[LLM_CHUNKING] Sending request to Gemini 2.0 Flash Experimental...`);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("Gemini response has no candidates");
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error("Gemini response has no content parts");
    }

    // Process function calls to extract chunks
    const dualChunks: DualChunk[] = [];
    
    for (const part of candidate.content.parts) {
      if (part.functionCall) {
        const functionCall = part.functionCall;
        
        if (functionCall.name === "create_narrative_chunk") {
          const args = functionCall.args;
          const narrativeType = `narrative_${args.narrative_type.toLowerCase().replace('narrative_', '')}` as ChunkType;
          
          dualChunks.push({
            content: args.content,
            metadata: {
              type: narrativeType,
              community_name: communityName,
              char_count: args.content.length,
              campaign_focus: args.campaign_focus
            }
          });
          
        } else if (functionCall.name === "create_atomic_chunk") {
          const args = functionCall.args;
          const atomicType = `atomic_${args.atomic_category}` as ChunkType;
          
          dualChunks.push({
            content: args.content,
            metadata: {
              type: atomicType,
              community_name: communityName,
              char_count: args.content.length,
              atomic_category: args.atomic_category,
              // Add specific metadata based on category
              ...(args.atomic_category === 'amenity' && /pet|dog/i.test(args.content) && { is_pet_related: true }),
              ...(args.atomic_category === 'amenity' && { amenity_category: determineAmenityCategory(args.content) }),
              ...(args.atomic_category === 'location' && { location_type: determineLocationType(args.content) }),
              ...(args.atomic_category === 'pricing' && { price_type: determinePriceType(args.content) }),
            }
          });
        }
      }
    }

    console.log(`[LLM_CHUNKING] Generated ${dualChunks.length} intelligent chunks (${dualChunks.filter(c => c.metadata.type.startsWith('narrative')).length} narrative, ${dualChunks.filter(c => c.metadata.type.startsWith('atomic')).length} atomic)`);
    
    return dualChunks;

  } catch (error) {
    console.error(`[LLM_CHUNKING] Gemini API error:`, error);
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
    const chunkRecords = chunks.map((chunk, i) => {
      const metadata = dualChunks[i].metadata;
      return {
        client_id: clientId,
        source_id: sourceId,
        content: chunk,
        embedding: allEmbeddings[i].embedding,
        document_type: docType,
        chunk_type: 'llm_dual',
        chunk_subtype: metadata.type,
        community_name: metadata.community_name,
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
