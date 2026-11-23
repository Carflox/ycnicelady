# YC NICE LADY — Admin Function

## Deploy
Create a Node.js Appwrite Function, entrypoint `main.js`, public execution allowed (the function itself enforces login and session), then configure environment variables:

- `APPWRITE_ENDPOINT` — region endpoint
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY` — server key; never in client or repository
- `APPWRITE_DATABASE_ID`
- `APPWRITE_PRODUCTS_TABLE_ID`
- `APPWRITE_FINANCE_TABLE_ID` (required to save finance movements)
- `APPWRITE_ANALYTICS_TABLE_ID` (required to display public-site events)
- `APPWRITE_SUNAT_TABLE_ID` (required for manual SUNAT tracking; current table ID: `6b03c6f0001009a7b9f0`)
- `APPWRITE_PRODUCTS_BUCKET_ID` (required for image uploads)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` — strong unique password
- `ADMIN_SESSION_SECRET` — random secret, at least 32 bytes recommended

## Required TablesDB attributes
The Products table must support the project fields: `name`, `description`, `category`, `supplier`, `price`, `cost_price`, `stock`, `is_active`, `sort_order`, `kit_items`, `image_path`. `kit_items` should be a string attribute containing JSON. Finance table should support: `kind`, `created_at`, `description`, `product_id`, `product_name`, `category`, `supplier`, `quantity`, `unit_price`, `amount`, `analytics_event_id`. Analytics table expects: `event_type`, `created_at`, `product_id`, `product_name`, `quantity`.

Set `APPWRITE_SUNAT_TABLE_ID=6b03c6f0001009a7b9f0` in the deployed Admin Function's environment. The table must be in the configured TablesDB database and have these attributes: `tax_type` (string), `tax_period` (string), `amount` (double), `due_date` (string), `status` (string), `paid_at` (string), `payment_method` (string), `payment_reference` (string), and `notes` (string). The panel records obligations and payments entered manually; it does not calculate tax due, submit declarations, or send payments to SUNAT.

The Function performs login, signed-token validation, product CRUD, visibility, reorder, finance list/save/delete and analytics list/dismiss. No server key is sent to the browser. Product-image upload uses Appwrite Storage via the server API key.

## Limits and notes
- The session token is HMAC-signed and expires after eight hours; use `ADMIN_SESSION_SECRET` and rotate it if compromised.
- Use HTTPS, enable Appwrite function rate limits if available, and restrict API key permissions to the required tables and bucket.
- List operations report whether their tables are configured; finance and SUNAT writes require their respective tables.
- This implementation is a backend scaffold matching the current admin.js actions. Verify table schemas and permissions in your Appwrite console before production deployment.

## Connect the website's admin panel
After creating and deploying this Function in Appwrite, copy its **Function ID** from the Function page (not its deployment ID). Set `appwriteAdminFunctionId` in the root `js/config.js` to that exact ID, then rebuild with `npm run build`. The website can only call this Function after it has been deployed in your Appwrite project; the ID cannot be guessed or generated locally.
