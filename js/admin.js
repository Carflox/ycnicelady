// Panel de administración de YC NICE LADY.
// Se conecta a la Appwrite Function de administración (appwriteAdminFunctionId en js/config.js).
(() => {
    'use strict';

    const config = window.YCNiceLadyConfig || {};
    const ENDPOINT = String(config.appwriteEndpoint || '').replace(/\/$/, '');
    const PROJECT = config.appwriteProjectId;
    const ADMIN_FUNCTION = config.appwriteAdminFunctionId;
    const BUCKET = config.appwriteProductsBucket;
    const TOKEN_KEY = 'yc-nice-lady-admin-token';
    const KIT_CATEGORIES = ['libros', 'set', 'kits'];

const COST_LABELS = {
    productos: 'Compra a proveedor / inventario',
    delivery: 'Delivery pagado',
    gasolina: 'Gasolina',
    material_moto: 'Materiales de moto',
    empaque: 'Empaques',
    otros: 'Otros gastos operativos'
};

const $ = id => document.getElementById(id);
const field = (form, name) => form.elements.namedItem(name);

const loginView = $('loginView');
const adminView = $('adminView');
const loginForm = $('loginForm');
const productForm = $('productForm');
const financeSaleForm = $('financeSaleForm');
const financeExpenseForm = $('financeExpenseForm');
const financeSaleProduct = $('financeSaleProduct');
const financeExpenseProduct = $('financeExpenseProduct');
const adminProducts = $('adminProducts');
const kitEditor = $('kitEditor');
const kitEditorItems = $('kitEditorItems');

let token = '';
let products = [];
let entries = [];
let events = [];
let kitRows = [];
let dragId = null;

try {
    token = sessionStorage.getItem(TOKEN_KEY) || '';
} catch {
    token = '';
}

  // ==========================================
  // UTILIDADES
  // ==========================================

const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));

const money = value => `S/ ${Number(value || 0).toFixed(2)}`;

const normalize = value =>
    String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const formatDate = value => {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
};

const toLocalInput = (date = new Date()) => {
    const pad = number => String(number).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function say(output, message, isError = false) {
    if (!output) return;

    output.textContent = message;
    output.classList.toggle('error', isError);
}

function imageUrl(path) {
    const fileId = String(path || '').trim().split('/').filter(Boolean).pop();

    if (!fileId || !ENDPOINT || !PROJECT || !BUCKET) return '';

    return `${ENDPOINT}/storage/buckets/${encodeURIComponent(BUCKET)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(PROJECT)}`;
}

const productById = id => products.find(product => String(product.id) === String(id));

  // ==========================================
  // CONEXIÓN CON LA FUNCTION
  // ==========================================

async function api(action, data = {}, { timeoutMs = 30000 } = {}) {
    if (!ENDPOINT || !PROJECT || !ADMIN_FUNCTION) {
        throw new Error('El panel no está conectado: configura appwriteAdminFunctionId en js/config.js con el ID de la Appwrite Function admin desplegada. No uses el ID de productos ni orders.');
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        let response;

        try {
        response = await fetch(`${ENDPOINT}/functions/${encodeURIComponent(ADMIN_FUNCTION)}/executions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT },
            body: JSON.stringify({
            body: JSON.stringify({ action, token, ...data }),
            async: false,
            method: 'POST',
            path: '/'
        }),
            signal: controller.signal
        });
        } catch (error) {
        throw new Error(error.name === 'AbortError' ? 'La conexión tardó demasiado.' : 'No se pudo conectar con Appwrite.');
    }

        const execution = await response.json().catch(() => null);

        if (!response.ok) throw new Error(execution?.message || `Appwrite respondió ${response.status}.`);

        if (String(execution?.status).toLowerCase() !== 'completed') {
        throw new Error(execution?.errors || 'La Function de administración no terminó correctamente.');
    }

    let body = execution.responseBody;

    if (typeof body === 'string' && body.trim()) {
        try {
            body = JSON.parse(body);
        } catch {
          // texto plano
        }
    }

    const code = Number(execution.responseStatusCode || 200);

    if (code >= 400) {
        const error = new Error(body?.message || `La Function respondió ${code}.`);

        error.status = code;
        throw error;
}

        return body;
    } finally {
        window.clearTimeout(timer);
    }
}

async function call(action, data, options) {
    try {
        return await api(action, data, options);
    } catch (error) {
        if (error.status === 401 && action !== 'login') signOut('Tu sesión venció. Ingresa de nuevo.');

        throw error;
    }
}

  // ==========================================
  // SESIÓN
  // ==========================================

function showLogin(message = '') {
    loginView.hidden = false;
    adminView.hidden = true;
    say($('loginMessage'), message, Boolean(message));
}

function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
}

function signOut(message = '') {
    token = '';

    try {
        sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // almacenamiento bloqueado
}

    products = [];
    entries = [];
    events = [];
    showLogin(message);
}

loginForm.addEventListener('submit', async event => {
    event.preventDefault();

    const button = loginForm.querySelector('button[type="submit"]');

    button.disabled = true;
    say($('loginMessage'), 'Ingresando…');

    try {
        const result = await api('login', {
        email: field(loginForm, 'email').value,
        password: field(loginForm, 'password').value
    });

        token = result.token;

    try {
        sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
        // la sesión durará mientras la página siga abierta
}

        field(loginForm, 'password').value = '';
        say($('loginMessage'), '');
        showAdmin();
        await loadProducts();
    } catch (error) {
        say($('loginMessage'), error.message, true);
    } finally {
        button.disabled = false;
    }
});

$('toggleAdminPassword').addEventListener('click', event => {
    const input = $('adminPassword');
    const show = input.type === 'password';

    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? 'Ocultar' : 'Ver';
    event.currentTarget.setAttribute('aria-pressed', String(show));
});

$('showPasswordReset').addEventListener('click', () => {
    $('passwordResetView').hidden = false;
    $('resetRequestForm').hidden = true;
    $('resetConfirmForm').hidden = true;
    say(
        $('resetMessage'),
        'Por seguridad la contraseña se cambia en Appwrite: Funciones → ycnicelady-admin → Variables → ADMIN_PASSWORD. Guarda el cambio y vuelve a desplegar la función.'
    );
});

$('backToLogin').addEventListener('click', () => {
    $('passwordResetView').hidden = true;
});

$('signOut').addEventListener('click', () => signOut());

  // ==========================================
  // PRODUCTOS
  // ==========================================

async function loadProducts() {
    say($('productsSummary'), 'Cargando…');

    try {
        products = (await call('products.list')).products;
        renderProducts();
        refreshFinanceSaleProducts();
        refreshFinanceExpenseProducts();
        renderKitEditor();
    } catch (error) {
        say($('productsSummary'), error.message, true);
    }
}

function renderProducts() {
    const query = normalize($('adminProductSearch').value);

    const visible = products.filter(product =>
        !query || normalize(`${product.name} ${product.description} ${product.category}`).includes(query)
    );

    const hidden = products.filter(product => !product.is_active).length;

    say($('productsSummary'), `${products.length} productos${hidden ? ` · ${hidden} ocultos` : ''}`);
    say(
        $('adminOrderStatus'),
        query ? 'Borra la búsqueda para poder reordenar.' : 'Arrastra los productos para cambiar su orden.'
    );

    if (!visible.length) {
        adminProducts.innerHTML = '<p class="empty-list">No hay productos para mostrar.</p>';
        return;
    }

    adminProducts.innerHTML = visible.map(product => {
        const image = imageUrl(product.image_path);

        return `
        <article class="admin-product" data-id="${escapeHtml(product.id)}" draggable="${query ? 'false' : 'true'}">
            <button class="admin-product-image-button" type="button" data-action="preview" aria-label="Ver foto de ${escapeHtml(product.name)}">
            ${image ? `<img class="admin-product-image" src="${escapeHtml(image)}" alt="" loading="lazy">` : '<span aria-hidden="true">♡</span>'}
            <span>Ver foto</span>
        </button>
        <div class="admin-product-meta">
            <h3>${escapeHtml(product.name)}${product.is_active ? '' : ' · <em>Oculto</em>'}</h3>
            <p>${escapeHtml(product.description || 'Sin descripción.')}</p>
            <p><strong>${money(product.price)}</strong> · costo ${money(product.cost_price)} · stock ${product.stock} · ${escapeHtml(product.category)}${product.supplier ? ` · ${escapeHtml(product.supplier)}` : ''}</p>
        </div>
        <div class="row-actions">
            <button type="button" data-action="edit">Editar</button>
            <button type="button" data-action="visibility">${product.is_active ? 'Ocultar' : 'Mostrar'}</button>
            <button class="delete" type="button" data-action="delete">Eliminar</button>
        </div>
        </article>`;
    }).join('');
}

adminProducts.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    const card = event.target.closest('[data-id]');

    if (!button || !card) return;

    const product = productById(card.dataset.id);

    if (!product) return;

    const action = button.dataset.action;

    try {
        if (action === 'preview') {
        $('adminPreviewImage').src = imageUrl(product.image_path);
        $('adminPreviewCaption').textContent = product.name;
        $('adminImagePreview').showModal();
    } else if (action === 'edit') {
        fillProductForm(product);
    } else if (action === 'visibility') {
        await call('product.visibility', { id: product.id, is_active: !product.is_active });
        await loadProducts();
    } else if (action === 'delete') {
        if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;

        await call('product.delete', { id: product.id });
        say($('productMessage'), 'Producto eliminado.');
        await loadProducts();
}
    } catch (error) {
        say($('productMessage'), error.message, true);
    }
});

adminProducts.addEventListener('dragstart', event => {
    const card = event.target.closest('.admin-product');

    if (!card || card.getAttribute('draggable') !== 'true') return;

    dragId = card.dataset.id;
    card.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', dragId);
});

adminProducts.addEventListener('dragend', () => {
    dragId = null;
    adminProducts.querySelectorAll('.admin-product').forEach(card =>
        card.classList.remove('is-dragging', 'drop-before', 'drop-after')
    );
});

adminProducts.addEventListener('dragover', event => {
    const card = event.target.closest('.admin-product');

    if (!dragId || !card || card.dataset.id === dragId) return;

    event.preventDefault();

    const box = card.getBoundingClientRect();
    const before = event.clientY < box.top + box.height / 2;

    card.classList.toggle('drop-before', before);
    card.classList.toggle('drop-after', !before);
});

adminProducts.addEventListener('drop', async event => {
    const card = event.target.closest('.admin-product');

    if (!dragId || !card || card.dataset.id === dragId) return;

    event.preventDefault();

    const before = card.classList.contains('drop-before');
    const moved = productById(dragId);
    const rest = products.filter(product => product !== moved);
    const index = rest.findIndex(product => String(product.id) === card.dataset.id);

    rest.splice(index + (before ? 0 : 1), 0, moved);
    rest.forEach((product, position) => (product.sort_order = position));
    products = rest;
    renderProducts();
    say($('adminOrderStatus'), 'Guardando orden…');

    try {
        await call('products.reorder', { ids: products.map(product => product.id) });
        say($('adminOrderStatus'), 'Orden guardado. La tienda lo mostrará así.');
    } catch (error) {
        say($('adminOrderStatus'), error.message, true);
        await loadProducts();
    }
});

$('adminProductSearch').addEventListener('input', renderProducts);
$('refreshProducts').addEventListener('click', loadProducts);
$('closeAdminImagePreview').addEventListener('click', () => $('adminImagePreview').close());

  // ---------- Formulario de producto ----------

function updateKitVisibility() {
    kitEditor.hidden = !KIT_CATEGORIES.includes(field(productForm, 'category').value);
}

function renderKitEditor() {
    const accessories = products.filter(
        product => product.category === 'accesorios' && String(product.id) !== field(productForm, 'id').value
    );

    kitEditorItems.innerHTML = kitRows.map((row, index) => `
    <div class="kit-editor-row">
        <label>Complemento
            <input type="text" maxlength="80" value="${escapeHtml(row.name)}" data-kit-index="${index}" data-kit-field="name">
        </label>
        <label>Precio (S/)
            <input type="number" min="0" step="0.01" value="${escapeHtml(row.price)}" data-kit-index="${index}" data-kit-field="price">
        </label>
        <label>Accesorio vinculado
            <select data-kit-index="${index}" data-kit-field="accessory_product_id">
            <option value="">Sin vincular</option>
            ${accessories.map(product => `<option value="${escapeHtml(product.id)}"${String(product.id) === String(row.accessory_product_id) ? ' selected' : ''}>${escapeHtml(product.name)}</option>`).join('')}
            </select>
        </label>
        <button type="button" data-kit-remove="${index}">Quitar</button>
    </div>`).join('');
}

kitEditorItems.addEventListener('input', event => {
    const target = event.target;
    const row = kitRows[Number(target.dataset.kitIndex)];

    if (!row || !target.dataset.kitField) return;

    row[target.dataset.kitField] = target.value;
});

kitEditorItems.addEventListener('click', event => {
    const button = event.target.closest('[data-kit-remove]');

    if (!button) return;

    kitRows.splice(Number(button.dataset.kitRemove), 1);
    renderKitEditor();
});

$('addKitItem').addEventListener('click', () => {
    kitRows.push({ id: crypto.randomUUID(), name: '', price: 0, accessory_product_id: '' });
    renderKitEditor();
});

field(productForm, 'category').addEventListener('change', updateKitVisibility);

function resetProductForm() {
    productForm.reset();
    field(productForm, 'id').value = '';
    field(productForm, 'existingImagePath').value = '';
    field(productForm, 'isActive').checked = true;
    kitRows = [];
    $('formTitle').textContent = 'Nuevo producto';
    $('resetProductForm').hidden = true;
    updateKitVisibility();
    renderKitEditor();
}

function fillProductForm(product) {
    resetProductForm();

    ['id', 'name', 'description', 'category', 'supplier', 'price', 'cost_price', 'stock'].forEach(name => {
        field(productForm, name).value = product[name === 'id' ? 'id' : name] ?? '';
    });

    field(productForm, 'existingImagePath').value = product.image_path || '';
    field(productForm, 'isActive').checked = product.is_active;
    kitRows = product.kit_items.map(item => ({ ...item, accessory_product_id: item.accessory_product_id || '' }));
    $('formTitle').textContent = `Editar: ${product.name}`;
    $('resetProductForm').hidden = false;
    updateKitVisibility();
    renderKitEditor();
    productForm.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

$('resetProductForm').addEventListener('click', resetProductForm);

async function compressImage(file) {
    if (!/^image\//.test(file.type)) throw new Error('El archivo debe ser una imagen.');

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));

    const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.readAsDataURL(blob);
    });

    return { type: 'image/jpeg', data };
}

productForm.addEventListener('submit', async event => {
    event.preventDefault();

    const button = $('saveProduct');
    const value = name => field(productForm, name).value;

    button.disabled = true;
    say($('productMessage'), 'Guardando…');

    try {
    const product = {
        id: value('id') || undefined,
        name: value('name'),
        description: value('description'),
        category: value('category'),
        supplier: value('supplier'),
        price: Number(value('price')),
        cost_price: Number(value('cost_price') || 0),
        stock: Number(value('stock') || 0),
        is_active: field(productForm, 'isActive').checked,
        image_path: value('existingImagePath'),
        kit_items: kitEditor.hidden ? [] : kitRows.filter(row => String(row.name).trim()).map(row => ({
            ...row,
            price: Number(row.price) || 0
        }))
    };

    const file = field(productForm, 'image').files?.[0];

        if (file) product.image = await compressImage(file);

        await call('product.save', { product }, { timeoutMs: 60000 });
        say($('productMessage'), 'Producto guardado ♡');
        resetProductForm();
        await loadProducts();
    } catch (error) {
        say($('productMessage'), error.message, true);
    } finally {
        button.disabled = false;
    }
});

  // ==========================================
  // GRÁFICOS SIMPLES (SVG y CSS, sin librerías)
  // ==========================================

const emptyChart = '<p class="chart-empty">Aún no hay datos.</p>';

function barsSvg(values, labels, color = '#8f5369') {
    if (!values.some(Boolean)) return emptyChart;

    const width = 480;
    const height = 170;
    const barWidth = width / values.length;
    const max = Math.max(1, ...values);
    const step = Math.ceil(values.length / 12);

    return `<svg viewBox="0 0 ${width} ${height}" role="img" style="width:100%;height:auto">${values.map((count, index) => {
      const barHeight = Math.round((count / max) * (height - 40));
      const x = index * barWidth;

    return `<rect x="${x + 3}" y="${height - 24 - barHeight}" width="${barWidth - 6}" height="${barHeight}" rx="3" fill="${color}"><title>${escapeHtml(labels[index])}: ${count}</title></rect>` +
        (index % step === 0 ? `<text x="${x + barWidth / 2}" y="${height - 8}" font-size="10" text-anchor="middle" fill="#806a72">${escapeHtml(labels[index])}</text>` : '');
    }).join('')}</svg>`;
}

function horizontalBars(items) {
    if (!items.length) return emptyChart;

    const max = Math.max(1, ...items.map(item => item.value));

    return items.map(item => `
        <div style="margin:8px 0">
        <div style="display:flex;justify-content:space-between;gap:10px;font-size:.8rem"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.text)}</strong></div>
        <div style="height:8px;border-radius:99px;background:#f5e4ea"><div style="height:8px;border-radius:99px;background:#8f5369;width:${Math.max(3, (item.value / max) * 100)}%"></div></div>
    </div>`).join('');
}

function pieChart(items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);

    if (!total) return emptyChart;

    let start = 0;

    const slices = items.map(item => {
      const end = start + (item.value / total) * 100;
        const slice = `${item.color} ${start}% ${end}%`;

        start = end;

        return slice;
    });

    return `<div class="pie-layout" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
    <div class="pie-chart" role="img" style="width:140px;height:140px;border-radius:50%;background:conic-gradient(${slices.join(',')})"></div>
        <ul class="pie-legend" style="list-style:none;margin:0;padding:0">${items.map(item =>
        `<li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color};margin-right:6px"></span>${escapeHtml(item.label)}: <strong>${item.value}</strong></li>`).join('')}</ul>
    </div>`;
}

const card = (label, value) => `<div class="ax-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

  // ==========================================
  // FINANZAS
  // ==========================================

function refreshFinanceSaleProducts() {
    const selected = financeSaleProduct.value;

    financeSaleProduct.innerHTML =
        '<option value="">Venta general</option>' +
        products.map(product =>
        `<option value="${escapeHtml(String(product.id))}">${escapeHtml(String(product.name || ''))}</option>`
    ).join('');

    if (products.some(product => String(product.id) === selected)) financeSaleProduct.value = selected;
}

function refreshFinanceExpenseProducts() {
    const selected = financeExpenseProduct.value;

    financeExpenseProduct.innerHTML =
        '<option value="">Compra general / varios</option>' +
        products.map(product => {
        const suffix = product.supplier ? ` — ${String(product.supplier)}` : '';

        return `<option value="${escapeHtml(String(product.id))}">${escapeHtml(String(product.name || ''))}${escapeHtml(suffix)}</option>`;
    }).join('');

    if (products.some(product => String(product.id) === selected)) financeExpenseProduct.value = selected;
}

function syncFinanceSaleFields({ useCurrentPrices = false } = {}) {
    const product = productById(financeSaleProduct.value);
    const quantity = Math.max(1, Number(field(financeSaleForm, 'quantity').value) || 1);

    field(financeSaleForm, 'product_name').value = product ? String(product.name || '') : '';

    if (product && useCurrentPrices) {
        field(financeSaleForm, 'unit_price').value = Number(product.price || 0).toFixed(2);
    }

    if (product) {
        field(financeSaleForm, 'description').value = `${String(product.name || '')} × ${quantity}`;
    }

    const unitPrice = Math.max(0, Number(field(financeSaleForm, 'unit_price').value) || 0);

    field(financeSaleForm, 'amount').value = (unitPrice * quantity).toFixed(2);
}

function resetFinanceForms() {
    financeSaleForm.reset();
    financeExpenseForm.reset();
    field(financeSaleForm, 'created_at').value = toLocalInput();
    field(financeExpenseForm, 'created_at').value = toLocalInput();
    field(financeSaleForm, 'analytics_event_id').value = '';
    updateExpenseFields();
}

function updateExpenseFields() {
    $('financeInventoryProductWrap').hidden = field(financeExpenseForm, 'category').value !== 'productos';
}

    const tokens = name => new Set(normalize(name).split(/[^a-z0-9]+/).filter(word => word.length > 1 && !['de', 'en', 'el', 'la', 'y'].includes(word)));

function similarity(a, b) {
    const left = tokens(a.name);
    const right = tokens(b.name);
    const shared = [...left].filter(word => right.has(word)).length;
    const union = new Set([...left, ...right]).size || 1;
    const sameImage = a.image_path && b.image_path && a.image_path.split('/').pop() === b.image_path.split('/').pop();

    return sameImage ? 1 : shared / union;
}

function productStats() {
    const stats = new Map();

    const row = (id, name) => {
        const key = id || `n:${normalize(name)}`;

        if (!stats.has(key)) stats.set(key, { id, name: productById(id)?.name || name || 'Sin nombre', cart: 0, whatsapp: 0, units: 0, revenue: 0 });

        return stats.get(key);
    };

    events.forEach(item => {
        const target = row(item.product_id, item.product_name);

        if (item.event_type === 'add_to_cart') target.cart += item.quantity;
        if (item.event_type === 'whatsapp_click') target.whatsapp += item.quantity;
    });

    entries.filter(item => item.kind === 'sale').forEach(sale => {
        const target = row(sale.product_id, sale.product_name || sale.description);

        target.units += sale.quantity;
        target.revenue += sale.amount;
    });

    return stats;
}

function renderFinance() {
    const sales = entries.filter(item => item.kind === 'sale');
    const expenses = entries.filter(item => item.kind === 'expense');
    const income = sales.reduce((sum, item) => sum + item.amount, 0);
    const costs = expenses.reduce((sum, item) => sum + item.amount, 0);
    const linked = new Set(sales.map(item => item.analytics_event_id).filter(Boolean));
    const pending = events.filter(item => item.event_type === 'whatsapp_click' && !item.dismissed && !linked.has(item.id));

    $('financeTotals').innerHTML =
        card('Ventas confirmadas', money(income)) +
        card('Costos y gastos', money(costs)) +
        card('Ganancia estimada', money(income - costs)) +
        card('Unidades vendidas', String(sales.reduce((sum, item) => sum + item.quantity, 0))) +
        card('Pedidos por confirmar', String(pending.length));

    say($('financePendingStatus'), pending.length ? `${pending.length} pedidos de WhatsApp sin confirmar.` : 'No hay pedidos pendientes.');

    $('financePendingWhatsapp').innerHTML = pending.map(item => `
    <tr>
        <td>${escapeHtml(formatDate(item.created_at))}</td>
        <td>${escapeHtml(item.product_name || 'Pedido por WhatsApp')}</td>
        <td>${item.quantity}</td>
        <td><div class="finance-pending-actions">
            <button class="button" type="button" data-pending-sale="${escapeHtml(item.id)}">Registrar venta</button>
            <button class="text-button" type="button" data-pending-dismiss="${escapeHtml(item.id)}">Descartar</button>
        </div></td>
    </tr>`).join('');

    const perDay = new Map();

    sales.forEach(item => {
        const day = new Date(item.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });

        perDay.set(day, (perDay.get(day) || 0) + item.amount);
    });

    const days = [...perDay.entries()].reverse().slice(-30);

    $('financeTrendChart').innerHTML = barsSvg(days.map(([, value]) => Math.round(value)), days.map(([label]) => label));

    const perSupplier = new Map();

    expenses.forEach(item => {
        const label = `${item.supplier || 'Sin proveedor'} · ${COST_LABELS[item.category] || item.category}`;

        perSupplier.set(label, (perSupplier.get(label) || 0) + item.amount);
    });

    $('financeSupplierChart').innerHTML = horizontalBars(
        [...perSupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value, text: money(value) }))
    );

    const stats = [...productStats().values()].sort((a, b) => b.revenue - a.revenue || b.cart - a.cart);

    say($('financeProductPerformanceStatus'), stats.length ? `${stats.length} productos con actividad.` : 'Aún no hay actividad.');
    $('financeProductPerformance').innerHTML = stats.map(item => `
        <tr><td>${escapeHtml(item.name)}</td><td>${item.cart}</td><td>${item.whatsapp}</td><td>${item.units}</td><td>${money(item.revenue)}</td></tr>`).join('');

    renderSimilarProducts();

    $('financeSalesLedger').innerHTML = sales.map(item => `
    <tr>
        <td>${escapeHtml(formatDate(item.created_at))}</td>
        <td>${escapeHtml(item.product_name || item.description || 'Venta general')}</td>
        <td>${item.quantity}</td><td>${money(item.unit_price)}</td><td>${money(item.amount)}</td>
        <td><button class="finance-delete" type="button" data-finance-delete="${escapeHtml(item.id)}">Eliminar</button></td>
    </tr>`).join('');

    $('financeExpenseLedger').innerHTML = expenses.map(item => `
    <tr>
        <td>${escapeHtml(formatDate(item.created_at))}</td>
        <td>${escapeHtml(COST_LABELS[item.category] || item.category)}</td>
        <td>${escapeHtml(item.product_name || '—')}</td>
        <td>${escapeHtml(item.supplier || '—')}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${money(item.amount)}</td>
        <td><button class="finance-delete" type="button" data-finance-delete="${escapeHtml(item.id)}">Eliminar</button></td>
    </tr>`).join('');
}

function renderSimilarProducts() {
    const stats = productStats();
    const matches = new Map();

    for (let i = 0; i < products.length; i++) {
        for (let j = i + 1; j < products.length; j++) {
        const score = similarity(products[i], products[j]);

        if (score < 0.6) continue;

        [[products[i], products[j]], [products[j], products[i]]].forEach(([product, other]) => {
            const list = matches.get(product.id) || [];

            list.push({ other, score });
            matches.set(product.id, list);
        });
    }
}

    const rows = [...matches.entries()].slice(0, 40);

    say($('similarProductsStatus'), rows.length ? `${rows.length} productos con coincidencias.` : 'No se encontraron productos parecidos.');

    $('similarProductsLedger').innerHTML = rows.map(([id, list]) => {
        const product = productById(id);
        const stat = stats.get(id) || { cart: 0, whatsapp: 0, units: 0, revenue: 0 };
        const image = imageUrl(product.image_path);
        const best = list.sort((a, b) => b.score - a.score)[0];

    return `<tr>
        <td><div class="similar-product-cell">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ''}<strong>${escapeHtml(product.name)}</strong></div></td>
        <td>${Math.round(best.score * 100)}% con ${escapeHtml(best.other.name)}</td>
        <td>${stat.cart}</td><td>${stat.whatsapp}</td><td>${stat.units}</td><td>${money(stat.revenue)}</td>
        </tr>`;
    }).join('');
}

async function loadFinance() {
    say($('financeStatus'), 'Cargando finanzas…');

    try {
        const [finance, activity] = await Promise.all([call('finance.list'), call('analytics.list')]);

        entries = finance.entries;
        events = activity.events;
        renderFinance();
        say($('financeStatus'), 'Ventas, compras y gastos se guardan de forma segura en la nube.');
    } catch (error) {
        say($('financeStatus'), error.message, true);
    }
    }

    async function saveEntry(form, kind, messageOutput) {
    const read = name => field(form, name)?.value ?? '';

    try {
        await call('finance.save', {
        entry: {
            kind,
            created_at: new Date(read('created_at')).toISOString(),
            description: read('description'),
            product_id: read('product_id'),
            product_name: read('product_name'),
            category: read('category'),
            supplier: read('supplier'),
            quantity: read('quantity'),
            unit_price: read('unit_price'),
            amount: read('amount'),
            analytics_event_id: read('analytics_event_id')
        }
        });

        resetFinanceForms();
        await loadFinance();
    } catch (error) {
        say(messageOutput, error.message, true);
    }
    }

    financeSaleForm.addEventListener('submit', event => {
    event.preventDefault();
    syncFinanceSaleFields();
    saveEntry(financeSaleForm, 'sale', $('financeStatus'));
    });

    financeExpenseForm.addEventListener('submit', event => {
    event.preventDefault();
    saveEntry(financeExpenseForm, 'expense', $('financeStatus'));
    });

    financeSaleProduct.addEventListener('change', () => syncFinanceSaleFields({ useCurrentPrices: true }));
    field(financeSaleForm, 'quantity').addEventListener('input', () => syncFinanceSaleFields());
    field(financeSaleForm, 'unit_price').addEventListener('input', () => syncFinanceSaleFields());
    field(financeExpenseForm, 'category').addEventListener('change', updateExpenseFields);

    financeExpenseProduct.addEventListener('change', () => {
    const product = productById(financeExpenseProduct.value);

    field(financeExpenseForm, 'product_name').value = product ? product.name : '';

    if (product) {
        field(financeExpenseForm, 'supplier').value = product.supplier || '';

        if (!field(financeExpenseForm, 'description').value) {
        field(financeExpenseForm, 'description').value = `Compra: ${product.name}`;
        }
    }
    });

    $('adminFinance').addEventListener('click', async event => {
    const sale = event.target.closest('[data-pending-sale]');
    const dismiss = event.target.closest('[data-pending-dismiss]');
    const remove = event.target.closest('[data-finance-delete]');

    try {
        if (sale) {
        const item = events.find(candidate => candidate.id === sale.dataset.pendingSale);

        if (!item) return;

        field(financeSaleForm, 'analytics_event_id').value = item.id;
        field(financeSaleForm, 'created_at').value = toLocalInput(new Date(item.created_at));
        field(financeSaleForm, 'quantity').value = item.quantity;
        financeSaleProduct.value = item.product_id;
        syncFinanceSaleFields({ useCurrentPrices: true });
        financeSaleForm.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        } else if (dismiss) {
        await call('analytics.dismiss', { id: dismiss.dataset.pendingDismiss });
        await loadFinance();
        } else if (remove) {
        if (!window.confirm('¿Eliminar este movimiento?')) return;

        await call('finance.delete', { id: remove.dataset.financeDelete });
        await loadFinance();
        }
    } catch (error) {
        say($('financeStatus'), error.message, true);
    }
    });

    $('openFinance').addEventListener('click', () => {
    resetFinanceForms();
    $('adminFinance').showModal();
    loadFinance();
    });

    $('closeFinance').addEventListener('click', () => $('adminFinance').close());

  // ==========================================
  // ESTADÍSTICAS
  // ==========================================

    function renderAnalytics() {
    const carts = events.filter(item => item.event_type === 'add_to_cart');
    const clicks = events.filter(item => item.event_type === 'whatsapp_click');
    const sumQuantity = list => list.reduce((sum, item) => sum + item.quantity, 0);
    const perProduct = new Map();

    carts.forEach(item => {
        const key = item.product_id || item.product_name;
        const current = perProduct.get(key) || { name: productById(item.product_id)?.name || item.product_name, image: productById(item.product_id)?.image_path, count: 0 };

        current.count += item.quantity;
        perProduct.set(key, current);
    });

    $('analyticsCards').innerHTML =
        card('Interacciones', String(events.length)) +
        card('Agregados al carrito', String(sumQuantity(carts))) +
        card('Clics en WhatsApp', String(clicks.length)) +
        card('Productos distintos', String(perProduct.size));

    const top = [...perProduct.values()].sort((a, b) => b.count - a.count)[0];
    const topImage = top ? imageUrl(top.image) : '';

    $('topProduct').innerHTML = top
        ? `<div class="similar-product-cell">${topImage ? `<img src="${escapeHtml(topImage)}" alt="">` : ''}<strong>${escapeHtml(top.name)}</strong> · ${top.count} veces</div>`
        : 'Aún no hay productos agregados.';

    const perHour = list => {
        const hours = Array(24).fill(0);

        list.forEach(item => (hours[new Date(item.created_at).getHours()] += item.quantity));

        return hours;
    };

    const labels = Array.from({ length: 24 }, (_, hour) => `${hour}h`);

    $('cartHourChart').innerHTML = barsSvg(perHour(carts), labels);
    $('whatsappHourChart').innerHTML = barsSvg(perHour(clicks), labels, '#4c8f69');
    $('interactionChart').innerHTML = pieChart([
        { label: 'Agregar al carrito', value: carts.length, color: '#8f5369' },
        { label: 'Pedir por WhatsApp', value: clicks.length, color: '#4c8f69' }
    ]);

    const recent = events.slice(0, 100);

    say($('analyticsHistorySummary'), `Últimos ${recent.length} de ${events.length} registros.`);
    $('analyticsHistory').innerHTML = recent.map(item => `
        <tr>
        <td>${escapeHtml(formatDate(item.created_at))}</td>
        <td>${item.event_type === 'whatsapp_click' ? 'Clic en WhatsApp' : 'Agregó al carrito'}</td>
        <td>${escapeHtml(item.product_name || '—')}</td>
        <td>${item.quantity}</td>
        </tr>`).join('');
    }

    $('openAnalytics').addEventListener('click', async () => {
    $('adminAnalytics').showModal();
    say($('analyticsStatus'), 'Cargando actividad…');
    $('analyticsContent').hidden = true;

    try {
        events = (await call('analytics.list')).events;
        renderAnalytics();
        $('analyticsContent').hidden = false;
        say($('analyticsStatus'), 'Actividad de la tienda.');
    } catch (error) {
        say($('analyticsStatus'), error.message, true);
    }
    });

    $('closeAnalytics').addEventListener('click', () => $('adminAnalytics').close());

  // ==========================================
  // INICIO
  // ==========================================

    async function start() {
    resetProductForm();

    if (!token) {
        showLogin();
        return;
    }

    try {
        await api('session');
        showAdmin();
        await loadProducts();
    } catch {
        signOut();
    }
    }

    start();
})();