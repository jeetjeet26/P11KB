# Intranet Deployment Checklist

This document outlines the necessary steps to configure and prepare the P11RAG repository for deployment on a corporate intranet.

---

### Phase 1: Environment Configuration

The primary task is to create and populate the production environment files. These files should **not** be committed to the repository but must be in place on the deployment server.

- [ ]  **`ad-agency-kb` Service:**
    - [ ] Create a `.env.production.local` file inside the `ad-agency-kb/` directory.
    - [ ] Set `NEXT_PUBLIC_SUPABASE_URL` to the production URL of the intranet-hosted Supabase instance.
    - [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the production anonymous key for the Supabase instance.
    - [ ] Verify `OPENAI_API_KEY` and `OPENAI_ASSISTANT_ID` are correct for the production environment.

- [ ]  **`campaign-service` Service:**
    - [ ] Create a `.env.production.local` file inside the `campaign-service/` directory.
    - [ ] Set `NEXT_PUBLIC_SUPABASE_URL` to the production URL of the intranet-hosted Supabase instance.
    - [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the production anonymous key for the Supabase instance.
    - [ ] Verify `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `GOOGLE_MAPS_API_KEY` are correct for the production environment.

---

### Phase 2: Security Hardening (CORS)

For security, the Supabase Edge Functions must be updated to only allow requests from the official application domains on the intranet, instead of allowing requests from anywhere (`*`).

- [ ]  Identify the final production URLs for the two front-end applications (e.g., `http://ad-agency.mycompany.internal`, `http://campaigns.mycompany.internal`).
- [ ]  Modify the CORS headers in the following Supabase Edge Functions:
    - [ ]  `supabase/functions/extract-client-profile/index.ts`
    - [ ]  `supabase/functions/generate-copy/index.ts`
    - [ ]  `supabase/functions/process-document/index.ts`
- [ ]  **Action:** In each file, replace the permissive `'Access-Control-Allow-Origin': '*'` with logic to validate the request's origin against an allow-list of your production URLs.

---

### Phase 3: Infrastructure & Network (For DevOps/IT Team)

These tasks are typically handled by the IT or DevOps team responsible for the deployment environment.

- [ ]  **Hosting:**
    - [ ] Provision server(s) for the two Next.js applications (`ad-agency-kb`, `campaign-service`).
    - [ ] Provision a server or service for the Supabase backend.
- [ ]  **DNS:**
    - [ ] Create internal DNS records to point user-friendly URLs to the IP addresses of the front-end application servers.
- [ ]  **Firewall & Proxy:**
    - [ ] Ensure firewall rules allow employees on the intranet to access the application URLs.
    - [ ] Ensure firewall rules allow the application servers to communicate with the Supabase server on the required ports.
    - [ ] Confirm if an outbound proxy is needed for the application servers to reach the public OpenAI and Google APIs. If so, configure the server environment accordingly.

---

### Final Verification

- [ ]  Confirm with the deployment team that all environment variables from Phase 1 have been securely set on the production servers.
- [ ]  Review the code changes from Phase 2 to ensure they have been committed to the repository before handing it over.
- [ ]  Remove any local development files (e.g., `.env.local`) from the final commit to avoid leaking development credentials. 