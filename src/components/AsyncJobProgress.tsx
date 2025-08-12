/**
 * Phase 4: Frontend Integration - Progress UI Components
 * Implements progress visualization as specified in timeout.md Phase 5.1
 */

"use client";

import { useState, useEffect } from 'react';
import type { JobProgress, GenerationState, CampaignGenerationJob } from '@/types/async-jobs';

interface AsyncJobProgressProps {
  generationState: GenerationState;
  progress: JobProgress | null;
  job: CampaignGenerationJob | null;
  error: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function AsyncJobProgress({ 
  generationState, 
  progress, 
  job, 
  error, 
  onCancel, 
  onRetry 
}: AsyncJobProgressProps) {
  const [showCloseMessage, setShowCloseMessage] = useState(false);

  // Show "You can close this tab" message after 30 seconds of processing
  useEffect(() => {
    if (generationState === 'processing') {
      const timer = setTimeout(() => {
        setShowCloseMessage(true);
      }, 30000); // 30 seconds

      return () => clearTimeout(timer);
    } else {
      setShowCloseMessage(false);
    }
  }, [generationState]);

  // Don't render anything if idle
  if (generationState === 'idle') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {generationState === 'submitting' && 'Creating Campaign Job...'}
            {generationState === 'processing' && 'Generating Campaign...'}
            {generationState === 'completed' && 'Campaign Ready!'}
            {generationState === 'failed' && 'Generation Failed'}
          </h3>
          
          {/* Cancel button - only show during processing */}
          {(generationState === 'submitting' || generationState === 'processing') && onCancel && (
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Cancel job"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress Content */}
        {generationState === 'submitting' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
              <span className="text-gray-700">Submitting your request...</span>
            </div>
          </div>
        )}

        {generationState === 'processing' && progress && (
          <div className="space-y-4">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{progress.step}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
            </div>

            {/* Current Step Description */}
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
              <span className="text-gray-700">{progress.message}</span>
            </div>

            {/* Estimated Time Remaining */}
            {progress.estimatedTimeRemaining && (
              <div className="text-sm text-gray-500">
                Estimated time remaining: {progress.estimatedTimeRemaining}
              </div>
            )}

            {/* Job Details */}
            {job && (
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                <div><strong>Campaign:</strong> {job.campaign_name}</div>
                <div><strong>Type:</strong> {job.campaign_type?.replace('re_', '').replace('_', ' ')}</div>
                {job.ad_group_type && (
                  <div><strong>Focus:</strong> {job.ad_group_type.replace('_', ' ')}</div>
                )}
                <div><strong>Job ID:</strong> {job.id}</div>
              </div>
            )}

            {/* "You can close this tab" message */}
            {showCloseMessage && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">
                    <p className="text-blue-800 font-medium">You can close this tab</p>
                    <p className="text-blue-600">Your campaign is being generated in the background. You'll receive the results when you return.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {generationState === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-lg font-medium">Campaign generated successfully!</span>
            </div>
            
            {job && (
              <div className="text-sm text-gray-600 bg-green-50 p-3 rounded">
                <div><strong>Campaign:</strong> {job.campaign_name}</div>
                {job.total_duration_ms && (
                  <div><strong>Generation time:</strong> {Math.round(job.total_duration_ms / 1000)} seconds</div>
                )}
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              View Results
            </button>
          </div>
        )}

        {generationState === 'failed' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-lg font-medium">Generation failed</span>
            </div>
            
            {error && (
              <div className="text-sm text-red-700 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <div className="flex space-x-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Step-by-step breakdown */}
        {(generationState === 'processing' || generationState === 'completed') && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Process Steps</h4>
            <div className="space-y-2">
              {[
                { key: 'vector_search', label: 'Vector Search', range: '0-25%' },
                { key: 'context_building', label: 'Context Building', range: '25-50%' },
                { key: 'generation', label: 'Content Generation', range: '50-85%' },
                { key: 'validation', label: 'Validation', range: '85-100%' }
              ].map((step, index) => {
                const isCurrentStep = progress?.step.toLowerCase().includes(step.key.replace('_', ' '));
                const isCompleted = progress && progress.percent > (index + 1) * 25;
                const isPending = !isCurrentStep && !isCompleted;

                return (
                  <div key={step.key} className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isCompleted ? 'bg-green-500 border-green-500' :
                      isCurrentStep ? 'bg-purple-500 border-purple-500' :
                      'border-gray-300'
                    }`}>
                      {isCompleted && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isCurrentStep && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                    <span className={`text-sm ${
                      isCurrentStep ? 'text-purple-700 font-medium' :
                      isCompleted ? 'text-green-700' :
                      'text-gray-500'
                    }`}>
                      {step.label} <span className="text-xs">({step.range})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Job History Component for Phase 5.2
interface JobHistoryProps {
  jobs: CampaignGenerationJob[];
  onRetryJob?: (job: CampaignGenerationJob) => void;
}

export function JobHistory({ jobs, onRetryJob }: JobHistoryProps) {
  if (jobs.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-500 text-sm">No recent generation jobs.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium text-gray-900 mb-3">Recent Generation Jobs</h4>
      <div className="space-y-3">
        {jobs.slice(0, 10).map((job) => (
          <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{job.campaign_name}</div>
              <div className="text-xs text-gray-500">
                {job.campaign_type?.replace('re_', '').replace('_', ' ')} • {' '}
                {new Date(job.created_at).toLocaleDateString()} {new Date(job.created_at).toLocaleTimeString()}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-1 text-xs rounded-full ${
                job.status === 'completed' ? 'bg-green-100 text-green-800' :
                job.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                job.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {job.status}
              </span>
              {job.status === 'failed' && onRetryJob && (
                <button
                  onClick={() => onRetryJob(job)}
                  className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
