# Plan: Frontload Google Maps POI Enrichment at Client Intake (No Live Calls During Generation)

## Decision
- Precompute and store Points of Interest (POIs) during client intake in `ad-agency-kb`.
- Do not call Google Maps during ad generation. Generation reads only from the vector knowledge base.
- A refresh function can be added later; out of scope for this phase.

## Goals
- Faster generation latency, predictable costs, consistent POI quality.
- Centralize POI acquisition in intake flow and store as reusable, vectorized chunks.

## Non-Goals
- No live/just-in-time Google Maps calls during ad generation.
- No periodic refresh in this phase (design only, implementation later).

---

## Where To Trigger POI Enrichment

Two acceptable hook points; choose one (or both) depending on data availability timing:

1) `ad-agency-kb` → `POST /api/process` when `sourceType === 'client_intake'` and a full address is present.
   - File: `ad-agency-kb/src/app/api/process/route.ts`
   - Behavior: after processing intake JSON, if a postal address is detected, enqueue an async POI enrichment job.

2) After profile extraction in Supabase Edge Function when address is confirmed.
   - File: `supabase/functions/extract-client-profile/index.ts`
   - Behavior: once address fields are extracted, enqueue the same POI enrichment job.

Recommendation: Start with (1) to keep orchestration in `ad-agency-kb`; optionally add (2) as a backup trigger.

---

## Orchestration (Background, Non-Blocking)

Do not block the intake request. Fire-and-forget an enrichment task:

- Option A (Simple): Directly call a new Edge Function `enrich-poi` with `{ client_id, address }`. Handle retries within the function.
- Option B (Robust): Insert a row into an `enrichment_jobs` table (status: queued → running → done/failed). A worker/cron triggers `enrich-poi`. Provides retries, observability, and rate limiting.

Start with Option A to ship quickly; refactor to Option B when scale grows.

---

## New Edge Function: `enrich-poi`

Purpose: Given `client_id` and a full `address`, produce and upsert POI chunks into the vector DB.

Inputs
- `client_id: string`
- `address: string` (full postal address)
- Optional: `latitude`, `longitude` (skip geocoding if provided)

Steps
1. Geocode `address` → `(lat, lng)` using Google Geocoding API.
2. For each category set, query Places (Nearby/Text Search) with capped radius and results:
   - Categories: `school`, `park`, `shopping_mall` (or `shopping` via Text Search), `transit_station`, `tourist_attraction|landmark`, `employer` (Text Search for top employers near X).
   - Default radius: urban 1500m; suburban 3000–5000m (start with 2500m baseline). Max 5 results/category.
3. Compute straight-line `distance_meters` from `(lat, lng)` (Haversine). Travel time not needed in this phase.
4. Format text:
   - Atomic (short, fact-dense): "0.6 mi: Bell Tower Shops (shopping mall, 4.5★, 3,211 reviews)."
   - Narrative (optional, 1–2 sentences): "Minutes from Bell Tower Shops, top-rated schools, and rapid transit—ideal for commuters."
5. Embed each chunk with existing embedding model (e.g., `text-embedding-3-small`), store in `chunks` table.
6. Upsert idempotently (see Keys & Idempotency below).

Error Handling
- Retry geocoding and category queries with exponential backoff (up to 2–3 attempts).
- Log and continue on per-category failures; never fail the entire job unless geocoding fails.

---

## Storage Model: Vector Chunks (Reuse Existing `chunks`)

Content
- Atomic location chunk per POI.
- Optional narrative location chunk summarizing the area.

Metadata (attached to each chunk)
- `type`: `atomic_location` | `narrative_location`
- `location_type`: `proximity`
- `poi_category`: `school` | `park` | `shopping` | `transit` | `employer` | `landmark`
- `place_id`: Google Place ID
- `name`, `formatted_address`
- `lat`, `lng`, `distance_meters`
- Optional: `rating`, `user_ratings_total`
- `source`: `google_maps_places`
- `client_id`
- `geohash` (e.g., precision 8) or `address_hash`
- `created_at`, `version`

Keys & Idempotency
- Upsert on composite key: `(client_id, geohash_precision_8, poi_category, place_id)`.
- On re-run, update content/metadata if values change; avoid duplicates.

RLS / Tenancy
- Ensure `chunks` rows carry `client_id` and comply with existing RLS policies.

---

## Generation Path: No Live Calls

- Do not register or expose any Maps tool/function in the generation services.
- Ad generation retrieves context exclusively via vector search (existing `match_chunks` RPC), scoped by `client_id`.
- For proximity-focused prompts, optionally filter or rank-boost chunks with `source=google_maps_places` and `location_type=proximity`.
- If no POI chunks exist, proceed without POI—never perform a live Maps call.

---

## Rate Limits, Costs, and Secrets

- Cap results to at most 5 POIs per category and 5–6 categories per client → ≤ 25–30 POIs per run.
- Implement per-client cooldown (e.g., ignore re-requests within 24h) to avoid duplicate spend.
- Store Google Maps API key in Edge Function environment only; never expose to client code.

---

## Acceptance Criteria

- Intake submission with a valid address triggers an async POI enrichment job.
- Within ~1–2 minutes: POI chunks appear in the client’s knowledge base with the metadata above.
- Ad generation performs no outbound Maps calls and reads only from stored chunks.
- If POI chunks are absent, ad generation still succeeds without attempting a live call.

---

## Rollout Plan

1) Define metadata schema and upsert key policy; validate RLS.
2) Implement Edge Function `enrich-poi` and secure config for Maps API.
3) Wire `ad-agency-kb` intake flow to enqueue enrichment (non-blocking).
4) Verify retrieval during generation: proximity prompts surface POI chunks.
5) Add minimal observability (logs, counts, basic error alerts).

---

## Future (Out of Scope Now)

- "Refresh POIs" button in `ClientDetail` to re-enqueue enrichment.
- Optional scheduled refresh (e.g., quarterly) for active clients.
- Travel time data (Distance Matrix) if needed for messaging.
- Employer lists via curated datasets for certain metros.

---

## Open Questions / Defaults

- Default radius: start at 2500m; revisit after pilot.
- Categories: ship with `school`, `park`, `shopping`, `transit`, `landmark`. Add `employer` via Text Search as needed.
- Narrative chunks: optional in v1; atomic-only is acceptable to ship faster.

