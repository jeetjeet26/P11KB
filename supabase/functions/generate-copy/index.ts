import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, clientId } = await req.json();

    if (!query || !clientId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: query, clientId' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Generate embedding for the query
    const queryEmbeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
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

    if (!queryEmbeddingResponse.ok) {
      const error = await queryEmbeddingResponse.text();
      console.error('OpenAI embedding error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate query embedding' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const queryEmbeddingData = await queryEmbeddingResponse.json();
    const queryEmbedding = queryEmbeddingData.data[0].embedding;

    // Search for relevant chunks using vector similarity
    const { data: chunks, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.75,
      match_count: 5,
      client_id_filter: clientId
    });

    if (error) {
      console.error('Database search error:', error);
      return new Response(
        JSON.stringify({ error: error.message }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Prepare context from retrieved chunks
    const contextText = chunks.map(chunk => chunk.content).join('\n---\n');

    // Generate response using OpenAI
    const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert copywriter for an ad agency. Using the following client context, fulfill the user's request. The context is:\n\n${contextText}`
          },
          {
            role: 'user',
            content: query
          }
        ]
      })
    });

    if (!completionResponse.ok) {
      const error = await completionResponse.text();
      console.error('OpenAI completion error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate response' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const completionData = await completionResponse.json();

    return new Response(
      JSON.stringify({ 
        response: completionData.choices[0].message.content,
        chunksUsed: chunks.length
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Generate copy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}); 