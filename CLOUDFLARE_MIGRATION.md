# Recipe Library — Cloudflare migration handover
Updated 26 October 2026.

## Objective
Finish migrating `Our Recipes v0.13` from Supabase to Cloudflare Workers + D1, preserving the current mobile UI and all shared-household functionality. Do as much as possible directly using connected tools; only involve the user when truly necessary. **Do not modify or deploy over `main/index.html` until a tested replacement is ready and the user approves.**

## Confirmed working
- GitHub repo: `gporteous86/recipe-library`; branch `cloudflare-migration` is the development branch.
- GitHub Pages: https://gporteous86.github.io/recipe-library/ — publishes `main` `/(root)`.
- Cloudflare Worker: https://recipe-library-api.gporteous86.workers.dev
- D1 database: `recipe-library`, binding `DB`; also `LOGIN_LIMITER` binding.
- Authenticated `POST /auth/login` returns a token; authenticated `GET /recipes` with bearer token and `X-Household-Id` returned all **17 of 17** imported recipes.
- Household: `Our Recipes`, ID `0073df82-f7b1-4eb0-b919-001e36eaa4de`, owner membership already exists.
- Password was reset successfully and login passed; do not repeat account registration, password reset or D1 import.
- `GET /health` from published GitHub Pages test returned HTTP 200, JSON `{"ok":true,"service":"recipe-library-api"}`.
- CORS preflight from origin `https://gporteous86.github.io` returned HTTP 204 and allowed `Content-Type,Authorization,X-Household-Id`.
- Imported `Burger Bowls` has no method in original source; this is not an import defect.

## Exact repo state
- `main/index.html`: existing Supabase app, untouched. This is the live website.
- `main/cloudflare-test.html`: published standalone health check; **not** an authenticated login test.
- `cloudflare-migration/index.html`: original Supabase app, ready for safe edits.
- `cloudflare-migration/cloudflare-test.html`: test form for Cloudflare browser sign-in and authenticated recipe count, not yet deployed on GitHub Pages.
- `cloudflare-migration/CLOUDFLARE_MIGRATION.md`: this handover.

## Existing Supabase features to migrate
- Auth: sign up, sign in, sign out, session restore.
- Households: fetch/create/join, separate member accounts.
- Recipes: list, search, filter, details, add, edit, delete, favourite.
- Meal planner: daily assignments, free-text meals, clear/remove.
- Photographs: existing Supabase Storage bucket `recipe-images`, image compression.
- Image-to-recipe: Supabase Edge Function `scan-recipe` accepts recipe image pages.
- Nutritional fields and WhatsApp sharing.

## API route inventory — VERIFY AGAINST WORKER
Potential routes documented previously: `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`, `/household`, `/household/join`, `/recipes`, `/recipes/:id`, `/meal-plan`, `/meal-plan/:day`.
Only login and recipe listing have been authenticated end-to-end. Verify request/response schema, tenancy checks and route methods before coding. The Worker source is not currently in this GitHub repository.

## Immediate next steps
1. Confirm authenticated browser test from allowed GitHub Pages origin; do not confuse with published health-only test.
2. Build Cloudflare API adapter and migrate UI code on `cloudflare-migration`, preserving styles.
3. Test read of 17 recipes, then CRUD/favourites/planner against disposable records.
4. Verify or implement photo storage/serving and AI scanning backend; these have NOT been proven migrated.
5. Test a second household member, permissions, mobile layout.
6. Cut over to `main` only after full validation and explicit user approval, with rollback.

## Connector limitations
GitHub integration can fetch files/create branches and has committed simple files. It blocked attempts to create/update files containing the browser sign-in test. Do not pretend the blocked changes were deployed or keep asking user to manually copy files. Consider supported ChatGPT Work cloud-browser workflow if available, without bypassing restrictions. No Cloudflare connector was identified.

## Important
The user wants this finished with minimal repeated questions. They already spent a long session setting up Cloudflare, password reset, CORS and confirming imports. Avoid revisiting those tasks; focus on frontend and remaining backend features. Never expose passwords, hashes or tokens.

## Development checkpoint — 26 October, frontend conversion

- Copied the supplied deployed Worker source into `cloudflare/worker.js`; no backend deployment or database migration performed.
- Converted the development frontend to `cloudflare-client.js`: auth/session restore, household create/join, recipe CRUD/favourites, and seven-day planner use the exact methods and envelopes in that source.
- Session bearer tokens use sessionStorage (survive reload in the tab, cleared by sign-out/expiry); never query parameters or logs.
- Meal editing no longer deletes the saved slot before the replacement is submitted. Failed picture uploads retain the saved recipe ID so retry does not create a duplicate.
- Removed Supabase SDK/configuration from the development frontend. Existing design and recipe review/scanning flow retained.
- Client contract/error tests pass with Node's built-in test runner; inline JavaScript syntax checked. These are mocked checks, **not authenticated live/browser verification**.

### Still blocked / not ready for cutover

The supplied Worker contains **no image upload/serving or scan endpoint**, no R2 binding, and no AI integration. The frontend now targets POST `/images` with `{recipe_id,image,mimeType}` (expects `{path}`), GET `/images/<path>`, and POST `/scan-recipe` with `{images:[{image,mimeType}]}` (expects `{recipe}`). These are proposed contracts, not deployed capabilities. Do not deploy this frontend to main yet.

Next: obtain authenticated Cloudflare management access or a supported deployment path; configure image storage and server-side scanning; migrate original image bytes with a path mapping; implement and test those routes. Do not silently treat old relative Supabase image paths as migrated. Existing absolute HTTPS images can still display but remain an external dependency until migrated.

Then run authenticated browser tests and disposable CRUD/planner tests, verify 17 recipes, photographs, scan, membership and mobile appearance. No live data writes or cutover have been performed in this checkpoint.

### Media implementation checkpoint

R2 `RECIPE_IMAGES` and Workers AI `AI` bindings were confirmed in user screenshots. The existing Supabase scan function was then inspected through the connected Supabase tools: it uses OpenAI Responses, model `gpt-5.6-luna`, with all images in one request. Preserve OpenAI; **Workers AI is unused**.

Added household-authenticated JPEG upload/read routes to the proposed Worker and authenticated blob loading in the frontend (plain img requests cannot carry bearer headers). Added OpenAI multi-page scanning with validation, rate limiting, server-side key, and structured result validation. Eight mocked tests pass. Not deployed or live-tested.

Required before deployment: add `OPENAI_API_KEY` as an encrypted Cloudflare secret using the existing OpenAI project key; never put it in GitHub or chat. Optional `OPENAI_MODEL` overrides the existing model. The existing model name was copied from the deployed function, not proven callable in this session. Do not deploy main or retire Supabase until photos are migrated and end-to-end tests pass. New Worker source is `cloudflare/worker.js`.
