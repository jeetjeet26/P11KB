import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { query, clientId } = await req.json();
    if (!query || !clientId) {
      throw new Error("Missing query or clientId");
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
    // 1. Fetch the structured profile from the client_intake table.
    const { data: intakeData, error: intakeError } = await supabase.from('client_intake').select('*').eq('client_id', clientId).single();
    if (intakeError && intakeError.code !== 'PGRST116') {
      throw intakeError;
    }
    const structuredContext = intakeData ? `
      **Client Brand Guidelines (MUST FOLLOW):**
      - Brand Voice: ${intakeData.brand_voice_guidelines || 'Not specified'}
      - Target Audience: ${intakeData.target_audience || 'Not specified'}
      - Unique Features to Highlight: ${intakeData.unique_features || 'Not specified'}
      - Current Offers: ${intakeData.current_campaigns || 'Not specified'}
    ` : 'No structured brand guidelines found.';
    // 2. Perform a vector search to get relevant text chunks.
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: query,
        model: 'text-embedding-3-small'
      })
    });
    if (!embeddingResponse.ok) throw new Error(await embeddingResponse.text());
    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    const { data: chunks, error: rpcError } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.75,
      match_count: 5,
      client_id_filter: clientId
    });
    if (rpcError) throw rpcError;
    const semanticContext = chunks && chunks.length > 0 ? chunks.map((c)=>c.content).join('\n---\n') : 'No specific context found in documents.';
    // 3. Build the final, powerful prompt that combines both data sources.
    const systemPrompt = `You are an expert ad copywriter. Your task is to generate ad copy that is highly specific to the client's brand. You must use all the information provided below.

MANDATORY CHARACTER REQUIREMENTS - NO EXCEPTIONS:
- EVERY headline MUST be 20-30 characters (REJECT anything under 20)
- EVERY description MUST be 65-90 characters (REJECT anything under 65)
- Count characters before submitting. Add descriptive words to reach minimums.
- Example: "Downtown Living" (16 chars) → "Luxury Downtown Living" (22 chars)

      ${structuredContext}

      **Supporting Context from Uploaded Client Documents:**
      ${semanticContext}
    `;
    // 4. Call OpenAI to generate the ad copy.
    const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: query
          }
        ]
      })
    });
    if (!completionResponse.ok) throw new Error(await completionResponse.text());
    const completionData = await completionResponse.json();
    return new Response(JSON.stringify({
      response: completionData.choices[0].message.content
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in generate-copy:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
