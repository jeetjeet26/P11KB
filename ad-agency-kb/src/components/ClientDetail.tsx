"use client";

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import React from 'react'; // Added missing import for React.useEffect

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_PDF_SIZE = 15 * 1024 * 1024; // 15MB for PDFs

export function ClientDetail({ client, onBack }: { client: any, onBack: () => void }) {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [manualIntake, setManualIntake] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [sources, setSources] = useState<any[]>([]);
    const [intakeData, setIntakeData] = useState<any>(null);
    
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

            const result = await response.json();
            console.log('[CLIENT] Manual intake response:', result);

            if (!response.ok) {
                throw new Error(result.error || 'Processing failed');
            }

            alert('Manual intake processed successfully!');
            setManualIntake('');
            loadSources(); // Refresh sources list

        } catch (error: any) {
            console.error('[CLIENT] Manual intake error:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        console.log('[CLIENT] File selected:', { name: file.name, size: file.size, type: file.type });

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            alert(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            return;
        }

        // Additional validation for PDFs
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (fileExtension === 'pdf' && file.size > MAX_PDF_SIZE) {
            alert(`PDF file too large. Maximum size for PDFs is ${MAX_PDF_SIZE / 1024 / 1024}MB to prevent processing issues.`);
            return;
        }

        setSelectedFile(file);
    };

    const handleFileUpload = async () => {
        if (!selectedFile) return;

        // Double-check file size before upload
        if (selectedFile.size > MAX_FILE_SIZE) {
            alert(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            return;
        }

        const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
        if (fileExtension === 'pdf' && selectedFile.size > MAX_PDF_SIZE) {
            alert(`PDF file too large. Maximum size for PDFs is ${MAX_PDF_SIZE / 1024 / 1024}MB`);
            return;
        }

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

            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            console.log('[CLIENT] File upload response:', result);

            if (!response.ok) {
                throw new Error(result.error || 'Upload failed');
            }

            alert('File uploaded and processed successfully!');
            setSelectedFile(null);
            // Reset the file input
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            
            loadSources(); // Refresh sources list

        } catch (error: any) {
            console.error('[CLIENT] File upload error:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    // Load sources for this client
    const loadSources = async () => {
        try {
            const { data } = await supabase
                .from('sources')
                .select('*')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false });
            
            if (data) setSources(data);
        } catch (error) {
            console.error('Error loading sources:', error);
        }
    };

    // Load intake data for this client
    const loadIntakeData = async () => {
        try {
            const { data } = await supabase
                .from('client_intake')
                .select('*')
                .eq('client_id', client.id)
                .eq('intake_completed', true)
                .single();
            
            if (data) setIntakeData(data);
        } catch (error) {
            console.error('Error loading intake data:', error);
        }
    };

    // Delete a source
    const deleteSource = async (sourceId: string) => {
        if (!confirm('Are you sure you want to delete this source? This will also remove all associated chunks.')) {
            return;
        }

        try {
            // Delete chunks first
            await supabase
                .from('chunks')
                .delete()
                .eq('source_id', sourceId);

            // Then delete the source
            const { error } = await supabase
                .from('sources')
                .delete()
                .eq('id', sourceId);

            if (error) throw error;

            alert('Source deleted successfully!');
            loadSources();
        } catch (error: any) {
            console.error('Error deleting source:', error);
            alert(`Error deleting source: ${error.message}`);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    // Load data when component mounts
    React.useEffect(() => {
        loadSources();
        loadIntakeData();
    }, [client.id]);

    return (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <button onClick={onBack} className="mb-6 text-blue-600 hover:underline">← Back to Dashboard</button>
            <h2 className="text-3xl font-bold mb-2">{client.name} - Knowledge Base</h2>
            <p className="text-gray-500 mb-6">Client ID: {client.id}</p>
            
            {/* Client Intake Information Section */}
            {intakeData && (
                <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-xl font-semibold mb-4 text-blue-800">Client Onboarding Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        {intakeData.community_name && (
                            <div>
                                <span className="font-medium text-blue-700">Business Name:</span>
                                <p className="text-blue-600">{intakeData.community_name}</p>
                            </div>
                        )}
                        {intakeData.community_type && (
                            <div>
                                <span className="font-medium text-blue-700">Type:</span>
                                <p className="text-blue-600">{intakeData.community_type}</p>
                            </div>
                        )}
                        {intakeData.property_type && (
                            <div>
                                <span className="font-medium text-blue-700">Property Type:</span>
                                <p className="text-blue-600">{intakeData.property_type === 'home' ? 'Single Family Homes' : 'Apartments/Multifamily'}</p>
                            </div>
                        )}
                        {intakeData.community_address && (
                            <div>
                                <span className="font-medium text-blue-700">Address:</span>
                                <p className="text-blue-600">{intakeData.community_address}</p>
                            </div>
                        )}
                        {intakeData.price_point && (
                            <div>
                                <span className="font-medium text-blue-700">Price Point:</span>
                                <p className="text-blue-600">{intakeData.price_point}</p>
                            </div>
                        )}
                        {intakeData.target_audience && (
                            <div className="md:col-span-2 lg:col-span-3">
                                <span className="font-medium text-blue-700">Target Audience:</span>
                                <p className="text-blue-600 text-xs">{intakeData.target_audience.substring(0, 200)}...</p>
                            </div>
                        )}
                        {intakeData.brand_voice_guidelines && (
                            <div className="md:col-span-2 lg:col-span-3">
                                <span className="font-medium text-blue-700">Brand Voice:</span>
                                <p className="text-blue-600 text-xs">{intakeData.brand_voice_guidelines.substring(0, 200)}...</p>
                            </div>
                        )}
                    </div>
                    <p className="mt-3 text-xs text-blue-500">
                        Intake completed on {new Date(intakeData.intake_completed_at).toLocaleDateString()}
                    </p>
                </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Side: Data Ingestion */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">Add Knowledge</h3>
                    
                    {/* Manual Intake */}
                    <div className="p-6 bg-white border rounded-lg shadow mb-4">
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
                    
                    {/* File Upload */}
                    <div className="p-6 bg-white border rounded-lg shadow">
                        <h4 className="font-bold mb-2">File Upload</h4>
                        <p className="text-sm text-gray-600 mb-2">
                            Supported: PDF (max {MAX_PDF_SIZE / 1024 / 1024}MB), DOCX, TXT, JPG, PNG (max {MAX_FILE_SIZE / 1024 / 1024}MB)
                        </p>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                            className="w-full p-2 border rounded-md"
                        />
                        {selectedFile && (
                            <div className="mt-2 p-2 bg-gray-50 border rounded text-sm">
                                <p><strong>Selected:</strong> {selectedFile.name}</p>
                                <p><strong>Size:</strong> {formatFileSize(selectedFile.size)}</p>
                                <p><strong>Type:</strong> {selectedFile.type}</p>
                            </div>
                        )}
                        <button onClick={handleFileUpload} disabled={uploading || !selectedFile} className="w-full mt-2 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                            {uploading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>
                </div>

                {/* Right Side: Source Management */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">Knowledge Sources</h3>
                    
                    <div className="p-6 bg-white border rounded-lg shadow">
                        <h4 className="font-bold mb-4">Uploaded Sources</h4>
                        {sources.length === 0 ? (
                            <p className="text-gray-500">No sources uploaded yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {sources.map((source) => (
                                    <div key={source.id} className="p-3 bg-gray-50 rounded border">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-medium">{source.source_location}</p>
                                                <p className="text-sm text-gray-600 capitalize">{source.type}</p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(source.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => deleteSource(source.id)}
                                                className="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Vector Database Stats */}
                    <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg shadow mt-4">
                        <h4 className="font-bold mb-2 text-blue-800">Knowledge Base Stats</h4>
                        <p className="text-sm text-blue-700">
                            This client has <strong>{sources.length}</strong> sources in the knowledge base.
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                            Each source is processed into semantic chunks for AI retrieval.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
} 