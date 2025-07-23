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

interface CurationState {
  // Current generation batch
  currentBatch: {
    headlines: string[];
    descriptions: string[];
    keywords: any;
    final_url_paths: string[];
    character_validation: {
      headlines_valid: ValidationResult[];
      descriptions_valid: ValidationResult[];
    };
  } | null;
  
  // Editable versions of current batch (for editing before adding to final)
  editableBatch: {
    headlines: string[];
    descriptions: string[];
  } | null;
  
  // User's curated final campaign
  finalCampaign: {
    headlines: string[];
    descriptions: string[];
    keywords: any;
    final_url_paths: string[];
  };
  
  // Generation metadata
  campaignData: any | null;
  derivedContext: any | null;
  
  // Phase 5: Enhanced context metadata for dual chunking preview
  enhancedContext: {
    hasDualChunking: boolean;
    campaignFocus: string;
    atomicIngredients: {
      available: Array<{
        category: string;
        count: number;
        examples: string[];
      }>;
      totalCount: number;
    } | null;
    narrativeContext: {
      available: number;
      examples: string[];
    } | null;
    focusMapping: {
      atomic_categories: string[];
      narrative_types: string[];
      priority: string;
    } | null;
  } | null;
  
  // Workflow state
  generationCount: number;
  isGenerating: boolean;
  isSaving: boolean;
  isDirty: boolean;
}

interface RealEstateCampaignGeneratorProps {
  client: any;
}

// ===== PHASE 5: CONTEXT PREVIEW COMPONENTS =====

/**
 * Context Preview Component - Shows organized atomic ingredients and narrative context
 */
const ContextPreview = ({ enhancedContext }: { enhancedContext: CurationState['enhancedContext'] }) => {
  if (!enhancedContext) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-500 text-sm">No context preview available</p>
      </div>
    );
  }

  if (!enhancedContext.hasDualChunking) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-medium text-yellow-800 mb-2">🔄 Traditional Context Mode</h4>
        <p className="text-yellow-700 text-sm">
          Using enhanced prompt generation with traditional vector search context. 
          Campaign Focus: <span className="font-medium">{enhancedContext.campaignFocus}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <h4 className="font-medium text-blue-800 mb-4">🧩 Dual Chunking Context Preview</h4>
      
      {/* Campaign Focus */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-blue-700">🎯 Campaign Focus:</span>
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {enhancedContext.campaignFocus.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        {enhancedContext.focusMapping && (
          <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
            <strong>Priority:</strong> {enhancedContext.focusMapping.priority} | 
            <strong> Atomic Categories:</strong> {enhancedContext.focusMapping.atomic_categories.join(', ')} | 
            <strong> Narrative Types:</strong> {enhancedContext.focusMapping.narrative_types.join(', ')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atomic Ingredients */}
        <div>
          <h5 className="font-medium text-blue-700 mb-3">
            🔩 Atomic Ingredients ({enhancedContext.atomicIngredients?.totalCount || 0} total)
          </h5>
          {enhancedContext.atomicIngredients?.available.length ? (
            <div className="space-y-2">
              {enhancedContext.atomicIngredients.available.map((ingredient, index) => (
                <div key={index} className="bg-white border border-blue-200 rounded p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-blue-800 text-sm">
                      {ingredient.category.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">
                      {ingredient.count} items
                    </span>
                  </div>
                  {ingredient.examples.length > 0 && (
                    <div className="text-xs text-blue-600 space-y-1">
                      {ingredient.examples.map((example, exampleIndex) => (
                        <div key={exampleIndex} className="bg-blue-50 px-2 py-1 rounded">
                          "{example}"
                        </div>
                      ))}
                      {ingredient.count > 3 && (
                        <div className="text-blue-500 italic">
                          +{ingredient.count - 3} more ingredients...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-blue-600 text-sm bg-blue-100 p-2 rounded">
              No atomic ingredients available for this focus
            </p>
          )}
        </div>

        {/* Narrative Context */}
        <div>
          <h5 className="font-medium text-blue-700 mb-3">
            📖 Narrative Context ({enhancedContext.narrativeContext?.available || 0} chunks)
          </h5>
          {enhancedContext.narrativeContext?.available ? (
            <div className="space-y-2">
              {enhancedContext.narrativeContext.examples.map((chunk, index) => (
                <div key={index} className="bg-white border border-blue-200 rounded p-3">
                  <div className="text-xs text-blue-700 leading-relaxed">
                    "{chunk}"
                  </div>
                </div>
              ))}
              {enhancedContext.narrativeContext.available > 2 && (
                <div className="text-blue-500 text-sm italic bg-blue-100 p-2 rounded">
                  +{enhancedContext.narrativeContext.available - 2} more narrative chunks available for context...
                </div>
              )}
            </div>
          ) : (
            <p className="text-blue-600 text-sm bg-blue-100 p-2 rounded">
              No narrative context available for this focus
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-100 rounded text-xs text-blue-700">
        <strong>💡 How this works:</strong> Gemini combines atomic ingredients as precise building blocks 
        with narrative chunks for broader storytelling context, focused on {enhancedContext.campaignFocus.replace('_', ' ')} strategy.
      </div>
    </div>
  );
};

/**
 * Component Grid for showing organized atomic ingredients
 */
const ComponentGrid = ({ type, focus, enhancedContext }: { 
  type: 'atomic' | 'narrative'; 
  focus: string;
  enhancedContext: CurationState['enhancedContext'] 
}) => {
  if (!enhancedContext?.hasDualChunking) {
    return (
      <div className="text-sm text-gray-500 bg-gray-100 p-3 rounded">
        Dual chunking not available - using traditional context
      </div>
    );
  }

  if (type === 'atomic') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {enhancedContext.atomicIngredients?.available.map((ingredient, index) => (
          <div key={index} className="bg-white border rounded p-2">
            <div className="font-medium text-xs text-gray-700 mb-1">
              {ingredient.category.toUpperCase()}
            </div>
            <div className="text-xs text-gray-600">
              {ingredient.count} ingredients
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {enhancedContext.narrativeContext?.available || 0} narrative chunks available
      </div>
      <div className="text-xs text-gray-600">
        Provides broader context and storytelling material for campaign focus
      </div>
    </div>
  );
};

export function RealEstateCampaignGenerator({ client }: RealEstateCampaignGeneratorProps) {
    const supabase = createClient();
    
    // Form state
    const [campaignType, setCampaignType] = useState<keyof typeof RE_CAMPAIGN_TYPES>('re_general_location');
    const [adGroupType, setAdGroupType] = useState('location_general');
    const [campaignName, setCampaignName] = useState('');
    
    // Curation state
    const [curationState, setCurationState] = useState<CurationState>({
        currentBatch: null,
        editableBatch: null,
        finalCampaign: {
            headlines: [],
            descriptions: [],
            keywords: null,
            final_url_paths: []
        },
        campaignData: null,
        derivedContext: null,
        enhancedContext: null, // Phase 5: Add enhanced context state
        generationCount: 0,
        isGenerating: false,
        isSaving: false,
        isDirty: false
    });
    
    // Other state
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Update ad group options when campaign type changes
    useEffect(() => {
        const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
        if (campaignConfig.requiresAdGroupFocus && campaignConfig.adGroups) {
            const firstAdGroup = Object.keys(campaignConfig.adGroups)[0];
            setAdGroupType(firstAdGroup);
        } else {
            setAdGroupType('');
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
        
        const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
        if (campaignConfig.requiresAdGroupFocus && !adGroupType) {
            return "Ad group focus is required for this campaign type";
        }
        
        return null;
    };

    // Generate new batch of options
    const generateNewBatch = async () => {
        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setCurationState(prev => ({ ...prev, isGenerating: true }));
        setError(null);
        setSuccessMessage(null);
        
        try {
            const requestData: any = {
                clientId: client.id,
                campaignType,
                campaignName: campaignName.trim()
            };

            const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
            if (campaignConfig.requiresAdGroupFocus) {
                requestData.adGroupType = adGroupType;
            }

            console.log('[RE-CAMPAIGN-UI] Generating new batch:', requestData);

            const response = await fetch('/api/campaigns/real-estate/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Campaign generation failed');
            }

            // Update current batch and metadata
            setCurationState(prev => ({
                ...prev,
                currentBatch: result.generatedCopy,
                editableBatch: {
                    headlines: [...result.generatedCopy.headlines],
                    descriptions: [...result.generatedCopy.descriptions]
                },
                campaignData: result.campaignData,
                derivedContext: result.derivedContext,
                enhancedContext: result.enhancedContext, // Phase 5: Store enhanced context
                generationCount: prev.generationCount + 1,
                isGenerating: false
            }));

        } catch (error: any) {
            console.error('[RE-CAMPAIGN-UI] Generation error:', error);
            setError(error.message);
            setCurationState(prev => ({ ...prev, isGenerating: false }));
        }
    };

    // Update editable batch item
    const updateEditableBatchItem = (type: 'headline' | 'description', index: number, newValue: string) => {
        setCurationState(prev => {
            if (!prev.editableBatch) return prev;
            
            const newEditableBatch = { ...prev.editableBatch };
            
            if (type === 'headline') {
                newEditableBatch.headlines[index] = newValue;
            } else if (type === 'description') {
                newEditableBatch.descriptions[index] = newValue;
            }
            
            return {
                ...prev,
                editableBatch: newEditableBatch
            };
        });
    };

    // Add item to final campaign (uses edited version from editableBatch)
    const addToFinalCampaign = (type: 'headline' | 'description', index: number) => {
        setCurationState(prev => {
            if (!prev.editableBatch) return prev;
            
            const newFinalCampaign = { ...prev.finalCampaign };
            const item = type === 'headline' 
                ? prev.editableBatch.headlines[index] 
                : prev.editableBatch.descriptions[index];
            
            if (type === 'headline' && newFinalCampaign.headlines.length < 15) {
                // Check for duplicates
                if (!newFinalCampaign.headlines.includes(item)) {
                    newFinalCampaign.headlines.push(item);
                }
            } else if (type === 'description' && newFinalCampaign.descriptions.length < 4) {
                // Check for duplicates
                if (!newFinalCampaign.descriptions.includes(item)) {
                    newFinalCampaign.descriptions.push(item);
                }
            }
            
            // Update keywords and URL paths from latest batch
            if (prev.currentBatch) {
                newFinalCampaign.keywords = prev.currentBatch.keywords;
                newFinalCampaign.final_url_paths = prev.currentBatch.final_url_paths;
            }
            
            return {
                ...prev,
                finalCampaign: newFinalCampaign,
                isDirty: true
            };
        });
    };

    // Remove item from final campaign
    const removeFromFinalCampaign = (type: 'headline' | 'description', index: number) => {
        setCurationState(prev => {
            const newFinalCampaign = { ...prev.finalCampaign };
            
            if (type === 'headline') {
                newFinalCampaign.headlines.splice(index, 1);
            } else if (type === 'description') {
                newFinalCampaign.descriptions.splice(index, 1);
            }
            
            return {
                ...prev,
                finalCampaign: newFinalCampaign,
                isDirty: true
            };
        });
    };

    // Update final campaign item (for editing)
    const updateFinalCampaignItem = (type: 'headline' | 'description', index: number, newValue: string) => {
        setCurationState(prev => {
            const newFinalCampaign = { ...prev.finalCampaign };
            
            if (type === 'headline') {
                newFinalCampaign.headlines[index] = newValue;
            } else if (type === 'description') {
                newFinalCampaign.descriptions[index] = newValue;
            }
            
            return {
                ...prev,
                finalCampaign: newFinalCampaign,
                isDirty: true
            };
        });
    };

    // Add all available items from the current batch to the final campaign
    const addAllToFinalCampaign = (type: 'headline' | 'description') => {
        setCurationState(prev => {
            if (!prev.editableBatch) return prev;
            
            const newFinalCampaign = { ...prev.finalCampaign };
            const itemsToAdd = type === 'headline' 
                ? prev.editableBatch.headlines 
                : prev.editableBatch.descriptions;
            
            const existingItems = type === 'headline'
                ? newFinalCampaign.headlines
                : newFinalCampaign.descriptions;

            const capacity = type === 'headline' ? 15 : 4;

            for (const item of itemsToAdd) {
                if (existingItems.length >= capacity) break;
                if (!existingItems.includes(item)) {
                    existingItems.push(item);
                }
            }

            // Update keywords and URL paths from latest batch
            if (prev.currentBatch) {
                newFinalCampaign.keywords = prev.currentBatch.keywords;
                newFinalCampaign.final_url_paths = prev.currentBatch.final_url_paths;
            }
            
            return {
                ...prev,
                finalCampaign: newFinalCampaign,
                isDirty: true
            };
        });
    };

    // Remove all items of a certain type from the final campaign
    const removeAllFromFinalCampaign = (type: 'headline' | 'description') => {
        setCurationState(prev => {
            const newFinalCampaign = { ...prev.finalCampaign };
            
            if (type === 'headline') {
                newFinalCampaign.headlines = [];
            } else if (type === 'description') {
                newFinalCampaign.descriptions = [];
            }
            
            return {
                ...prev,
                finalCampaign: newFinalCampaign,
                isDirty: true
            };
        });
    };

    // Validate character limits for final campaign
    const validateCharacter = (text: string, type: 'headline' | 'description'): ValidationResult => {
        if (type === 'headline') {
            return {
                text,
                valid: text.length >= 20 && text.length <= 30,
                length: text.length,
                truncated: text.length > 30 ? text.substring(0, 30) : undefined
            };
        } else {
            return {
                text,
                valid: text.length >= 65 && text.length <= 90,
                length: text.length,
                truncated: text.length > 90 ? text.substring(0, 90) : undefined
            };
        }
    };

    // Fill remaining slots with AI
    const fillRemainingSlots = async () => {
        const headlinesNeeded = 15 - curationState.finalCampaign.headlines.length;
        const descriptionsNeeded = 4 - curationState.finalCampaign.descriptions.length;
        
        if (headlinesNeeded === 0 && descriptionsNeeded === 0) {
            setError("Campaign is already complete!");
            return;
        }
        
        // Generate a new batch and auto-add needed items
        await generateNewBatch();
        
        // Auto-add items to fill remaining slots (using edited versions)
        setCurationState(prev => {
            if (!prev.editableBatch) return prev;
            
            const newFinalCampaign = { ...prev.finalCampaign };
            
            // Add headlines to fill remaining slots
            let headlinesAdded = 0;
            for (const headline of prev.editableBatch.headlines) {
                if (headlinesAdded >= headlinesNeeded) break;
                if (!newFinalCampaign.headlines.includes(headline)) {
                    newFinalCampaign.headlines.push(headline);
                    headlinesAdded++;
                }
            }
            
            // Add descriptions to fill remaining slots
            let descriptionsAdded = 0;
            for (const description of prev.editableBatch.descriptions) {
                if (descriptionsAdded >= descriptionsNeeded) break;
                if (!newFinalCampaign.descriptions.includes(description)) {
                    newFinalCampaign.descriptions.push(description);
                    descriptionsAdded++;
                }
            }
            
            return {
                ...prev,
                finalCampaign: newFinalCampaign,
                isDirty: true
            };
        });
    };

    // Save final campaign
    const saveFinalCampaign = async () => {
        if (curationState.finalCampaign.headlines.length === 0 && curationState.finalCampaign.descriptions.length === 0) {
            setError("Cannot save empty campaign. Add at least one headline or description.");
            return;
        }

        setCurationState(prev => ({ ...prev, isSaving: true }));
        setError(null);
        
        try {
            // Calculate character validation for final campaign
            const headlinesValidation = curationState.finalCampaign.headlines.map(h => validateCharacter(h, 'headline'));
            const descriptionsValidation = curationState.finalCampaign.descriptions.map(d => validateCharacter(d, 'description'));
            
            const saveData = {
                campaignData: curationState.campaignData,
                finalCampaign: curationState.finalCampaign,
                characterValidation: {
                    headlines_valid: headlinesValidation,
                    descriptions_valid: descriptionsValidation
                }
            };

            const response = await fetch('/api/campaigns/real-estate/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Campaign save failed');
            }

            setSuccessMessage(`Campaign saved successfully! Campaign ID: ${result.campaignId}`);
            
            // Reset state after successful save
            setCurationState(prev => ({
                ...prev,
                isSaving: false,
                isDirty: false
            }));
            
            // Reload campaigns list
            loadCampaigns();

        } catch (error: any) {
            console.error('[RE-CAMPAIGN-UI] Save error:', error);
            setError(error.message);
            setCurationState(prev => ({ ...prev, isSaving: false }));
        }
    };

    // Export campaign as Google Ads CSV
    const exportToGoogleAdsCSV = () => {
        if (!curationState.finalCampaign.headlines.length && !curationState.finalCampaign.descriptions.length) {
            setError("Cannot export empty campaign. Please save a campaign first.");
            return;
        }

        try {
            const csvData = generateGoogleAdsCSV(
                curationState.campaignData,
                curationState.finalCampaign
            );
            
            // Create and download the CSV file
            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${curationState.campaignData?.campaignName || 'campaign'}_google_ads.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setSuccessMessage("Google Ads CSV exported successfully with keywords!");
        } catch (error: any) {
            console.error('[RE-CAMPAIGN-UI] Export error:', error);
            setError(`Export failed: ${error.message}`);
        }
    };

    const exportKeywordsOnly = () => {
        if (!curationState.finalCampaign.keywords) {
            setError("No keywords to export. Please generate a campaign first.");
            return;
        }

        try {
            const csvData = generateKeywordsCSV(
                curationState.campaignData,
                curationState.finalCampaign.keywords
            );
            
            // Create and download the CSV file
            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${curationState.campaignData?.campaignName || 'campaign'}_keywords.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setSuccessMessage("Keywords CSV exported successfully!");
        } catch (error: any) {
            console.error('[RE-CAMPAIGN-UI] Keywords export error:', error);
            setError(`Keywords export failed: ${error.message}`);
        }
    };

    // Generate Google Ads compatible CSV data
    const generateGoogleAdsCSV = (campaignData: any, finalCampaign: any): string => {
        if (!campaignData || !finalCampaign) {
            throw new Error("Missing campaign data for export");
        }

        // Map campaign type to readable ad group name with unit-specific naming
        const getAdGroupName = (campaignData: any): string => {
            const type = campaignData.campaignType;
            const adGroupType = campaignData.adGroupType;
            
            switch (type) {
                case 're_general_location':
                    return 'General Location';
                case 're_unit_type':
                    // More specific ad group names for unit types
                    switch (adGroupType) {
                        case 'studio': return 'Studio Apartments';
                        case '1br': return '1 Bedroom Apartments';
                        case '2br': return '2 Bedroom Apartments';
                        case '3br': return '3 Bedroom Apartments';
                        case '4br_plus': return '4+ Bedroom Apartments';
                        default: return 'Unit Type';
                    }
                case 're_proximity':
                    return 'Proximity Search';
                default:
                    return type.replace('re_', '').replace('_', ' ');
            }
        };

        const campaignName = campaignData.campaignName;
        const adGroupName = getAdGroupName(campaignData);
        
        // Pad headlines to 15 (Google Ads supports up to 15 headlines)
        const headlines = [...finalCampaign.headlines];
        while (headlines.length < 15) {
            headlines.push('');
        }
        headlines.splice(15); // Ensure max 15
        
        // Pad descriptions to 4 (Google Ads supports up to 4 descriptions)
        const descriptions = [...finalCampaign.descriptions];
        while (descriptions.length < 4) {
            descriptions.push('');
        }
        descriptions.splice(4); // Ensure max 4
        
        // Generate final URL (use first final_url_path or create a campaign-specific default)
        const generateFinalUrl = (campaignData: any, finalCampaign: any): string => {
            // If final_url_paths are provided, use the first one
            if (finalCampaign.final_url_paths && finalCampaign.final_url_paths.length > 0) {
                const path = finalCampaign.final_url_paths[0];
                return path.startsWith('http') ? path : `https://your-domain.com/${path}`;
            }
            
            // Generate campaign-specific URL based on type and location
            const location = campaignData.location;
            const city = location?.city?.toLowerCase().replace(/\s+/g, '-') || 'location';
            const state = location?.state?.toLowerCase() || '';
            
            switch (campaignData.campaignType) {
                case 're_unit_type':
                    const unitType = campaignData.adGroupType || 'apartments';
                    return `https://your-domain.com/${city}-${state}/${unitType}`;
                case 're_proximity':
                    return `https://your-domain.com/${city}-${state}/proximity`;
                case 're_general_location':
                default:
                    return `https://your-domain.com/${city}-${state}`;
            }
        };
        
        const finalUrl = generateFinalUrl(campaignData, finalCampaign);
        
        // Prepare keywords for CSV
        const keywords = finalCampaign.keywords || {};
        const exactMatch = (keywords.exact_match || []).join('; ');
        const phraseMatch = (keywords.phrase_match || []).join('; ');
        const broadMatch = (keywords.broad_match || []).join('; ');
        const negativeKeywords = (keywords.negative_keywords || []).join('; ');
        
        // Create CSV headers (including keywords)
        const headers = [
            'Campaign',
            'Ad group',
            ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
            ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
            'Final URL',
            'Exact Match Keywords',
            'Phrase Match Keywords', 
            'Broad Match Keywords',
            'Negative Keywords'
        ];
        
        // Create CSV row (including keywords)
        const row = [
            campaignName,
            adGroupName,
            ...headlines,
            ...descriptions,
            finalUrl,
            exactMatch,
            phraseMatch,
            broadMatch,
            negativeKeywords
        ];
        
        // Escape and quote CSV values
        const escapeCsvValue = (value: string): string => {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };
        
        // Build CSV content
        const csvContent = [
            headers.join(','),
            row.map(escapeCsvValue).join(',')
        ].join('\n');
        
        return csvContent;
    };

    // Generate keywords-only CSV with Campaign, Ad Group, and Keyword columns
    const generateKeywordsCSV = (campaignData: any, keywords: any): string => {
        if (!keywords) {
            throw new Error("No keywords data provided");
        }

        const campaignName = campaignData?.campaignName || 'Campaign';
        const rows: string[] = [];
        
        // CSV header with just three columns
        rows.push('Campaign,Ad Group,Keyword');
        
        // Helper to get ad group name
        const getAdGroupName = (campaignData: any): string => {
            const type = campaignData?.campaignType;
            const adGroupType = campaignData?.adGroupType;
            
            switch (type) {
                case 're_general_location':
                    return 'General Location';
                case 're_unit_type':
                    switch (adGroupType) {
                        case 'studio': return 'Studio Apartments';
                        case '1br': return '1 Bedroom Apartments';
                        case '2br': return '2 Bedroom Apartments';
                        case '3br': return '3 Bedroom Apartments';
                        case '4br_plus': return '4+ Bedroom Apartments';
                        default: return 'Unit Type';
                    }
                case 're_proximity':
                    return 'Proximity Search';
                default:
                    return 'Default Ad Group';
            }
        };

        const adGroupName = getAdGroupName(campaignData);
        
        // Escape CSV values
        const escapeCsvValue = (value: string): string => {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };
        
        // Add broad match keywords
        if (keywords.broad_match && Array.isArray(keywords.broad_match)) {
            keywords.broad_match.forEach((keyword: string) => {
                if (keyword.trim()) {
                    rows.push(`${escapeCsvValue(campaignName)},${escapeCsvValue(adGroupName)},${escapeCsvValue(keyword)}`);
                }
            });
        }
        
        // Add negative keywords (with minus prefix to distinguish them)
        if (keywords.negative_keywords && Array.isArray(keywords.negative_keywords)) {
            keywords.negative_keywords.forEach((keyword: string) => {
                if (keyword.trim()) {
                    rows.push(`${escapeCsvValue(campaignName)},${escapeCsvValue(adGroupName)},-${escapeCsvValue(keyword)}`);
                }
            });
        }
        
        return rows.join('\n');
    };

    // Clear all state
    const clearAll = () => {
        setCampaignName('');
        setCurationState({
            currentBatch: null,
            editableBatch: null,
            finalCampaign: {
                headlines: [],
                descriptions: [],
                keywords: null,
                final_url_paths: []
            },
            campaignData: null,
            derivedContext: null,
            enhancedContext: null, // Phase 5: Clear enhanced context
            generationCount: 0,
            isGenerating: false,
            isSaving: false,
            isDirty: false
        });
        setError(null);
        setSuccessMessage(null);
    };

    const currentCampaignConfig = RE_CAMPAIGN_TYPES[campaignType];
    const currentAdGroups = currentCampaignConfig.requiresAdGroupFocus && 'adGroups' in currentCampaignConfig 
        ? currentCampaignConfig.adGroups 
        : null;

    return (
        <div className="w-full max-w-7xl mx-auto mt-8">
            <h2 className="text-3xl font-bold mb-2">{client.name} - Campaign Curation Workflow</h2>
            <p className="text-gray-500 mb-2">Client ID: {client.id}</p>
            <p className="text-sm text-blue-600 mb-8">Generate options → Curate favorites → Edit & save final campaign</p>
            
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800">{error}</p>
                </div>
            )}

            {successMessage && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800">{successMessage}</p>
                </div>
            )}

            <div className="flex flex-col space-y-12">
                {/* Section 1: Campaign Configuration */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">1. Campaign Configuration</h3>
                    
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

                        {/* Generation Controls */}
                        <div className="border-t pt-4">
                            <div className="flex gap-2">
                                <button 
                                    onClick={generateNewBatch} 
                                    disabled={curationState.isGenerating}
                                    className="flex-1 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300 font-medium"
                                >
                                    {curationState.isGenerating ? 'Generating...' : 
                                     curationState.generationCount === 0 ? 'Generate Options' : 'Generate More Options'}
                                </button>
                                <button 
                                    onClick={clearAll}
                                    className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                                >
                                    Clear
                                </button>
                            </div>
                            {curationState.generationCount > 0 && (
                                <p className="text-sm text-gray-600 mt-2">Batch {curationState.generationCount} generated</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 2: Generated Options */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">2. Generated Options</h3>
                    
                    {/* Phase 5: Enhanced Context Preview */}
                    {curationState.enhancedContext && (
                        <div className="mb-4">
                            <ContextPreview enhancedContext={curationState.enhancedContext} />
                        </div>
                    )}
                    
                    {/* Show derived context if available */}
                    {curationState.derivedContext && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                            <h5 className="font-medium text-blue-800 mb-2">Auto-Extracted:</h5>
                            <div className="text-sm text-blue-700 space-y-1">
                                <div><strong>Location:</strong> {curationState.derivedContext.location?.city}, {curationState.derivedContext.location?.state}</div>
                                {curationState.derivedContext.priceRange && (
                                    <div><strong>Price:</strong> {curationState.derivedContext.priceRange}</div>
                                )}
                                {curationState.derivedContext.targetDemographic && (
                                    <div><strong>Target:</strong> {curationState.derivedContext.targetDemographic}</div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {curationState.currentBatch && curationState.editableBatch ? (
                        <div className="bg-white border rounded-lg p-6 shadow space-y-6">
                            {/* Generated Headlines */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-green-800">Headlines (edit then click to add)</h4>
                                    <button
                                        onClick={() => addAllToFinalCampaign('headline')}
                                        className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-300"
                                        disabled={!curationState.currentBatch || curationState.finalCampaign.headlines.length >= 15}
                                    >
                                        Add All
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {(curationState.editableBatch?.headlines || []).map((headline, index) => {
                                        const validation = curationState.currentBatch!.character_validation.headlines_valid[index];
                                        const currentValidation = validateCharacter(headline, 'headline');
                                        const isAlreadyAdded = curationState.finalCampaign.headlines.includes(headline);
                                        const canAdd = curationState.finalCampaign.headlines.length < 15 && !isAlreadyAdded;
                                        
                                        return (
                                            <div key={index} className={`p-2 rounded text-sm border ${currentValidation.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                                <div className="flex justify-between items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={headline}
                                                        onChange={(e) => updateEditableBatchItem('headline', index, e.target.value)}
                                                        className={`flex-1 bg-transparent border-none focus:outline-none ${currentValidation.valid ? 'text-green-800' : 'text-red-800'}`}
                                                        maxLength={35}
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs ${currentValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
                                                            {currentValidation.length}/30
                                                        </span>
                                                        {isAlreadyAdded ? (
                                                            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-200 rounded">Added</span>
                                                        ) : (
                                                            <button
                                                                onClick={() => addToFinalCampaign('headline', index)}
                                                                disabled={!canAdd}
                                                                className={`text-xs px-2 py-1 rounded ${canAdd ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-300 text-gray-500'}`}
                                                            >
                                                                {canAdd ? 'Add' : 'Full'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Generated Descriptions */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-green-800">Descriptions (edit then click to add)</h4>
                                    <button
                                        onClick={() => addAllToFinalCampaign('description')}
                                        className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-300"
                                        disabled={!curationState.currentBatch || curationState.finalCampaign.descriptions.length >= 4}
                                    >
                                        Add All
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {(curationState.editableBatch?.descriptions || []).map((description, index) => {
                                        const validation = curationState.currentBatch!.character_validation.descriptions_valid[index];
                                        const currentValidation = validateCharacter(description, 'description');
                                        const isAlreadyAdded = curationState.finalCampaign.descriptions.includes(description);
                                        const canAdd = curationState.finalCampaign.descriptions.length < 4 && !isAlreadyAdded;
                                        
                                        return (
                                            <div key={index} className={`p-2 rounded text-sm border ${currentValidation.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                                <div className="flex justify-between items-start gap-2">
                                                    <textarea
                                                        value={description}
                                                        onChange={(e) => updateEditableBatchItem('description', index, e.target.value)}
                                                        className={`flex-1 bg-transparent border-none focus:outline-none resize-none ${currentValidation.valid ? 'text-green-800' : 'text-red-800'}`}
                                                        rows={2}
                                                        maxLength={95}
                                                    />
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={`text-xs ${currentValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
                                                            {currentValidation.length}/90
                                                        </span>
                                                        {isAlreadyAdded ? (
                                                            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-200 rounded">Added</span>
                                                        ) : (
                                                            <button
                                                                onClick={() => addToFinalCampaign('description', index)}
                                                                disabled={!canAdd}
                                                                className={`text-xs px-2 py-1 rounded ${canAdd ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-300 text-gray-500'}`}
                                                            >
                                                                {canAdd ? 'Add' : 'Full'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 border rounded-lg p-6 text-center">
                            <p className="text-gray-500">No options generated yet. Click "Generate Options" to start the curation process.</p>
                        </div>
                    )}
                </div>

                {/* Section 3: Final Campaign */}
                <div>
                    <h3 className="text-2xl font-semibold mb-4">
                        3. Final Campaign ({curationState.finalCampaign.headlines.length}/15 headlines, {curationState.finalCampaign.descriptions.length}/4 descriptions)
                    </h3>
                    
                    <div className="bg-white border rounded-lg p-6 shadow space-y-6">
                        {/* Final Headlines */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-bold text-purple-800">Headlines</h4>
                                <button
                                    onClick={() => removeAllFromFinalCampaign('headline')}
                                    className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
                                    disabled={curationState.finalCampaign.headlines.length === 0}
                                >
                                    Remove All
                                </button>
                            </div>
                            {curationState.finalCampaign.headlines.length === 0 ? (
                                <p className="text-gray-500 text-sm">No headlines added yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {curationState.finalCampaign.headlines.map((headline, index) => {
                                        const validation = validateCharacter(headline, 'headline');
                                        return (
                                            <div key={index} className={`p-2 rounded text-sm border ${validation.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={headline}
                                                        onChange={(e) => updateFinalCampaignItem('headline', index, e.target.value)}
                                                        className="flex-1 bg-transparent border-none focus:outline-none text-sm"
                                                        maxLength={35}
                                                    />
                                                    <span className={`text-xs ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
                                                        {validation.length}/30
                                                    </span>
                                                    <button
                                                        onClick={() => removeFromFinalCampaign('headline', index)}
                                                        className="text-xs text-red-600 hover:text-red-800"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Final Descriptions */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-bold text-purple-800">Descriptions</h4>
                                <button
                                    onClick={() => removeAllFromFinalCampaign('description')}
                                    className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
                                    disabled={curationState.finalCampaign.descriptions.length === 0}
                                >
                                    Remove All
                                </button>
                            </div>
                            {curationState.finalCampaign.descriptions.length === 0 ? (
                                <p className="text-gray-500 text-sm">No descriptions added yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {curationState.finalCampaign.descriptions.map((description, index) => {
                                        const validation = validateCharacter(description, 'description');
                                        return (
                                            <div key={index} className={`p-2 rounded text-sm border ${validation.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                                <div className="flex items-start gap-2">
                                                    <textarea
                                                        value={description}
                                                        onChange={(e) => updateFinalCampaignItem('description', index, e.target.value)}
                                                        className="flex-1 bg-transparent border-none focus:outline-none text-sm resize-none"
                                                        rows={2}
                                                        maxLength={95}
                                                    />
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={`text-xs ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
                                                            {validation.length}/90
                                                        </span>
                                                        <button
                                                            onClick={() => removeFromFinalCampaign('description', index)}
                                                            className="text-xs text-red-600 hover:text-red-800"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="border-t pt-4 space-y-2">
                            {(curationState.finalCampaign.headlines.length < 15 || curationState.finalCampaign.descriptions.length < 4) && (
                                <button
                                    onClick={fillRemainingSlots}
                                    disabled={curationState.isGenerating}
                                    className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-sm"
                                >
                                    Fill Remaining Slots ({15 - curationState.finalCampaign.headlines.length} headlines, {4 - curationState.finalCampaign.descriptions.length} descriptions needed)
                                </button>
                            )}
                            
                            <button
                                onClick={saveFinalCampaign}
                                disabled={curationState.isSaving || (curationState.finalCampaign.headlines.length === 0 && curationState.finalCampaign.descriptions.length === 0)}
                                className="w-full py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300 font-medium"
                            >
                                {curationState.isSaving ? 'Saving Campaign...' : 'Save Campaign'}
                            </button>
                            
                            {/* Export to Google Ads CSV Button */}
                            {(curationState.finalCampaign.headlines.length > 0 || curationState.finalCampaign.descriptions.length > 0) && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <button
                                            onClick={exportToGoogleAdsCSV}
                                            disabled={curationState.isSaving}
                                            className="py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 font-medium text-sm"
                                        >
                                            📊 Export Full CSV
                                        </button>
                                        <button
                                            onClick={exportKeywordsOnly}
                                            disabled={curationState.isSaving || !curationState.finalCampaign.keywords}
                                            className="py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 font-medium text-sm"
                                        >
                                            🔑 Export Keywords
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                                        <p className="font-medium mb-1">📋 Full CSV Export includes:</p>
                                        <ul className="space-y-1 text-xs">
                                            <li>• Campaign: {curationState.campaignData?.campaignName || 'Your campaign'}</li>
                                            <li>• Ad Group: {curationState.campaignData ? (
                                                curationState.campaignData.campaignType === 're_unit_type' && curationState.campaignData.adGroupType
                                                    ? `${curationState.campaignData.adGroupType.replace('_', ' ')} apartments`.replace(/^\w/, (c: string) => c.toUpperCase())
                                                    : curationState.campaignData.campaignType.replace('re_', '').replace('_', ' ').replace(/^\w/, (c: string) => c.toUpperCase())
                                            ) : 'Campaign type'}</li>
                                            <li>• {curationState.finalCampaign.headlines.length} Headlines (max 15)</li>
                                            <li>• {curationState.finalCampaign.descriptions.length} Descriptions (max 4)</li>
                                            <li>• Auto-generated Final URL</li>
                                            <li>• <strong>All Keywords:</strong> Exact ({(curationState.finalCampaign.keywords?.exact_match || []).length}), Phrase ({(curationState.finalCampaign.keywords?.phrase_match || []).length}), Broad ({(curationState.finalCampaign.keywords?.broad_match || []).length}), Negative ({(curationState.finalCampaign.keywords?.negative_keywords || []).length})</li>
                                        </ul>
                                        <p className="mt-2 text-xs text-blue-700">
                                            💡 <strong>Note:</strong> Update "your-domain.com" in Final URL column before uploading to Google Ads
                                        </p>
                                    </div>
                                    <div className="text-xs text-gray-600 bg-green-50 p-2 rounded">
                                        <p className="font-medium mb-1">🔑 Keywords CSV includes:</p>
                                        <ul className="space-y-1 text-xs">
                                            <li>• All {((curationState.finalCampaign.keywords?.broad_match || []).length + (curationState.finalCampaign.keywords?.negative_keywords || []).length)} keywords generated by Gemini</li>
                                            <li>• Properly formatted for Google Ads bulk keyword import</li>
                                            <li>• Includes match types: broad, -negative</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Keywords & URL Paths (Read-only) */}
                        {curationState.finalCampaign.keywords && (
                            <div className="border-t pt-4">
                                <h5 className="font-medium text-gray-700 mb-2">Keywords (Auto-included)</h5>
                                <div className="flex flex-wrap gap-1">
                                    {curationState.finalCampaign.keywords.broad_match?.slice(0, 5).map((keyword: string, index: number) => (
                                        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                            {keyword}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Campaign History */}
                    <div className="mt-8">
                        <h3 className="text-xl font-semibold mb-4">Recent Campaigns</h3>
                        <div className="bg-white border rounded-lg p-4 shadow">
                            {campaigns.length === 0 ? (
                                <p className="text-gray-500 text-sm">No campaigns saved yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {campaigns.slice(0, 5).map((campaign) => (
                                        <div key={campaign.id} className="p-2 bg-gray-50 rounded text-sm">
                                            <div className="font-medium">{campaign.product_name}</div>
                                            <div className="text-xs text-gray-500">
                                                {new Date(campaign.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 