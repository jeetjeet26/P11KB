"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RealEstateCampaignGenerator } from '@/components/RealEstateCampaignGenerator';

export default function CampaignServicePage() {
    const supabase = createClient();
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load clients from database
    const loadClients = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            setClients(data || []);
        } catch (err: any) {
            console.error('Error loading clients:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClients();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading clients...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
                        <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Clients</h3>
                        <p className="text-red-600 mb-4">{error}</p>
                        <button 
                            onClick={loadClients}
                            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (clients.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto px-4 py-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-8">Real Estate Campaign Service</h1>
                    
                    <div className="text-center py-12">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 max-w-md mx-auto">
                            <h3 className="text-lg font-medium text-yellow-800 mb-2">No Clients Found</h3>
                            <p className="text-yellow-600 mb-4">
                                No clients are available in the database. Please add clients through the Knowledge Base service first.
                            </p>
                            <button 
                                onClick={loadClients}
                                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                            >
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Real Estate Campaign Service</h1>
                    <p className="text-gray-600">Generate Google Ads campaigns for real estate properties using AI and your knowledge base</p>
                </div>

                {/* Client Selection */}
                {!selectedClient ? (
                    <div>
                        <h2 className="text-2xl font-semibold mb-6">Select a Client</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {clients.map((client) => (
                                <div key={client.id} className="bg-white border rounded-lg p-6 shadow hover:shadow-md transition-shadow">
                                    <h3 className="text-xl font-semibold mb-2">{client.name}</h3>
                                    <p className="text-gray-600 text-sm mb-4">
                                        Client ID: {client.id}
                                    </p>
                                    <p className="text-gray-500 text-sm mb-4">
                                        Created: {new Date(client.created_at).toLocaleDateString()}
                                    </p>
                                    <button
                                        onClick={() => setSelectedClient(client)}
                                        className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 transition-colors"
                                    >
                                        Generate Campaigns
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div>
                        {/* Back to client selection */}
                        <div className="mb-6">
                            <button
                                onClick={() => setSelectedClient(null)}
                                className="flex items-center text-purple-600 hover:text-purple-800 transition-colors"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Back to Client Selection
                            </button>
                        </div>

                        {/* Campaign Generator */}
                        <RealEstateCampaignGenerator client={selectedClient} />
                    </div>
                )}
            </div>
        </div>
    );
} 