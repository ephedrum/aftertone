const { getStore } = require('@netlify/blobs');

// Minimal schema validation
function validateItem(item) {
  const errors = [];
  if (!item.id || typeof item.id !== 'string') errors.push('id is required string');
  if (!item.make) errors.push('make is required');
  if (!item.model) errors.push('model is required');
  if (item.year && typeof item.year !== 'number') errors.push('year must be number');
  if (item.status && !['Available', 'On Hold', 'Sold', 'Draft'].includes(item.status)) {
    errors.push('status must be Available | On Hold | Sold | Draft');
  }
  return errors;
}

function normalizeId(str = '') {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const store = getStore({ name: 'inventory' });
const KEY = 'inventory.json';

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method === 'OPTIONS') return { statusCode: 200, headers: corsHeaders() };

  if (method === 'GET') return handleGet(event);
  if (method === 'POST') return handlePost(event);
  return resp(405, { error: 'Method not allowed' });
};

async function handleGet(event) {
  const isAuthed = Boolean(event.clientContext?.identity?.token);
  const includeDrafts = isAuthed && event.queryStringParameters?.includeDrafts === '1';
  try {
    const raw = await store.get(KEY, { type: 'text' });
    if (!raw) return resp(200, [], { 'Cache-Control': 'no-cache' });
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [];
    const filtered = includeDrafts ? list : list.filter((i) => i.status !== 'Draft');
    return resp(200, filtered, { 'Cache-Control': 'no-cache' });
  } catch (err) {
    return resp(500, { error: 'Failed to read inventory', detail: err.message });
  }
}

async function handlePost(event) {
  const isAuthed = Boolean(event.clientContext?.identity?.token);
  if (!isAuthed) return resp(401, { error: 'Unauthorized' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return resp(400, { error: 'Invalid JSON' });
  }

  let incoming = [];
  if (Array.isArray(payload)) incoming = payload;
  else if (Array.isArray(payload.items)) incoming = payload.items;
  else if (payload.item) incoming = [payload.item];
  else return resp(400, { error: 'Body must be array, {items:[]}, or {item:{}}' });

  // Normalize IDs and validate
  incoming = incoming.map((item) => ({
    ...item,
    id: item.id ? normalizeId(item.id) : normalizeId(`${item.make}-${item.model}-${item.year || ''}`),
  }));

  const validationErrors = incoming.flatMap((item, idx) =>
    validateItem(item).map((msg) => `item ${idx}: ${msg}`)
  );
  if (validationErrors.length) return resp(400, { error: 'Validation failed', details: validationErrors });

  // Load existing
  let existing = [];
  try {
    const raw = await store.get(KEY, { type: 'text' });
    existing = raw ? JSON.parse(raw) : [];
  } catch {
    existing = [];
  }

  const map = new Map(existing.map((i) => [i.id, i]));
  incoming.forEach((item) => map.set(item.id, { ...map.get(item.id), ...item }));
  const merged = [...map.values()];

  try {
    await store.set(KEY, JSON.stringify(merged, null, 2), {
      contentType: 'application/json',
    });
    return resp(200, merged, { 'Cache-Control': 'no-cache' });
  } catch (err) {
    return resp(500, { error: 'Failed to write inventory', detail: err.message });
  }
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    ...extra,
  };
}

function resp(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: corsHeaders(extraHeaders),
    body: JSON.stringify(body),
  };
}
