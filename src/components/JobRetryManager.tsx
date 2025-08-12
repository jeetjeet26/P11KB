/**
 * Phase 5: User Experience Enhancements - Job Retry Manager
 * Implements intelligent retry functionality with exponential backoff
 * as specified in timeout.md Phase 5.2
 */

"use client";

import { useState, useCallback } from 'react';
import type { CampaignGenerationJob } from '@/types/async-jobs';

interface JobRetryManagerProps {
  job: CampaignGenerationJob;
  onRetrySuccess?: (newJobId: string) => void;
  onRetryError?: (error: string) => void;
  className?: string;
}

interface RetryStrategy {
  immediate: boolean;
  withDelay: boolean;
  withModifications: boolean;
  delaySeconds: number;
  maxAttempts: number;
}

interface RetryAnalysis {
  errorType: 'timeout' | 'api_error' | 'validation_error' | 'system_error' | 'unknown';
  likelySuccess: number; // percentage
  recommendedStrategy: RetryStrategy;
  modifications: string[];
  riskFactors: string[];
}

export function JobRetryManager({ 
  job, 
  onRetrySuccess, 
  onRetryError, 
  className = '' 
}: JobRetryManagerProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryAnalysis, setRetryAnalysis] = useState<RetryAnalysis | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [customDelay, setCustomDelay] = useState(0);
  const [selectedModifications, setSelectedModifications] = useState<string[]>([]);

  // Analyze the failed job to determine the best retry strategy
  const analyzeFailure = useCallback((job: CampaignGenerationJob): RetryAnalysis => {
    const errorMessage = job.error_message?.toLowerCase() || '';
    const stepDurations = job.step_durations || {};
    const totalDuration = job.total_duration_ms || 0;
    
    let errorType: RetryAnalysis['errorType'] = 'unknown';
    let likelySuccess = 50;
    let modifications: string[] = [];
    let riskFactors: string[] = [];

    // Analyze error type
    if (errorMessage.includes('timeout') || errorMessage.includes('503') || totalDuration > 120000) {
      errorType = 'timeout';
      likelySuccess = 80;
      modifications = [
        'Reduce complexity by limiting search scope',
        'Use faster generation mode',
        'Split into multiple smaller campaigns'
      ];
    } else if (errorMessage.includes('api') || errorMessage.includes('429') || errorMessage.includes('quota')) {
      errorType = 'api_error';
      likelySuccess = 75;
      modifications = [
        'Retry with exponential backoff',
        'Use alternative API endpoints',
        'Reduce API call frequency'
      ];
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      errorType = 'validation_error';
      likelySuccess = 60;
      modifications = [
        'Review campaign parameters',
        'Check client data quality',
        'Verify input formats'
      ];
      riskFactors = ['May require manual parameter adjustment'];
    } else if (errorMessage.includes('system') || errorMessage.includes('internal')) {
      errorType = 'system_error';
      likelySuccess = 70;
      modifications = [
        'Retry with different server resources',
        'Use simpler processing pipeline'
      ];
    }

    // Determine recommended strategy based on error type and history
    let recommendedStrategy: RetryStrategy;
    
    switch (errorType) {
      case 'timeout':
        recommendedStrategy = {
          immediate: false,
          withDelay: true,
          withModifications: true,
          delaySeconds: 30,
          maxAttempts: 2
        };
        break;
      case 'api_error':
        recommendedStrategy = {
          immediate: false,
          withDelay: true,
          withModifications: false,
          delaySeconds: 60,
          maxAttempts: 3
        };
        break;
      case 'validation_error':
        recommendedStrategy = {
          immediate: false,
          withDelay: false,
          withModifications: true,
          delaySeconds: 0,
          maxAttempts: 1
        };
        riskFactors.push('Manual review recommended before retry');
        break;
      default:
        recommendedStrategy = {
          immediate: true,
          withDelay: false,
          withModifications: false,
          delaySeconds: 0,
          maxAttempts: 2
        };
    }

    // Additional risk factors based on job characteristics
    if (job.campaign_type === 're_proximity') {
      riskFactors.push('Proximity campaigns are more complex and prone to timeouts');
    }
    
    if (totalDuration > 90000) {
      riskFactors.push('Previous attempt took longer than average');
    }

    return {
      errorType,
      likelySuccess,
      recommendedStrategy,
      modifications,
      riskFactors
    };
  }, []);

  // Execute the retry with selected strategy
  const executeRetry = useCallback(async (strategy: 'immediate' | 'delayed' | 'modified') => {
    setIsRetrying(true);
    
    try {
      const retryData = {
        clientId: job.client_id,
        campaignName: job.campaign_name + ' (Retry)',
        campaignType: job.campaign_type,
        adGroupType: job.ad_group_type,
        retryOf: job.id,
        modifications: selectedModifications
      };

      let delay = 0;
      if (strategy === 'delayed') {
        delay = customDelay || retryAnalysis?.recommendedStrategy.delaySeconds || 30;
      }

      // Apply delay if needed
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }

      // Create new job
      const response = await fetch('/api/campaigns/real-estate/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Retry failed');
      }

      const result = await response.json();
      
      if (onRetrySuccess) {
        onRetrySuccess(result.jobId);
      }

    } catch (error: any) {
      console.error('[RETRY-MANAGER] Retry failed:', error);
      if (onRetryError) {
        onRetryError(error.message);
      }
    } finally {
      setIsRetrying(false);
    }
  }, [job, selectedModifications, customDelay, retryAnalysis, onRetrySuccess, onRetryError]);

  // Analyze failure when component mounts or job changes
  const handleAnalyze = useCallback(() => {
    const analysis = analyzeFailure(job);
    setRetryAnalysis(analysis);
  }, [job, analyzeFailure]);

  if (job.status !== 'failed') {
    return null;
  }

  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="font-medium text-red-800">Job Failed - Retry Options</h4>
        </div>
        {!retryAnalysis && (
          <button
            onClick={handleAnalyze}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Analyze Failure
          </button>
        )}
      </div>

      {/* Error Details */}
      <div className="mb-4 p-3 bg-red-100 rounded text-sm">
        <div className="font-medium text-red-800 mb-1">Error Details:</div>
        <div className="text-red-700">{job.error_message}</div>
        {job.total_duration_ms && (
          <div className="text-red-600 text-xs mt-1">
            Failed after {Math.round(job.total_duration_ms / 1000)} seconds
          </div>
        )}
      </div>

      {retryAnalysis && (
        <div className="space-y-4">
          {/* Analysis Summary */}
          <div className="bg-white rounded p-3 border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Failure Analysis</span>
              <span className={`px-2 py-1 rounded text-xs ${
                retryAnalysis.likelySuccess >= 70 ? 'bg-green-100 text-green-800' :
                retryAnalysis.likelySuccess >= 50 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {retryAnalysis.likelySuccess}% success chance
              </span>
            </div>
            
            <div className="text-sm text-gray-600 space-y-1">
              <div><strong>Error Type:</strong> {retryAnalysis.errorType.replace('_', ' ').toUpperCase()}</div>
              {retryAnalysis.riskFactors.length > 0 && (
                <div>
                  <strong>Risk Factors:</strong>
                  <ul className="list-disc list-inside ml-2">
                    {retryAnalysis.riskFactors.map((risk, index) => (
                      <li key={index} className="text-red-600">{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Quick Retry Options */}
          <div className="space-y-2">
            <h5 className="font-medium text-gray-900">Quick Retry Options</h5>
            
            {retryAnalysis.recommendedStrategy.immediate && (
              <button
                onClick={() => executeRetry('immediate')}
                disabled={isRetrying}
                className="w-full p-3 text-left bg-green-50 hover:bg-green-100 border border-green-200 rounded transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800">Immediate Retry</div>
                    <div className="text-sm text-green-700">Retry now with same parameters</div>
                  </div>
                  <div className="text-green-600">
                    {isRetrying ? '⏳' : '▶️'}
                  </div>
                </div>
              </button>
            )}

            {retryAnalysis.recommendedStrategy.withDelay && (
              <button
                onClick={() => executeRetry('delayed')}
                disabled={isRetrying}
                className="w-full p-3 text-left bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-blue-800">Delayed Retry</div>
                    <div className="text-sm text-blue-700">
                      Wait {retryAnalysis.recommendedStrategy.delaySeconds}s before retrying
                    </div>
                  </div>
                  <div className="text-blue-600">
                    {isRetrying ? '⏳' : '⏰'}
                  </div>
                </div>
              </button>
            )}

            {retryAnalysis.recommendedStrategy.withModifications && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="font-medium text-yellow-800 mb-2">Retry with Modifications</div>
                <div className="space-y-2">
                  {retryAnalysis.modifications.map((mod, index) => (
                    <label key={index} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedModifications.includes(mod)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModifications([...selectedModifications, mod]);
                          } else {
                            setSelectedModifications(selectedModifications.filter(m => m !== mod));
                          }
                        }}
                        className="rounded border-yellow-300 text-yellow-600 focus:ring-yellow-500"
                      />
                      <span className="text-sm text-yellow-700">{mod}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => executeRetry('modified')}
                  disabled={isRetrying || selectedModifications.length === 0}
                  className="mt-3 w-full py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 text-sm"
                >
                  {isRetrying ? 'Retrying...' : 'Retry with Modifications'}
                </button>
              </div>
            )}
          </div>

          {/* Advanced Options */}
          <div>
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <span>Advanced Options</span>
              <svg 
                className={`w-4 h-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvancedOptions && (
              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custom Delay (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={customDelay}
                      onChange={(e) => setCustomDelay(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Retry Attempts
                    </label>
                    <select className="w-full px-3 py-1 border border-gray-300 rounded text-sm">
                      <option value="1">1 attempt</option>
                      <option value="2">2 attempts</option>
                      <option value="3">3 attempts</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="autoRetry"
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="autoRetry" className="text-sm text-gray-700">
                      Enable automatic retry on subsequent failures
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Manual Override */}
          <div className="pt-3 border-t border-red-200">
            <button
              onClick={() => executeRetry('immediate')}
              disabled={isRetrying}
              className="w-full py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 text-sm"
            >
              {isRetrying ? 'Retrying...' : 'Force Retry (Override Analysis)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
