"use client";

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAsyncJob } from '@/hooks/useAsyncJob';
import { AsyncJobProgress, JobHistory } from '@/components/AsyncJobProgress';
import { EnhancedJobHistory } from '@/components/EnhancedJobHistory';
import { EnhancedProgressTracker } from '@/components/EnhancedProgressTracker';
import { JobRetryManager } from '@/components/JobRetryManager';
import { 
  useNotificationSystem, 
  useCampaignNotifications, 
  InAppNotificationContainer 
} from '@/components/NotificationSystem';
import type { CampaignGenerationJob } from '@/types/async-jobs';

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
  
  // Optional composition diagnostics (non-blocking)
  diagnostics?: {
    campaignType: string;
    communityMentionsInHeadlines?: number;
    communityMentionTarget?: string;
    ctaHeadlines: number;
    ctaDescriptions: number;
    ctaTargets: { headlinesMin: number; headlinesMax: number; descriptionsMin: number };
    abbreviationBalance: {
      spelledHeadlines: number;
      spelledDescriptions: number;
      abbreviatedHeadlines: number;
      abbreviatedDescriptions: number;
      spelledTargets: { headlinesMin: number; descriptionsMin: number };
    };
    unitTypeMentions?: {
      headlinesWithUnitType: number;
      totalHeadlines: number;
      mostHeadlinesThreshold: number;
    };
    amenitySignalsFound: string[];
    fhRiskFlags: string[];
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

  // System now requires dual chunking - no traditional mode fallback
  if (!enhancedContext.hasDualChunking) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h4 className="font-medium text-red-800 mb-2">❌ Dual Chunking Required</h4>
        <p className="text-red-700 text-sm mb-2">
          The system requires dual chunking data to generate ad copy. No chunks with 
          <code className="bg-red-100 px-1 py-0.5 rounded mx-1">chunk_type='llm_dual'</code> 
          were found for this client.
        </p>
        <p className="text-red-600 text-xs">
          <strong>Action Required:</strong> Please crawl the client's website to generate atomic 
          and narrative chunks before attempting ad copy generation.
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
      <div className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
        ⚠️ Dual chunking data required. Please crawl website to generate chunks.
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
    
    // Async job management
    const asyncJob = useAsyncJob(client.id);
    
    // Form state
    const [campaignType, setCampaignType] = useState<keyof typeof RE_CAMPAIGN_TYPES>('re_general_location');
    const [adGroupType, setAdGroupType] = useState('location_general');
    const [campaignName, setCampaignName] = useState('');
    
    // Job history state
    const [jobHistory, setJobHistory] = useState<CampaignGenerationJob[]>([]);
    
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
    
    // Phase 5: Enhanced UX state
    const [isPageVisible, setIsPageVisible] = useState(true);
    const [showAdvancedProgress, setShowAdvancedProgress] = useState(false);
    const [selectedFailedJob, setSelectedFailedJob] = useState<CampaignGenerationJob | null>(null);
    
    // Phase 5: Notification system
    const notificationSystem = useNotificationSystem();
    useCampaignNotifications({
        generationState: asyncJob.generationState,
        job: asyncJob.job,
        isPageVisible
    });

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

    // Load job history
    const loadJobHistory = async () => {
        const { data } = await supabase
            .from('campaign_generation_jobs')
            .select('*')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (data) setJobHistory(data as CampaignGenerationJob[]);
    };

    useEffect(() => {
        loadCampaigns();
        loadJobHistory();
    }, [client.id]);

    // Handle async job completion
    useEffect(() => {
        if (asyncJob.generationState === 'completed' && asyncJob.job?.generated_copy) {
            console.log('[RE-CAMPAIGN-UI] Async job completed, updating UI with results');
            
            const result = asyncJob.job.generated_copy;
            
            // Update curation state with async job results
            setCurationState(prev => ({
                ...prev,
                currentBatch: result,
                editableBatch: {
                    headlines: [...(result.headlines || [])],
                    descriptions: [...(result.descriptions || [])]
                },
                campaignData: asyncJob.job?.derived_context?.campaignData || prev.campaignData,
                derivedContext: asyncJob.job?.derived_context || prev.derivedContext,
                enhancedContext: result.enhancedContext || prev.enhancedContext,
                diagnostics: result.diagnostics || prev.diagnostics,
                generationCount: prev.generationCount + 1,
                isGenerating: false
            }));

            // Refresh job history to show the completed job
            loadJobHistory();
            
            setSuccessMessage('Campaign generated successfully using async processing!');
        }
    }, [asyncJob.generationState, asyncJob.job]);

    // Phase 5: Enhanced job management
    useEffect(() => {
        const handleVisibilityChange = () => {
            setIsPageVisible(!document.hidden);
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Handle job cancellation
    const handleCancelJob = useCallback(async (jobId: string) => {
        try {
            const response = await fetch(`/api/campaigns/jobs/${jobId}/cancel`, {
                method: 'POST'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to cancel job');
            }

            notificationSystem.notify(
                'Job Cancelled',
                'The campaign generation job has been cancelled successfully.',
                'info'
            );

            // Refresh job history
            loadJobHistory();
            
        } catch (error: any) {
            console.error('[CAMPAIGN-GENERATOR] Cancel job error:', error);
            notificationSystem.notify(
                'Cancellation Failed',
                error.message,
                'error'
            );
        }
    }, [notificationSystem]);

    // Handle retry for failed async jobs
    const handleRetryJob = async (job: CampaignGenerationJob) => {
        const requestData = {
            campaignName: job.campaign_name + ' (Retry)',
            campaignType: job.campaign_type,
            adGroupType: job.ad_group_type
        };
        
        // Retry using the same method (async since it was attempted async before)
        await asyncJob.createJob(requestData);
        
        notificationSystem.notify(
            'Retry Started',
            `Retrying campaign "${job.campaign_name}" with a new job.`,
            'info'
        );
    };

    // Handle viewing results from completed job
    const handleViewJobResults = useCallback((job: CampaignGenerationJob) => {
        if (job.generated_copy) {
            // Load the results into the current state
            setCurationState(prev => ({
                ...prev,
                currentBatch: job.generated_copy,
                editableBatch: {
                    headlines: [...(job.generated_copy.headlines || [])],
                    descriptions: [...(job.generated_copy.descriptions || [])]
                },
                campaignData: job.derived_context?.campaignData || prev.campaignData,
                derivedContext: job.derived_context || prev.derivedContext,
                enhancedContext: job.generated_copy.enhancedContext || prev.enhancedContext,
                diagnostics: job.generated_copy.diagnostics || prev.diagnostics,
                generationCount: prev.generationCount + 1,
                isGenerating: false
            }));

            // Update form fields
            setCampaignName(job.campaign_name);
            setCampaignType(job.campaign_type as keyof typeof RE_CAMPAIGN_TYPES);
            if (job.ad_group_type) {
                setAdGroupType(job.ad_group_type);
            }

            notificationSystem.notify(
                'Results Loaded',
                `Results from "${job.campaign_name}" have been loaded into the editor.`,
                'success'
            );
        }
    }, [notificationSystem]);

    // Validate form
    const validateForm = (): string | null => {
        if (!campaignName.trim()) return "Campaign name is required";
        
        const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
        if (campaignConfig.requiresAdGroupFocus && !adGroupType) {
            return "Ad group focus is required for this campaign type";
        }
        
        return null;
    };

    // Determine if we should use async generation (hybrid approach)
    const shouldUseAsyncGeneration = (campaignType: string, adGroupType: string): boolean => {
        // Check if async generation is disabled via environment variable
        const asyncDisabled = process.env.NEXT_PUBLIC_DISABLE_ASYNC_GENERATION === 'true';
        if (asyncDisabled) {
            console.log('[RE-CAMPAIGN-UI] Async generation disabled by environment variable');
            return false;
        }
        
        // ALWAYS use async generation to showcase the UI improvements
        console.log('[RE-CAMPAIGN-UI] Using async generation to show UI improvements');
        return true;
    };

    // Generate new batch of options (with hybrid sync/async approach)
    const generateNewBatch = async () => {
        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        const requestData: any = {
            clientId: client.id,
            campaignType,
            campaignName: campaignName.trim()
        };

        const campaignConfig = RE_CAMPAIGN_TYPES[campaignType];
        if (campaignConfig.requiresAdGroupFocus) {
            requestData.adGroupType = adGroupType;
        }

        // Hybrid approach: decide between sync and async generation
        const useAsync = shouldUseAsyncGeneration(campaignType, adGroupType);
        
        if (useAsync) {
            console.log('[RE-CAMPAIGN-UI] ⚡ ASYNC MODE: Creating async job to show UI improvements');
            console.log('[RE-CAMPAIGN-UI] Request data:', requestData);
            // Use async job system
            await asyncJob.createJob(requestData);
            console.log('[RE-CAMPAIGN-UI] ✅ Async job created, UI progress tracking should now be visible');
            // Job progress will be handled by the AsyncJobProgress component
        } else {
            console.log('[RE-CAMPAIGN-UI] Using synchronous generation for simple campaign');
            // Use existing synchronous generation
            await generateSynchronous(requestData);
        }
    };

    // Synchronous generation (existing logic)
    const generateSynchronous = async (requestData: any) => {
        setCurationState(prev => ({ ...prev, isGenerating: true }));
        setError(null);
        setSuccessMessage(null);
        
        try {
            console.log('[RE-CAMPAIGN-UI] Generating new batch (sync):', requestData);

            const response = await fetch('/api/campaigns/real-estate/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData),
            });

            // Robust parse: prefer JSON, gracefully handle unexpected content types
            const contentType = response.headers.get('content-type') || '';
            let result: any = null;
            if (contentType.includes('application/json')) {
                result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Campaign generation failed');
                }
            } else {
                const text = await response.text();
                throw new Error(text || 'Service temporarily unavailable. Please try again.');
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
                diagnostics: result.diagnostics || null,
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

    // Export as Excel with two sheets: Ads and Keywords
    const exportToGoogleAdsXLSX = async () => {
        if (!curationState.finalCampaign) {
            setError("Nothing to export. Generate a campaign first.");
            return;
        }

        try {
            let XLSX: any;
            try {
                const mod: any = await import('xlsx');
                XLSX = mod?.default ?? mod;
            } catch (primaryImportError) {
                const fallbackMod: any = await import('xlsx/dist/xlsx.full.min.js');
                XLSX = fallbackMod?.default ?? fallbackMod;
            }

            const campaignName = curationState.campaignData?.campaignName || 'campaign';

            // Sheet 1: Ads (headlines/descriptions with Final URL)
            const adsHeaders = [
                'Campaign',
                'Ad group',
                'Ad type',
                ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
                ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
                'Final URL',
                'Path 1',
                'Path 2'
            ];

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

            const generateFinalUrl = (campaignData: any, finalCampaign: any): string => {
                if (finalCampaign.final_url_paths && finalCampaign.final_url_paths.length > 0) {
                    const path = finalCampaign.final_url_paths[0];
                    return path.startsWith('http') ? path : `https://your-domain.com/${path}`;
                }
                const location = campaignData?.location;
                const city = location?.city?.toLowerCase().replace(/\s+/g, '-') || 'location';
                const state = location?.state?.toLowerCase() || '';
                switch (campaignData?.campaignType) {
                    case 're_unit_type':
                        const unitType = campaignData?.adGroupType || 'apartments';
                        return `https://your-domain.com/${city}-${state}/${unitType}`;
                    case 're_proximity':
                        return `https://your-domain.com/${city}-${state}/proximity`;
                    case 're_general_location':
                    default:
                        return `https://your-domain.com/${city}-${state}`;
                }
            };

            const derivePath1Path2 = (campaignData: any, finalCampaign: any): { path1: string; path2: string } => {
                // Prefer explicitly provided paths
                if (finalCampaign.final_url_paths && finalCampaign.final_url_paths.length > 0) {
                    const raw = String(finalCampaign.final_url_paths[0] || '').replace(/^https?:\/\//, '');
                    const parts = raw.split('/').filter(Boolean);
                    return { path1: parts[0] || '', path2: parts[1] || '' };
                }
                // Derive from campaign data basics
                const location = campaignData?.location;
                const city = (location?.city || '').split(' ')[0]?.toLowerCase();
                const adGroupType = (campaignData?.adGroupType || '').toString().toLowerCase();
                return { path1: city || '', path2: adGroupType || '' };
            };

            const headlines = [...(curationState.finalCampaign.headlines || [])];
            while (headlines.length < 15) headlines.push('');
            headlines.splice(15);
            const descriptions = [...(curationState.finalCampaign.descriptions || [])];
            while (descriptions.length < 4) descriptions.push('');
            descriptions.splice(4);

            const { path1, path2 } = derivePath1Path2(curationState.campaignData, curationState.finalCampaign);
            const adsRow = [
                campaignName,
                getAdGroupName(curationState.campaignData),
                'Responsive search ad',
                ...headlines,
                ...descriptions,
                generateFinalUrl(curationState.campaignData, curationState.finalCampaign),
                path1,
                path2
            ];

            const adsAoA = [adsHeaders, adsRow];
            const adsWs = (XLSX.utils && typeof XLSX.utils.aoa_to_sheet === 'function')
                ? XLSX.utils.aoa_to_sheet(adsAoA)
                : XLSX.utils.json_to_sheet([
                    Object.fromEntries(adsHeaders.map((h: string, i: number) => [h, adsRow[i] ?? '']))
                ]);

            // Create workbook with just the Ads sheet
            const wb = (XLSX.utils && typeof XLSX.utils.book_new === 'function') ? XLSX.utils.book_new() : { SheetNames: [], Sheets: {} };
            if (XLSX.utils && typeof XLSX.utils.book_append_sheet === 'function') {
                XLSX.utils.book_append_sheet(wb, adsWs, 'Ads');
            } else {
                // manual workbook composition if utils APIs are not present
                wb.SheetNames.push('Ads');
                wb.Sheets['Ads'] = adsWs;
            }

            // Download workbook (with robust fallback)
            const safeName = `${campaignName}_google_ads.xlsx`;
            if (typeof XLSX.writeFile === 'function') {
                try {
                    XLSX.writeFile(wb, safeName);
                } catch (werr: any) {
                    // Fallback to manual Blob download
                    const wbout: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = safeName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }
            } else {
                const wbout: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = safeName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }

            setSuccessMessage("Google Ads XLSX exported successfully!");
        } catch (e: any) {
            console.error('[RE-CAMPAIGN-UI] XLSX export error:', e);
            setError(`XLSX export failed: ${e.message || e}`);
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
        const broadMatch = (keywords.broad_match || []).join('; ');
        const negativeKeywords = (keywords.negative_keywords || []).join('; ');
        
        // Create CSV headers (including keywords)
        const headers = [
            'Campaign',
            'Ad group',
            ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
            ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
            'Final URL',
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


    // Clear all state
    const clearAll = () => {
        setCampaignName('');
        setCurationState({
            currentBatch: null,
            editableBatch: null,
            finalCampaign: {
                headlines: [],
                descriptions: [],
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
            {/* Phase 5: In-app notification container */}
            <InAppNotificationContainer />
            
            <h2 className="text-3xl font-bold mb-2">{client.name} - Campaign Curation Workflow</h2>
            <p className="text-gray-500 mb-2">Client ID: {client.id}</p>
            <p className="text-sm text-blue-600 mb-8">Generate options → Curate favorites → Edit & save final campaign</p>

            {/* Phase 5: Enhanced Progress Tracker */}
            {(asyncJob.generationState === 'processing' || asyncJob.generationState === 'submitting') && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Generation Progress</h3>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setShowAdvancedProgress(!showAdvancedProgress)}
                                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                            >
                                {showAdvancedProgress ? 'Simple View' : 'Advanced View'}
                            </button>
                            <button
                                onClick={() => notificationSystem.toggleSound()}
                                className={`px-3 py-1 text-sm rounded ${
                                    notificationSystem.state.soundEnabled 
                                        ? 'bg-purple-100 text-purple-700' 
                                        : 'bg-gray-100 text-gray-600'
                                }`}
                                title={`Sound notifications ${notificationSystem.state.soundEnabled ? 'enabled' : 'disabled'}`}
                            >
                                {notificationSystem.state.soundEnabled ? '🔊' : '🔇'}
                            </button>
                        </div>
                    </div>
                    
                    {showAdvancedProgress ? (
                        <EnhancedProgressTracker
                            job={asyncJob.job}
                            onCancel={asyncJob.cancelJob}
                            showDetailedBreakdown={true}
                            showPerformanceMetrics={true}
                        />
                    ) : (
                        <AsyncJobProgress
                            generationState={asyncJob.generationState}
                            progress={asyncJob.progress}
                            job={asyncJob.job}
                            error={asyncJob.error}
                            onCancel={asyncJob.cancelJob}
                            onRetry={asyncJob.retryJob}
                        />
                    )}
                </div>
            )}

            {/* Phase 5: Job Retry Manager for failed jobs */}
            {selectedFailedJob && (
                <div className="mb-6" data-retry-manager>
                    <JobRetryManager
                        job={selectedFailedJob}
                        onRetrySuccess={(newJobId) => {
                            setSelectedFailedJob(null);
                            loadJobHistory();
                            notificationSystem.notify(
                                'Retry Job Created',
                                `New job ${newJobId} started for retry`,
                                'success'
                            );
                        }}
                        onRetryError={(error) => {
                            notificationSystem.notify(
                                'Retry Failed',
                                error,
                                'error'
                            );
                        }}
                    />
                    <button
                        onClick={() => setSelectedFailedJob(null)}
                        className="mt-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                    >
                        Dismiss Retry Options
                    </button>
                </div>
            )}
            
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
                            {/* Generation method indicator */}
                            {campaignName.trim() && (
                                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded text-sm">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                                        <span className="text-purple-700 font-semibold">
                                            <strong>🚀 Async Generation Mode:</strong> Enhanced UI with progress tracking, notifications, and job history
                                        </span>
                                    </div>
                                    <div className="mt-2 text-xs text-purple-600">
                                        ✨ You'll see: Real-time progress • Browser notifications • Sound alerts • Job history • Retry options
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button 
                                    onClick={generateNewBatch} 
                                    disabled={curationState.isGenerating || asyncJob.generationState === 'submitting' || asyncJob.generationState === 'processing'}
                                    className="flex-1 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300 font-medium"
                                >
                                    {curationState.isGenerating ? 'Generating...' : 
                                     asyncJob.generationState === 'submitting' ? 'Creating Job...' :
                                     asyncJob.generationState === 'processing' ? 'Processing Async...' :
                                     curationState.generationCount === 0 ? 'Generate Options' : 'Generate More Options'}
                                </button>
                                <button 
                                    onClick={clearAll}
                                    className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                                    disabled={asyncJob.generationState === 'processing'}
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
                        {/* Composition Diagnostics (non-blocking) */}
                        {curationState.diagnostics && (
                          <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h5 className="font-medium text-gray-800 mb-2">Composition Diagnostics</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                              <div>
                                <div><strong>CTA Headlines:</strong> {curationState.diagnostics.ctaHeadlines} (target {curationState.diagnostics.ctaTargets.headlinesMin}–{curationState.diagnostics.ctaTargets.headlinesMax})</div>
                                <div><strong>CTA Descriptions:</strong> {curationState.diagnostics.ctaDescriptions} (target ≥ {curationState.diagnostics.ctaTargets.descriptionsMin})</div>
                              </div>
                              <div>
                                <div><strong>Spelled Terms (H/D):</strong> {curationState.diagnostics.abbreviationBalance.spelledHeadlines}/{curationState.diagnostics.abbreviationBalance.spelledDescriptions} (targets ≥{curationState.diagnostics.abbreviationBalance.spelledTargets.headlinesMin} / ≥{curationState.diagnostics.abbreviationBalance.spelledTargets.descriptionsMin})</div>
                                <div><strong>Abbreviations (H/D):</strong> {curationState.diagnostics.abbreviationBalance.abbreviatedHeadlines}/{curationState.diagnostics.abbreviationBalance.abbreviatedDescriptions}</div>
                              </div>
                              {typeof curationState.diagnostics.communityMentionsInHeadlines === 'number' && (
                                <div>
                                  <div><strong>Community Mentions (H):</strong> {curationState.diagnostics.communityMentionsInHeadlines} {curationState.diagnostics.communityMentionTarget ? `(${curationState.diagnostics.communityMentionTarget})` : ''}</div>
                                </div>
                              )}
                              {curationState.diagnostics.unitTypeMentions && (
                                <div>
                                  <div><strong>Unit Type Mentions (H):</strong> {curationState.diagnostics.unitTypeMentions.headlinesWithUnitType}/{curationState.diagnostics.unitTypeMentions.totalHeadlines} (most should include)</div>
                                </div>
                              )}
                              <div className="md:col-span-2">
                                <div><strong>Amenity Signals Found:</strong> {curationState.diagnostics.amenitySignalsFound.length > 0 ? curationState.diagnostics.amenitySignalsFound.join(', ') : 'None detected'}</div>
                                {curationState.diagnostics.fhRiskFlags.length > 0 && (
                                  <div className="text-red-700"><strong>FH Risk Flags:</strong> {curationState.diagnostics.fhRiskFlags.join(', ')}</div>
                                )}
                              </div>
                            </div>
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
                                            📊 Export CSV
                                        </button>
                                        <button
                                            onClick={exportToGoogleAdsXLSX}
                                            disabled={curationState.isSaving}
                                            className="py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 font-medium text-sm"
                                        >
                                            📑 Export XLSX
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                                        <p className="font-medium mb-1">📋 Export includes:</p>
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
                                        </ul>
                                        <p className="mt-2 text-xs text-blue-700">
                                            💡 <strong>Note:</strong> Update "your-domain.com" in Final URL column before uploading to Google Ads
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

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

                    {/* Phase 5: Enhanced Job History */}
                    <div className="mt-8">
                        <EnhancedJobHistory
                            clientId={client.id}
                            onRetryJob={(job) => {
                                setSelectedFailedJob(job);
                                // Scroll to the retry manager
                                setTimeout(() => {
                                    const retryElement = document.querySelector('[data-retry-manager]');
                                    if (retryElement) {
                                        retryElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                }, 100);
                            }}
                            onViewResults={handleViewJobResults}
                            onCancelJob={handleCancelJob}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
} 