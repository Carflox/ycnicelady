# YC NICE LADY — Analytics Function

Public execution endpoint, with the function server key stored only in environment variables. Required variables: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_ANALYTICS_TABLE_ID`. Supports `catalog_view`, `product_view`, `add_to_cart`, and `whatsapp_click`; it clamps quantities, truncates user-controlled strings, and creates a row with a server timestamp. It does not collect customer names, phone numbers, or payment credentials.

Configure the analytics table attributes: `event_type` (string), `created_at` (datetime/string), `product_id` (string), `product_name` (string), `quantity` (integer). Deploy this Function, set its Function ID as `appwriteAnalyticsFunctionId` in `js/config.js`, and set the same table ID as `APPWRITE_ANALYTICS_TABLE_ID` in the Admin Function.
