import assert from 'node:assert/strict';
import admin from './appwrite-functions/admin/main.js';

Object.assign(process.env, {
  APPWRITE_PROJECT_ID: 'test',
  APPWRITE_API_KEY: 'test-key',
  APPWRITE_DATABASE_ID: 'db',
  APPWRITE_PRODUCTS_TABLE_ID: 'products',
  APPWRITE_FINANCE_TABLE_ID: 'finance',
  APPWRITE_ANALYTICS_TABLE_ID: 'analytics',
  APPWRITE_SUNAT_TABLE_ID: 'sunat',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'safe-test-pass',
  ADMIN_SESSION_SECRET: 'a-long-test-secret'
});

const tables = {
  products: new Map([
    ['p1', {
      $id: 'p1',
      name: 'P1',
      price: 10,
      cost_price: 4,
      stock: 4,
      is_active: true,
      sort_order: 1,
      kit_items: '[{"id":"kit1","name":"Lash","price":3}]'
    }]
  ]),
  finance: new Map([
    ['sale-1', {
      $id: 'sale-1',
      kind: 'sale',
      product_id: 'p1',
      quantity: 1,
      amount: 25,
      category: 'yape'
    }]
  ]),
  analytics: new Map([
    ['whatsapp-1', {
      $id: 'whatsapp-1',
      event_type: 'whatsapp_click',
      product_id: 'p1',
      quantity: 2
    }]
  ]),
  sunat: new Map([
    ['tax-1', {
      $id: 'tax-1',
      tax_type: 'IGV',
      tax_period: '2026-10',
      due_date: '2026-11-20',
      amount: 125.5,
      status: 'pending'
    }]
  ])
};

const oldFetch = globalThis.fetch;
const calls = [];
let failNextFinanceWrite = false;

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/');
  const table = parts[5];
  const rowIndex = parts.indexOf('rows');
  const rowId = parts[rowIndex + 1];
  const rows = tables[table];

  if (!rows) {
    return { ok: false, status: 404, json: async () => ({ message: 'Table not found' }) };
  }

  if (options.method === 'PATCH' && parts.includes('stock')) {
    const product = rows.get(rowId);
    const operation = parts.at(-1);
    const { value, min } = JSON.parse(options.body);
    const updatedStock = product.stock + (operation === 'increment' ? value : -value);

    if (updatedStock < (min || 0)) {
      return { ok: false, status: 409, json: async () => ({ message: 'Insufficient stock' }) };
    }

    product.stock = updatedStock;
    return { ok: true, status: 200, json: async () => product };
  }

  if (rowId && options.method === 'GET') {
    const row = rows.get(rowId);
    return row
      ? { ok: true, status: 200, json: async () => row }
      : { ok: false, status: 404, json: async () => ({ message: 'Row not found' }) };
  }

  if (rowId && options.method === 'PUT') {
    const row = { ...rows.get(rowId), ...JSON.parse(options.body).data, $id: rowId };
    rows.set(rowId, row);
    return { ok: true, status: 200, json: async () => row };
  }

  if (rowId && options.method === 'DELETE') {
    rows.delete(rowId);
    return { ok: true, status: 200, json: async () => ({}) };
  }

  if (options.method === 'POST' && rowIndex >= 0) {
    if (table === 'finance' && failNextFinanceWrite) {
      failNextFinanceWrite = false;
      return { ok: false, status: 500, json: async () => ({ message: 'Finance write failed' }) };
    }

    const body = JSON.parse(options.body);
    const row = { ...body.data, $id: body.rowId };
    rows.set(body.rowId, row);
    return { ok: true, status: 201, json: async () => row };
  }

  if (rowId === undefined && options.method !== 'POST') {
    return { ok: true, status: 200, json: async () => ({ rows: [...rows.values()] }) };
  }

  return { ok: true, status: 200, json: async () => ({}) };
};

async function run(body) {
  let result;
  let status = 200;
  const res = {
    json: (data, responseStatus = 200) => {
      result = data;
      status = responseStatus;
      return data;
    }
  };

  await admin({ req: { bodyJson: body }, res, log() {}, error() {} });
  return { result, status };
}

const login = await run({
  action: 'login',
  email: 'admin@example.test',
  password: 'safe-test-pass'
});
assert.equal(login.status, 200);
assert.ok(login.result.token);

const list = await run({ action: 'products.list', token: login.result.token });
assert.equal(list.status, 200);
assert.equal(list.result.products.length, 1);
assert.equal(list.result.products[0].id, 'p1');
assert.deepEqual(list.result.products[0].kit_items, [{ id: 'kit1', name: 'Lash', price: 3 }]);

assert.equal((await run({ action: 'products.list', token: 'invalid' })).status, 401);
assert.equal((await run({ action: 'login', email: 'admin@example.test', password: 'wrong' })).status, 401);
assert.equal((await run({ action: 'session', token: login.result.token })).status, 200);

const saleStockBefore = tables.products.get('p1').stock;
const saleUpdate = await run({
  action: 'finance.save',
  token: login.result.token,
  entry: {
    id: 'sale-1',
    kind: 'sale',
    created_at: '2026-11-22T12:00:00.000Z',
    description: 'Venta',
    product_id: 'p1',
    category: 'yape',
    quantity: 1,
    unit_price: 25,
    amount: 25
  }
});
assert.equal(saleUpdate.status, 200);
assert.equal(tables.products.get('p1').stock, saleStockBefore);

failNextFinanceWrite = true;
const failedPurchase = await run({
  action: 'finance.save',
  token: login.result.token,
  entry: {
    kind: 'expense',
    category: 'productos',
    product_id: 'p1',
    quantity: 2,
    amount: 20
  }
});
assert.equal(failedPurchase.status, 500);
assert.equal(tables.products.get('p1').stock, saleStockBefore);

const purchase = await run({
  action: 'finance.save',
  token: login.result.token,
  entry: {
    kind: 'expense',
    category: 'productos',
    product_id: 'p1',
    product_name: 'P1',
    supplier: 'Proveedor',
    quantity: 3,
    amount: 30
  }
});
assert.equal(purchase.status, 200);
assert.equal(tables.products.get('p1').stock, 7);
assert.ok([...tables.finance.values()].some(entry => entry.product_id === 'p1' && entry.quantity === 3));

const purchaseId = [...tables.finance.entries()].find(([, entry]) =>
  entry.kind === 'expense'
)[0];
const purchaseUpdate = await run({
  action: 'finance.save',
  token: login.result.token,
  entry: {
    id: purchaseId,
    kind: 'expense',
    category: 'productos',
    product_id: 'p1',
    product_name: 'P1',
    supplier: 'Proveedor',
    quantity: 5,
    amount: 50
  }
});
assert.equal(purchaseUpdate.status, 200);
assert.equal(tables.products.get('p1').stock, 9);

tables.products.get('p1').stock = 2;
const blockedPurchaseDelete = await run({
  action: 'finance.delete',
  token: login.result.token,
  id: purchaseId
});
assert.equal(blockedPurchaseDelete.status, 409);
assert.equal(tables.finance.has(purchaseId), true);

tables.products.get('p1').stock = 9;
const purchaseDelete = await run({
  action: 'finance.delete',
  token: login.result.token,
  id: purchaseId
});
assert.equal(purchaseDelete.status, 200);
assert.equal(tables.products.get('p1').stock, 4);

const dismiss = await run({
  action: 'analytics.dismiss',
  token: login.result.token,
  id: 'whatsapp-1'
});
assert.equal(dismiss.status, 200);
assert.equal(dismiss.result.stockRestored, true);
assert.equal(tables.products.get('p1').stock, 6);
assert.equal(tables.analytics.has('whatsapp-1'), false);

const pendingSunat = await run({
  action: 'sunat.save',
  token: login.result.token,
  entry: {
    tax_type: 'IGV',
    tax_period: '2026-10',
    due_date: '2026-11-20',
    amount: 125.5,
    status: 'pending'
  }
});
assert.equal(pendingSunat.status, 200);

const invalidSunat = await run({
  action: 'sunat.save',
  token: login.result.token,
  entry: {
    tax_type: 'IGV',
    tax_period: '2026-13',
    due_date: '2026-11-20',
    amount: 125.5,
    status: 'pending'
  }
});
assert.equal(invalidSunat.status, 400);

const invalidSunatDate = await run({
  action: 'sunat.save',
  token: login.result.token,
  entry: {
    tax_type: 'IGV',
    tax_period: '2026-10',
    due_date: '2026-02-30',
    amount: 125.5,
    status: 'pending'
  }
});
assert.equal(invalidSunatDate.status, 400);

const invalidPayment = await run({
  action: 'sunat.save',
  token: login.result.token,
  entry: {
    tax_type: 'IGV',
    tax_period: '2026-10',
    due_date: '2026-11-20',
    amount: 125.5,
    status: 'paid',
    payment_method: 'banco'
  }
});
assert.equal(invalidPayment.status, 400);

const paidUpdate = await run({
  action: 'sunat.save',
  token: login.result.token,
  entry: {
    id: 'tax-1',
    tax_type: 'IGV',
    tax_period: '2026-10',
    due_date: '2026-11-20',
    amount: 125.5,
    status: 'paid',
    paid_at: '2026-11-22',
    payment_method: 'banco'
  }
});
assert.equal(paidUpdate.status, 200);
assert.equal(tables.sunat.get('tax-1').status, 'paid');

const sunatDelete = await run({
  action: 'sunat.delete',
  token: login.result.token,
  id: 'tax-1'
});
assert.equal(sunatDelete.status, 200);
assert.equal(tables.sunat.has('tax-1'), false);

globalThis.fetch = oldFetch;
console.log('PASS: auth, finanzas, stock, pedidos descartados y validación SUNAT.');
