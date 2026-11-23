// Appwrite Function: catálogo público y reserva de stock de YC NICE LADY.
// Las claves viven solo en las variables de entorno de la Function.
import { randomBytes } from 'node:crypto';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getConfig() {
  const config = {
    endpoint: (
      process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1'
    ).replace(/\/$/, ''),
    project: process.env.APPWRITE_PROJECT_ID,
    key: process.env.APPWRITE_API_KEY,
    database: process.env.APPWRITE_DATABASE_ID,
    table: process.env.APPWRITE_PRODUCTS_TABLE_ID,
    analyticsTable: process.env.APPWRITE_ANALYTICS_TABLE_ID
  };

  if (!config.project || !config.key || !config.database || !config.table) {
    throw new HttpError(500, 'Falta configuración del servidor Appwrite.');
  }

  return config;
}

async function tableApi(config, path, { method = 'GET', body, table = config.table } = {}) {
  const url =
    `${config.endpoint}/tablesdb/${encodeURIComponent(config.database)}` +
    `/tables/${encodeURIComponent(table)}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      'X-Appwrite-Project': config.project,
      'X-Appwrite-Key': config.key,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.message || `Appwrite HTTP ${response.status}`
    );
  }

  return data;
}

function readBody(req) {
  try {
    if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  } catch {
    // cuerpo vacío o inválido
  }

  try {
    return JSON.parse(req.bodyText || req.body || '{}');
  } catch {
    return {};
  }
}

function parseKitItems(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function savePublicEvent(config, event, { reservedOrder = false } = {}) {
  if (!config.analyticsTable) {
    throw new HttpError(503, 'La captura de estadísticas no está configurada.');
  }

  const eventType = String(event.event_type || '');

  if (!['catalog_view', 'product_view', 'add_to_cart', 'whatsapp_click'].includes(eventType)) {
    throw new HttpError(400, 'Evento inválido.');
  }

  if (eventType === 'whatsapp_click' && !reservedOrder) {
    throw new HttpError(400, 'Los pedidos por WhatsApp solo se registran después de reservar el stock.');
  }

  const data = {
    event_type: eventType,
    created_at: new Date().toISOString(),
    product_id: String(event.product_id || '').slice(0, 128),
    product_name: String(event.product_name || '').slice(0, 160),
    quantity: Math.max(1, Math.min(1000, Math.trunc(Number(event.quantity) || 1)))
  };

  const id = randomBytes(12).toString('hex');
  await tableApi(config, '/rows', {
    method: 'POST',
    table: config.analyticsTable,
    body: { rowId: id, data }
  });
  return id;
}

async function loadCatalog(config) {
  const rows = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const queries = [{ method: 'limit', values: [PAGE_SIZE] }];

    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });

    const queryString = queries
      .map(query => `queries[]=${encodeURIComponent(JSON.stringify(query))}`)
      .join('&');

    const data = await tableApi(config, `/rows?${queryString}`);
    const batch = Array.isArray(data.rows) ? data.rows : [];

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;

    cursor = batch[batch.length - 1].$id;
  }

  return rows
    .filter(row => row.is_active !== false)
    .sort(
      (a, b) =>
        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'es')
    )
    .map(row => ({
      id: row.$id,
      name: row.name,
      price: row.price,
      description: row.description || '',
      stock: Number(row.stock) || 0,
      image_path: row.image_path || '',
      category: row.category || '',
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active !== false,
      created_at: row.created_at || row.$createdAt,
      kit_items: parseKitItems(row.kit_items)
    }));
}

async function reserveStock(config, items, report) {
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    throw new HttpError(400, 'Pedido inválido.');
  }

  const wanted = new Map();

  for (const item of items) {
    const id = String(item?.id || '');
    const quantity = Math.trunc(Number(item?.quantity));

    if (!id || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      throw new HttpError(400, 'Pedido inválido.');
    }

    wanted.set(id, (wanted.get(id) || 0) + quantity);
  }

  const entries = [...wanted];
  const productRows = new Map();

  // 1. Verificar todo antes de descontar nada.
  await Promise.all(
    entries.map(async ([id, quantity]) => {
      const row = await tableApi(config, `/rows/${encodeURIComponent(id)}`);

      if (row.is_active === false || Number(row.stock) < quantity) {
        throw new HttpError(409, `Sin stock suficiente de ${row.name}.`);
      }

      productRows.set(id, row);
    })
  );

  // 2. Descontar. allSettled espera a todos y deja ver cuáles se aplicaron.
  const results = await Promise.allSettled(
    entries.map(([id, quantity]) =>
      tableApi(config, `/rows/${encodeURIComponent(id)}/stock/decrement`, {
        method: 'PATCH',
        body: { value: quantity, min: 0 }
      })
    )
  );

  const applied = entries.filter(
    (_, index) => results[index].status === 'fulfilled'
  );

  if (results.every(result => result.status === 'fulfilled')) {
    const eventIds = [];

    try {
      for (const [id, quantity] of entries) {
        eventIds.push(await savePublicEvent(config, {
          event_type: 'whatsapp_click',
          product_id: id,
          product_name: productRows.get(id)?.name,
          quantity
        }, { reservedOrder: true }));
      }

      return;
    } catch (eventError) {
      const eventCleanup = await Promise.allSettled(
        eventIds.map(eventId =>
          tableApi(config, `/rows/${encodeURIComponent(eventId)}`, {
            method: 'DELETE',
            table: config.analyticsTable
          })
        )
      );
      const stockRollback = await Promise.allSettled(
        entries.map(([id, quantity]) =>
          tableApi(config, `/rows/${encodeURIComponent(id)}/stock/increment`, {
            method: 'PATCH',
            body: { value: quantity }
          })
        )
      );
      const failures = [
        ...eventCleanup.filter(result => result.status === 'rejected'),
        ...stockRollback.filter(result => result.status === 'rejected')
      ];

      if (failures.length) {
        throw new HttpError(
          500,
          `${eventError.message} No se pudo revertir por completo el pedido reservado.`
        );
      }

      throw new HttpError(503, `No se pudo registrar el pedido en estadísticas; se devolvió el stock. ${eventError.message}`);
    }
  }

  // 3. Algo falló: devolver el stock de los que sí se descontaron.
  const rollback = await Promise.allSettled(
    applied.map(([id, quantity]) =>
      tableApi(config, `/rows/${encodeURIComponent(id)}/stock/increment`, {
        method: 'PATCH',
        body: { value: quantity }
      })
    )
  );

  rollback
    .filter(result => result.status === 'rejected')
    .forEach(result => report?.(`No se pudo devolver el stock: ${result.reason?.message}`));

  throw new HttpError(409, 'El stock cambió antes de confirmar el pedido.');
}

async function catalogHandler({ req, res, log, error }) {
  try {
    const config = getConfig();
    const body = readBody(req);

    if (Array.isArray(body?.order_items)) {
      await reserveStock(config, body.order_items, error);
      log?.('Stock reservado.');
      return res.json({ success: true });
    }

    if (body && Object.hasOwn(body, 'event_type')) {
      await savePublicEvent(config, body);
      return res.json({ success: true });
    }

    const products = await loadCatalog(config);
    log?.(`Catálogo cargado: ${products.length} productos`);
    return res.json(products);
  } catch (e) {
    error?.(e.message);

    return res.json(
      { success: false, message: e.message || 'Error en la función.' },
      e instanceof HttpError ? e.status : 500
    );
  }
}

export default catalogHandler;
