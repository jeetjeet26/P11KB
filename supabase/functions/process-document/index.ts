import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// Enhanced semantic chunking configuration
const SEMANTIC_CONFIG = {
  minChunkSize: 100,
  maxChunkSize: 1500,  // Reduced from 2000 for better chunk distribution
  targetChunkSize: 800, // Target size for optimal chunks
  preserveStructure: true,
  
  // Patterns for identifying document structure
  headingPatterns: [
    /^#{1,6}\s+.+$/gm,                    // Markdown headers
    /^[A-Z][A-Z\s&:,-]{2,50}:?\s*$/gm,    // ALL CAPS headers
    /^[A-Z][^.!?]*:?\s*$/gm,              // Title case headers (single line)
    /^\d+\.\s+[A-Z].+$/gm,                // Numbered headers
    /^[IVX]+\.\s+[A-Z].+$/gm,             // Roman numeral headers
  ],
  
  listPatterns: [
    /^[\s]*[-•*]\s+.+$/gm,                // Bullet points
    /^[\s]*\d+\.\s+.+$/gm,                // Numbered lists
    /^[\s]*[a-zA-Z]\.\s+.+$/gm,           // Lettered lists
  ],
  
  separatorPatterns: [
    /\n\s*\n\s*\n/g,                      // Multiple blank lines
    /^[-=_]{3,}\s*$/gm,                   // Horizontal rules
    /^\*{3,}\s*$/gm,                      // Asterisk separators
  ],

  // PDF-specific patterns to help identify structure in "flat" text
  pdfPatterns: [
    /\.\s+[A-Z]/g,                        // Sentence endings followed by capital letters
    /\?\s+[A-Z]/g,                        // Question endings
    /!\s+[A-Z]/g,                         // Exclamation endings
    /:\s+[A-Z]/g,                         // Colon endings (often section breaks)
  ]
};

interface DocumentStructure {
  sections: Array<{type: string, lineIndex: number, content: string, level?: number}>;
  lists: Array<{type: string, lineIndex: number, content: string}>;
  tables: Array<{type: string, lineIndex: number, content: string}>;
  separators: Array<{type: string, lineIndex: number, content: string}>;
}

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
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .trim();

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
  chunks.forEach((chunk, i) => {
    console.log(`[SEMANTIC] Chunk ${i + 1}: ${chunk.length} chars - "${chunk.substring(0, 80)}..."`);
  });

  return chunks;
}

/**
 * Analyze document structure with enhanced PDF text detection
 */
function analyzeDocumentStructure(text: string): DocumentStructure {
  const lines = text.split('\n');
  const structure: DocumentStructure = {
    sections: [],
    lists: [],
    tables: [],
    separators: []
  };

  console.log(`[SEMANTIC] Analyzing ${lines.length} lines for structure`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for headings
    for (const pattern of SEMANTIC_CONFIG.headingPatterns) {
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
    for (const pattern of SEMANTIC_CONFIG.listPatterns) {
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
    for (const pattern of SEMANTIC_CONFIG.separatorPatterns) {
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
 */
function extractLogicalChunks(text: string, structure: DocumentStructure, documentType: string): string[] {
  const lines = text.split('\n');
  let chunks: string[] = [];

  // Strategy 1: Section-based chunking (if clear headings exist)
  if (structure.sections.length > 0) {
    console.log(`[SEMANTIC] Using section-based chunking (${structure.sections.length} sections)`);
    chunks = extractSectionBasedChunks(lines, structure);
  } 
  // Strategy 2: List-based chunking
  else if (structure.lists.length > 0) {
    console.log(`[SEMANTIC] Using list-based chunking (${structure.lists.length} lists)`);
    chunks = extractListBasedChunks(lines, structure);
  }
  // Strategy 3: Table-based chunking
  else if (structure.tables.length > 0) {
    console.log(`[SEMANTIC] Using table-based chunking (${structure.tables.length} tables)`);
    chunks = extractTableBasedChunks(lines, structure);
  }
  // Strategy 4: Enhanced paragraph-based chunking
  else {
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
  paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  console.log(`[SEMANTIC] Double newline split produced ${paragraphs.length} paragraphs`);
  
  // Strategy 2: If that didn't work well, try single newlines with context
  if (paragraphs.length <= 2) {
    paragraphs = text.split(/\n/).filter(p => p.trim().length > 20);
    console.log(`[SEMANTIC] Single newline split produced ${paragraphs.length} lines`);
    
    // Group lines into logical paragraphs
    const groupedParagraphs: string[] = [];
    let currentGroup = '';
    
    for (const line of paragraphs) {
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
  for (const paragraph of paragraphs) {
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
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 0);
  console.log(`[SEMANTIC] Sentence-based split produced ${sentences.length} sentences`);
  
  let currentChunk = '';
  for (const sentence of sentences) {
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
  
  for (let i = 0; i < text.length; i += chunkSize) {
    let chunk = text.slice(i, i + chunkSize);
    
    // Try to end at a word boundary if not at the end
    if (i + chunkSize < text.length) {
      const lastSpaceIndex = chunk.lastIndexOf(' ');
      if (lastSpaceIndex > chunkSize * 0.8) { // If we can find a space in the last 20%
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
  const sections = structure.sections.sort((a, b) => a.lineIndex - b.lineIndex);

  for (let i = 0; i < sections.length; i++) {
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
  const listItems = structure.lists.sort((a, b) => a.lineIndex - b.lineIndex);

  let currentChunk = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isListItem = listItems.some(item => item.lineIndex === i);

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
  const tableRows = structure.tables.sort((a, b) => a.lineIndex - b.lineIndex);

  let currentTable = '';
  let currentText = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = tableRows.some(row => row.lineIndex === i);

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
  const paragraphs = sectionText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  if (paragraphs.length > 1) {
    let currentChunk = '';
    for (const paragraph of paragraphs) {
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
  const processedChunks = chunks
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length >= SEMANTIC_CONFIG.minChunkSize)
    .map(chunk => {
      return chunk
        .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
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

function getHeadingLevel(text: string): number {
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { textContent, clientId, sourceId, documentType } = await req.json();

    if (!textContent || !clientId || !sourceId) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters: textContent, clientId, sourceId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const validDocumentTypes = ['looker_report', 'client_brand_asset', 'client_onboarding'];
    const docType = documentType || 'client_brand_asset';
    
    if (!validDocumentTypes.includes(docType)) {
      return new Response(JSON.stringify({
        error: 'Invalid documentType. Must be one of: looker_report, client_brand_asset, client_onboarding'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[SEMANTIC] Processing ${docType} document`);
    console.log(`[SEMANTIC] Text length: ${textContent.length} characters`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Create semantic chunks with enhanced logic
    const chunks = createSemanticChunks(textContent, docType);

    console.log(`[SEMANTIC] Final result: ${chunks.length} chunks created`);

    if (chunks.length === 0) {
      return new Response(JSON.stringify({
        error: 'No valid semantic chunks created from document'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate embeddings in batches
    console.log(`[SEMANTIC] Generating embeddings for ${chunks.length} chunks`);
    const BATCH_SIZE = 50;
    const allEmbeddings: any[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
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

    console.log(`[SEMANTIC] Generated ${allEmbeddings.length} embeddings`);

    // Prepare chunk records
    const chunkRecords = chunks.map((chunk, i) => ({
      client_id: clientId,
      source_id: sourceId,
      content: chunk,
      embedding: allEmbeddings[i].embedding,
      document_type: docType,
      chunk_type: 'semantic'
    }));

    // Insert chunks into database in batches
    const DB_BATCH_SIZE = 25;
    let totalInserted = 0;

    for (let i = 0; i < chunkRecords.length; i += DB_BATCH_SIZE) {
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        min: Math.min(...chunks.map(c => c.length)),
        max: Math.max(...chunks.map(c => c.length)),
        avg: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Enhanced semantic processing error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
  }
}); 