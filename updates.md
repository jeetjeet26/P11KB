## Updates and Improvements

### Client intake schema vs UI mismatch (arrays vs TEXT)
- What’s happening:
  - UI writes arrays for `competitors` and `area_employers`, but `client_intake` defines these as `TEXT`.
- Why it matters:
  - Type mismatch can cause insert failures, silent coercion to strings, and broken reads when the UI expects arrays.
- Recommended fix (backward compatible):
  - Prefer `JSONB` columns for flexibility (or `TEXT[]`).
  - During rollout, make the UI tolerant of both shapes:
    - If value is an array, use it directly; if it’s a string, split by commas.
- Safe rollout:
  - Phase 1: Add `competitors_jsonb JSONB` and `area_employers_jsonb JSONB`; backfill by splitting existing `TEXT` on commas; update UI to read either field.
  - Phase 2: Swap reads/writes to JSONB; optionally drop old `TEXT` columns or keep as computed/compat.

### Gemini function-calling response handling (maps tool)
- What’s happening:
  - After handling `functionCall`, responses are sent back to the Gemini chat without the expected message parts envelope, risking repeated tool calls or empty responses.
- Why it matters:
  - The SDK expects function responses wrapped in message "parts" (tool role), not raw objects.
- Recommended fix:
  - Send tool responses as parts, e.g. (pseudocode—adapt to your `@google/generative-ai` version):
    ```ts
    const parts = [{ functionResponse: { name, response: { result: mapsResult } } }];
    await chat.sendMessage({ contents: [{ role: 'tool', parts }] });
    ```
  - Keep the rest of your logic (iteration/loop guards) unchanged.

### Over-escaping of text before JSON payload to Edge Function
- What’s happening:
  - Route pre-escapes backslashes and quotes, then JSON.stringify encodes again.
- Why it matters:
  - Produces double-escaped artifacts (e.g., `\\n`, `\"`) that degrade chunk quality and embeddings.
- Recommended fix:
  - Remove manual escaping of backslashes/quotes; allow JSON encoding to handle it.
  - Keep control-character stripping if needed; for pathological inputs, consider base64 encode/decode at the boundary.

### Non-breaking performance improvement for PDF/OCR processing
- Goal:
  - Keep `/api/process` contract unchanged, but move heavy CPU work off the web tier.
- Recommended design:
  - PDFs/Images: Upload to Supabase Storage (ideally client-side via signed URL). From the route, invoke an Edge Function (e.g., `process-document-ocr`) with storage path, `clientId`, `sourceId`, and mime info. The function runs `pdf-parse`/OCR and writes chunks/embeddings.
  - JSON/manual intake: Keep current path, but send raw text to the Edge Function that performs chunking/embedding.
- Benefits:
  - Prevents route handler CPU/memory spikes; isolates and scales heavy work; improves reliability under load.

### Request size vs Next config
- What’s happening:
  - Comments suggest increased body size, but current `next.config.js` does not adjust App Router route body limits, and upstream proxies may still enforce 413.
- Why it matters:
  - Large file uploads can fail depending on deployment environment.
- Recommended fix:
  - Prefer direct-to-Storage uploads (client → Supabase Storage, with signed upload). The API processes by reference (URL), avoiding large HTTP bodies through the app.

### Additional quality fixes

- Narrative taxonomy alignment
  - Issue: `value_pricing` focus references `narrative_pricing`, which the chunker doesn’t emit (it emits `narrative_amenities|location|lifestyle|community`).
  - Fix: Either add `narrative_pricing` in the chunker or replace with existing types (e.g., `narrative_community`) in the focus map to ensure hits.

- Prompt requirements nesting
  - Issue: The enhanced prompt builder reads `headlines`, `descriptions`, and `character_limits` at the root, but callers pass them under `requirements`.
  - Fix: Pass properties at the root or update the builder to read from `requirements` so intended constraints are applied (avoid relying on defaults).

- Headline input max length
  - Issue: UI uses `maxLength={35}` while rules enforce 30 chars.
  - Fix: Change to `30` to reduce rework during validation.

- Google Maps results stability (location bias)
  - Issue: Text search without explicit location bias can return broad results.
  - Fix: Derive lat/lng from the structured address (via one-time Geocoding) and use Places Nearby/Details with `location` + `radius` (or set a strict textsearch region bias).

- Dependency consistency
  - Issue: Different `@supabase/ssr` versions across apps may cause subtle cookie/session behavior differences.
  - Fix: Align versions in both apps.

- Observability and traceability
  - Issue: Multi-step flows (process → embed → search → generate) are hard to correlate in logs.
  - Fix: Add a short request ID to the initial request and propagate through Edge Function calls and logs; log at INFO level with brief, structured fields.

### Rollout checklist
- [ ] Update `client_intake` schema to JSONB or TEXT[] for arrays; backfill and make UI tolerant during transition.
- [ ] Wrap Gemini function responses with proper `parts` and `role: 'tool'` envelope.
- [ ] Remove manual escaping of quotes/backslashes before JSON; keep safe control-character filtering.
- [ ] Introduce Storage-first uploads and Edge Function processing for PDFs/images; keep `/api/process` contract intact.
- [ ] Prefer processing-by-reference (URL) to avoid large HTTP bodies through app routes.
- [ ] Align narrative focus types with emitted chunk types.
- [ ] Ensure prompt requirement fields are read from the path actually used by callers.
- [ ] Enforce 30-char headline input at the UI to reduce invalid entries.
- [ ] Add Maps location bias using lat/lng.
- [ ] Standardize `@supabase/ssr` versions.
- [ ] Add request IDs to logs spanning all steps and services.