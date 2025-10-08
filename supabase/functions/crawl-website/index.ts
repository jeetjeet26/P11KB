import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// ===== INTERFACES =====

interface CrawlRequest {
  client_id: string;
  website_url?: string; // Legacy support - will use first URL from urls_to_crawl if not provided
  urls_to_crawl: string[]; // User-specified list of URLs to crawl
  max_pages?: number;
  exclude_patterns?: string[];
  page_types_to_include?: string[];
}

interface PageContent {
  url: string;
  title: string;
  content: string;
  page_type: string;
  meta_description?: string;
  h1_headings: string[];
  content_length: number;
}

interface DualChunk {
  content: string;
  metadata: WebChunkMetadata;
}

interface WebChunkMetadata {
  type: 'atomic_web' | 'narrative_web';
  page_title: string;
  page_type: string;
  char_count: number;
  content_category?: 'hero' | 'amenity' | 'feature' | 'contact' | 'pricing' | 'gallery' | 'navigation';
  semantic_importance?: 'high' | 'medium' | 'low';
  is_navigation?: boolean;
  contains_contact_info?: boolean;
  has_pricing_info?: boolean;
  // Real estate specific metadata
  floor_plan_bedrooms?: number | null;
  atomic_category?: 'amenity' | 'feature' | 'location' | 'pricing' | 'lifestyle' | 'community' | null;
  price_type?: 'starting_at' | 'range' | 'average' | null;
  amenity_category?: 'fitness' | 'social' | 'convenience' | 'outdoor' | 'pet' | null;
  location_type?: 'proximity' | 'neighborhood' | 'transit' | null;
  community_name?: string | null;
  campaign_focus?: string[];
  is_pet_related?: boolean;
  chunk_subtype?: string | null;
}

// ===== UTILITY FUNCTIONS =====

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash and fragment
    const normalized = parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
    return normalized;
  } catch {
    return url;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function classifyPageType(url: string, title: string, content: string): string {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  // Homepage detection
  if (urlLower.match(/\/(index\.(html?|php)|home|$)/) || 
      urlLower === new URL(url).origin || 
      urlLower === new URL(url).origin + '/') {
    return 'homepage';
  }

  // Amenities page
  if (urlLower.includes('amenities') || urlLower.includes('amenity') ||
      titleLower.includes('amenities') || titleLower.includes('amenity')) {
    return 'amenities';
  }

  // Floor plans / gallery
  if (urlLower.includes('floor') || urlLower.includes('plans') || 
      urlLower.includes('gallery') || urlLower.includes('photos') ||
      titleLower.includes('floor plans') || titleLower.includes('gallery')) {
    return 'gallery';
  }

  // Contact page
  if (urlLower.includes('contact') || urlLower.includes('leasing') ||
      titleLower.includes('contact') || titleLower.includes('leasing')) {
    return 'contact';
  }

  // About page
  if (urlLower.includes('about') || titleLower.includes('about')) {
    return 'about';
  }

  // Pricing page
  if (urlLower.includes('pricing') || urlLower.includes('rates') ||
      titleLower.includes('pricing') || titleLower.includes('rates') ||
      contentLower.includes('starting at') || contentLower.includes('rent')) {
    return 'pricing';
  }

  // Neighborhood / location
  if (urlLower.includes('neighborhood') || urlLower.includes('location') ||
      titleLower.includes('neighborhood') || titleLower.includes('location')) {
    return 'location';
  }

  return 'other';
}

function cleanContent(html: string): string {
  // Remove script and style tags completely
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove common navigation and footer elements
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/class=["\'].*?(nav|menu|footer|header).*?["\']/gi, '');
  
  // Remove HTML tags but keep content
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove common boilerplate content
  const boilerplatePatterns = [
    /copyright.*?\d{4}/gi,
    /all rights reserved/gi,
    /privacy policy/gi,
    /terms of service/gi,
    /cookie policy/gi,
    /skip to main content/gi,
    /toggle navigation/gi,
    /menu/gi
  ];
  
  boilerplatePatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  return cleaned.trim();
}

async function checkRobotsTxt(baseUrl: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const response = await fetch(robotsUrl, { 
      method: 'GET',
      headers: { 'User-Agent': 'P11RAG-Bot/1.0' }
    });
    
    if (!response.ok) return true; // If no robots.txt, assume allowed
    
    const robotsText = await response.text();
    const userAgentSection = robotsText.match(/User-agent:\s*\*[\s\S]*?(?=User-agent:|$)/i);
    
    if (userAgentSection) {
      const disallowPattern = /Disallow:\s*\/$/i;
      return !disallowPattern.test(userAgentSection[0]);
    }
    
    return true;
  } catch {
    return true; // If can't check, assume allowed
  }
}

async function discoverPages(baseUrl: string, maxPages: number = 15): Promise<string[]> {
  const discovered = new Set<string>();
  const domain = extractDomain(baseUrl);
  const baseUrlObj = new URL(baseUrl);
  // Use the full path to keep crawler within the specific property/section
  const basePath = baseUrlObj.pathname.endsWith('/') 
    ? baseUrlObj.pathname.slice(0, -1) 
    : baseUrlObj.pathname;
  
  // Helper to check if URL is within the same section
  const isRelevantUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      // Must be same domain
      if (urlObj.hostname !== baseUrlObj.hostname) return false;
      // Must be under the exact base path (not parent directories)
      const urlPath = urlObj.pathname.split('?')[0]; // Remove query params for comparison
      if (!urlPath.startsWith(basePath) && url !== baseUrl) return false;
      // Exclude common non-content pages
      const excludePatterns = [
        '/careers', '/about-us', '/contact', '/privacy', '/terms',
        '/sustainability', '/corporate', '/press', '/legal'
      ];
      return !excludePatterns.some(pattern => urlObj.pathname.includes(pattern));
    } catch {
      return false;
    }
  };
  
  // Always include the base URL first
  discovered.add(normalizeUrl(baseUrl));
  
  try {
    // Try to get sitemap.xml first
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const sitemapResponse = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'P11RAG-Bot/1.0' }
    });
    
    if (sitemapResponse.ok) {
      const sitemapText = await sitemapResponse.text();
      const urlMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g);
      if (urlMatches) {
        urlMatches.forEach(match => {
          const url = match.replace(/<\/?loc>/g, '');
          if (isRelevantUrl(url)) {
            discovered.add(normalizeUrl(url));
          }
        });
      }
    }
  } catch {
    // Sitemap failed, continue with homepage crawling
  }
  
  // If we don't have enough URLs from sitemap, crawl homepage for links
  if (discovered.size < maxPages) {
    try {
      const homepageResponse = await fetch(baseUrl, {
        headers: { 'User-Agent': 'P11RAG-Bot/1.0' }
      });
      
      if (homepageResponse.ok) {
        const homepageHtml = await homepageResponse.text();
        const linkMatches = homepageHtml.match(/href=["\']([^"\']+)["\']/g);
        
        if (linkMatches) {
          linkMatches.forEach(match => {
            try {
              const href = match.replace(/href=["\']/g, '').replace(/["\']/g, '');
              const absoluteUrl = new URL(href, baseUrl).toString();
              
              if (isRelevantUrl(absoluteUrl) && 
                  !absoluteUrl.includes('#') && 
                  !absoluteUrl.match(/\.(pdf|jpg|jpeg|png|gif|zip|doc|docx)$/i)) {
                discovered.add(normalizeUrl(absoluteUrl));
              }
            } catch {
              // Invalid URL, skip
            }
          });
        }
      }
    } catch {
      // Homepage crawling failed
    }
  }
  
  return Array.from(discovered).slice(0, maxPages);
}

async function crawlPage(url: string): Promise<PageContent | null> {
  try {
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'P11RAG-Bot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    });
    
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      return null;
    }
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract meta description
    const metaMatch = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
    const metaDescription = metaMatch ? metaMatch[1].trim() : '';
    
    // Extract h1 headings
    const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi);
    const h1Headings = h1Matches ? h1Matches.map(h => h.replace(/<[^>]+>/g, '').trim()) : [];
    
    // Clean content
    const cleanedContent = cleanContent(html);
    const pageType = classifyPageType(url, title, cleanedContent);
    
    return {
      url,
      title,
      content: cleanedContent,
      page_type: pageType,
      meta_description: metaDescription,
      h1_headings: h1Headings,
      content_length: cleanedContent.length
    };
  } catch (error) {
    console.error(`Failed to crawl ${url}:`, error);
    return null;
  }
}

async function generateWebChunksWithLLM(pageContent: PageContent): Promise<DualChunk[]> {
  try {
    const modelName = Deno.env.get('OPENAI_CHUNKING_MODEL') || 'gpt-4o-mini';
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }
    const prompt = `Analyze this web page content and create dual chunks for real estate marketing:

URL: ${pageContent.url}
Page Type: ${pageContent.page_type}
Title: ${pageContent.title}
Content: ${pageContent.content}

Create chunks following these rules:
1. ATOMIC chunks (15-150 characters): Perfect for Google Ads headlines, bullet points, features
2. NARRATIVE chunks (300-800 characters): Contextual descriptions for ad copy context

Focus on:
- Property features and amenities
- Location benefits
- Pricing information
- Unique selling points
- Community lifestyle elements

IMPORTANT: Extract structured real estate metadata for each chunk to enable precise filtering during ad generation.

Return as JSON array with this structure:
{
  "chunks": [
    {
      "content": "chunk text here",
      "metadata": {
        "type": "atomic_web" or "narrative_web",
        "page_title": "${pageContent.title}",
        "page_type": "${pageContent.page_type}",
        "char_count": number,
        "content_category": "hero|amenity|feature|contact|pricing|gallery|navigation",
        "semantic_importance": "high|medium|low",
        "is_navigation": boolean,
        "contains_contact_info": boolean,
        "has_pricing_info": boolean,
        
        // Real Estate Specific Metadata (extract when present):
        "floor_plan_bedrooms": null or number (0 for studio, 1, 2, 3, etc. - ONLY if chunk mentions specific bedroom count),
        "atomic_category": null or "amenity|feature|location|pricing|lifestyle|community",
        "price_type": null or "starting_at|range|average" (if chunk contains pricing),
        "amenity_category": null or "fitness|social|convenience|outdoor|pet" (if chunk is amenity-related),
        "location_type": null or "proximity|neighborhood|transit" (if chunk is location-related),
        "community_name": null or string (extract property/community name if mentioned),
        "campaign_focus": [] or array of "luxury|location|amenities|value|lifestyle" (what marketing angles this supports),
        "is_pet_related": false or true (if chunk mentions pets, pet amenities, pet policy),
        "chunk_subtype": null or string (e.g., "pool", "fitness_center", "parking", "kitchen_features")
      }
    }
  ]
}

CRITICAL RULES FOR METADATA EXTRACTION:
1. For pricing chunks like "2-Bed Apartments: Starting at $4,469", set floor_plan_bedrooms: 2
2. For "Studios starting at $2,933", set floor_plan_bedrooms: 0
3. For "1-bedroom from $3,310", set floor_plan_bedrooms: 1
4. For generic "Units start at $X" without bedroom context, leave floor_plan_bedrooms: null
5. For amenity chunks, categorize by type (fitness, social, outdoor, convenience, pet)
6. For location chunks, specify if it's about proximity, neighborhood character, or transit
7. Set campaign_focus array to indicate which marketing angles the chunk supports
8. Extract community_name from the content when the property name is mentioned

EXAMPLES:
- "2-Bed Apartments: Starting at $4,469" → floor_plan_bedrooms: 2, price_type: "starting_at", atomic_category: "pricing"
- "Rooftop pool with cabanas" → amenity_category: "outdoor", atomic_category: "amenity", campaign_focus: ["luxury", "amenities"]
- "Pet wash station and dog park" → amenity_category: "pet", is_pet_related: true, chunk_subtype: "pet_amenities"
- "Walk to restaurants and shops" → location_type: "proximity", atomic_category: "location", campaign_focus: ["location", "lifestyle"]`;

    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: 'You are a JSON-only extractor for real estate web content.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });

    if (!chatResponse.ok) {
      const err = await chatResponse.text();
      throw new Error(`OpenAI error ${chatResponse.status}: ${err}`);
    }

    const chatJson = await chatResponse.json();
    const responseText = chatJson?.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.chunks || [];
  } catch (error) {
    console.error('LLM chunking failed:', error);
    // Do not create fallback chunks; return empty to indicate failure
    return [];
  }
}

// ===== MAIN EDGE FUNCTION =====

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const { 
      client_id, 
      website_url,
      urls_to_crawl = [],
      max_pages = 15, 
      exclude_patterns = [],
      page_types_to_include = []
    }: CrawlRequest = await req.json();

    // Validate required fields
    if (!client_id) {
      return new Response(JSON.stringify({ 
        error: 'Missing required field: client_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ensure we have URLs to crawl
    if (!urls_to_crawl || urls_to_crawl.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Missing required field: urls_to_crawl (must be a non-empty array of URLs)' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Initialize OpenAI
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize all URLs
    const normalizedUrls = urls_to_crawl.map(url => normalizeUrl(url));
    const baseUrl = normalizedUrls[0]; // Use first URL as the base for tracking

    console.log(`[CRAWL] Starting crawl job for client ${client_id}, crawling ${normalizedUrls.length} URLs`);
    console.log(`[CRAWL] URLs to crawl:`, normalizedUrls);

    // Check robots.txt compliance for the base domain
    const robotsCompliant = await checkRobotsTxt(baseUrl);
    if (!robotsCompliant) {
      console.warn('[CRAWL] robots.txt check suggests disallowed, but proceeding with user-specified URLs');
    }

    // Create crawl job record
    const { data: crawlJob, error: jobError } = await supabase
      .from('web_crawl_jobs')
      .insert({
        client_id,
        website_url: baseUrl,
        status: 'in_progress',
        robots_txt_compliant: robotsCompliant,
        crawl_settings: {
          max_pages: normalizedUrls.length,
          exclude_patterns,
          page_types_to_include
        },
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError) {
      console.error('[CRAWL] Failed to create crawl job:', jobError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create crawl job',
        details: jobError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const crawlJobId = crawlJob.id;
    console.log(`[CRAWL] Created crawl job ${crawlJobId}`);

    try {
      // Use user-provided URLs directly (no discovery)
      console.log(`[CRAWL] Using ${normalizedUrls.length} user-specified URLs`);
      
      // Filter out excluded patterns if any
      const filteredUrls = normalizedUrls.filter(url => {
        return !exclude_patterns.some(pattern => url.includes(pattern));
      });

      console.log(`[CRAWL] After filtering exclusions: ${filteredUrls.length} URLs to crawl`);

      // Update job with URLs to crawl
      await supabase
        .from('web_crawl_jobs')
        .update({
          pages_found: filteredUrls.length,
          discovered_pages: filteredUrls
        })
        .eq('id', crawlJobId);

      // Crawl pages with rate limiting
      let processedPages = 0;
      let totalChunksCreated = 0;
      const crawlDelay = 1000; // 1 second delay between requests

      for (const url of filteredUrls) {
        console.log(`[CRAWL] Processing page ${processedPages + 1}/${filteredUrls.length}: ${url}`);
        
        // Create web page record
        const { data: webPage } = await supabase
          .from('web_pages')
          .insert({
            crawl_job_id: crawlJobId,
            url,
            processing_status: 'pending'
          })
          .select()
          .single();

        try {
          // Crawl the page
          const pageContent = await crawlPage(url);
          
          if (!pageContent) {
            await supabase
              .from('web_pages')
              .update({
                processing_status: 'failed',
                error_message: 'Failed to fetch or parse page content'
              })
              .eq('id', webPage.id);
            continue;
          }

          // Filter by page type if specified
          if (page_types_to_include.length > 0 && 
              !page_types_to_include.includes(pageContent.page_type)) {
            await supabase
              .from('web_pages')
              .update({
                processing_status: 'skipped',
                error_message: 'Page type not in included types'
              })
              .eq('id', webPage.id);
            continue;
          }

          // Generate chunks using LLM
          console.log(`[CRAWL] Generating chunks for ${url}`);
          const dualChunks = await generateWebChunksWithLLM(pageContent);

          if (dualChunks.length === 0) {
            await supabase
              .from('web_pages')
              .update({
                processing_status: 'processed',
                page_title: pageContent.title,
                page_type: pageContent.page_type,
                content_length: pageContent.content_length,
                chunks_created: 0,
                processed_at: new Date().toISOString()
              })
              .eq('id', webPage.id);
            continue;
          }

          // Generate embeddings for chunks
          const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              input: dualChunks.map(chunk => chunk.content),
              model: 'text-embedding-3-small'
            })
          });

          if (!openaiResponse.ok) {
            throw new Error(`OpenAI API error: ${openaiResponse.statusText}`);
          }

          const embeddingData = await openaiResponse.json();
          const embeddings = embeddingData.data;

          // Check if source exists, if not create it
          let source;
          const { data: existingSource } = await supabase
            .from('sources')
            .select('*')
            .eq('client_id', client_id)
            .eq('url_crawled', url)
            .single();

          if (existingSource) {
            source = existingSource;
          } else {
            const { data: newSource, error: sourceError } = await supabase
              .from('sources')
              .insert({
                client_id,
                type: 'website_crawl',
                source_location: url,
                url_crawled: url,
                crawl_status: 'completed'
              })
              .select()
              .single();

            if (sourceError || !newSource) {
              console.error('[CRAWL] Failed to create source:', sourceError);
              await supabase
                .from('web_pages')
                .update({
                  processing_status: 'failed',
                  error_message: `Failed to create source: ${sourceError?.message || 'Unknown error'}`
                })
                .eq('id', webPage.id);
              continue;
            }
            source = newSource;
          }

          // Prepare chunk records with full metadata
          const chunkRecords = dualChunks.map((chunk, i) => {
            // Determine proper chunk_subtype based on atomic vs narrative
            let chunk_subtype: string;
            if (chunk.metadata.type === 'atomic_web') {
              // For atomic chunks, use atomic_<category> format
              const category = chunk.metadata.atomic_category || 'general';
              chunk_subtype = `atomic_${category}`;
            } else {
              // For narrative chunks, use narrative_<page_type> format
              const category = chunk.metadata.content_category || 
                               (pageContent.page_type === 'amenities' ? 'amenities' :
                                pageContent.page_type === 'location' ? 'location' :
                                pageContent.page_type === 'pricing' ? 'pricing' :
                                pageContent.page_type === 'homepage' ? 'community' : 'general');
              chunk_subtype = `narrative_${category}`;
            }

            return {
              client_id,
              source_id: source.id,
              content: chunk.content,
              embedding: embeddings[i].embedding,
              document_type: 'website_content',
              chunk_type: 'llm_dual',  // ✅ FIXED: Always use 'llm_dual' for dual chunking system
              source_type: 'web',
              chunk_subtype: chunk_subtype,  // ✅ FIXED: Proper atomic_/narrative_ format
              source_url: url,
              page_title: pageContent.title,
              page_type: pageContent.page_type,
              crawl_timestamp: new Date().toISOString(),
              content_language: 'en',
              // Real estate specific metadata
              char_count: chunk.metadata.char_count || chunk.content.length,
              floor_plan_bedrooms: chunk.metadata.floor_plan_bedrooms || null,
              atomic_category: chunk.metadata.atomic_category || null,
              price_type: chunk.metadata.price_type || null,
              amenity_category: chunk.metadata.amenity_category || null,
              location_type: chunk.metadata.location_type || null,
              community_name: chunk.metadata.community_name || null,
              campaign_focus: chunk.metadata.campaign_focus ? JSON.stringify(chunk.metadata.campaign_focus) : null,
              is_pet_related: chunk.metadata.is_pet_related || false
            };
          });

          // Insert chunks
          const { error: chunkError } = await supabase
            .from('chunks')
            .insert(chunkRecords);

          if (chunkError) {
            console.error('[CRAWL] Failed to insert chunks:', chunkError);
            await supabase
              .from('web_pages')
              .update({
                processing_status: 'failed',
                error_message: `Failed to save chunks: ${chunkError.message}`
              })
              .eq('id', webPage.id);
            continue;
          }

          // Update page record
          await supabase
            .from('web_pages')
            .update({
              processing_status: 'processed',
              page_title: pageContent.title,
              page_type: pageContent.page_type,
              content_length: pageContent.content_length,
              meta_description: pageContent.meta_description,
              h1_headings: pageContent.h1_headings,
              chunks_created: chunkRecords.length,
              processed_at: new Date().toISOString()
            })
            .eq('id', webPage.id);

          totalChunksCreated += chunkRecords.length;
          console.log(`[CRAWL] Created ${chunkRecords.length} chunks for ${url}`);

        } catch (error) {
          console.error(`[CRAWL] Failed to process ${url}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          await supabase
            .from('web_pages')
            .update({
              processing_status: 'failed',
              error_message: errorMessage
            })
            .eq('id', webPage.id);
        }

        processedPages++;

        // Update job progress
        await supabase
          .from('web_crawl_jobs')
          .update({
            pages_processed: processedPages,
            chunks_created: totalChunksCreated
          })
          .eq('id', crawlJobId);

        // Rate limiting delay
        if (processedPages < filteredUrls.length) {
          await new Promise(resolve => setTimeout(resolve, crawlDelay));
        }
      }

      // Mark job as completed
      await supabase
        .from('web_crawl_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', crawlJobId);

      console.log(`[CRAWL] Job completed. Processed ${processedPages} pages, created ${totalChunksCreated} chunks`);

      return new Response(JSON.stringify({
        success: true,
        crawl_job_id: crawlJobId,
        pages_processed: processedPages,
        chunks_created: totalChunksCreated,
        discovered_pages: filteredUrls.length
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[CRAWL] Job failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Mark job as failed
      await supabase
        .from('web_crawl_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', crawlJobId);

      return new Response(JSON.stringify({
        error: 'Crawling job failed',
        details: errorMessage,
        crawl_job_id: crawlJobId
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('[CRAWL] Request failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

