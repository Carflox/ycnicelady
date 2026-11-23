# YC NICE LADY — Analytics Function

This is an optional standalone collector. The current website sends events through the existing public Catalog/Orders Function instead, so a separate Analytics Function is not needed unless you choose to deploy one.

For the current shared setup, deploy the updated `appwrite-functions/catalog` code and configure `APPWRITE_ANALYTICS_TABLE_ID` on both Catalog and Admin Functions. The table attributes are `event_type` (string), `created_at` (datetime/string), `product_id` (string), `product_name` (string), and `quantity` (integer). The collector supports only catalog/product views, cart additions, and WhatsApp order events; it does not collect names, phone numbers, or payment credentials.

To use this standalone function instead, deploy it with the five environment variables above and point `appwriteAnalyticsFunctionId` in `js/config.js` to its Function ID.
