import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// Chunking configuration
const CHUNK_CONFIG = {
  minSize: 100,
  maxSize: 1200,
  overlap: 150,
  sentenceEndRegex: /[.!?]+\s+/g,
  paragraphSeparator: /\n\s*\n/,
  similarityThreshold: 0.8,
  targetChunkSize: 800 // Target chunk size for optimal embeddings
};

/**
 * Latin text detection configuration
 */
const LATIN_CONFIG = {
  // Common Latin words used in placeholder text (Lorem Ipsum and variations)
  commonLatinWords: [
    'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
    'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
    'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
    'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
    'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
    'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
    'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
    'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'vivamus', 'mauris',
    'placerat', 'eleifend', 'leo', 'diam', 'sollicitudin', 'tempor', 'fermentum',
    'ligula', 'vitae', 'hendrerit', 'bibendum', 'cursus', 'risus', 'pharetra', 'vel'
  ],
  
  // Strong Latin indicators - if any of these are found, immediately flag as Latin
  strongLatinIndicators: [
    /lorem\s*ipsum/i,                    // Classic Lorem ipsum (flexible spacing)
    /ipsum\s*dolor/i,                    // Ipsum dolor
    /dolor\s*sit\s*amet/i,               // Dolor sit amet (flexible spacing)
    /consectetur\s*adipiscing/i,         // Consectetur adipiscing
    /eiusmod\s*tempor/i,                 // Eiusmod tempor
    /labore\s*et\s*dolore/i,             // Labore et dolore
    /magna\s*aliqua/i,                   // Magna aliqua
    /veniam\s*quis\s*nostrud/i,          // Veniam quis nostrud
    /exercitation\s*ullamco/i,           // Exercitation ullamco
    /ut\s*aliquip\s*ex\s*ea/i,           // Ut aliquip ex ea
    /duis\s*aute\s*irure/i,              // Duis aute irure
    /reprehenderit\s*in\s*voluptate/i,   // Reprehenderit in voluptate
    /cillum\s*dolore\s*eu\s*fugiat/i,    // Cillum dolore eu fugiat
    /excepteur\s*sint\s*occaecat/i,      // Excepteur sint occaecat
    /cupidatat\s*non\s*proident/i,       // Cupidatat non proident
    /officia\s*deserunt\s*mollit/i,      // Officia deserunt mollit
    /ametlorem/i,                        // Concatenated amet+lorem
    /loremipsum/i,                       // Concatenated lorem+ipsum
    /ipsumdolor/i,                       // Concatenated ipsum+dolor
    /dolorsit/i,                         // Concatenated dolor+sit
    /sitamet/i                           // Concatenated sit+amet
  ],
  
  // Latin phrases that are commonly used in placeholder text (more flexible)
  commonLatinPhrases: [
    /lorem.{0,3}ipsum/i,                 // Lorem ipsum with up to 3 chars between
    /dolor.{0,3}sit.{0,3}amet/i,         // Dolor sit amet with flexible spacing
    /consectetur.{0,3}adipiscing/i,      // Consectetur adipiscing
    /ut.{0,3}labore.{0,3}et.{0,3}dolore/i, // Ut labore et dolore
    /magna.{0,3}aliqua/i,                // Magna aliqua
    /enim.{0,3}ad.{0,3}minim/i,          // Enim ad minim
    /quis.{0,3}nostrud/i,                // Quis nostrud
    /ullamco.{0,3}laboris/i,             // Ullamco laboris
    /commodo.{0,3}consequat/i,           // Commodo consequat
    /duis.{0,3}aute/i,                   // Duis aute
    /irure.{0,3}dolor/i,                 // Irure dolor
    /voluptate.{0,3}velit/i,             // Voluptate velit
    /esse.{0,3}cillum/i,                 // Esse cillum
    /fugiat.{0,3}nulla/i,                // Fugiat nulla
    /excepteur.{0,3}sint/i,              // Excepteur sint
    /occaecat.{0,3}cupidatat/i,          // Occaecat cupidatat
    /sunt.{0,3}in.{0,3}culpa/i,          // Sunt in culpa
    /deserunt.{0,3}mollit/i              // Deserunt mollit
  ],
  
  // Threshold for considering text as Latin placeholder
  latinWordThreshold: 0.5, // Lowered to 50% to catch mixed content with some English
  minWordsForAnalysis: 3,   // Lowered to 3 words to catch shorter Latin snippets
  strongIndicatorWeight: 1.0 // If a strong indicator is found, immediately mark as Latin
};

/**
 * Detect if a chunk contains primarily Latin placeholder text
 */
function isLatinPlaceholderText(text) {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const originalText = text;
  const lowerText = text.toLowerCase();

  // First check for strong Latin indicators - if any found, immediately flag as Latin
  for (const indicator of LATIN_CONFIG.strongLatinIndicators) {
    if (indicator.test(lowerText)) {
      console.log(`[LATIN-FILTER] Found strong Latin indicator pattern in chunk: "${originalText.substring(0, 100)}..."`);
      return true;
    }
  }

  // Then check for common Latin phrases
  for (const phrase of LATIN_CONFIG.commonLatinPhrases) {
    if (phrase.test(lowerText)) {
      console.log(`[LATIN-FILTER] Found Latin phrase pattern in chunk: "${originalText.substring(0, 100)}..."`);
      return true;
    }
  }

  // Extract words and analyze Latin content ratio
  const words = lowerText
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2); // Only consider words longer than 2 characters

  if (words.length < LATIN_CONFIG.minWordsForAnalysis) {
    return false; // Too few words to analyze
  }

  // Count Latin words
  const latinWords = words.filter(word => 
    LATIN_CONFIG.commonLatinWords.includes(word)
  );

  const latinRatio = latinWords.length / words.length;

  // Special handling for chunks with many repetitions of the same Latin words
  const uniqueWords = [...new Set(words)];
  const uniqueLatinWords = [...new Set(latinWords)];
  const uniqueLatinRatio = uniqueLatinWords.length / uniqueWords.length;

  // If high concentration of unique Latin words, flag as Latin
  if (uniqueLatinRatio >= 0.4 && uniqueLatinWords.length >= 3) {
    console.log(`[LATIN-FILTER] Found Latin placeholder text (${Math.round(uniqueLatinRatio * 100)}% unique Latin words): "${originalText.substring(0, 100)}..."`);
    return true;
  }

  // Check regular ratio
  if (latinRatio >= LATIN_CONFIG.latinWordThreshold) {
    console.log(`[LATIN-FILTER] Found Latin placeholder text (${Math.round(latinRatio * 100)}% Latin words): "${originalText.substring(0, 100)}..."`);
    return true;
  }

  // Additional check: if the text contains many repeated Latin words, flag it
  const wordCounts = words.reduce((counts, word) => {
    counts[word] = (counts[word] || 0) + 1;
    return counts;
  }, {});

  const repeatedLatinWords = Object.entries(wordCounts)
    .filter(([word, count]) => LATIN_CONFIG.commonLatinWords.includes(word) && count >= 2)
    .length;

  if (repeatedLatinWords >= 3) {
    console.log(`[LATIN-FILTER] Found repeated Latin words pattern (${repeatedLatinWords} repeated Latin words): "${originalText.substring(0, 100)}..."`);
    return true;
  }

  return false;
}

/**
 * Filter out Latin placeholder text chunks
 */
function filterLatinChunks(chunks) {
  const filteredChunks = chunks.filter(chunk => {
    const isLatin = isLatinPlaceholderText(chunk);
    if (isLatin) {
      console.log(`[LATIN-FILTER] Removed Latin placeholder chunk: "${chunk.substring(0, 100)}..."`);
    }
    return !isLatin;
  });

  const originalCount = chunks.length;
  const filteredCount = filteredChunks.length;
  const removedCount = originalCount - filteredCount;

  if (removedCount > 0) {
    console.log(`[LATIN-FILTER] Removed ${removedCount} Latin placeholder chunks out of ${originalCount} total chunks`);
  }

  return filteredChunks;
}

/**
 * Improved chunking strategy with semantic boundaries and overlap
 */
function createSemanticChunks(text) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  console.log(`[CHUNKING] Starting with ${text.length} characters`);

  // Step 1: Clean and normalize text MORE CAREFULLY to preserve structure
  const cleanText = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines to double newlines
    .replace(/[ \t]+/g, ' ') // Normalize spaces and tabs (but NOT newlines)
    .replace(/[ \t]*\n[ \t]*/g, '\n') // Clean up spaces around newlines
    .trim();

  console.log(`[CHUNKING] After normalization: ${cleanText.length} characters`);
  console.log(`[CHUNKING] First 300 chars: "${cleanText.substring(0, 300)}"`);

  // Step 2: Split into paragraphs first
  const paragraphs = cleanText
    .split(CHUNK_CONFIG.paragraphSeparator)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  console.log(`[CHUNKING] Found ${paragraphs.length} paragraphs`);
  console.log(`[CHUNKING] Paragraph lengths: ${paragraphs.slice(0, 5).map(p => p.length).join(', ')}${paragraphs.length > 5 ? '...' : ''}`);

  // If no paragraphs found, try sentence-based splitting
  if (paragraphs.length <= 1) {
    console.log(`[CHUNKING] No paragraph breaks found, trying sentence-based splitting`);
    return createSentenceBasedChunks(cleanText);
  }

  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If paragraph is small enough, try to combine with current chunk
    if (currentChunk.length === 0) {
      currentChunk = paragraph;
    } else if ((currentChunk + '\n\n' + paragraph).length <= CHUNK_CONFIG.maxSize) {
      currentChunk = currentChunk + '\n\n' + paragraph;
    } else {
      // Current chunk is ready, process it
      if (currentChunk.length >= CHUNK_CONFIG.minSize) {
        chunks.push(...processChunk(currentChunk));
      }
      currentChunk = paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length >= CHUNK_CONFIG.minSize) {
    chunks.push(...processChunk(currentChunk));
  }

  console.log(`[CHUNKING] After paragraph processing: ${chunks.length} chunks`);

  // Step 3: Add overlapping chunks for better context preservation
  const overlappingChunks = createOverlappingChunks(chunks);
  console.log(`[CHUNKING] Created ${overlappingChunks.length} overlapping chunks`);

  // Step 4: Deduplicate similar chunks
  const deduplicatedChunks = deduplicateChunks([...chunks, ...overlappingChunks]);
  console.log(`[CHUNKING] After deduplication: ${deduplicatedChunks.length} chunks`);

  // Step 5: Filter out Latin placeholder text chunks
  const latinFilteredChunks = filterLatinChunks(deduplicatedChunks);
  console.log(`[CHUNKING] After Latin filtering: ${latinFilteredChunks.length} chunks`);

  const finalChunks = latinFilteredChunks.filter(chunk => 
    chunk.length >= CHUNK_CONFIG.minSize && chunk.length <= CHUNK_CONFIG.maxSize
  );

  console.log(`[CHUNKING] Final result: ${finalChunks.length} chunks`);
  console.log(`[CHUNKING] Final chunk sizes: ${finalChunks.map(c => c.length).join(', ')}`);

  return finalChunks;
}

/**
 * Process a single chunk, splitting by sentences if needed
 */
function processChunk(chunk) {
  console.log(`[CHUNKING] Processing chunk of ${chunk.length} characters`);

  if (chunk.length <= CHUNK_CONFIG.maxSize) {
    return [chunk];
  }

  // First try: Split by sentences
  const sentences = chunk.split(CHUNK_CONFIG.sentenceEndRegex).filter(s => s.trim().length > 0);
  console.log(`[CHUNKING] Found ${sentences.length} sentences`);

  if (sentences.length > 1) {
    // Use sentence-based chunking
    const result = [];
    let currentSentenceGroup = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const potentialChunk = currentSentenceGroup 
        ? currentSentenceGroup + '. ' + trimmedSentence 
        : trimmedSentence;

      if (potentialChunk.length <= CHUNK_CONFIG.maxSize) {
        currentSentenceGroup = potentialChunk;
      } else {
        // Save current group if it's big enough
        if (currentSentenceGroup.length >= CHUNK_CONFIG.minSize) {
          result.push(currentSentenceGroup);
        }
        // Start new group with current sentence
        if (trimmedSentence.length <= CHUNK_CONFIG.maxSize) {
          currentSentenceGroup = trimmedSentence;
        } else {
          // Handle very long sentences by word-based splitting
          result.push(...splitByWords(trimmedSentence));
          currentSentenceGroup = '';
        }
      }
    }

    // Add the last sentence group
    if (currentSentenceGroup.length >= CHUNK_CONFIG.minSize) {
      result.push(currentSentenceGroup);
    }

    console.log(`[CHUNKING] Sentence-based chunking created ${result.length} chunks`);
    return result;
  } else {
    // Fallback: Force split by words when sentence splitting fails
    console.log(`[CHUNKING] Sentence splitting failed, using word-based splitting`);
    return splitByWords(chunk);
  }
}

/**
 * Fallback chunking by words when sentence splitting doesn't work
 */
function splitByWords(text) {
  const words = text.split(/\s+/);
  const chunks = [];
  let currentChunk = '';

  for (const word of words) {
    const potentialChunk = currentChunk ? currentChunk + ' ' + word : word;
    if (potentialChunk.length <= CHUNK_CONFIG.maxSize) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk.length >= CHUNK_CONFIG.minSize) {
        chunks.push(currentChunk);
      }
      currentChunk = word;
    }
  }

  // Add the last chunk
  if (currentChunk.length >= CHUNK_CONFIG.minSize) {
    chunks.push(currentChunk);
  }

  console.log(`[CHUNKING] Word-based splitting created ${chunks.length} chunks`);
  return chunks;
}

/**
 * Create overlapping chunks to preserve context
 */
function createOverlappingChunks(chunks) {
  if (chunks.length < 2) return [];

  const overlappingChunks = [];
  for (let i = 0; i < chunks.length - 1; i++) {
    const chunk1 = chunks[i];
    const chunk2 = chunks[i + 1];

    // Take last part of chunk1 + first part of chunk2
    const overlap1 = chunk1.length > CHUNK_CONFIG.overlap 
      ? chunk1.substring(chunk1.length - CHUNK_CONFIG.overlap) 
      : chunk1;
    const overlap2 = chunk2.length > CHUNK_CONFIG.overlap 
      ? chunk2.substring(0, CHUNK_CONFIG.overlap) 
      : chunk2;

    const overlappingChunk = overlap1 + ' [...] ' + overlap2;

    if (overlappingChunk.length >= CHUNK_CONFIG.minSize && overlappingChunk.length <= CHUNK_CONFIG.maxSize) {
      overlappingChunks.push(overlappingChunk);
    }
  }

  return overlappingChunks;
}

/**
 * Remove very similar chunks to avoid redundancy
 */
function deduplicateChunks(chunks) {
  const deduplicated = [];

  for (const chunk of chunks) {
    let isDuplicate = false;
    for (const existing of deduplicated) {
      const similarity = calculateSimilarity(chunk, existing);
      if (similarity > CHUNK_CONFIG.similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      deduplicated.push(chunk);
    }
  }

  return deduplicated;
}

/**
 * Calculate basic similarity between two strings
 */
function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Fallback chunking when paragraph-based chunking fails
 */
function createSentenceBasedChunks(text) {
  console.log(`[CHUNKING] Using sentence-based chunking fallback`);

  // Split by sentences
  const sentences = text.split(CHUNK_CONFIG.sentenceEndRegex).filter(s => s.trim().length > 0);
  console.log(`[CHUNKING] Found ${sentences.length} sentences`);

  if (sentences.length <= 1) {
    console.log(`[CHUNKING] No sentences found, using word-based splitting`);
    return splitByWords(text);
  }

  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    const potentialChunk = currentChunk 
      ? currentChunk + '. ' + trimmedSentence 
      : trimmedSentence;

    if (potentialChunk.length <= CHUNK_CONFIG.maxSize) {
      currentChunk = potentialChunk;
    } else {
      // Save current chunk if it's big enough
      if (currentChunk.length >= CHUNK_CONFIG.minSize) {
        chunks.push(currentChunk);
      }
      // Start new chunk with current sentence
      if (trimmedSentence.length <= CHUNK_CONFIG.maxSize) {
        currentChunk = trimmedSentence;
      } else {
        // Handle very long sentences by word-based splitting
        chunks.push(...splitByWords(trimmedSentence));
        currentChunk = '';
      }
    }
  }

  // Add the last chunk
  if (currentChunk.length >= CHUNK_CONFIG.minSize) {
    chunks.push(currentChunk);
  }

  console.log(`[CHUNKING] Sentence-based chunking created ${chunks.length} chunks`);
  return chunks;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { textContent, clientId, sourceId } = await req.json();

    if (!textContent || !clientId || !sourceId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: textContent, clientId, sourceId' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[CHUNKING] Starting semantic chunking for ${textContent.length} characters`);
    console.log(`[CHUNKING] Sample text preview: "${textContent.substring(0, 200)}..."`);

    // Create semantic chunks with improved strategy and Latin filtering
    const chunks = createSemanticChunks(textContent);

    console.log(`[CHUNKING] Created ${chunks.length} semantic chunks`);
    console.log(`[CHUNKING] Chunk sizes: ${chunks.map(c => c.length).join(', ')}`);

    if (chunks.length === 1) {
      console.warn(`[CHUNKING] WARNING: Only 1 chunk created from ${textContent.length} characters!`);
      console.log(`[CHUNKING] Single chunk preview: "${chunks[0].substring(0, 200)}..."`);
    }

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No valid text chunks created' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Add safeguard for too many chunks
    const MAX_CHUNKS = 100;
    if (chunks.length > MAX_CHUNKS) {
      console.warn(`[CHUNKING] Too many chunks (${chunks.length}), limiting to ${MAX_CHUNKS}`);
      chunks.splice(MAX_CHUNKS);
    }

    // Get embeddings from OpenAI
    console.log(`[CHUNKING] Generating embeddings for ${chunks.length} chunks`);

    // Process chunks in batches to avoid API limits
    const BATCH_SIZE = 50; // OpenAI embedding API limit is typically 2048 inputs
    const allEmbeddings = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`[CHUNKING] Processing embedding batch ${i / BATCH_SIZE + 1} of ${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)`);

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
        console.error(`[CHUNKING] OpenAI API error for batch ${i / BATCH_SIZE + 1}:`, error);
        return new Response(JSON.stringify({
          error: 'Failed to generate embeddings',
          details: `Batch ${i / BATCH_SIZE + 1} failed: ${error}`,
          batch: i / BATCH_SIZE + 1,
          totalBatches: Math.ceil(chunks.length / BATCH_SIZE)
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const batchData = await embeddingResponse.json();
      allEmbeddings.push(...batchData.data);

      // Add small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[CHUNKING] Successfully generated ${allEmbeddings.length} embeddings`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    );

    // Prepare chunk records
    const chunkRecords = chunks.map((chunk, i) => ({
      client_id: clientId,
      source_id: sourceId,
      content: chunk,
      embedding: allEmbeddings[i].embedding
    }));

    // Insert chunks into database in batches to avoid query size limits
    const DB_BATCH_SIZE = 25; // Smaller batches for database
    let totalInserted = 0;

    for (let i = 0; i < chunkRecords.length; i += DB_BATCH_SIZE) {
      const batch = chunkRecords.slice(i, i + DB_BATCH_SIZE);
      console.log(`[CHUNKING] Inserting database batch ${i / DB_BATCH_SIZE + 1} of ${Math.ceil(chunkRecords.length / DB_BATCH_SIZE)} (${batch.length} records)`);

      const { error } = await supabase
        .from('chunks')
        .insert(batch);

      if (error) {
        console.error(`[CHUNKING] Database insert error for batch ${i / DB_BATCH_SIZE + 1}:`, error);
        return new Response(JSON.stringify({
          error: 'Database insertion failed',
          details: error.message,
          batch: i / DB_BATCH_SIZE + 1,
          totalBatches: Math.ceil(chunkRecords.length / DB_BATCH_SIZE),
          recordsInserted: totalInserted
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      totalInserted += batch.length;
    }

    console.log(`[CHUNKING] Successfully stored ${totalInserted} semantic chunks in database`);

    return new Response(JSON.stringify({
      message: "Document processed successfully with improved chunking and Latin filtering",
      chunksCreated: chunks.length,
      chunksStored: totalInserted,
      chunkSizes: {
        min: Math.min(...chunks.map(c => c.length)),
        max: Math.max(...chunks.map(c => c.length)),
        avg: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)
      },
      processing: {
        embeddingBatches: Math.ceil(chunks.length / 50),
        databaseBatches: Math.ceil(chunkRecords.length / 25)
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Process document error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}); 