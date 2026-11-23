import assert from 'node:assert/strict';
import analytics from './appwrite-functions/analytics/main.js';

Object.assign(process.env, {
  APPWRITE_PROJECT_ID: 'p',
  APPWRITE_API_KEY: 'k',
  APPWRITE_DATABASE_ID: 'd',
  APPWRITE_ANALYTICS_TABLE_ID: 't'
});

const originalFetch = globalThis.fetch;
let captured;
globalThis.fetch = async (url, options) => {
  captured = JSON.parse(options.body);
  return { ok: true, status: 200, json: async () => ({}) };
};

async function run(eventType, quantity = 1) {
  let result;
  let status;
  const res = {
    json: (body, responseStatus = 200) => {
      result = body;
      status = responseStatus;
    }
  };
  await analytics({
    req: {
      bodyJson: {
        event_type: eventType,
        product_id: 'id',
        product_name: 'P',
        quantity
      }
    },
    res,
    error() {}
  });
  return { result, status };
}

for (const eventType of ['catalog_view', 'product_view', 'add_to_cart', 'whatsapp_click']) {
  const response = await run(eventType, 99999);
  assert.equal(response.status, 200);
  assert.equal(captured.data.event_type, eventType);
  assert.equal(captured.data.quantity, 1000);
}

const invalid = await run('unknown_event');
assert.equal(invalid.status, 400);
assert.equal(invalid.result.success, false);

globalThis.fetch = originalFetch;
console.log('PASS: collector valida eventos públicos, sanitiza y limita cantidades.');
