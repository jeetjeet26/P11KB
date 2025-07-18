import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// File size limits (in bytes)
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_PDF_SIZE = 15 * 1024 * 1024; // 15MB for PDFs to prevent memory issues

export async function GET(req: NextRequest) {
  console.log('[SERVER] GET request to /api/process');
  return NextResponse.json({ message: 'Process route is working! Use POST to upload files.' });
}

export async function POST(req: NextRequest) {
  console.log('\n[SERVER] =================================');
  console.log('[SERVER] POST request received at /api/process');
  console.log('[SERVER] Request method:', req.method);
  console.log('[SERVER] Request URL:', req.url);
  
  try {
    const contentType = req.headers.get('content-type') || '';
    console.log('[SERVER] Content-Type:', contentType);
    console.log('[SERVER] All headers:', Object.fromEntries(req.headers.entries()));
    
    let textContent: string;
    let clientId: string;
    let sourceType: string = 'upload';
    let sourceLocation: string;
    
    if (contentType.includes('multipart/form-data')) {
      console.log('[SERVER] Processing multipart/form-data (file upload)');
      // Handle file upload
      const formData = await req.formData();
      console.log('[SERVER] FormData parsed successfully');
      
      const file = formData.get('file') as File;
      clientId = formData.get('clientId') as string;
      console.log('[SERVER] File extracted:', file ? { name: file.name, size: file.size, type: file.type } : 'null');
      console.log('[SERVER] ClientId extracted:', clientId);
      
      if (!file || !clientId) {
        console.error('[SERVER] Missing required fields - file:', !!file, 'clientId:', !!clientId);
        return NextResponse.json({ error: 'Missing file or clientId' }, { status: 400 });
      }
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        console.error('[SERVER] File too large:', file.size, 'bytes. Max allowed:', MAX_FILE_SIZE);
        return NextResponse.json({ 
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        }, { status: 400 });
      }
      
      sourceLocation = file.name;
      console.log('[SERVER] Starting file processing for:', sourceLocation);
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      console.log('[SERVER] File extension detected:', fileExtension);
      
      // Additional size check for PDFs
      if (fileExtension === 'pdf' && file.size > MAX_PDF_SIZE) {
        console.error('[SERVER] PDF file too large:', file.size, 'bytes. Max allowed for PDFs:', MAX_PDF_SIZE);
        return NextResponse.json({ 
          error: `PDF file too large. Maximum size for PDFs is ${MAX_PDF_SIZE / 1024 / 1024}MB` 
        }, { status: 400 });
      }
      
      const buffer = await file.arrayBuffer();
      console.log('[SERVER] File buffer created, size:', buffer.byteLength);
      
      // Extract text based on file type
      console.log('[SERVER] Starting text extraction for file type:', fileExtension);
      try {
        switch (fileExtension) {
          case 'pdf':
            console.log('[SERVER] Processing PDF file...');
            try {
              // Dynamic import for pdf-parse
              const pdf = (await import('pdf-parse')).default;
              console.log('[SERVER] pdf-parse module loaded successfully');
              
              const pdfData = await pdf(Buffer.from(buffer), {
                // Add options to prevent memory issues
                max: 0, // No limit on pages (0 = all pages)
                version: 'v1.10.100' // Use specific version
              });
              textContent = pdfData.text;
              console.log('[SERVER] PDF text extracted, length:', textContent.length);
              
              if (!textContent || textContent.trim().length === 0) {
                console.error('[SERVER] PDF appears to be empty or contains no extractable text');
                return NextResponse.json({ 
                  error: 'PDF contains no extractable text. It may be an image-based PDF or corrupted.' 
                }, { status: 400 });
              }
            } catch (pdfError) {
              console.error('[SERVER] PDF processing error:', pdfError);
              return NextResponse.json({ 
                error: 'Failed to process PDF file', 
                details: pdfError instanceof Error ? pdfError.message : 'Unknown PDF error'
              }, { status: 500 });
            }
            break;
            
          case 'docx':
            console.log('[SERVER] Processing DOCX file...');
            try {
              // Dynamic import for mammoth
              const mammoth = (await import('mammoth'));
              const docxResult = await mammoth.extractRawText({buffer: Buffer.from(buffer)});
              textContent = docxResult.value;
              console.log('[SERVER] DOCX text extracted, length:', textContent.length);
            } catch (docxError) {
              console.error('[SERVER] DOCX processing error:', docxError);
              return NextResponse.json({ 
                error: 'Failed to process DOCX file', 
                details: docxError instanceof Error ? docxError.message : 'Unknown DOCX error'
              }, { status: 500 });
            }
            break;
            
          case 'txt':
            console.log('[SERVER] Processing TXT file...');
            textContent = new TextDecoder().decode(buffer);
            console.log('[SERVER] TXT text extracted, length:', textContent.length);
            break;
            
          case 'jpg':
          case 'jpeg':
          case 'png':
            console.log('[SERVER] Processing image file with OCR...');
            try {
              // Dynamic import for tesseract.js
              const { recognize } = await import('tesseract.js');
              const { data: { text } } = await recognize(Buffer.from(buffer));
              textContent = text;
              console.log('[SERVER] OCR text extracted, length:', textContent.length);
            } catch (ocrError) {
              console.error('[SERVER] OCR processing error:', ocrError);
              return NextResponse.json({ 
                error: 'Failed to process image file with OCR', 
                details: ocrError instanceof Error ? ocrError.message : 'Unknown OCR error'
              }, { status: 500 });
            }
            break;
            
          default:
            console.error('[SERVER] Unsupported file type:', fileExtension);
            return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
        }
      } catch (processingError) {
        console.error('[SERVER] File processing error:', processingError);
        return NextResponse.json({ 
          error: 'Failed to process file', 
          details: processingError instanceof Error ? processingError.message : 'Unknown processing error'
        }, { status: 500 });
      }
      
    } else if (contentType.includes('application/json')) {
      console.log('[SERVER] Processing application/json (manual intake)');
      // Handle JSON data (manual text input)
      const body = await req.json();
      console.log('[SERVER] JSON body parsed:', { hasTextContent: !!body.textContent, clientId: body.clientId });
      textContent = body.textContent;
      clientId = body.clientId;
      sourceType = 'manual_intake';
      sourceLocation = 'Form';
      console.log('[SERVER] Manual intake processed, text length:', textContent.length);
      
    } else {
      console.error('[SERVER] Unsupported content type:', contentType);
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
    }
    
    console.log('[SERVER] Text content validation...');
    if (!textContent || textContent.trim().length === 0) {
      console.error('[SERVER] No text content extracted from file');
      return NextResponse.json({ error: 'No text content extracted from file' }, { status: 400 });
    }
    console.log('[SERVER] Text content validated successfully, length:', textContent.length);
    
    // Sanitize text content to prevent Unicode/JSON issues
    console.log('[SERVER] Sanitizing text content for safe JSON transmission...');
    textContent = textContent
      // Replace problematic Unicode characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') // Remove control characters
      .replace(/[\u2000-\u206F]/g, ' ') // Replace general punctuation spaces
      .replace(/[\uFEFF\uFFFE\uFFFF]/g, '') // Remove byte order marks and invalid chars
      // Fix common PDF extraction issues
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/"/g, '\\"') // Escape quotes
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n') // Convert remaining carriage returns
      // Remove or replace other problematic characters  
      .replace(/[\uD83D][\uDE00-\uDEFF]/g, '[emoji]') // Replace emojis (surrogate pairs)
      .replace(/[\u2600-\u26FF]/g, '[symbol]') // Replace misc symbols
      .trim();
    
    console.log('[SERVER] Text sanitized, new length:', textContent.length);
    
    // Add safeguard for very large text content to prevent edge function timeouts
    const MAX_TEXT_LENGTH = 50000; // 50KB of text should be reasonable
    if (textContent.length > MAX_TEXT_LENGTH) {
      console.warn('[SERVER] Text content is very large:', textContent.length, 'characters. Truncating to:', MAX_TEXT_LENGTH);
      textContent = textContent.substring(0, MAX_TEXT_LENGTH) + '\n\n[Document truncated due to size limits]';
    }
    
    // Initialize Supabase client
    console.log('[SERVER] Initializing Supabase client...');
    const supabase = createClient();
    console.log('[SERVER] Supabase client initialized');
    
    // Create source record
    console.log('[SERVER] Creating source record with data:', {
      client_id: clientId,
      type: sourceType,
      source_location: sourceLocation
    });
    const { data: sourceData, error: sourceError } = await supabase
      .from('sources')
      .insert({
        client_id: clientId,
        type: sourceType,
        source_location: sourceLocation
      })
      .select()
      .single();
      
    if (sourceError) {
      console.error('[SERVER] Error creating source:', sourceError);
      return NextResponse.json({ error: 'Failed to create source record', details: sourceError.message }, { status: 500 });
    }
    console.log('[SERVER] Source record created successfully:', sourceData);
    
    // Validate JSON payload before sending
    const payload = {
      textContent: textContent,
      clientId: clientId,
      sourceId: sourceData.id
    };
    
    try {
      JSON.stringify(payload);
      console.log('[SERVER] JSON payload validated successfully');
    } catch (jsonError) {
      console.error('[SERVER] JSON validation failed:', jsonError);
      return NextResponse.json({ 
        error: 'Text content contains invalid characters', 
        details: 'Document text could not be safely processed due to encoding issues'
      }, { status: 400 });
    }
    
    // Call the edge function to process and chunk the document
    console.log('[SERVER] Calling edge function process-document with data:', {
      textContentLength: textContent.length,
      clientId: clientId,
      sourceId: sourceData.id
    });
    
    const { data: processResult, error: processError } = await supabase.functions.invoke('process-document', {
      body: payload
    });
    
    if (processError) {
      console.error('[SERVER] Error processing document:', processError);
      console.error('[SERVER] Error context:', processError.context);
      
      // Try to get the actual error message from the edge function response
      let errorDetails = processError.message;
      if (processError.context && processError.context.text) {
        try {
          const errorText = await processError.context.text();
          console.error('[SERVER] Edge function error response:', errorText);
          errorDetails = errorText;
        } catch (e) {
          console.error('[SERVER] Could not read error response text:', e);
        }
      }
      
      return NextResponse.json({ 
        error: 'Failed to process document', 
        details: errorDetails,
        edgeError: processError.message
      }, { status: 500 });
    }
    
    console.log('[SERVER] Edge function completed successfully:', processResult);
    
    const response = { 
      success: true, 
      message: 'File processed and stored successfully',
      sourceId: sourceData.id,
      textLength: textContent.length
    };
    console.log('[SERVER] Sending success response:', response);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('\n[SERVER] =================================');
    console.error('[SERVER] CRITICAL ERROR in /api/process');
    console.error('[SERVER] Error type:', typeof error);
    console.error('[SERVER] Error instanceof Error:', error instanceof Error);
    console.error('[SERVER] Error details:', error);
    if (error instanceof Error) {
      console.error('[SERVER] Error message:', error.message);
      console.error('[SERVER] Error stack:', error.stack);
    }
    console.error('[SERVER] =================================\n');
    
    const errorResponse = { 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error',
      type: typeof error
    };
    console.error('[SERVER] Sending error response:', errorResponse);
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}