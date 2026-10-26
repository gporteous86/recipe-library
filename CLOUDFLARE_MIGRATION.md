# Cloudflare migration status

The live `index.html` remains on Supabase. Do not cut over before testing.

## Verified
- Cloudflare Worker `recipe-library-api` responds to browser health requests.
- PowerShell authentication passed.
- Authenticated recipe listing returns 17 recipes.
- Browser CORS preflight passed from GitHub Pages.

## Routes to integrate
- `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`
- `/household`, `/household/join`
- `/recipes`, `/recipes/:id`
- `/meal-plan`, `/meal-plan/:day`

## Remaining work
- Verify browser login and list with the existing test page in this branch.
- Replace Supabase client calls in the UI, preserve styling.
- Test CRUD, favourites, meal plan and second-user household membership.
- Implement or validate recipe image storage and scanning before cutting over.
- Preserve original data and keep a rollback path.

Current live website: https://gporteous86.github.io/recipe-library/
