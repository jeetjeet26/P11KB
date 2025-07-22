import { createClient } from 'jsr:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Defines all the fields the AI can extract from documents
const PROFILE_FIELD_DEFINITIONS = {
  community_name: "The name of the property/community/business (e.g., 'Sinclair at Palm Pointe', 'Downtown Luxury Apartments').",
  community_type: "What kind of property is it (e.g., 'Multifamily Apartments', 'Student Housing').",
  community_address: "The full street address of the community.",
  price_point: "The pricing range or description (e.g., 'Luxury', 'Affordable', '$1500-$2500/month').",
  property_url: "The main website URL for the property.",
  competitors: "A list of direct competitors mentioned.",
  unique_features: "Specific, unique selling points or amenities.",
  target_audience: "The primary demographic the client is targeting.",
  brand_voice_guidelines: "Describe the desired brand tone (e.g., 'Professional and welcoming', 'Modern and edgy').",
  current_campaigns: "Any currently active campaigns, sales, or promotions mentioned."
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { textContent, clientId, profileFieldsToExtract } = await req.json();
    if (!textContent || !clientId || !profileFieldsToExtract || profileFieldsToExtract.length === 0) {
      throw new Error('Missing required parameters');
    }
    // 1. Dynamically build the prompt based on what the frontend asks for.
    const fieldsToRequest = profileFieldsToExtract.map((field)=>`- "${field}": ${PROFILE_FIELD_DEFINITIONS[field]}`).join('\n');
    const systemPrompt = `You are an expert data analyst. Read the provided text and extract the following fields into a JSON object. If you cannot find info for a field, return null for that field.\n\n${fieldsToRequest}`;
    // 2. Call OpenAI to extract the structured data.
    const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: systemPrompt
          },
          {
            role: 'user',
            content: textContent
          }
        ],
        response_format: {
          type: "json_object"
        }
      })
    });
    if (!extractionResponse.ok) throw new Error(await extractionResponse.text());
    const extractionData = await extractionResponse.json();
    const extractedProfile = JSON.parse(extractionData.choices[0].message.content);
    // 3. Filter out null values to prevent erasing existing data.
    const profileUpdate = Object.fromEntries(Object.entries(extractedProfile).filter(([_, value])=>value !== null));
    if (Object.keys(profileUpdate).length === 0) {
      return new Response(JSON.stringify({
        message: "No new information found to update."
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // 4. "Upsert" the data into the client_intake table.
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    const { error } = await supabase.from('client_intake').upsert({
      client_id: clientId,
      ...profileUpdate
    }, {
      onConflict: 'client_id'
    });
    if (error) throw error;
    return new Response(JSON.stringify({
      message: "Client profile updated successfully"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in extract-client-profile:', error);
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
