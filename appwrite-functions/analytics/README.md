# YC NICE LADY — Analytics Function

Public execution endpoint, with the function server key stored only in environment variables. Required variables: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_ANALYTICS_TABLE_ID`. Supports only `add_to_cart` and `whatsapp_click`, clamps quantities and truncates user-controlled strings. It creates a row with a server timestamp.

Configure the analytics table attributes: `event_type` (string), `created_at` (datetime/string), `product_id` (string), `product_name` (string), `quantity` (integer). Then deploy and set `appwriteAnalyticsFunctionId` in `js/config.js`.
