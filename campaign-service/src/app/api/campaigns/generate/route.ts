import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Define campaign types and their specific requirements
const CAMPAIGN_TYPES = {
  facebook_ad: {
    name: 'Facebook Ad',
    fields: ['headlines', 'body_text', 'cta'],
    description: 'Facebook advertising copy with multiple headlines, body text, and call-to-action'
  },
  google_search_ad: {
    name: 'Google Search Ad',
    fields: ['headlines', 'descriptions', 'final_url_path'],
    description: 'Google Search advertising copy with headlines, descriptions, and URL path'
  },
  email_newsletter: {
    name: 'Email Newsletter',
    fields: ['subject_lines', 'preview_text', 'body_content', 'cta'],
    description: 'Email newsletter with subject lines, preview text, body content, and call-to-action'
  },
  social_media_post: {
    name: 'Social Media Post',
    fields: ['post_text', 'hashtags', 'cta'],
    description: 'Social media post with engaging text, hashtags, and call-to-action'
  }
} as const;

// Type definitions
interface CampaignRequest {
  clientId: string;
  campaignType: keyof typeof CAMPAIGN_TYPES;
  productName: string;
  targetAudience: string;
  specialOffer?: string;
  additionalContext?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CampaignRequest = await req.json();
    const { clientId, campaignType, productName, targetAudience, specialOffer, additionalContext } = body;

    // Validate required fields
    if (!clientId || !campaignType || !productName || !targetAudience) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing required fields: clientId, campaignType, productName, targetAudience" 
      }, { status: 400 });
    }

    // Validate campaign type
    if (!CAMPAIGN_TYPES[campaignType]) {
      return NextResponse.json({ 
        success: false, 
        error: `Invalid campaign type. Must be one of: ${Object.keys(CAMPAIGN_TYPES).join(', ')}` 
      }, { status: 400 });
    }

    const supabase = createClient();

    // === Step 1: Retrieve Context from Supabase Vector Database ===
    console.log(`[CAMPAIGN-GEN] Starting campaign generation for client ${clientId}`);
    
    // Create a comprehensive search query
    const searchQuery = `
      ${productName} product information marketing copy advertising
      ${targetAudience} target audience demographics preferences
      ${specialOffer ? `special offer promotion ${specialOffer}` : ''}
      ${additionalContext || ''}
      brand voice tone messaging style guidelines
    `.trim();

    console.log(`[CAMPAIGN-GEN] Search query: ${searchQuery}`);
    
    // Generate embedding for the search query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: searchQuery,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Query the vector database using your match_chunks function
    const { data: contextChunks, error: contextError } = await supabase.rpc('match_chunks', {
      client_id_filter: clientId,
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lower threshold to retrieve more potential matches
      match_count: 15,      // More chunks for richer context
    });

    if (contextError) {
      console.error('[CAMPAIGN-GEN] Supabase RPC error:', contextError);
      throw new Error(`Database query failed: ${contextError.message}`);
    }
    
    // Debug: Check total chunks for this client
    const { data: allChunks, error: countError } = await supabase
      .from('chunks')
      .select('id, content')
      .eq('client_id', clientId);
    
    console.log(`[CAMPAIGN-GEN] Total chunks in database for client: ${allChunks?.length || 0}`);
    console.log(`[CAMPAIGN-GEN] Retrieved ${contextChunks?.length || 0} context chunks with similarity > 0.3`);
    
    if (allChunks && allChunks.length > 0) {
      console.log('[CAMPAIGN-GEN] Sample chunk content:', allChunks[0].content.substring(0, 200) + '...');
    }
    
    // Combine context chunks
    const contextText = contextChunks && contextChunks.length > 0
      ? contextChunks.map((chunk: any, index: number) => `[Context ${index + 1}]\n${chunk.content}`).join('\n\n---\n\n')
      : "No specific client context found in knowledge base.";

    console.log(`[CAMPAIGN-GEN] Context text length: ${contextText.length} characters`);

    // === Step 2: Construct Detailed Prompt for Assistant ===
    const campaignConfig = CAMPAIGN_TYPES[campaignType];
    
    const prompt = `
CRITICAL: Ignore any previous instructions about entertainment, streaming, or other industries. You are working specifically on REAL ESTATE marketing.

You are an expert copywriter for a digital advertising agency specializing in REAL ESTATE. Generate compelling ${campaignConfig.name} copy for a REAL ESTATE product/service.

**REAL ESTATE Campaign Brief:**
- Campaign Type: ${campaignConfig.name}
- Product/Service: ${productName} (REAL ESTATE RELATED)
- Target Audience: ${targetAudience}
- Special Offer: ${specialOffer || 'None specified'}
- Additional Context: ${additionalContext || 'None provided'}

**Client Knowledge Base Context (REAL ESTATE FOCUS):**
${contextText}

**IMPORTANT:** This is for REAL ESTATE marketing. Do NOT generate content about entertainment, streaming, or unrelated industries.

**Requirements:**
Generate ${campaignConfig.description} specifically for REAL ESTATE. Return your response as a single, valid JSON object with this exact structure:

${JSON.stringify(generateResponseStructure(campaignType), null, 2)}

**REAL ESTATE Guidelines:**
- MUST focus on REAL ESTATE content only
- Use the client context to ensure brand consistency and accurate property/service details
- Tailor messaging to the specified target audience in the REAL ESTATE market
- Include the special offer if provided
- Make copy compelling, clear, and action-oriented for REAL ESTATE
- Ensure all text is professional and error-free
- Return ONLY the JSON object, no additional text
- Focus on properties, homes, real estate services, not entertainment
`;

    console.log(`[CAMPAIGN-GEN] Sending prompt to OpenAI Assistant`);

    // === Step 3: Generate Copy with OpenAI Assistant ===
    // Validate OPENAI_ASSISTANT_ID is set
    if (!process.env.OPENAI_ASSISTANT_ID) {
      throw new Error("OPENAI_ASSISTANT_ID environment variable is not set");
    }

    // First create a thread
    const thread = await openai.beta.threads.create();
    if (!thread || !thread.id) {
      throw new Error("Failed to create OpenAI thread");
    }
    console.log(`[CAMPAIGN-GEN] Thread created: ${thread.id}`);

    // Add message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: prompt,
    });

    // Create and run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });
    
    if (!run || !run.id) {
      throw new Error("Failed to create OpenAI run");
    }
    console.log(`[CAMPAIGN-GEN] Run created: ${run.id}`);

    // Store thread and run IDs in variables to avoid any scope issues
    const threadId = thread.id;
    const runId = run.id;

    // Poll for completion
    let currentRun = run;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (['queued', 'in_progress'].includes(currentRun.status) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`[CAMPAIGN-GEN] Polling attempt ${attempts + 1}, status: ${currentRun.status}`);
      try {
        console.log(`[CAMPAIGN-GEN] Retrieving run status for thread: ${threadId}, run: ${runId}`);
        // Correct parameter format for OpenAI API
        currentRun = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
      } catch (retrieveError) {
        console.error(`[CAMPAIGN-GEN] Error retrieving run status:`, retrieveError);
        console.error(`[CAMPAIGN-GEN] Thread ID: ${threadId}, Run ID: ${runId}`);
        throw new Error(`Failed to retrieve run status: ${retrieveError}`);
      }
      attempts++;
    }
    
    if (currentRun.status !== 'completed') {
      const errorDetails = currentRun.last_error?.message || 'Unknown error';
      console.error(`[CAMPAIGN-GEN] Assistant run failed with status: ${currentRun.status}`, errorDetails);
      throw new Error(`Assistant failed to generate copy. Status: ${currentRun.status}. ${errorDetails}`);
    }

    // === Step 4: Extract and Parse Response ===
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find((m: any) => m.role === 'assistant');

    if (!assistantMessage || assistantMessage.content[0].type !== 'text') {
        throw new Error("Assistant did not return a valid text response.");
    }
    
    // Extract JSON from response (handle cases where assistant adds extra text)
    const responseText = assistantMessage.content[0].text.value;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
        console.error('[CAMPAIGN-GEN] No JSON found in response:', responseText);
        throw new Error("Assistant did not return valid JSON.");
    }

    let generatedCopy;
    try {
      generatedCopy = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[CAMPAIGN-GEN] JSON parse error:', parseError);
      console.error('[CAMPAIGN-GEN] Raw response:', responseText);
      throw new Error("Generated copy is not valid JSON.");
    }

    console.log(`[CAMPAIGN-GEN] Successfully generated copy:`, generatedCopy);

    // === Step 5: Save to Database ===
    const { data: newCampaign, error: insertError } = await supabase
      .from('campaigns')
      .insert({
        client_id: clientId,
        campaign_type: campaignType,
        product_name: productName,
        target_audience: targetAudience,
        special_offer: specialOffer || null,
        generated_copy: generatedCopy,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CAMPAIGN-GEN] Database insert error:', insertError);
      throw new Error(`Failed to save campaign: ${insertError.message}`);
    }

    console.log(`[CAMPAIGN-GEN] Campaign saved with ID: ${newCampaign.id}`);

    // === Step 6: Return Success Response ===
    return NextResponse.json({ 
      success: true, 
      campaignId: newCampaign.id,
      generatedCopy,
      contextChunksUsed: contextChunks?.length || 0
    });

  } catch (error: any) {
    console.error("Campaign generation failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// Helper function to generate response structure based on campaign type
function generateResponseStructure(campaignType: keyof typeof CAMPAIGN_TYPES) {
  switch (campaignType) {
    case 'facebook_ad':
      return {
        headlines: ["Headline 1", "Headline 2", "Headline 3"],
        body_text: "Main ad copy text that speaks to the target audience...",
        cta: "Call to action text"
      };
    
    case 'google_search_ad':
      return {
        headlines: ["Headline 1", "Headline 2", "Headline 3"],
        descriptions: ["Description 1", "Description 2"],
        final_url_path: "suggested-url-path"
      };
    
    case 'email_newsletter':
      return {
        subject_lines: ["Subject Line 1", "Subject Line 2", "Subject Line 3"],
        preview_text: "Email preview text...",
        body_content: "Full email body content...",
        cta: "Call to action text"
      };
    
    case 'social_media_post':
      return {
        post_text: "Engaging social media post text...",
        hashtags: ["#hashtag1", "#hashtag2", "#hashtag3"],
        cta: "Call to action text"
      };
    
    default:
      return {
        content: "Generated content based on campaign type"
      };
  }
} 