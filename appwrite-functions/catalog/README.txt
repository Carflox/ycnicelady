YC NICE LADY — Appwrite catalog Function

Create an Appwrite Function with:
- Name: YC NICE LADY Catalog
- Function ID: choose an ID and then use that same ID as APPWRITE_PRODUCTS_FUNCTION_ID in the Site build environment
- Runtime: Node.js (current supported runtime)
- Entrypoint: main.js
- Code: upload this folder's main.js
- Execution permission: allow public execution; event and order input is validated server-side

Set these Function environment variables:
APPWRITE_ENDPOINT=https://sfo.cloud.appwrite.io/v1 (use your Appwrite region endpoint)
APPWRITE_PROJECT_ID=6afbf48e003dc6106784
APPWRITE_API_KEY=server-only key, never put in frontend or GitHub
APPWRITE_DATABASE_ID=6afc0156001d3dd77b2e
APPWRITE_PRODUCTS_TABLE_ID=6afc017900116468e591
APPWRITE_ANALYTICS_TABLE_ID=6b04881e00088a054f27 (also configured as APPWRITE_FINANCE_TABLE_ID in the Admin Function)

The API key needs TablesDB read/write access for product stock updates and event inserts into the analytics table. Do not expose it in client code.

After the Function is deployed and its ID is known, configure the Appwrite Site build environment:
APPWRITE_ENDPOINT
APPWRITE_PROJECT_ID
APPWRITE_DATABASE_ID
APPWRITE_PRODUCTS_BUCKET_ID
APPWRITE_PRODUCTS_FUNCTION_ID (the Function ID)
WHATSAPP_NUMBER
Then redeploy the Site.

The browser invokes the Function through Appwrite's Function execution endpoint; it does NOT use /api/products.
This function returns active product rows only and exposes no supplier/cost_price fields. It also receives the public, non-personal events `catalog_view`, `product_view`, `add_to_cart`, and `whatsapp_click`, and stores them in `APPWRITE_ANALYTICS_TABLE_ID`. Use the same deployed Function ID for `appwriteProductsFunctionId`, `appwriteOrdersFunctionId`, and `appwriteAnalyticsFunctionId`; deploy this updated Function before publishing the site.

The Finance and Analytics environment variables currently point to the same table. That table must contain the union of Finance and Analytics attributes documented in `appwrite-functions/admin/README.md`; fields specific to one record type must be optional.

The public checkout reserves stock in the Products table before opening WhatsApp. In Finance, confirming a pending WhatsApp item records revenue without subtracting stock again. Dismissing an unconfirmed pending item restores its reserved quantity. An inventory expense updates stock only when a specific product and received quantity are selected.

The analytics table must be configured before public orders are enabled. A WhatsApp order is only redirected after its reservation and pending event are both saved; if event saving fails, the Function attempts to restore the reserved stock and returns an error.
