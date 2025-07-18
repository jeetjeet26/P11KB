"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function CampaignGenerator({ client }: { client: any }) {
    const supabase = createClient();
    
    // Campaign generation state
    const [campaignGenerating, setCampaignGenerating] = useState(false);
    const [campaignType, setCampaignType] = useState('facebook_ad');
    const [productName, setProductName] = useState('');
    const [targetAudience, setTargetAudience] = useState('');
    const [specialOffer, setSpecialOffer] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [generatedCopy, setGeneratedCopy] = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    
    // Campaign types available
    const CAMPAIGN_TYPES = {
        facebook_ad: 'Facebook Ad',
        google_search_ad: 'Google Search Ad',
        email_newsletter: 'Email Newsletter',
        social_media_post: 'Social Media Post'
    };

    // Load existing campaigns for this client
    const loadCampaigns = async () => {
        const { data } = await supabase
            .from('campaigns')
            .select('*')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });
        
        if (data) setCampaigns(data);
    };

    // Load campaigns on component mount
    useEffect(() => {
        loadCampaigns();
    }, [client.id]);

    // Generate campaign copy
    const generateCampaign = async () => {
        if (!productName || !targetAudience) {
            alert('Please fill in required fields: Product/Service Name and Target Audience');
            return;
        }

        setCampaignGenerating(true);
        console.log('[CAMPAIGN] Starting campaign generation');

        try {
            const requestData = {
                clientId: client.id,
                campaignType,
                productName,
                targetAudience,
                specialOffer: specialOffer || undefined,
                additionalContext: additionalContext || undefined
            };

            console.log('[CAMPAIGN] Sending campaign generation request:', requestData);

            const response = await fetch('/api/campaigns/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
            });

            const result = await response.json();
            console.log('[CAMPAIGN] Campaign generation response:', result);

            if (!response.ok) {
                throw new Error(result.error || 'Campaign generation failed');
            }

            setGeneratedCopy(result.generatedCopy);
            alert(`Campaign generated successfully! Used ${result.contextChunksUsed} context chunks from knowledge base.`);
            
            // Refresh campaigns list
            loadCampaigns();

        } catch (error: any) {
            console.error('[CAMPAIGN] Campaign generation error:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setCampaignGenerating(false);
        }
    };

    // Clear campaign form
    const clearCampaignForm = () => {
        setProductName('');
        setTargetAudience('');
        setSpecialOffer('');
        setAdditionalContext('');
        setGeneratedCopy(null);
    };

    return (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <h2 className="text-3xl font-bold mb-2">{client.name} - Campaign Generator</h2>
            <p className="text-gray-500 mb-8">Client ID: {client.id}</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Side: Campaign Creation Form */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">Create New Campaign</h3>
                    
                    <div className="p-6 bg-white border rounded-lg shadow mb-4">
                        {/* Campaign Type Selection */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Campaign Type</label>
                            <select 
                                value={campaignType} 
                                onChange={(e) => setCampaignType(e.target.value)}
                                className="w-full p-2 border rounded-md"
                            >
                                {Object.entries(CAMPAIGN_TYPES).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Product Name */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Product/Service Name *</label>
                            <input
                                type="text"
                                value={productName}
                                onChange={(e) => setProductName(e.target.value)}
                                placeholder="e.g., Nike Air Max, Premium CRM Software"
                                className="w-full p-2 border rounded-md"
                                required
                            />
                        </div>

                        {/* Target Audience */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Target Audience *</label>
                            <input
                                type="text"
                                value={targetAudience}
                                onChange={(e) => setTargetAudience(e.target.value)}
                                placeholder="e.g., young professionals 25-35, fitness enthusiasts"
                                className="w-full p-2 border rounded-md"
                                required
                            />
                        </div>

                        {/* Special Offer */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Special Offer (Optional)</label>
                            <input
                                type="text"
                                value={specialOffer}
                                onChange={(e) => setSpecialOffer(e.target.value)}
                                placeholder="e.g., 20% off, Free shipping, Limited time offer"
                                className="w-full p-2 border rounded-md"
                            />
                        </div>

                        {/* Additional Context */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Additional Context (Optional)</label>
                            <textarea
                                value={additionalContext}
                                onChange={(e) => setAdditionalContext(e.target.value)}
                                placeholder="Any specific requirements, tone, or messaging notes..."
                                className="w-full p-2 border rounded-md h-20"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button 
                                onClick={generateCampaign} 
                                disabled={campaignGenerating || !productName || !targetAudience}
                                className="flex-1 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300"
                            >
                                {campaignGenerating ? 'Generating...' : 'Generate Campaign'}
                            </button>
                            <button 
                                onClick={clearCampaignForm}
                                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Side: Generated Copy & Campaign History */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">Campaign Results</h3>
                    
                    {/* Generated Copy Display */}
                    {generatedCopy && (
                        <div className="p-6 bg-green-50 border border-green-200 rounded-lg shadow mb-4">
                            <h4 className="font-bold mb-4 text-green-800">Generated Campaign Copy</h4>
                            <div className="space-y-4">
                                {Object.entries(generatedCopy).map(([key, value]) => (
                                    <div key={key} className="bg-white p-3 rounded border">
                                        <h5 className="font-semibold text-sm text-gray-600 mb-1">
                                            {key.replace(/_/g, ' ').toUpperCase()}
                                        </h5>
                                        {Array.isArray(value) ? (
                                            <ul className="list-disc list-inside space-y-1">
                                                {(value as string[]).map((item, index) => (
                                                    <li key={index} className="text-gray-800">{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-gray-800">{value as string}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Campaign History */}
                    <div className="p-6 bg-white border rounded-lg shadow">
                        <h4 className="font-bold mb-4">Recent Campaigns</h4>
                        {campaigns.length === 0 ? (
                            <p className="text-gray-500">No campaigns generated yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {campaigns.slice(0, 5).map((campaign) => (
                                    <div key={campaign.id} className="p-3 bg-gray-50 rounded border">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium">{campaign.product_name}</p>
                                                <p className="text-sm text-gray-600">{campaign.campaign_type.replace('_', ' ')}</p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(campaign.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 