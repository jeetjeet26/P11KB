import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SaveCampaignRequest {
  campaignData: {
    clientId: string;
    campaignType: string;
    campaignName: string;
    adGroupType?: string;
    location: any;
    unitDetails?: any;
    proximityTargets?: string[];
    priceRange?: string;
    specialOffers?: string;
    targetDemographic?: string;
    additionalContext?: string;
    derivedProductName: string;
    derivedTargetAudience: string;
  };
  finalCampaign: {
    headlines: string[];
    descriptions: string[];
    keywords: {
      broad_match: string[];
      negative_keywords: string[];
    };
    final_url_paths: string[];
  };
  characterValidation: {
    headlines_valid: any[];
    descriptions_valid: any[];
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: SaveCampaignRequest = await req.json();
    const { campaignData, finalCampaign, characterValidation } = body;

    // Validate required fields
    if (!campaignData || !finalCampaign) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing required fields: campaignData and finalCampaign" 
      }, { status: 400 });
    }

    // Validate minimum campaign requirements
    if (finalCampaign.headlines.length === 0 && finalCampaign.descriptions.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Campaign must have at least one headline or description" 
      }, { status: 400 });
    }

    const supabase = createClient();

    console.log(`[RE-CAMPAIGN-SAVE] Saving curated campaign for client ${campaignData.clientId}`);
    console.log(`[RE-CAMPAIGN-SAVE] Final headlines: ${finalCampaign.headlines.length}/15`);
    console.log(`[RE-CAMPAIGN-SAVE] Final descriptions: ${finalCampaign.descriptions.length}/4`);

    // Prepare database record
    const dbCampaignData = {
      client_id: campaignData.clientId,
      campaign_type: campaignData.campaignType,
      product_name: campaignData.derivedProductName,
      target_audience: campaignData.derivedTargetAudience,
      ad_group_type: campaignData.adGroupType || null,
      location_data: campaignData.location,
      unit_details: campaignData.unitDetails || null,
      proximity_targets: campaignData.proximityTargets || null,
      price_range: campaignData.priceRange || null,
      special_offers: campaignData.specialOffers || null,
      target_demographic: campaignData.targetDemographic || null,
      generated_copy: finalCampaign,
      character_validation: characterValidation
    };

    // Save to database
    const { data: newCampaign, error: insertError } = await supabase
      .from('campaigns')
      .insert(dbCampaignData)
      .select()
      .single();

    if (insertError) {
      console.error('[RE-CAMPAIGN-SAVE] Database insert error:', insertError);
      throw new Error(`Failed to save campaign: ${insertError.message}`);
    }

    console.log(`[RE-CAMPAIGN-SAVE] Curated campaign saved with ID: ${newCampaign.id}`);

    // Calculate final validation summary
    const validHeadlines = characterValidation.headlines_valid?.filter((h: any) => h.valid).length || 0;
    const validDescriptions = characterValidation.descriptions_valid?.filter((d: any) => d.valid).length || 0;

    return NextResponse.json({ 
      success: true, 
      campaignId: newCampaign.id,
      savedCampaign: finalCampaign,
      validationSummary: {
        headlinesValid: validHeadlines,
        descriptionsValid: validDescriptions,
        totalHeadlines: finalCampaign.headlines.length,
        totalDescriptions: finalCampaign.descriptions.length
      }
    });

  } catch (error: any) {
    console.error("Save curated campaign failed:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
} 