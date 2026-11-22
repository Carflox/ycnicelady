# YC NICE LADY — Engineering improvements

## Implemented in this continuation
- Added a deployable Appwrite Admin Function: login, HMAC-signed expiring sessions, session validation, products list/save/visibility/delete/reorder, finance list/save/delete, analytics list/dismiss, and server-side image upload.
- Added public Analytics Function with event validation, bounded quantity and truncated input values, server timestamp, and server-side TableDB insertion.
- Admin product form now sends existing `image_path`, preserving images when saving without uploading a replacement.
- Added simulation tests for catalog filter/order/reservation path, admin login/signed-token/session authorization and unauthorized requests, and analytics event validation/quantity limits.
- Updated package scripts so `npm test` runs all three test suites.
- Added Function deployment and schema documentation.

## Test results
- `npm test`: PASS (3 suites)
- `npm run build`: PASS
- `node --check`: PASS for relevant JS files
- Local preview HTTP: `/`, `/admin.html`, `/js/config.js`, `/js/store.js` returned HTTP 200 in a prior validation.

## Not verified against the live Appwrite project
The network environment prevented a real connection to Appwrite. Function source, tests and frontend build were verified locally with mocked responses. Deploy the Functions and validate schema/permissions in the Appwrite console before production.

## Deployment variables
Admin Function: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_PRODUCTS_TABLE_ID`, `APPWRITE_FINANCE_TABLE_ID`, `APPWRITE_ANALYTICS_TABLE_ID`, `APPWRITE_PRODUCTS_BUCKET_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
Analytics Function: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_ANALYTICS_TABLE_ID`.

## Remaining risks to verify before production
- Confirm exact TablesDB attribute types and table IDs against the live project.
- Review the existing catalog Function's stock decrement endpoint and concurrency/rollback semantics in Appwrite; test real simultaneous reservations.
- Rate-limit public analytics and login execution at platform level.
- Confirm the deployed Function IDs in `js/config.js`; admin/analytics IDs remain deployment-dependent.
- Review API key permissions, rotate exposed keys from the original ZIP if they were published, and keep server keys off the frontend.
