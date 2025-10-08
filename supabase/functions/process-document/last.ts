import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare Deno for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// ===== PHASE 1: DUAL CHUNKING SYSTEM =====

// Enhanced Chunk Types for Multifamily
enum ChunkType {
  // Atomic component types (8-90 characters)
  ATOMIC_AMENITY = 'atomic_amenity',           // "Resort-style saltwater pool"
  ATOMIC_FEATURE = 'atomic_feature',           // "In-unit washer and dryer"
  ATOMIC_FLOOR_PLAN = 'atomic_floor_plan',     // "Spacious 2-bed, 2-bath"
  ATOMIC_LIFESTYLE = 'atomic_lifestyle',       // "Luxury apartment living"
  ATOMIC_LOCATION = 'atomic_location',         // "5-minute drive from South Coast Plaza"
  ATOMIC_SPECIAL = 'atomic_special',           // "One month free on 13-month lease"
  ATOMIC_URGENCY = 'atomic_urgency',           // "Offer ends July 31st, 2025"
  ATOMIC_CTA = 'atomic_cta',                   // "Schedule your tour"
  ATOMIC_PRICE = 'atomic_price',               // "$1,200-$2,000/month"
  ATOMIC_COMMUNITY = 'atomic_community',       // "The Current Costa Mesa"
  
  // Narrative context types (400-800 characters)
  NARRATIVE_AMENITIES = 'narrative_amenities', // Full amenity descriptions with lifestyle context
  NARRATIVE_LOCATION = 'narrative_location',   // Location benefits with supporting details
  NARRATIVE_LIFESTYLE = 'narrative_lifestyle', // Target market and lifestyle descriptions
  NARRATIVE_COMMUNITY = 'narrative_community'  // Overall community positioning
}

// Enhanced Metadata Structure
interface MultifamilyChunkMetadata {
  type: ChunkType;
  community_name: string;
  char_count: number;
  
  // For atomic chunks: which ad formats they're suitable as ingredients for
  atomic_category?: 'amenity' | 'feature' | 'location' | 'pricing' | 'lifestyle' | 'availability';
  
  // For narrative chunks: which campaign focuses they support
  campaign_focus?: ('luxury' | 'location' | 'amenities' | 'value' | 'lifestyle')[];
  
  // Type-specific metadata
  is_pet_related?: boolean;
  offer_expiry?: string; // ISO date for leasing specials
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

// ===== HELPER FUNCTIONS =====

/**
 * Extract community/business name from content when not explicitly provided
 */
function extractCommunityNameFromContent(text: string): string | null {
  const patterns = [
    // Look for "Community/Business Name:" pattern
    /Community\/Business Name:\s*([^\n]+)/i,
    /Business Name:\s*([^\n]+)/i,
    /Community Name:\s*([^\n]+)/i,
    /Property Name:\s*([^\n]+)/i,
    
    // Look for "CLIENT ONBOARDING INFORMATION FOR [Name]"
    /CLIENT ONBOARDING INFORMATION FOR\s+([^\n]+)/i,
    
    // Look for apartment/community names with common suffixes (more precise)
    /([A-Z][a-zA-Z\s&]{2,40}(?:Apartments?|Community|Properties|Residences?))(?:\s|$|Type:|Property Type:)/,
    /([A-Z][a-zA-Z\s&]{2,40}at\s+[A-Z][a-zA-Z\s]{2,30})(?:\s|$|Type:|Property Type:)/,
    
    // Look for "The [Name]" patterns
    /(The\s+[A-Z][a-zA-Z\s]{2,40})(?:\s|$|Type:|Property Type:)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let extracted = match[1].trim();
      
      // Clean up common unwanted suffixes/prefixes
      extracted = extracted.replace(/^(CLIENT ONBOARDING INFORMATION FOR\s+)/i, '');
      extracted = extracted.replace(/\s+(BASIC INFORMATION|INFO|DETAILS).*$/i, '');
      
      // Ensure it fits database constraint (255 chars max)
      if (extracted.length > 200) {
        extracted = extracted.substring(0, 200).trim();
      }
      
      // Filter out generic terms
      if (!extracted.match(/^(Type|Property|Address|Website|Information|Details)$/i) && extracted.length > 3) {
        console.log(`[EXTRACT] Found community name: "${extracted}"`);
        return extracted;
      }
    }
  }
  
  console.log(`[EXTRACT] No community name found in content`);
  return null;
}

// ===== DUAL CHUNKING FUNCTIONS =====

/**
 * Main dual chunking function that creates both atomic and narrative chunks
 */
function createDualChunkingSystem(text: string, communityName: string): DualChunk[] {
  console.log(`[DUAL_CHUNKING] Starting dual chunking for community: ${communityName}`);
  console.log(`[DUAL_CHUNKING] Input text length: ${text.length} characters`);
  
  const chunks: DualChunk[] = [];
  
  // 1. Create atomic components (precise ingredients)
  const atomicComponents = extractAtomicComponents(text, communityName);
  chunks.push(...atomicComponents);
  console.log(`[DUAL_CHUNKING] Created ${atomicComponents.length} atomic chunks`);
  
  // 2. Create narrative chunks (reduced size, focused context)
  const narrativeChunks = createFocusedNarrativeChunks(text, communityName);
  chunks.push(...narrativeChunks);
  console.log(`[DUAL_CHUNKING] Created ${narrativeChunks.length} narrative chunks`);
  
  console.log(`[DUAL_CHUNKING] Total chunks created: ${chunks.length}`);
  return chunks;
}

/**
 * Extract atomic components from text using pattern matching
 */
function extractAtomicComponents(text: string, communityName: string): DualChunk[] {
  const atomicChunks: DualChunk[] = [];
  
  // Amenity patterns (8-90 characters)
  const amenityPatterns = [
    /(?:resort-style|luxury|heated|saltwater|infinity|rooftop|olympic-size|lap)\s+pool/gi,
    /(?:state-of-the-art|24-hour|fully-equipped|modern)\s+fitness\s+(?:center|gym)/gi,
    /(?:in-unit|full-size|stackable|front-loading)\s+(?:washer|laundry)/gi,
    /(?:granite|quartz|stainless\s+steel|gourmet)\s+(?:countertops|appliances|kitchen)/gi,
    /(?:walk-in|spacious|custom)\s+(?:closets?|pantry)/gi,
    /(?:private|covered|spacious|oversized)\s+(?:balcony|balconies|patio|patios)/gi,
    /(?:clubhouse|business\s+center|media\s+room|game\s+room)/gi,
    /(?:dog\s+park|pet\s+spa|pet-friendly|dog\s+run)/gi,
    /(?:concierge|doorman|valet|package)\s+(?:service|services)/gi,
    /(?:garage|covered|assigned|reserved)\s+parking/gi
  ];
  
  // Feature patterns
  const featurePatterns = [
    /(?:hardwood|luxury\s+vinyl|ceramic\s+tile)\s+(?:floors|flooring)/gi,
    /(?:central|zoned)\s+(?:air|a\/c|heating)/gi,
    /(?:high|vaulted|cathedral)\s+ceilings/gi,
    /(?:crown|decorative)\s+molding/gi,
    /(?:energy-efficient|double-pane)\s+windows/gi,
    /(?:security|controlled\s+access|keyless)\s+(?:system|entry)/gi,
    /(?:smart|programmable)\s+thermostat/gi,
    /(?:usb|built-in)\s+outlets/gi
  ];
  
  // Location patterns
  const locationPatterns = [
    /(?:\d+\s+minutes?|walking\s+distance|steps\s+from|close\s+to|near|minutes\s+from)\s+(?:shopping|dining|entertainment|beach|downtown|metro|transit)/gi,
    /(?:convenient\s+access|easy\s+access|quick\s+drive)\s+to\s+.{5,50}/gi,
    /(?:prime|desirable|prestigious)\s+(?:location|neighborhood|area)/gi,
    /(?:waterfront|beachfront|ocean\s+view|mountain\s+view)/gi
  ];
  
  // Price patterns
  const pricePatterns = [
    /\$[\d,]+(?:-\$?[\d,]+)?\s*\/?\s*(?:month|mo|monthly)?/gi,
    /(?:starting\s+at|from|as\s+low\s+as)\s+\$[\d,]+/gi,
    /(?:rent|pricing|rates)\s+(?:starting\s+at|from)\s+\$[\d,]+/gi
  ];
  
  // Special offer patterns
  const specialPatterns = [
    /(?:one|1|first)\s+month\s+free/gi,
    /(?:\$\d+|\d+\s+months?)\s+(?:off|deposit|special)/gi,
    /(?:move-in|signing|lease)\s+(?:special|incentive|bonus)/gi,
    /(?:waived|reduced|no)\s+(?:deposit|fees|application\s+fee)/gi
  ];

  // Availability and leasing patterns
  const availabilityPatterns = [
    /(?:available|move-in\s+ready|lease\s+ready|ready\s+for\s+occupancy)\s+(?:in\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi,
    /(?:available|move-in\s+ready|lease\s+ready)\s+(?:in\s+)?\d{1,2}\/\d{4}/gi,
    /(?:available|move-in\s+ready|lease\s+ready)\s+(?:in\s+)?\d{1,2}\/\d{1,2}\/\d{4}/gi,
    /(?:coming\s+soon|opening|grand\s+opening)\s+(?:in\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi,
    /(?:now\s+leasing|pre-leasing|accepting\s+applications)/gi,
    /(?:immediate|instant)\s+(?:move-in|occupancy|availability)/gi,
    /(?:lease\s+starts?|occupancy\s+begins?)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi
  ];

  // Extract and create atomic chunks
  const extractFromPatterns = (patterns: RegExp[], type: ChunkType, category: string) => {
    patterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        const cleanMatch = match.trim();
        if (cleanMatch.length >= 8 && cleanMatch.length <= 90) {
          atomicChunks.push({
            content: cleanMatch,
            metadata: {
              type,
              community_name: communityName,
              char_count: cleanMatch.length,
              atomic_category: category as any,
              ...(type === ChunkType.ATOMIC_AMENITY && category === 'amenity' && /pet|dog/.test(cleanMatch.toLowerCase()) && { is_pet_related: true }),
              ...(type === ChunkType.ATOMIC_SPECIAL && { offer_expiry: extractExpiryDate(cleanMatch) }),
              ...(type === ChunkType.ATOMIC_PRICE && { price_type: determinePriceType(cleanMatch) }),
              ...(type === ChunkType.ATOMIC_LOCATION && { location_type: determineLocationType(cleanMatch) }),
              ...(type === ChunkType.ATOMIC_AMENITY && { amenity_category: determineAmenityCategory(cleanMatch) })
            }
          });
        }
      });
    });
  };
  
  extractFromPatterns(amenityPatterns, ChunkType.ATOMIC_AMENITY, 'amenity');
  extractFromPatterns(featurePatterns, ChunkType.ATOMIC_FEATURE, 'feature');
  extractFromPatterns(locationPatterns, ChunkType.ATOMIC_LOCATION, 'location');
  extractFromPatterns(pricePatterns, ChunkType.ATOMIC_PRICE, 'pricing');
  extractFromPatterns(specialPatterns, ChunkType.ATOMIC_SPECIAL, 'pricing');
  extractFromPatterns(availabilityPatterns, ChunkType.ATOMIC_SPECIAL, 'availability');
  
  // Extract community name if found
  const communityPatterns = [
    new RegExp(`(?:the\\s+)?${communityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:apartments?|condos?|community|residence|homes?))?`, 'gi'),
    /(?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:apartments?|condos?|community|residence|homes?)/gi
  ];
  
  communityPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => {
      const cleanMatch = match.trim();
      if (cleanMatch.length >= 8 && cleanMatch.length <= 90) {
        atomicChunks.push({
          content: cleanMatch,
          metadata: {
            type: ChunkType.ATOMIC_COMMUNITY,
            community_name: communityName,
            char_count: cleanMatch.length,
            atomic_category: 'lifestyle'
          }
        });
      }
    });
  });
  
  // Remove duplicates
  const uniqueAtomicChunks = atomicChunks.filter((chunk, index, self) => 
    index === self.findIndex(c => c.content.toLowerCase() === chunk.content.toLowerCase())
  );
  
  console.log(`[ATOMIC_EXTRACTION] Extracted ${uniqueAtomicChunks.length} unique atomic components`);
  return uniqueAtomicChunks;
}

/**
 * Create focused narrative chunks (400-800 characters)
 */
function createFocusedNarrativeChunks(text: string, communityName: string): DualChunk[] {
  const narrativeChunks: DualChunk[] = [];
  
  console.log(`[NARRATIVE_CREATION] Starting narrative chunking for text length: ${text.length}`);
  
  // Enhanced section splitting with multiple strategies
  let sections = text.split(/\n\s*\n/).filter(section => section.trim().length > 0);
  console.log(`[NARRATIVE_CREATION] Double newline split produced ${sections.length} sections`);
  
  // If double newline splitting doesn't work well, try other strategies
  if (sections.length <= 2 && text.length > 1200) {
    console.log(`[NARRATIVE_CREATION] Fallback: Trying form field splitting`);
    
    // Try splitting by form field patterns (common in client onboarding forms)
    sections = text.split(/(?:\n|^)(?=[A-Z][^.!?]*?:(?:\s|$))/m).filter(section => section.trim().length > 0);
    console.log(`[NARRATIVE_CREATION] Form field split produced ${sections.length} sections`);
    
    // If that doesn't work, try splitting by logical breaks
    if (sections.length <= 2) {
      console.log(`[NARRATIVE_CREATION] Fallback: Trying sentence-based splitting`);
      sections = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(section => section.trim().length > 50);
      console.log(`[NARRATIVE_CREATION] Sentence split produced ${sections.length} sections`);
    }
    
    // If we still have large sections, force split them
    if (sections.some(section => section.length > 1000)) {
      console.log(`[NARRATIVE_CREATION] Force splitting large sections`);
      const forceSplit: string[] = [];
      for (const section of sections) {
        if (section.length > 1000) {
          // Split large sections by sentences
          const sentences = section.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
          let currentGroup = '';
          for (const sentence of sentences) {
            if (currentGroup && (currentGroup + ' ' + sentence).length > 800) {
              if (currentGroup.length >= 200) {
                forceSplit.push(currentGroup.trim());
              }
              currentGroup = sentence;
            } else {
              currentGroup = currentGroup ? currentGroup + ' ' + sentence : sentence;
            }
          }
          if (currentGroup && currentGroup.length >= 200) {
            forceSplit.push(currentGroup.trim());
          }
        } else {
          forceSplit.push(section);
        }
      }
      sections = forceSplit;
      console.log(`[NARRATIVE_CREATION] Force split produced ${sections.length} sections`);
    }
  }
  
  // Create narrative chunks from sections
  let currentChunk = '';
  let currentFocus: string[] = [];
  
  for (const section of sections) {
    const sectionText = section.trim();
    
    // Skip very short sections that won't add value
    if (sectionText.length < 50) {
      continue;
    }
    
    // Determine campaign focus for this section
    const focus = determineCampaignFocus(sectionText);
    const narrativeType = determineNarrativeType(sectionText);
    
    // If adding this section would exceed max size or change focus significantly, save current chunk
    const wouldExceedSize = currentChunk && (currentChunk + '\n\n' + sectionText).length > 800;
    const focusChanged = currentChunk && !arraysEqual(currentFocus, focus) && currentFocus.length > 0;
    
    if (wouldExceedSize || focusChanged) {
      // Save current chunk if it meets minimum size
      if (currentChunk.length >= 400) {
        narrativeChunks.push({
          content: currentChunk,
          metadata: {
            type: determineNarrativeType(currentChunk),
            community_name: communityName,
            char_count: currentChunk.length,
            campaign_focus: currentFocus as any[]
          }
        });
        console.log(`[NARRATIVE_CREATION] Created chunk: ${currentChunk.length} chars, focus: ${currentFocus.join(',')}`);
      }
      currentChunk = sectionText;
      currentFocus = focus;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + sectionText : sectionText;
      currentFocus = mergeArrays(currentFocus, focus);
    }
  }
  
  // Save final chunk
  if (currentChunk && currentChunk.length >= 400) {
    narrativeChunks.push({
      content: currentChunk,
      metadata: {
        type: determineNarrativeType(currentChunk),
        community_name: communityName,
        char_count: currentChunk.length,
        campaign_focus: currentFocus as any[]
      }
    });
    console.log(`[NARRATIVE_CREATION] Created final chunk: ${currentChunk.length} chars, focus: ${currentFocus.join(',')}`);
  }
  
  // If we still only have one chunk and it's very large, force split it
  if (narrativeChunks.length === 1 && narrativeChunks[0].content.length > 1200) {
    console.log(`[NARRATIVE_CREATION] Force splitting single large chunk of ${narrativeChunks[0].content.length} chars`);
    const largeChunk = narrativeChunks[0];
    narrativeChunks.length = 0; // Clear array
    
    // Split the large chunk into smaller pieces
    const chunkPieces = forceSplitLargeChunk(largeChunk.content);
    for (const piece of chunkPieces) {
      if (piece.length >= 400) {
        narrativeChunks.push({
          content: piece,
          metadata: {
            type: determineNarrativeType(piece),
            community_name: communityName,
            char_count: piece.length,
            campaign_focus: determineCampaignFocus(piece) as any[]
          }
        });
      }
    }
    console.log(`[NARRATIVE_CREATION] Force split created ${narrativeChunks.length} chunks`);
  }
  
  console.log(`[NARRATIVE_CREATION] Final result: Created ${narrativeChunks.length} focused narrative chunks`);
  narrativeChunks.forEach((chunk, i) => {
    console.log(`[NARRATIVE_CREATION] Chunk ${i + 1}: ${chunk.metadata.char_count} chars, type: ${chunk.metadata.type}, focus: ${chunk.metadata.campaign_focus?.join(',') || 'none'}`);
  });
  
  return narrativeChunks;
}

/**
 * Force split a large chunk into smaller narrative pieces
 */
function forceSplitLargeChunk(text: string): string[] {
  const chunks: string[] = [];
  const targetSize = 600; // Aim for middle of 400-800 range
  
  // Split by sentences first
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk && (currentChunk + ' ' + sentence).length > targetSize) {
      if (currentChunk.length >= 400) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    }
  }
  
  // Save final chunk
  if (currentChunk && currentChunk.length >= 400) {
    chunks.push(currentChunk.trim());
  }
  
  // If sentence-based splitting didn't work, use character-based with word boundaries
  if (chunks.length === 0) {
    for (let i = 0; i < text.length; i += targetSize) {
      let chunk = text.slice(i, i + targetSize);
      // Try to end at a word boundary
      if (i + targetSize < text.length) {
        const lastSpaceIndex = chunk.lastIndexOf(' ');
        if (lastSpaceIndex > targetSize * 0.7) {
          chunk = chunk.slice(0, lastSpaceIndex);
        }
      }
      if (chunk.length >= 400) {
        chunks.push(chunk.trim());
      }
    }
  }
  
  return chunks;
}

// ===== HELPER FUNCTIONS =====

function extractExpiryDate(text: string): string | undefined {
  const datePatterns = [
    /(?:expires?|ends?|through|until|by)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/gi,
    /(?:expires?|ends?|through|until|by)\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function determinePriceType(text: string): 'starting_at' | 'range' | 'average' {
  if (/starting|from|as\s+low\s+as/i.test(text)) return 'starting_at';
  if (/-|\sto\s/.test(text)) return 'range';
  return 'average';
}

function determineLocationType(text: string): 'proximity' | 'neighborhood' | 'transit' {
  if (/minutes?|drive|walk|steps/i.test(text)) return 'proximity';
  if (/metro|transit|bus|train|subway/i.test(text)) return 'transit';
  return 'neighborhood';
}

function determineAmenityCategory(text: string): 'fitness' | 'social' | 'convenience' | 'outdoor' {
  if (/gym|fitness|workout|exercise/i.test(text)) return 'fitness';
  if (/pool|clubhouse|lounge|game|social/i.test(text)) return 'social';
  if (/laundry|parking|storage|concierge|package/i.test(text)) return 'convenience';
  return 'outdoor';
}

function determineCampaignFocus(text: string): string[] {
  const focus: string[] = [];
  
  if (/luxury|premium|upscale|elegant|sophisticated/i.test(text)) focus.push('luxury');
  if (/location|convenient|close|near|downtown|shopping|dining/i.test(text)) focus.push('location');
  if (/amenities|pool|gym|fitness|clubhouse/i.test(text)) focus.push('amenities');
  if (/affordable|value|competitive|pricing|rent|lease/i.test(text)) focus.push('value');
  if (/lifestyle|living|community|home|comfort/i.test(text)) focus.push('lifestyle');
  
  return focus.length > 0 ? focus : ['lifestyle'];
}

function determineNarrativeType(text: string): ChunkType {
  if (/amenities|pool|gym|fitness|clubhouse|spa/i.test(text)) return ChunkType.NARRATIVE_AMENITIES;
  if (/location|convenient|close|near|downtown|shopping|dining|transportation/i.test(text)) return ChunkType.NARRATIVE_LOCATION;
  if (/lifestyle|living|community|resident|home|comfort|target|demographic/i.test(text)) return ChunkType.NARRATIVE_LIFESTYLE;
  return ChunkType.NARRATIVE_COMMUNITY;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, index) => val === b[index]);
}

function mergeArrays(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

// Document structure types
interface StructureElement {
  type: string;
  lineIndex: number;
  content: string;
  level?: number;
}

interface DocumentStructure {
  sections: StructureElement[];
  lists: StructureElement[];
  tables: StructureElement[];
  separators: StructureElement[];
}

// Enhanced semantic chunking configuration
const SEMANTIC_CONFIG = {
  minChunkSize: 100,
  maxChunkSize: 1500,
  targetChunkSize: 800,
  preserveStructure: true,
  // Patterns for identifying document structure
  headingPatterns: [
    /^#{1,6}\s+.+$/gm,
    /^[A-Z][A-Z\s&:,-]{2,50}:?\s*$/gm,
    /^[A-Z][^.!?]*:?\s*$/gm,
    /^\d+\.\s+[A-Z].+$/gm,
    /^[IVX]+\.\s+[A-Z].+$/gm
  ],
  listPatterns: [
    /^[\s]*[-•*]\s+.+$/gm,
    /^[\s]*\d+\.\s+.+$/gm,
    /^[\s]*[a-zA-Z]\.\s+.+$/gm
  ],
  separatorPatterns: [
    /\n\s*\n\s*\n/g,
    /^[-=_]{3,}\s*$/gm,
    /^\*{3,}\s*$/gm
  ],
  // PDF-specific patterns to help identify structure in "flat" text
  pdfPatterns: [
    /\.\s+[A-Z]/g,
    /\?\s+[A-Z]/g,
    /!\s+[A-Z]/g,
    /:\s+[A-Z]/g
  ]
};
/**
 * Enhanced semantic chunking that handles PDF text and preserves logical units
 */
function createSemanticChunks(text: string, documentType: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }
  console.log(`[SEMANTIC] Starting enhanced chunking for ${documentType}`);
  console.log(`[SEMANTIC] Input text length: ${text.length} characters`);
  console.log(`[SEMANTIC] First 200 chars: "${text.substring(0, 200)}..."`);
  // Clean and normalize the text
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\t/g, '  ').trim();
  // Identify document structure
  const structure = analyzeDocumentStructure(cleanText);
  console.log(`[SEMANTIC] Document structure analysis:`, {
    sections: structure.sections.length,
    lists: structure.lists.length,
    tables: structure.tables.length,
    separators: structure.separators.length
  });
  // Create chunks based on logical structure with enhanced fallbacks
  const chunks = extractLogicalChunks(cleanText, structure, documentType);
  console.log(`[SEMANTIC] Created ${chunks.length} semantic chunks`);
  chunks.forEach((chunk, i)=>{
    console.log(`[SEMANTIC] Chunk ${i + 1}: ${chunk.length} chars - "${chunk.substring(0, 80)}..."`);
  });
  return chunks;
}
/**
 * Analyze document structure with enhanced PDF text detection
 */ function analyzeDocumentStructure(text: string): DocumentStructure {
  const lines = text.split('\n');
  const structure: DocumentStructure = {
    sections: [],
    lists: [],
    tables: [],
    separators: []
  };
  console.log(`[SEMANTIC] Analyzing ${lines.length} lines for structure`);
  for(let i = 0; i < lines.length; i++){
    const line = lines[i].trim();
    if (!line) continue;
    // Check for headings
    for (const pattern of SEMANTIC_CONFIG.headingPatterns){
      if (pattern.test(line)) {
        structure.sections.push({
          type: 'heading',
          lineIndex: i,
          content: line,
          level: getHeadingLevel(line)
        });
        break;
      }
    }
    // Check for list items
    for (const pattern of SEMANTIC_CONFIG.listPatterns){
      if (pattern.test(line)) {
        structure.lists.push({
          type: 'list_item',
          lineIndex: i,
          content: line
        });
        break;
      }
    }
    // Check for table-like content
    if ((line.match(/[|,\t]/g) || []).length >= 2) {
      structure.tables.push({
        type: 'table_row',
        lineIndex: i,
        content: line
      });
    }
    // Check for separators
    for (const pattern of SEMANTIC_CONFIG.separatorPatterns){
      if (pattern.test(line)) {
        structure.separators.push({
          type: 'separator',
          lineIndex: i,
          content: line
        });
        break;
      }
    }
  }
  // Check for PDF-specific patterns if no clear structure found
  const totalStructureElements = structure.sections.length + structure.lists.length + structure.tables.length;
  console.log(`[SEMANTIC] Found ${totalStructureElements} structure elements`);
  return structure;
}
/**
 * Extract logical chunks with enhanced fallback strategies
 */ function extractLogicalChunks(text: string, structure: DocumentStructure, documentType: string): string[] {
  const lines = text.split('\n');
  let chunks: string[] = [];
  // Strategy 1: Section-based chunking (if clear headings exist)
  if (structure.sections.length > 0) {
    console.log(`[SEMANTIC] Using section-based chunking (${structure.sections.length} sections)`);
    chunks = extractSectionBasedChunks(lines, structure);
  } else if (structure.lists.length > 0) {
    console.log(`[SEMANTIC] Using list-based chunking (${structure.lists.length} lists)`);
    chunks = extractListBasedChunks(lines, structure);
  } else if (structure.tables.length > 0) {
    console.log(`[SEMANTIC] Using table-based chunking (${structure.tables.length} tables)`);
    chunks = extractTableBasedChunks(lines, structure);
  } else {
    console.log(`[SEMANTIC] Using enhanced paragraph-based chunking (fallback)`);
    chunks = extractEnhancedParagraphChunks(text);
  }
  // Strategy 5: Final fallback - sentence-based chunking if still too few chunks
  if (chunks.length <= 1 && text.length > SEMANTIC_CONFIG.maxChunkSize) {
    console.log(`[SEMANTIC] Only ${chunks.length} chunk(s) created, using sentence-based fallback`);
    chunks = extractSentenceBasedChunks(text);
  }
  // Post-process chunks to ensure quality
  return postProcessChunks(chunks, documentType);
}
/**
 * Enhanced paragraph-based chunking that handles PDF text better
 */
function extractEnhancedParagraphChunks(text: string): string[] {
  const chunks: string[] = [];
  // Try multiple splitting strategies
  let paragraphs: string[] = [];
  // Strategy 1: Split by double newlines (traditional paragraphs)
  paragraphs = text.split(/\n\s*\n/).filter((p)=>p.trim().length > 0);
  console.log(`[SEMANTIC] Double newline split produced ${paragraphs.length} paragraphs`);
  // Strategy 2: If that didn't work well, try single newlines with context
  if (paragraphs.length <= 2) {
    paragraphs = text.split(/\n/).filter((p)=>p.trim().length > 20);
    console.log(`[SEMANTIC] Single newline split produced ${paragraphs.length} lines`);
    // Group lines into logical paragraphs
    const groupedParagraphs: string[] = [];
    let currentGroup = '';
    for (const line of paragraphs){
      const trimmedLine = line.trim();
      // If adding this line would exceed target size, save current group
      if (currentGroup && (currentGroup + '\n' + trimmedLine).length > SEMANTIC_CONFIG.targetChunkSize) {
        if (currentGroup.length >= SEMANTIC_CONFIG.minChunkSize) {
          groupedParagraphs.push(currentGroup);
        }
        currentGroup = trimmedLine;
      } else {
        currentGroup = currentGroup ? currentGroup + '\n' + trimmedLine : trimmedLine;
      }
    }
    // Save final group
    if (currentGroup && currentGroup.length >= SEMANTIC_CONFIG.minChunkSize) {
      groupedParagraphs.push(currentGroup);
    }
    paragraphs = groupedParagraphs;
    console.log(`[SEMANTIC] Line grouping produced ${paragraphs.length} logical paragraphs`);
  }
  // Create chunks from paragraphs
  let currentChunk = '';
  for (const paragraph of paragraphs){
    const trimmedParagraph = paragraph.trim();
    // If adding this paragraph would exceed max size, save current chunk
    if (currentChunk && (currentChunk + '\n\n' + trimmedParagraph).length > SEMANTIC_CONFIG.maxChunkSize) {
      if (currentChunk.length >= SEMANTIC_CONFIG.minChunkSize) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmedParagraph;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedParagraph : trimmedParagraph;
    }
  }
  // Save final chunk
  if (currentChunk && currentChunk.length >= SEMANTIC_CONFIG.minChunkSize) {
    chunks.push(currentChunk);
  }
  return chunks;
}
/**
 * Sentence-based chunking for when structure-based methods fail
 */
function extractSentenceBasedChunks(text: string): string[] {
  const chunks: string[] = [];
  // Split by sentence endings while preserving sentences
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s)=>s.trim().length > 0);
  console.log(`[SEMANTIC] Sentence-based split produced ${sentences.length} sentences`);
  let currentChunk = '';
  for (const sentence of sentences){
    const trimmedSentence = sentence.trim();
    // If adding this sentence would exceed max size, save current chunk
    if (currentChunk && (currentChunk + ' ' + trimmedSentence).length > SEMANTIC_CONFIG.maxChunkSize) {
      if (currentChunk.length >= SEMANTIC_CONFIG.minChunkSize) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmedSentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
    }
  }
  // Save final chunk
  if (currentChunk && currentChunk.length >= SEMANTIC_CONFIG.minChunkSize) {
    chunks.push(currentChunk);
  }
  // If sentence splitting still didn't work, use character-based chunking
  if (chunks.length <= 1 && text.length > SEMANTIC_CONFIG.maxChunkSize) {
    console.log(`[SEMANTIC] Sentence chunking failed, using character-based fallback`);
    return extractCharacterBasedChunks(text);
  }
  return chunks;
}
/**
 * Character-based chunking as final fallback
 */
function extractCharacterBasedChunks(text: string): string[] {
  const chunks: string[] = [];
  const chunkSize = SEMANTIC_CONFIG.targetChunkSize;
  for(let i = 0; i < text.length; i += chunkSize){
    let chunk = text.slice(i, i + chunkSize);
    // Try to end at a word boundary if not at the end
    if (i + chunkSize < text.length) {
      const lastSpaceIndex = chunk.lastIndexOf(' ');
      if (lastSpaceIndex > chunkSize * 0.8) {
        chunk = chunk.slice(0, lastSpaceIndex);
      }
    }
    if (chunk.length >= SEMANTIC_CONFIG.minChunkSize) {
      chunks.push(chunk.trim());
    }
  }
  console.log(`[SEMANTIC] Character-based chunking produced ${chunks.length} chunks`);
  return chunks;
}
// Keep existing helper functions but update them
function extractSectionBasedChunks(lines: string[], structure: DocumentStructure): string[] {
  const chunks: string[] = [];
  const sections = structure.sections.sort((a, b)=>a.lineIndex - b.lineIndex);
  for(let i = 0; i < sections.length; i++){
    const currentSection = sections[i];
    const nextSection = sections[i + 1];
    const startLine = currentSection.lineIndex;
    const endLine = nextSection ? nextSection.lineIndex - 1 : lines.length - 1;
    const sectionLines = lines.slice(startLine, endLine + 1);
    const sectionText = sectionLines.join('\n').trim();
    if (sectionText.length >= SEMANTIC_CONFIG.minChunkSize) {
      if (sectionText.length > SEMANTIC_CONFIG.maxChunkSize) {
        chunks.push(...splitLargeSection(sectionText));
      } else {
        chunks.push(sectionText);
      }
    }
  }
  // Handle content before first heading
  if (sections.length > 0 && sections[0].lineIndex > 0) {
    const preContent = lines.slice(0, sections[0].lineIndex).join('\n').trim();
    if (preContent.length >= SEMANTIC_CONFIG.minChunkSize) {
      chunks.unshift(preContent);
    }
  }
  return chunks;
}
function extractListBasedChunks(lines: string[], structure: DocumentStructure): string[] {
  const chunks: string[] = [];
  const listItems = structure.lists.sort((a, b)=>a.lineIndex - b.lineIndex);
  let currentChunk = '';
  let inList = false;
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    const isListItem = listItems.some((item)=>item.lineIndex === i);
    if (isListItem && !inList) {
      if (currentChunk.trim() && currentChunk.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line;
      inList = true;
    } else if (isListItem && inList) {
      currentChunk += '\n' + line;
    } else if (!isListItem && inList) {
      if (currentChunk.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line;
      inList = false;
    } else {
      currentChunk += '\n' + line;
    }
  }
  if (currentChunk.trim() && currentChunk.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
function extractTableBasedChunks(lines: string[], structure: DocumentStructure): string[] {
  const chunks: string[] = [];
  const tableRows = structure.tables.sort((a, b)=>a.lineIndex - b.lineIndex);
  let currentTable = '';
  let currentText = '';
  let inTable = false;
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    const isTableRow = tableRows.some((row)=>row.lineIndex === i);
    if (isTableRow) {
      if (!inTable) {
        if (currentText.trim() && currentText.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
          chunks.push(currentText.trim());
        }
        currentText = '';
        inTable = true;
      }
      currentTable += (currentTable ? '\n' : '') + line;
    } else {
      if (inTable) {
        if (currentTable.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
          chunks.push(currentTable.trim());
        }
        currentTable = '';
        inTable = false;
      }
      currentText += (currentText ? '\n' : '') + line;
    }
  }
  if (currentTable.trim() && currentTable.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
    chunks.push(currentTable.trim());
  }
  if (currentText.trim() && currentText.trim().length >= SEMANTIC_CONFIG.minChunkSize) {
    chunks.push(currentText.trim());
  }
  return chunks;
}
function splitLargeSection(sectionText: string): string[] {
  const chunks: string[] = [];
  // Try to split by sub-sections or paragraphs first
  const paragraphs = sectionText.split(/\n\s*\n/).filter((p)=>p.trim().length > 0);
  if (paragraphs.length > 1) {
    let currentChunk = '';
    for (const paragraph of paragraphs){
      const trimmedParagraph = paragraph.trim();
      if (currentChunk && (currentChunk + '\n\n' + trimmedParagraph).length > SEMANTIC_CONFIG.maxChunkSize) {
        chunks.push(currentChunk);
        currentChunk = trimmedParagraph;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedParagraph : trimmedParagraph;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }
  } else {
    // Fallback to sentence-based splitting for large sections
    chunks.push(...extractSentenceBasedChunks(sectionText));
  }
  return chunks;
}
function postProcessChunks(chunks: string[], documentType: string): string[] {
  const processedChunks = chunks.map((chunk)=>chunk.trim()).filter((chunk)=>chunk.length >= SEMANTIC_CONFIG.minChunkSize).map((chunk)=>{
    return chunk.replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
    .trim();
  });
  console.log(`[SEMANTIC] Post-processing: ${chunks.length} -> ${processedChunks.length} chunks`);
  // Final validation - ensure we have meaningful chunks
  if (processedChunks.length === 0) {
    console.error(`[SEMANTIC] No valid chunks created after post-processing!`);
  }
  return processedChunks;
}
function getHeadingLevel(text) {
  const markdownMatch = text.match(/^(#{1,6})/);
  if (markdownMatch) {
    return markdownMatch[1].length;
  }
  if (/^[A-Z][A-Z\s&:,-]{2,50}:?\s*$/.test(text)) {
    return 1;
  }
  if (/^\d+\./.test(text)) {
    return 2;
  }
  return 3;
}
serve(async (req: Request)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { textContent, clientId, sourceId, documentType, communityName } = await req.json();
    if (!textContent || !clientId || !sourceId) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters: textContent, clientId, sourceId'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const validDocumentTypes = [
      'looker_report',
      'client_brand_asset',
      'multifamily_property'
    ];
    const docType = documentType || 'client_brand_asset';
    if (!validDocumentTypes.includes(docType)) {
      return new Response(JSON.stringify({
        error: 'Invalid documentType. Must be one of: looker_report, client_brand_asset, multifamily_property'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    console.log(`[PROCESSING] Processing ${docType} document`);
    console.log(`[PROCESSING] Text length: ${textContent.length} characters`);
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
    
    let chunks: string[] = [];
    let dualChunks: DualChunk[] = [];
    let chunkingStrategy = 'semantic';
    
    // Query clients table to get the community name (clients.name IS the community name)
    console.log(`[PROCESSING] Querying clients table for community name using clientId: ${clientId}`);
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single();

    let effectiveCommunityName = communityName;
    
    if (!effectiveCommunityName) {
      if (clientError) {
        console.error(`[PROCESSING] Could not retrieve client name:`, clientError);
        effectiveCommunityName = 'Unknown Community';
      } else {
        effectiveCommunityName = clientData?.name || 'Unknown Community';
        console.log(`[PROCESSING] Using community name from clients table: ${effectiveCommunityName}`);
      }
    }
    
    // Always use dual chunking for better organization and context
    try {
      dualChunks = createDualChunkingSystem(textContent, effectiveCommunityName);
      chunks = dualChunks.map(chunk => chunk.content);
      chunkingStrategy = 'dual_chunking';
      console.log(`[DUAL_CHUNKING] Final result: ${chunks.length} chunks created for ${effectiveCommunityName}`);
    } catch (error) {
      console.error(`[DUAL_CHUNKING] Error occurred, falling back to semantic chunking:`, error);
      // Fallback to semantic chunking only if dual chunking fails
      chunks = createSemanticChunks(textContent, docType);
      console.log(`[SEMANTIC] Fallback result: ${chunks.length} chunks created`);
    }
    
    if (chunks.length === 0) {
      return new Response(JSON.stringify({
        error: `No valid chunks created from ${docType} document`
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Generate embeddings in batches
    console.log(`[SEMANTIC] Generating embeddings for ${chunks.length} chunks`);
    const BATCH_SIZE = 50;
    const allEmbeddings: any[] = [];
    for(let i = 0; i < chunks.length; i += BATCH_SIZE){
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`[SEMANTIC] Processing embedding batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(chunks.length / BATCH_SIZE)}`);
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
        console.error(`[SEMANTIC] OpenAI API error:`, error);
        return new Response(JSON.stringify({
          error: 'Failed to generate embeddings',
          details: error
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const batchData = await embeddingResponse.json();
      allEmbeddings.push(...batchData.data);
      // Small delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((resolve)=>setTimeout(resolve, 100));
      }
    }
    console.log(`[SEMANTIC] Generated ${allEmbeddings.length} embeddings`);
    // Prepare chunk records with dual chunking metadata
    const chunkRecords = chunks.map((chunk, i) => {
      const baseRecord = {
        client_id: clientId,
        source_id: sourceId,
        content: chunk,
        embedding: allEmbeddings[i].embedding,
        document_type: docType,
        chunk_type: chunkingStrategy === 'dual_chunking' ? 'dual' : 'semantic'
      };
      
      // Add dual chunking metadata if available
      if (chunkingStrategy === 'dual_chunking' && dualChunks[i]) {
        const metadata = dualChunks[i].metadata;
        return {
          ...baseRecord,
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
      }
      
      return baseRecord;
    });
    // Insert chunks into database in batches
    const DB_BATCH_SIZE = 25;
    let totalInserted = 0;
    for(let i = 0; i < chunkRecords.length; i += DB_BATCH_SIZE){
      const batch = chunkRecords.slice(i, i + DB_BATCH_SIZE);
      console.log(`[SEMANTIC] Inserting batch ${Math.floor(i / DB_BATCH_SIZE) + 1} of ${Math.ceil(chunkRecords.length / DB_BATCH_SIZE)}`);
      const { error } = await supabase.from('chunks').insert(batch);
      if (error) {
        console.error(`[SEMANTIC] Database error:`, error);
        return new Response(JSON.stringify({
          error: 'Database insertion failed',
          details: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      totalInserted += batch.length;
    }
    console.log(`[SEMANTIC] Successfully stored ${totalInserted} semantic chunks`);
    return new Response(JSON.stringify({
      message: "Document processed with enhanced semantic chunking",
      documentType: docType,
      chunkingStrategy: "enhanced_semantic",
      chunksCreated: chunks.length,
      chunksStored: totalInserted,
      chunkSizes: {
        min: Math.min(...chunks.map((c)=>c.length)),
        max: Math.max(...chunks.map((c)=>c.length)),
        avg: Math.round(chunks.reduce((sum, c)=>sum + c.length, 0) / chunks.length)
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Enhanced semantic processing error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
