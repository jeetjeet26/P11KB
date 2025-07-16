import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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
      
      sourceLocation = file.name;
      console.log('[SERVER] Starting file processing for:', sourceLocation);
      
      const buffer = await file.arrayBuffer();
      console.log('[SERVER] File buffer created, size:', buffer.byteLength);
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      console.log('[SERVER] File extension detected:', fileExtension);
      
      // Extract text based on file type
      console.log('[SERVER] Starting text extraction for file type:', fileExtension);
      switch (fileExtension) {
        case 'pdf':
          console.log('[SERVER] Processing PDF file...');
          // Dynamic import for pdf-parse
          const pdf = (await import('pdf-parse')).default;
          const pdfData = await pdf(Buffer.from(buffer));
          textContent = pdfData.text;
          console.log('[SERVER] PDF text extracted, length:', textContent.length);
          break;
          
        case 'docx':
          console.log('[SERVER] Processing DOCX file...');
          // Dynamic import for mammoth
          const mammoth = (await import('mammoth'));
          const docxResult = await mammoth.extractRawText({buffer: Buffer.from(buffer)});
          textContent = docxResult.value;
          console.log('[SERVER] DOCX text extracted, length:', textContent.length);
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
          // Dynamic import for tesseract.js
          const { recognize } = await import('tesseract.js');
          const { data: { text } } = await recognize(Buffer.from(buffer));
          textContent = text;
          console.log('[SERVER] OCR text extracted, length:', textContent.length);
          break;
          
        default:
          console.error('[SERVER] Unsupported file type:', fileExtension);
          return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
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
    
    // Call the edge function to process and chunk the document
    console.log('[SERVER] Calling edge function process-document with data:', {
      textContentLength: textContent.length,
      clientId: clientId,
      sourceId: sourceData.id
    });
    
    const { data: processResult, error: processError } = await supabase.functions.invoke('process-document', {
      body: {
        textContent: textContent,
        clientId: clientId,
        sourceId: sourceData.id
      }
    });
    
    if (processError) {
      console.error('[SERVER] Error processing document:', processError);
      return NextResponse.json({ error: 'Failed to process document', details: processError.message }, { status: 500 });
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