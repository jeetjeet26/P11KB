"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Real Estate Campaign Types and Ad Groups
const RE_CAMPAIGN_TYPES = {
  're_general_location': {
    name: 'General Location',
    description: 'Headlines distributed across location general, specific areas, and amenities',
    requiresAdGroupFocus: false,
    adGroupFocuses: [
      'Location General',
      'Location Specific', 
      'Location Amenities'
    ]
  },
  're_unit_type': {
    name: 'Unit Type',
    description: 'Unit-specific campaigns focusing on bedrooms/bathrooms',
    requiresAdGroupFocus: true,
    adGroups: {
      'studio': 'Studio apartments',
      '1br': '1 bedroom units',
      '2br': '2 bedroom units',
      '3br': '3 bedroom units',
      '4br_plus': '4+ bedroom units'
    }
  },
  're_proximity': {
    name: 'Proximity Search',
    description: 'Headlines distributed across landmarks, transit, employers, and schools',
    requiresAdGroupFocus: false,
    adGroupFocuses: [
      'Near Landmarks',
      'Near Transit',
      'Near Employers',
      'Near Schools'
    ]
  }
} as const;

interface ValidationResult {
  text: string;
  valid: boolean;
  length: number;
  truncated?: string;
}

interface RealEstateCampaignGeneratorProps {
  client: any;
}

export function RealEstateCampaignGenerator({ client }: RealEstateCampaignGeneratorProps) {
    const supabase = createClient();
    
    // Form state - simplified to only essential fields
    const [campaignType, setCampaignType] = useState<keyof typeof RE_CAMPAIGN_TYPES>('re_general_location');
    const [adGroupType, setAdGroupType] = useState('location_general');
    const [campaignName, setCampaignName] = useState('');
    
    // Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedCopy, setGeneratedCopy] = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [derivedContext, setDerivedContext] = useState<any>(null);

    // Update ad group options when campaign type changes
    useEffect(() => {
        const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
        if (campaignConfig.requiresAdGroupFocus && campaignConfig.adGroups) {
            const firstAdGroup = Object.keys(campaignConfig.adGroups)[0];
            setAdGroupType(firstAdGroup);
        } else {
            setAdGroupType(''); // Clear for distributed campaigns
        }
    }, [campaignType]);

    // Load existing campaigns
    const loadCampaigns = async () => {
        const { data } = await supabase
            .from('campaigns')
            .select('*')
            .eq('client_id', client.id)
            .like('campaign_type', 're_%')
            .order('created_at', { ascending: false });
        
        if (data) setCampaigns(data);
    };

    useEffect(() => {
        loadCampaigns();
    }, [client.id]);

    // Validate form
    const validateForm = (): string | null => {
        if (!campaignName.trim()) return "Campaign name is required";
        
        // Check if ad group type is required for this campaign type
        const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
        if (campaignConfig.requiresAdGroupFocus && !adGroupType) {
            return "Ad group focus is required for this campaign type";
        }
        
        return null;
    };

    // Generate campaign
    const generateCampaign = async () => {
        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsGenerating(true);
        setError(null);
        setDerivedContext(null);
        
        try {
            const requestData: any = {
                clientId: client.id,
                campaignType,
                campaignName: campaignName.trim()
            };

            // Only include adGroupType for campaigns that require it
            const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
            if (campaignConfig.requiresAdGroupFocus) {
                requestData.adGroupType = adGroupType;
            }

            console.log('[RE-CAMPAIGN-UI] Sending simplified request:', requestData);

            const response = await fetch('/api/campaigns/real-estate/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Campaign generation failed');
            }

            setGeneratedCopy(result.generatedCopy);
            setDerivedContext(result.derivedContext);
            loadCampaigns(); // Refresh campaigns list

        } catch (error: any) {
            console.error('[RE-CAMPAIGN-UI] Error:', error);
            setError(error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    // Clear form
    const clearForm = () => {
        setCampaignName('');
        setGeneratedCopy(null);
        setDerivedContext(null);
        setError(null);
    };

    // Character validation display
    const CharacterValidationDisplay = ({ validation }: { validation: ValidationResult[] }) => (
        <div className="space-y-2">
            {validation.map((item, index) => (
                <div key={index} className={`p-2 rounded text-sm ${item.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex justify-between items-center">
                        <span className={item.valid ? 'text-green-800' : 'text-red-800'}>
                            {item.text}
                        </span>
                        <span className={`text-xs ${item.valid ? 'text-green-600' : 'text-red-600'}`}>
                            {item.length} chars {item.valid ? '✓' : '✗'}
                        </span>
                    </div>
                    {item.truncated && (
                        <div className="mt-1 text-xs text-gray-600">
                            Suggested: {item.truncated}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    // Derived context display
    const DerivedContextDisplay = ({ context }: { context: any }) => {
        if (!context) return null;

        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h5 className="font-medium text-blue-800 mb-2">Derived from Vector Database:</h5>
                <div className="text-sm text-blue-700 space-y-1">
                    {context.location && (
                        <div><strong>Location:</strong> {context.location.city}, {context.location.state}</div>
                    )}
                    {context.priceRange && (
                        <div><strong>Price Range:</strong> {context.priceRange}</div>
                    )}
                    {context.targetDemographic && (
                        <div><strong>Target Demographic:</strong> {context.targetDemographic}</div>
                    )}
                    {context.unitDetails && (
                        <div><strong>Unit Details:</strong> {context.unitDetails.bedrooms}BR/{context.unitDetails.bathrooms}BA</div>
                    )}
                    {context.proximityTargets && context.proximityTargets.length > 0 && (
                        <div><strong>Proximity Targets:</strong> {context.proximityTargets.join(', ')}</div>
                    )}
                </div>
            </div>
        );
    };

    const currentCampaignConfig = RE_CAMPAIGN_TYPES[campaignType];
    const currentAdGroups = currentCampaignConfig.requiresAdGroupFocus && 'adGroups' in currentCampaignConfig 
        ? currentCampaignConfig.adGroups 
        : null;

    return (
        <div className="w-full max-w-7xl mx-auto mt-8">
            <h2 className="text-3xl font-bold mb-2">{client.name} - Real Estate Campaign Generator</h2>
            <p className="text-gray-500 mb-2">Client ID: {client.id}</p>
            <p className="text-sm text-blue-600 mb-8">All campaign details automatically derived from your knowledge base</p>
            
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Simplified Campaign Configuration */}
                <div className="xl:col-span-1">
                    <h3 className="text-2xl font-semibold mb-4">Campaign Configuration</h3>
                    
                    <div className="space-y-6 bg-white border rounded-lg p-6 shadow">
                        {/* Campaign Name */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Campaign Name *</label>
                            <input
                                type="text"
                                value={campaignName}
                                onChange={(e) => setCampaignName(e.target.value)}
                                placeholder="Q1 2024 Location Campaign"
                                className="w-full p-2 border rounded-md"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Give your campaign a descriptive name for tracking
                            </p>
                        </div>

                        {/* Campaign Type */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Campaign Type</label>
                            <select 
                                value={campaignType} 
                                onChange={(e) => setCampaignType(e.target.value as keyof typeof RE_CAMPAIGN_TYPES)}
                                className="w-full p-2 border rounded-md"
                            >
                                {Object.entries(RE_CAMPAIGN_TYPES).map(([key, config]) => (
                                    <option key={key} value={key}>{config.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {RE_CAMPAIGN_TYPES[campaignType].description}
                            </p>
                        </div>

                        {/* Ad Group Type - only show for campaigns that require it */}
                        {currentCampaignConfig.requiresAdGroupFocus && currentAdGroups && (
                            <div>
                                <label className="block text-sm font-medium mb-2">Ad Group Focus</label>
                                <select 
                                    value={adGroupType} 
                                    onChange={(e) => setAdGroupType(e.target.value)}
                                    className="w-full p-2 border rounded-md"
                                >
                                    {Object.entries(currentAdGroups).map(([key, description]) => (
                                        <option key={key} value={key}>{description}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Distributed Headlines Info - show for campaigns that don't require ad group focus */}
                        {!currentCampaignConfig.requiresAdGroupFocus && 'adGroupFocuses' in currentCampaignConfig && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                <h4 className="font-medium text-purple-800 mb-2">Distributed Headlines</h4>
                                <p className="text-sm text-purple-700 mb-2">
                                    Headlines will be automatically distributed across these focuses:
                                </p>
                                <ul className="text-sm text-purple-600 space-y-1">
                                    {currentCampaignConfig.adGroupFocuses.map((focus, index) => (
                                        <li key={index}>• {focus}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Information Note */}
                        <div className="border-t pt-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-medium text-blue-800 mb-2">Auto-Derived Information</h4>
                                <p className="text-sm text-blue-700 mb-2">
                                    The following will be automatically extracted from your knowledge base:
                                </p>
                                <ul className="text-xs text-blue-600 space-y-1">
                                    <li>• Property location and details</li>
                                    <li>• Target demographic and psychographics</li>
                                    <li>• Pricing information and offers</li>
                                    <li>• Brand voice and messaging guidelines</li>
                                    <li>• Competitive positioning</li>
                                    <li>• Property amenities and features</li>
                                    <li>• Local area advantages</li>
                                </ul>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-4 border-t">
                            <button 
                                onClick={generateCampaign} 
                                disabled={isGenerating}
                                className="flex-1 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300 font-medium"
                            >
                                {isGenerating ? 'Generating from Knowledge Base...' : 'Generate Campaign'}
                            </button>
                            <button 
                                onClick={clearForm}
                                className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>

                {/* Middle Column: Generated Copy */}
                <div className="xl:col-span-1">
                    <h3 className="text-2xl font-semibold mb-4">Generated Campaign Copy</h3>
                    
                    {/* Show derived context if available */}
                    <DerivedContextDisplay context={derivedContext} />
                    
                    {generatedCopy ? (
                        <div className="bg-white border rounded-lg p-6 shadow space-y-6">
                            {/* Headlines */}
                            <div>
                                <h4 className="font-bold mb-3 text-green-800">Headlines (15 required, max 30 chars each)</h4>
                                <CharacterValidationDisplay validation={generatedCopy.character_validation?.headlines_valid || []} />
                            </div>

                            {/* Descriptions */}
                            <div>
                                <h4 className="font-bold mb-3 text-green-800">Descriptions (4 required, max 90 chars each)</h4>
                                <CharacterValidationDisplay validation={generatedCopy.character_validation?.descriptions_valid || []} />
                            </div>

                            {/* Keywords */}
                            {generatedCopy.keywords && (
                                <div>
                                    <h4 className="font-bold mb-3 text-green-800">Keywords</h4>
                                    <div className="space-y-3">
                                        {generatedCopy.keywords.exact_match && generatedCopy.keywords.exact_match.length > 0 && (
                                            <div>
                                                <h5 className="font-medium text-sm text-gray-700">Exact Match</h5>
                                                <div className="flex flex-wrap gap-1">
                                                    {generatedCopy.keywords.exact_match.map((keyword: string, index: number) => (
                                                        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                                            {keyword}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {generatedCopy.keywords.phrase_match && generatedCopy.keywords.phrase_match.length > 0 && (
                                            <div>
                                                <h5 className="font-medium text-sm text-gray-700">Phrase Match</h5>
                                                <div className="flex flex-wrap gap-1">
                                                    {generatedCopy.keywords.phrase_match.map((keyword: string, index: number) => (
                                                        <span key={index} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                                            {keyword}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {generatedCopy.keywords.broad_match && generatedCopy.keywords.broad_match.length > 0 && (
                                            <div>
                                                <h5 className="font-medium text-sm text-gray-700">Broad Match</h5>
                                                <div className="flex flex-wrap gap-1">
                                                    {generatedCopy.keywords.broad_match.map((keyword: string, index: number) => (
                                                        <span key={index} className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                                                            {keyword}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {generatedCopy.keywords.negative_keywords && generatedCopy.keywords.negative_keywords.length > 0 && (
                                            <div>
                                                <h5 className="font-medium text-sm text-gray-700">Negative Keywords</h5>
                                                <div className="flex flex-wrap gap-1">
                                                    {generatedCopy.keywords.negative_keywords.map((keyword: string, index: number) => (
                                                        <span key={index} className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                                                            -{keyword}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* URL Paths */}
                            {generatedCopy.final_url_paths && generatedCopy.final_url_paths.length > 0 && (
                                <div>
                                    <h4 className="font-bold mb-3 text-green-800">Suggested URL Paths</h4>
                                    <div className="space-y-1">
                                        {generatedCopy.final_url_paths.map((path: string, index: number) => (
                                            <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                                                /{path}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-gray-50 border rounded-lg p-6 text-center">
                            <p className="text-gray-500">No campaign generated yet. Choose your campaign type and click "Generate Campaign" to automatically extract details from your knowledge base.</p>
                        </div>
                    )}
                </div>

                {/* Right Column: Campaign History */}
                <div className="xl:col-span-1">
                    <h3 className="text-2xl font-semibold mb-4">Campaign History</h3>
                    
                    <div className="bg-white border rounded-lg p-6 shadow">
                        {campaigns.length === 0 ? (
                            <p className="text-gray-500">No real estate campaigns generated yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {campaigns.slice(0, 10).map((campaign) => (
                                    <div key={campaign.id} className="p-3 bg-gray-50 rounded border">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">
                                                    {campaign.product_name || `${campaign.campaign_type?.replace('re_', '').replace('_', ' ')} - ${campaign.ad_group_type}`}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {campaign.location_data?.city}, {campaign.location_data?.state}
                                                </p>
                                                {campaign.unit_details && (
                                                    <p className="text-xs text-gray-500">
                                                        {campaign.unit_details.bedrooms}BR/{campaign.unit_details.bathrooms}BA
                                                    </p>
                                                )}
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