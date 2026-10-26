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
