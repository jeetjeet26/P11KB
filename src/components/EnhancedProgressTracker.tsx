/**
 * Phase 5: User Experience Enhancements - Enhanced Progress Tracking
 * Implements advanced progress visualization with intelligent time estimation
 * as specified in timeout.md Phase 5.1 and 5.5
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { CampaignGenerationJob, ProgressStep } from '@/types/async-jobs';

interface EnhancedProgressTrackerProps {
  job: CampaignGenerationJob | null;
  onCancel?: () => void;
  showDetailedBreakdown?: boolean;
  showPerformanceMetrics?: boolean;
}

interface ProgressStepInfo {
  key: ProgressStep;
  label: string;
  description: string;
  icon: string;
  estimatedDuration: number; // in milliseconds
  minPercent: number;
  maxPercent: number;
  color: string;
}

interface TimeEstimation {
  remaining: string;
  total: string;
  confidence: 'low' | 'medium' | 'high';
  accuracy: number; // percentage
}

interface PerformanceMetrics {
  throughputRate: number; // steps per minute
  efficiency: number; // percentage
  predictedCompletion: Date;
  variance: number; // time variance from average
}

// Enhanced step configurations with realistic timing data
const PROGRESS_STEPS: ProgressStepInfo[] = [
  {
    key: 'vector_search',
    label: 'Vector Search',
    description: 'Searching knowledge base for relevant content...',
    icon: '🔍',
    estimatedDuration: 25000, // 25 seconds
    minPercent: 0,
    maxPercent: 25,
    color: 'blue'
  },
  {
    key: 'context_building',
    label: 'Context Building',
    description: 'Analyzing and organizing campaign context...',
    icon: '🧩',
    estimatedDuration: 35000, // 35 seconds
    minPercent: 25,
    maxPercent: 50,
    color: 'indigo'
  },
  {
    key: 'generation',
    label: 'Content Generation',
    description: 'Generating copy with Gemini AI...',
    icon: '✨',
    estimatedDuration: 45000, // 45 seconds
    minPercent: 50,
    maxPercent: 85,
    color: 'purple'
  },
  {
    key: 'validation',
    label: 'Validation & Correction',
    description: 'Validating and applying corrections...',
    icon: '✅',
    estimatedDuration: 15000, // 15 seconds
    minPercent: 85,
    maxPercent: 100,
    color: 'green'
  }
];

export function EnhancedProgressTracker({ 
  job, 
  onCancel, 
  showDetailedBreakdown = true,
  showPerformanceMetrics = false
}: EnhancedProgressTrackerProps) {
  const [startTime] = useState(Date.now());
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [stepHistory, setStepHistory] = useState<Array<{ step: ProgressStep; timestamp: number; percent: number }>>([]);

  // Update current time every second for real-time calculations
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Track step changes and build history
  useEffect(() => {
    if (job?.progress_step && job.progress_percent !== undefined) {
      setStepHistory(prev => {
        const lastEntry = prev[prev.length - 1];
        const currentStep = job.progress_step as ProgressStep;
        
        // Only add if step changed or significant progress made
        if (!lastEntry || 
            lastEntry.step !== currentStep || 
            Math.abs(lastEntry.percent - job.progress_percent!) >= 5) {
          return [...prev, {
            step: currentStep,
            timestamp: Date.now(),
            percent: job.progress_percent!
          }];
        }
        
        return prev;
      });
    }
  }, [job?.progress_step, job?.progress_percent]);

  // Calculate intelligent time estimation
  const timeEstimation = useMemo((): TimeEstimation => {
    if (!job || job.status !== 'processing') {
      return {
        remaining: 'N/A',
        total: 'N/A',
        confidence: 'low',
        accuracy: 0
      };
    }

    const currentPercent = job.progress_percent || 0;
    const currentStep = job.progress_step as ProgressStep;
    const currentStepInfo = PROGRESS_STEPS.find(step => step.key === currentStep);
    
    if (!currentStepInfo) {
      return {
        remaining: '2-3 min',
        total: '3-4 min',
        confidence: 'low',
        accuracy: 50
      };
    }

    // Method 1: Based on step progression (most accurate for early stages)
    const stepBasedEstimation = (): number => {
      const remainingSteps = PROGRESS_STEPS.slice(
        PROGRESS_STEPS.findIndex(s => s.key === currentStep)
      );
      
      const currentStepProgress = (currentPercent - currentStepInfo.minPercent) / 
                                  (currentStepInfo.maxPercent - currentStepInfo.minPercent);
      
      const remainingInCurrentStep = (1 - currentStepProgress) * currentStepInfo.estimatedDuration;
      const remainingFromFutureSteps = remainingSteps.slice(1)
                                        .reduce((sum, step) => sum + step.estimatedDuration, 0);
      
      return remainingInCurrentStep + remainingFromFutureSteps;
    };

    // Method 2: Based on actual elapsed time and progress (more accurate for later stages)
    const progressBasedEstimation = (): number => {
      const elapsed = currentTime - startTime;
      if (currentPercent === 0) return 120000; // fallback to 2 minutes
      
      const totalEstimated = (elapsed / currentPercent) * 100;
      return totalEstimated - elapsed;
    };

    // Method 3: Based on step history and velocity
    const velocityBasedEstimation = (): number => {
      if (stepHistory.length < 2) return stepBasedEstimation();
      
      const recentHistory = stepHistory.slice(-3); // Last 3 data points
      const timeDeltas = recentHistory.slice(1).map((entry, i) => 
        entry.timestamp - recentHistory[i].timestamp
      );
      const progressDeltas = recentHistory.slice(1).map((entry, i) => 
        entry.percent - recentHistory[i].percent
      );
      
      if (progressDeltas.length === 0 || progressDeltas.some(delta => delta <= 0)) {
        return stepBasedEstimation();
      }
      
      const avgVelocity = progressDeltas.reduce((sum, delta, i) => 
        sum + delta / timeDeltas[i], 0
      ) / progressDeltas.length; // percent per ms
      
      const remainingPercent = 100 - currentPercent;
      return remainingPercent / avgVelocity;
    };

    // Combine methods with weighted average based on confidence
    const elapsed = currentTime - startTime;
    const stepBased = stepBasedEstimation();
    const progressBased = progressBasedEstimation();
    const velocityBased = velocityBasedEstimation();

    let finalEstimation: number;
    let confidence: 'low' | 'medium' | 'high';
    let accuracy: number;

    if (elapsed < 30000) {
      // Early stage: rely more on step-based estimation
      finalEstimation = stepBased * 0.7 + progressBased * 0.3;
      confidence = 'low';
      accuracy = 40;
    } else if (elapsed < 60000) {
      // Mid stage: balanced approach with velocity consideration
      finalEstimation = stepBased * 0.4 + progressBased * 0.4 + velocityBased * 0.2;
      confidence = 'medium';
      accuracy = 70;
    } else {
      // Later stage: rely more on actual progress and velocity
      finalEstimation = progressBased * 0.3 + velocityBased * 0.7;
      confidence = 'high';
      accuracy = 85;
    }

    // Format time strings
    const formatTime = (ms: number): string => {
      const seconds = Math.max(0, Math.round(ms / 1000));
      if (seconds < 60) return `${seconds}s`;
      
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    };

    const totalEstimated = elapsed + finalEstimation;

    return {
      remaining: formatTime(finalEstimation),
      total: formatTime(totalEstimated),
      confidence,
      accuracy
    };
  }, [job, currentTime, startTime, stepHistory]);

  // Calculate performance metrics
  const performanceMetrics = useMemo((): PerformanceMetrics | null => {
    if (!showPerformanceMetrics || !job || stepHistory.length < 2) {
      return null;
    }

    const elapsed = currentTime - startTime;
    const currentPercent = job.progress_percent || 0;
    
    // Calculate throughput rate (percent per minute)
    const throughputRate = (currentPercent / elapsed) * 60000;
    
    // Calculate efficiency compared to estimated duration
    const totalEstimatedDuration = PROGRESS_STEPS.reduce((sum, step) => sum + step.estimatedDuration, 0);
    const expectedPercentByNow = Math.min(100, (elapsed / totalEstimatedDuration) * 100);
    const efficiency = Math.min(100, (currentPercent / expectedPercentByNow) * 100);
    
    // Predict completion time
    const remainingMs = parseInt(timeEstimation.remaining.replace(/[^\d]/g, '')) * 
                       (timeEstimation.remaining.includes('m') ? 60000 : 1000);
    const predictedCompletion = new Date(currentTime + remainingMs);
    
    // Calculate variance from average
    const averageDuration = 120000; // 2 minutes average
    const currentProjection = elapsed + remainingMs;
    const variance = ((currentProjection - averageDuration) / averageDuration) * 100;

    return {
      throughputRate,
      efficiency: Math.max(0, efficiency),
      predictedCompletion,
      variance
    };
  }, [job, stepHistory, currentTime, startTime, timeEstimation, showPerformanceMetrics]);

  if (!job || job.status !== 'processing') {
    return null;
  }

  const currentPercent = job.progress_percent || 0;
  const currentStep = job.progress_step as ProgressStep;
  const currentStepInfo = PROGRESS_STEPS.find(step => step.key === currentStep);

  return (
    <div className="bg-white rounded-lg p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Campaign Generation</h3>
          <p className="text-sm text-gray-600">{job.campaign_name}</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Cancel generation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            {currentStepInfo?.icon} {currentStepInfo?.label || 'Processing'}
          </span>
          <span className="text-sm font-medium text-gray-900">{currentPercent}%</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div 
            className={`h-3 rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-purple-600`}
            style={{ width: `${currentPercent}%` }}
          ></div>
        </div>
        
        <p className="text-sm text-gray-600">
          {currentStepInfo?.description || 'Processing your request...'}
        </p>
      </div>

      {/* Time Estimation */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-lg font-semibold text-blue-900">{timeEstimation.remaining}</div>
          <div className="text-sm text-blue-700">Time Remaining</div>
          <div className="text-xs text-blue-600">
            {timeEstimation.confidence} confidence ({timeEstimation.accuracy}% accuracy)
          </div>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-lg font-semibold text-purple-900">{timeEstimation.total}</div>
          <div className="text-sm text-purple-700">Total Duration</div>
          <div className="text-xs text-purple-600">
            Started {Math.round((currentTime - startTime) / 1000)}s ago
          </div>
        </div>
      </div>

      {/* Step Breakdown */}
      {showDetailedBreakdown && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Step Progress</h4>
          <div className="space-y-3">
            {PROGRESS_STEPS.map((step, index) => {
              const isCurrentStep = step.key === currentStep;
              const isCompleted = currentPercent > step.maxPercent;
              const isPending = currentPercent < step.minPercent;
              
              let stepProgress = 0;
              if (isCompleted) {
                stepProgress = 100;
              } else if (isCurrentStep) {
                stepProgress = Math.min(100, 
                  ((currentPercent - step.minPercent) / (step.maxPercent - step.minPercent)) * 100
                );
              }

              return (
                <div key={step.key} className="flex items-center space-x-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                    isCompleted ? 'bg-green-500 border-green-500 text-white' :
                    isCurrentStep ? 'bg-purple-500 border-purple-500 text-white' :
                    'border-gray-300 text-gray-400'
                  }`}>
                    {isCompleted ? '✓' : isPending ? index + 1 : '⋯'}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-medium ${
                        isCurrentStep ? 'text-purple-700' :
                        isCompleted ? 'text-green-700' :
                        'text-gray-500'
                      }`}>
                        {step.icon} {step.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {isCompleted ? '100%' : isCurrentStep ? `${Math.round(stepProgress)}%` : '0%'}
                      </span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          isCompleted ? 'bg-green-500' :
                          isCurrentStep ? 'bg-purple-500' :
                          'bg-gray-300'
                        }`}
                        style={{ width: `${Math.max(0, stepProgress)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {performanceMetrics && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Performance Metrics</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Throughput:</span>
              <span className="ml-2 font-medium">{performanceMetrics.throughputRate.toFixed(1)}%/min</span>
            </div>
            <div>
              <span className="text-gray-600">Efficiency:</span>
              <span className="ml-2 font-medium">{performanceMetrics.efficiency.toFixed(0)}%</span>
            </div>
            <div>
              <span className="text-gray-600">ETA:</span>
              <span className="ml-2 font-medium">
                {performanceMetrics.predictedCompletion.toLocaleTimeString()}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Variance:</span>
              <span className={`ml-2 font-medium ${
                performanceMetrics.variance > 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                {performanceMetrics.variance > 0 ? '+' : ''}{performanceMetrics.variance.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* "You can close this tab" message */}
      {(currentTime - startTime) > 30000 && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <p className="text-blue-800 font-medium">You can close this tab</p>
              <p className="text-blue-600">
                Your campaign is being generated in the background. 
                You'll receive the results when you return.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
