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
    const { textContent, clientId, sourceId } = await req.json();

    if (!textContent || !clientId || !sourceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: textContent, clientId, sourceId' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Split text into chunks (simple approach - split by paragraphs and filter short ones)
    const chunks = textContent
      .split('\n')
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 10);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid text chunks found' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get embeddings from OpenAI
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: chunks,
        model: 'text-embedding-3-small'
      })
    });

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.text();
      console.error('OpenAI API error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate embeddings' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const embeddingData = await embeddingResponse.json();

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Prepare chunk records
    const chunkRecords = chunks.map((chunk, i) => ({
      client_id: clientId,
      source_id: sourceId,
      content: chunk,
      embedding: embeddingData.data[i].embedding
    }));

    // Insert chunks into database
    const { error } = await supabase
      .from('chunks')
      .insert(chunkRecords);

    if (error) {
      console.error('Database insert error:', error);
      return new Response(
        JSON.stringify({ error: error.message }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: "Document processed successfully",
        chunksCreated: chunks.length
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Process document error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}); 