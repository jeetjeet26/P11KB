"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ClientIntakeFormProps {
  clientId: string;
  clientName: string;
  onComplete: () => void;
  onCancel: () => void;
  editMode?: boolean;
}

export function ClientIntakeForm({ clientId, clientName, onComplete, onCancel, editMode = false }: ClientIntakeFormProps) {
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(editMode);
  const [formData, setFormData] = useState({
    // Basic Information - removed communityName since it's the same as clientName
    communityType: 'Multifamily Apartments', // Default to their business type
    propertyType: 'apartment' as 'home' | 'apartment', // Property type for targeting
    
    // Location Details
    communityAddress: '',
    
    // Business Details
    pricePoint: '',
    propertyUrl: '',
    
    // Competitive Analysis
    competitors: '',
    uniqueFeatures: '',
    
    // Local Market
    popularActivities: '',
    areaEmployers: '',
    
    // Target Audience
    targetAudience: '',
    outOfMarketTargets: '',
    
    // Brand and Marketing
    brandVoiceGuidelines: '',
    currentCampaigns: '',
    
    // Additional Context
    schoolDistrictNotes: '',
    referralPatterns: '',
    specialPrograms: ''
  });

  // Load existing intake data if in edit mode
  useEffect(() => {
    if (editMode) {
      loadExistingIntake();
    }
  }, [editMode, clientId]);

  const loadExistingIntake = async () => {
    try {
      const { data, error } = await supabase
        .from('client_intake')
        .select('*')
        .eq('client_id', clientId)
        .eq('intake_completed', true)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          communityType: data.community_type || 'Multifamily Apartments', // Default to their business type
          propertyType: data.property_type || 'apartment',
          communityAddress: data.community_address || '',
          pricePoint: data.price_point || '',
          propertyUrl: data.property_url || '',
          competitors: data.competitors ? data.competitors.join(', ') : '',
          uniqueFeatures: data.unique_features || '',
          popularActivities: data.popular_activities || '',
          areaEmployers: data.area_employers ? data.area_employers.join(', ') : '',
          targetAudience: data.target_audience || '',
          outOfMarketTargets: data.out_of_market_targets || '',
          brandVoiceGuidelines: data.brand_voice_guidelines || '',
          currentCampaigns: data.current_campaigns || '',
          schoolDistrictNotes: data.school_district_notes || '',
          referralPatterns: data.referral_patterns || '',
          specialPrograms: data.special_programs || ''
        });
      }
    } catch (error) {
      console.error('Error loading existing intake data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert comma-separated strings to arrays for database storage
      const competitorsArray = formData.competitors 
        ? formData.competitors.split(',').map(c => c.trim()).filter(c => c.length > 0)
        : [];
      const areaEmployersArray = formData.areaEmployers 
        ? formData.areaEmployers.split(',').map(e => e.trim()).filter(e => e.length > 0)
        : [];

      // Prepare intake data
      const intakeDataPayload = {
        client_id: clientId,
        community_type: formData.communityType,
        property_type: formData.propertyType,
        community_address: formData.communityAddress,
        price_point: formData.pricePoint,
        property_url: formData.propertyUrl,
        competitors: competitorsArray, // Store as array
        unique_features: formData.uniqueFeatures,
        popular_activities: formData.popularActivities,
        area_employers: areaEmployersArray, // Store as array
        target_audience: formData.targetAudience,
        out_of_market_targets: formData.outOfMarketTargets,
        brand_voice_guidelines: formData.brandVoiceGuidelines,
        current_campaigns: formData.currentCampaigns,
        school_district_notes: formData.schoolDistrictNotes,
        referral_patterns: formData.referralPatterns,
        special_programs: formData.specialPrograms,
        intake_completed: true
      };

      let intakeData;
      let intakeError;

      if (editMode) {
        // Update existing intake data
        const result = await supabase
          .from('client_intake')
          .update(intakeDataPayload)
          .eq('client_id', clientId)
          .eq('intake_completed', true)
          .select()
          .single();
        intakeData = result.data;
        intakeError = result.error;
      } else {
        // Insert new intake data
        const result = await supabase
          .from('client_intake')
          .insert(intakeDataPayload)
          .select()
          .single();
        intakeData = result.data;
        intakeError = result.error;
      }

      if (intakeError) {
        throw intakeError;
      }

      // Create a comprehensive text representation for the vector database
      const intakeText = `
CLIENT ONBOARDING INFORMATION FOR ${clientName}

BASIC INFORMATION:
Community/Business Name: ${clientName}
Type: ${formData.communityType}
Property Type: ${formData.propertyType === 'home' ? 'Single Family Homes' : 'Apartments/Multifamily'}
Address: ${formData.communityAddress}
Website: ${formData.propertyUrl}

BUSINESS DETAILS:
Price Point: ${formData.pricePoint}

COMPETITIVE LANDSCAPE:
Main Competitors: ${formData.competitors}
Unique Differentiators: ${formData.uniqueFeatures}

LOCAL MARKET CONTEXT:
Popular Local Activities: ${formData.popularActivities}
Major Area Employers: ${formData.areaEmployers}
School District Notes: ${formData.schoolDistrictNotes}

TARGET AUDIENCE:
Primary Target Audience: ${formData.targetAudience}
Out-of-Market Targets: ${formData.outOfMarketTargets}
Referral Patterns: ${formData.referralPatterns}
Special Programs: ${formData.specialPrograms}

BRAND AND MARKETING:
Brand Voice & Guidelines: ${formData.brandVoiceGuidelines}
Current Marketing Campaigns: ${formData.currentCampaigns}
      `.trim();

      // Send the intake data to be processed and added to the vector database
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textContent: intakeText,
          clientId: clientId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process intake data');
      }

      alert(`Client intake ${editMode ? 'updated' : 'completed'} successfully! This information has been ${editMode ? 'updated in' : 'added to'} the knowledge base.`);
      onComplete();

    } catch (error) {
      console.error('Error submitting intake form:', error);
      alert(`Error submitting intake form: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

      if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading existing intake data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {editMode ? 'Edit Client Intake' : 'Client Intake Form'}
        </h2>
        <p className="text-gray-600">
          {editMode ? 'Update property details and market information for' : 'Add property details and market information for'} {clientName} to the knowledge base
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Basic Information</h3>
          <div className="mb-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Property:</strong> {clientName} | <strong>Type:</strong> {formData.communityType}
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Property Type for Marketing
            </label>
            <div className="flex space-x-6">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="propertyType"
                  value="home"
                  checked={formData.propertyType === 'home'}
                  onChange={(e) => handleInputChange('propertyType', e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Single Family Homes</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="propertyType"
                  value="apartment"
                  checked={formData.propertyType === 'apartment'}
                  onChange={(e) => handleInputChange('propertyType', e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Apartments/Multifamily</span>
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              This determines how marketing copy will refer to the living spaces (homes vs apartments)
            </p>
          </div>
        </div>

        {/* Location Details Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Location Details</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <input
                type="text"
                value={formData.communityAddress}
                onChange={(e) => handleInputChange('communityAddress', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 1033 Marmo Cir, Roseville, CA, 95747"
              />
            </div>
          </div>
        </div>

        {/* Business Details Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Business Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Point
              </label>
              <input
                type="text"
                value={formData.pricePoint}
                onChange={(e) => handleInputChange('pricePoint', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Starting in the hi $500s"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website URL
              </label>
              <input
                type="text"
                value={formData.propertyUrl}
                onChange={(e) => handleInputChange('propertyUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., https://example.com or example.com"
              />
            </div>
          </div>
        </div>

        {/* Competitive Analysis Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Competitive Analysis</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Top Competitors (comma-separated)
              </label>
              <input
                type="text"
                value={formData.competitors}
                onChange={(e) => handleInputChange('competitors', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Lennar's Sierra West, Sentinel Village, Inspiration Village"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unique Features That Set You Apart
              </label>
              <textarea
                value={formData.uniqueFeatures}
                onChange={(e) => handleInputChange('uniqueFeatures', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., build quality, happy homeowners, personal approach..."
              />
            </div>
          </div>
        </div>

        {/* Local Market Information Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Local Market Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Popular Local Activities
              </label>
              <textarea
                value={formData.popularActivities}
                onChange={(e) => handleInputChange('popularActivities', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe popular activities in the area..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Top Area Employers (comma-separated)
              </label>
              <input
                type="text"
                value={formData.areaEmployers}
                onChange={(e) => handleInputChange('areaEmployers', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Healthcare, Law Enforcement, Tech Companies"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                School District Notes
              </label>
              <textarea
                value={formData.schoolDistrictNotes}
                onChange={(e) => handleInputChange('schoolDistrictNotes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Information about local school districts..."
              />
            </div>
          </div>
        </div>

        {/* Target Audience Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Target Audience</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Target Audience
              </label>
              <textarea
                value={formData.targetAudience}
                onChange={(e) => handleInputChange('targetAudience', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe your target customers in detail..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Out-of-Market Targets
              </label>
              <input
                type="text"
                value={formData.outOfMarketTargets}
                onChange={(e) => handleInputChange('outOfMarketTargets', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Sacramento, Antelope area"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Referral Patterns & Customer Insights
              </label>
              <textarea
                value={formData.referralPatterns}
                onChange={(e) => handleInputChange('referralPatterns', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., lots of friends and family referrals, repeat customers..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Special Programs
              </label>
              <textarea
                value={formData.specialPrograms}
                onChange={(e) => handleInputChange('specialPrograms', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Hometown Heroes program for nurses, police officers..."
              />
            </div>
          </div>
        </div>

        {/* Brand and Marketing Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Brand & Marketing</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand Voice & Guidelines
              </label>
              <textarea
                value={formData.brandVoiceGuidelines}
                onChange={(e) => handleInputChange('brandVoiceGuidelines', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Fun, happy, friendly. Personal approach..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Marketing Campaigns
              </label>
              <textarea
                value={formData.currentCampaigns}
                onChange={(e) => handleInputChange('currentCampaigns', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 'Be Home Happy' campaign focusing on real people..."
              />
            </div>
          </div>
        </div>



        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? (editMode ? 'Updating...' : 'Submitting...') : (editMode ? 'Update Intake' : 'Complete Intake')}
          </button>
        </div>
      </form>
    </div>
  );
} 