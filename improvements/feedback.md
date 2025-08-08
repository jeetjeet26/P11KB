## Feedback Implementation Plan (Brianna Massas)

### Objectives
- Align ad generation prompts and outputs with Brianna’s guidance while preserving current dual-use keyword strategy and JSON contract.
- Improve creative variety, CTA coverage, and Fair Housing safety without increasing operational risk.

### Scope of Changes (no code here, implementation-ready plan)

#### 1) General Search Campaign updates
- Abbreviation usage: Allow mixed usage. Require some fully spelled terms alongside abbreviations to improve variety and readability.
  - Requirement: At least 3 headlines and 1 description use spelled-out “Apartments” and/or “Bedrooms”. Others may use “Apts”/“BRs” as needed for character fit.
- Amenity examples: Expand examples in guidance to explicitly include:
  - “Designer Finishes”, “Expansive Co-working Lounge”, “Spacious Floorplan Layouts”,
    “Smart Home Technology”, “Electric Car Charging”, “Cabanas, Grills & Pizza Oven”,
    “Pet Friendly With A Dog Park”.
- Update example seeds to include several fully spelled items (not only “Apts/BRs”) while remaining within 20–30 characters.

Pros/Cons:
- Pros: Better Ad Strength, stakeholder readability, clearer amenity emphasis.
- Cons: Slightly tighter character budgeting; mitigated by keeping only a portion spelled-out.

#### 2) Unit Type Campaign updates (FH-safe)
- Change “ALL headlines MUST mention unit type” to “MOST headlines should mention unit type”.
- Remove “benefits of bed count” language. Emphasize amenity- and feature-forward copy (neutral phrasing).
- Replace any “family-targeted” phrasing (e.g., “family-friendly”) with neutral alternatives like “spacious layouts”, “roommate-friendly”, “work-from-home ready”, “flexible space”.
- Refresh unit-type example seeds to remove any audience-inference that risks FH.

Pros/Cons:
- Pros: Reduces FH risk; keeps unit-type relevance; preserves variety.
- Cons: Slight reduction in persona-specific language; offset by richer amenity/feature details.

#### 3) CTA requirements (applies to both)
- Add explicit CTA distribution requirements:
  - Headlines: 3–5 should include a CTA.
  - Descriptions: At least 1 should include a CTA.
- Approved CTAs: “Call Today”, “Schedule A Tour”, “Learn More”, “Join The VIP List”, “Join The Priority List”, “Apply Now”, “Lease Today”, “Check Availability”.
- Keep existing CTA atomic ingredients; make distribution explicit in prompt guidance.
- Optional: Add a non-blocking diagnostic that flags if CTA targets are missed.

Pros/Cons:
- Pros: Improves conversion intent; clearer creative variety for RSAs.
- Cons: Risk of repeated CTAs; mitigated by a diverse allowed list.

#### 4) Keyword strategy alignment
- General Search campaigns: Generate 50–100 broad match keywords and ≥15 negative keywords.
- Unit Type campaigns: Generate 50–75 broad match keywords and ≥20 negatives including other unit types (e.g., if 2BR campaign: negatives include “studio”, “one bedroom”, “3 bedroom”, etc.).
- Maintain dual-use: keywords remain prompt constraints and exported JSON for budgeting/forecasting/testing.

Pros/Cons:
- Pros: Matches stakeholder planning norms; maintains search relevance control.
- Cons: Longer lists increase token count marginally; acceptable.

#### 5) Compliance guardrails and composition diagnostics (non-blocking)
- Create a small denylist of FH-risk patterns (e.g., explicit references to families, protected classes). Provide neutral alternatives in guidance.
- Provide a composition diagnostic along with outputs (no auto-edit):
  - Counts of community-name mentions (target 3–5 in headlines for General Search),
  - CTA presence (H: 3–5; D: ≥1),
  - Abbreviation balance (spelled vs abbreviated),
  - Unit-type mention distribution (“most”, not “all”).

Pros/Cons:
- Pros: Early QA visibility; safer launch; no blocking behavior.
- Cons: Adds a small layer of reporting logic; worth it for testing phase.

#### 6) Examples and docs refresh
- Update `AD_COPY_EXAMPLES` seeds to:
  - Include fully spelled examples and the new amenity phrases.
  - Neutralize unit-type phrasing for FH safety.
- Update internal docs/checklists to reflect:
  - Mixed abbreviation rule, CTA distribution, FH guidance,
  - Updated keyword volume targets and unit-type negatives.

Pros/Cons:
- Pros: More consistent generations; easier collaborator onboarding.
- Cons: Minor content work.

### Acceptance Criteria
- JSON output contains 15 headlines, 4 descriptions, keyword object (broad_match, negative_keywords), and final_url_paths.
- General Search:
  - 3–5 headlines include community name.
  - ≥3 headlines and ≥1 description use fully spelled “Apartments/Bedrooms”.
  - Amenity examples appear naturally across outputs.
- Unit Type:
  - Most headlines mention the unit type, plus amenities/brand/location where relevant.
  - No bed-count “benefits” language; neutral, amenity-forward copy.
- CTAs:
  - Headlines: 3–5 with CTAs; Descriptions: ≥1 with CTA.
- Keywords:
  - General: 50–100 broad; ≥15 negatives.
  - Unit Type: 50–75 broad; ≥20 negatives including other unit types.
- Diagnostics (if enabled) report compliance with the above without blocking.

### Rollout & Testing
1) Implement prompt text updates and example seed adjustments.
2) Update keyword count targets and unit-type negatives in strategy guidance.
3) Add optional composition diagnostics (non-blocking).
4) Manual sanity runs for:
   - re_general_location (distributed),
   - re_unit_type (1BR, 2BR, 3BR),
   - re_proximity (each focus).
5) Verify JSON shape and distribution targets, FH-safe language, and CTA coverage.
6) Share sample outputs with Brianna for confirmation; incorporate any final refinements.

