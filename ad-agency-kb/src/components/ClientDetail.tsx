"use client";

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ClientDetail({ client, onBack }: { client: any, onBack: () => void }) {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [manualIntake, setManualIntake] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);


    
    const handleManualIntake = async () => {
        if (!manualIntake) return;
        setLoading(true);
        console.log('[CLIENT] Starting manual intake process');
        console.log('[CLIENT] Manual intake data:', { textContent: manualIntake, clientId: client.id });
        
        try {
            const requestData = { textContent: manualIntake, clientId: client.id };
            console.log('[CLIENT] Sending manual intake request to /api/process');
            console.log('[CLIENT] Request payload:', requestData);
            
            const response = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
            });
            
            console.log('[CLIENT] Response status:', response.status);
            console.log('[CLIENT] Response headers:', Object.fromEntries(response.headers.entries()));
            
            const responseText = await response.text();
            console.log('[CLIENT] Raw response text:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
                console.log('[CLIENT] Parsed JSON result:', result);
            } catch (parseError) {
                console.error('[CLIENT] Failed to parse JSON response:', parseError);
                console.error('[CLIENT] Response was not valid JSON:', responseText);
                throw new Error(`Server returned invalid JSON response: ${responseText.substring(0, 200)}...`);
            }

            if (!response.ok) {
                console.error('[CLIENT] Request failed with status:', response.status);
                throw new Error(result.error || "An unknown error occurred.");
            }

            console.log('[CLIENT] Manual intake successful:', result);
            alert(result.message);
            setManualIntake('');
        } catch(e: any) {
            console.error('[CLIENT] Manual intake error:', e);
            alert(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleFileUpload = async () => {
        if (!selectedFile) return;
        setUploading(true);
        console.log('[CLIENT] Starting file upload process');
        console.log('[CLIENT] File details:', { 
            name: selectedFile.name, 
            size: selectedFile.size, 
            type: selectedFile.type,
            clientId: client.id 
        });
        
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('clientId', client.id);

            console.log('[CLIENT] Sending file upload request to /api/process');
            console.log('[CLIENT] FormData contains file and clientId:', client.id);

            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
            });
            
            console.log('[CLIENT] File upload response status:', response.status);
            console.log('[CLIENT] File upload response headers:', Object.fromEntries(response.headers.entries()));
            
            const responseText = await response.text();
            console.log('[CLIENT] File upload raw response text:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
                console.log('[CLIENT] File upload parsed JSON result:', result);
            } catch (parseError) {
                console.error('[CLIENT] Failed to parse JSON response from file upload:', parseError);
                console.error('[CLIENT] File upload response was not valid JSON:', responseText);
                throw new Error(`Server returned invalid JSON response: ${responseText.substring(0, 200)}...`);
            }

            if (!response.ok) {
                console.error('[CLIENT] File upload failed with status:', response.status);
                throw new Error(result.error || "An unknown error occurred.");
            }

            console.log('[CLIENT] File upload successful:', result);
            alert(result.message);
            setSelectedFile(null);
        } catch(e: any) {
            console.error('[CLIENT] File upload error:', e);
            alert(`Error: ${e.message}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <button onClick={onBack} className="mb-6 text-blue-600 hover:underline">← Back to Dashboard</button>
            <h2 className="text-3xl font-bold mb-2">{client.name}</h2>
            <p className="text-gray-500 mb-8">Client ID: {client.id}</p>
            
            <div className="grid grid-cols-1">
                {/* Left Side: Data Ingestion */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">Add Knowledge</h3>
                    <div className="p-6 bg-white border rounded-lg shadow">
                         <h4 className="font-bold mb-2">Manual Intake</h4>
                         <textarea 
                            value={manualIntake}
                            onChange={e => setManualIntake(e.target.value)}
                            placeholder="Paste client onboarding info, brand voice, etc."
                            className="w-full h-40 p-2 border rounded-md mb-2"
                         />
                         <button onClick={handleManualIntake} disabled={loading} className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300">
                            {loading ? 'Processing...' : 'Process Intake'}
                         </button>
                    </div>
                    <div className="p-6 bg-white border rounded-lg shadow mt-4">
                        <h4 className="font-bold mb-2">File Upload</h4>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="w-full p-2 border rounded-md"
                        />
                        <button onClick={handleFileUpload} disabled={uploading || !selectedFile} className="w-full mt-2 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                            {uploading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
} 