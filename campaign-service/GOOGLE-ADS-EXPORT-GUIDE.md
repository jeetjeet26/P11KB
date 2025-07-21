# Google Ads CSV Export Feature

## Overview

The Real Estate Campaign Generator now includes a **Google Ads CSV Export** feature that allows you to export your finalized campaigns in a format compatible with Google Ads bulk upload.

## How to Use

### 1. Generate and Curate Your Campaign
- Complete the campaign generation and curation process
- Add headlines and descriptions to your final campaign
- The export button will appear once you have at least one headline or description

### 2. Export Your Campaign
You now have two export options:
- **📊 Export Full CSV**: Complete campaign export with ads and keywords combined
- **🔑 Export Keywords**: Keywords-only export for bulk keyword import

#### Full CSV Export
- Click the **📊 Export Full CSV** button in the Final Campaign section
- The CSV file will automatically download with the filename: `{campaign-name}_google_ads.csv`
- Includes headlines, descriptions, final URLs, and all keyword types in one file

#### Keywords-Only Export  
- Click the **🔑 Export Keywords** button for a keywords-focused export
- The CSV file will automatically download with the filename: `{campaign-name}_keywords.csv`
- Perfect for Google Ads bulk keyword import with proper match type formatting

### 3. Upload to Google Ads
- Open your Google Ads account
- Navigate to **Ads & Extensions > Ads**
- Click the **+** button and select **Upload multiple ads**
- Upload your downloaded CSV file

## CSV Structure

The exported CSV follows Google Ads requirements exactly:

### Column Headers
| Column | Description | Example |
|--------|-------------|---------|
| Campaign | Your campaign name | "Luxury Downtown Apartments" |
| Ad group | Campaign type-specific ad group | "2 Bedroom Apartments" |
| Headline 1-15 | Up to 15 headlines (max 30 chars each) | "Luxury 2BR Downtown Now" |
| Description 1-4 | Up to 4 descriptions (max 90 chars each) | "Experience luxury living..." |
| Final URL | Landing page URL | "https://your-domain.com/san-diego-ca/2br" |
| Exact Match Keywords | All exact match keywords (semicolon-separated) | "[luxury apartments]; [2 bedroom downtown]" |
| Phrase Match Keywords | All phrase match keywords (semicolon-separated) | "luxury apartments san diego"; "2 bedroom near downtown" |
| Broad Match Keywords | All broad match keywords (semicolon-separated) | "luxury downtown apartments"; "2br apartments" |
| Negative Keywords | All negative keywords (semicolon-separated) | "cheap; budget; low cost; sale" |

### Ad Group Naming Convention

The system automatically generates meaningful ad group names:

#### Unit Type Campaigns (`re_unit_type`)
- **studio** → "Studio Apartments"
- **1br** → "1 Bedroom Apartments" 
- **2br** → "2 Bedroom Apartments"
- **3br** → "3 Bedroom Apartments"
- **4br_plus** → "4+ Bedroom Apartments"

#### Other Campaign Types
- **re_general_location** → "General Location"
- **re_proximity** → "Proximity Search"

### Final URL Generation

The system intelligently generates Final URLs based on:

1. **Custom URLs**: If `final_url_paths` are provided in your campaign
2. **Campaign-Specific URLs**: Auto-generated based on campaign type and location
   - Unit Type: `https://your-domain.com/{city}-{state}/{unit-type}`
   - Proximity: `https://your-domain.com/{city}-{state}/proximity`
   - General: `https://your-domain.com/{city}-{state}`

## Before Uploading to Google Ads

### ⚠️ Important: Update Final URLs
The exported CSV uses placeholder domain `your-domain.com`. **You must update these URLs** before uploading:

1. Open the CSV file in Excel, Google Sheets, or text editor
2. Find the "Final URL" column
3. Replace `your-domain.com` with your actual domain
4. Ensure URLs point to relevant landing pages
5. Save the file

### Example URL Updates
```
Before: https://your-domain.com/san-diego-ca/2br
After:  https://myapartments.com/san-diego-ca/2br

Before: https://your-domain.com/miami-fl/proximity  
After:  https://luxuryliving.com/miami-fl/proximity
```

## CSV Format Example

```csv
Campaign,Ad group,Headline 1,Headline 2,Headline 3,...,Description 1,Description 2,...,Final URL,Exact Match Keywords,Phrase Match Keywords,Broad Match Keywords,Negative Keywords
Luxury Downtown Apartments,2 Bedroom Apartments,Luxury 2BR Downtown Now,Modern Living San Diego,Prime Location Apartments,...,Experience luxury living in the heart of downtown San Diego with modern amenities.,Spacious 2-bedroom apartments with stunning city views and premium features.,...,https://your-domain.com/san-diego-ca/2br,"[luxury apartments]; [2 bedroom downtown]; [san diego apartments]","luxury apartments san diego"; "2 bedroom near downtown"; "apartments with amenities","luxury downtown apartments; 2br apartments; modern living","cheap; budget; low cost; sale"
```

## Features

### ✅ Automatic Padding
- Headlines padded to 15 columns (Google Ads max)
- Descriptions padded to 4 columns (Google Ads max)
- Empty cells for unused slots

### ✅ Character Validation
- All headlines respect 30-character Google Ads limit
- All descriptions respect 90-character Google Ads limit
- Character counts validated before export

### ✅ CSV Escaping
- Proper CSV escaping for commas, quotes, and newlines
- Compatible with Excel, Google Sheets, and Google Ads

### ✅ Comprehensive Keyword Generation
- **80-120 total keywords** generated by AI per campaign
- **Exact Match**: 20-30 keywords with [bracket] formatting
- **Phrase Match**: 20-30 keywords with "quote" formatting  
- **Broad Match**: 20-30 keywords with standard formatting
- **Negative Keywords**: 20-30 keywords to filter irrelevant traffic

### ✅ Smart Ad Group Naming
- Unit-specific ad group names for better organization
- Campaign type-based grouping for optimal performance

## Troubleshooting

### Export Button Not Visible
- **Solution**: Add at least one headline or description to your final campaign

### CSV Won't Upload to Google Ads
- **Check**: Final URL column has valid URLs (not placeholder domain)
- **Check**: All headlines are 30 characters or less
- **Check**: All descriptions are 90 characters or less
- **Check**: CSV file is not corrupted

### Headlines/Descriptions Cut Off
- **Explanation**: System automatically enforces Google Ads character limits
- **Solution**: Edit headlines/descriptions in the curation interface before export

## Best Practices

### 1. Campaign Organization
- Use descriptive campaign names that reflect your marketing goals
- Leverage the automatic ad group naming for better account structure

### 2. Landing Page Alignment
- Ensure Final URLs match your campaign type and ad group focus
- Create dedicated landing pages for unit types (studio, 1BR, 2BR, etc.)
- Implement location-specific landing pages for proximity campaigns

### 3. A/B Testing Setup
- Export multiple campaign variations with different headline/description mixes
- Use campaign naming conventions to track performance differences

### 4. Quality Score Optimization
- Ensure Final URLs are highly relevant to your ad content
- Match landing page content to headline promises
- Consider location-specific pages for proximity campaigns

## Integration with Google Ads

### Upload Process
1. Export CSV from the campaign generator
2. Update Final URLs to your domain
3. Log into Google Ads
4. Go to **Ads & Extensions** > **Ads**
5. Click **+** > **Upload multiple ads**
6. Upload your CSV file
7. Review and approve the imported ads

### Post-Upload Optimization
- Monitor performance metrics (CTR, CPC, Conversion Rate)
- Pause underperforming headlines/descriptions
- Scale successful ad variations
- Use insights to inform future campaign generation

---

**🎯 Pro Tip**: The exported CSV provides a solid foundation, but continue optimizing based on performance data to maximize your Google Ads ROI. 