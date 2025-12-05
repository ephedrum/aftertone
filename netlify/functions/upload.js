const { getStore } = require('@netlify/blobs');

// Placeholder: if you wire Large Media uploads via Git LFS or direct bucket,
// adjust this function to generate the final URL. For now, it stores a
// temporary mapping of filename -> URL in blobs to help the admin UI demo.
const store = getStore({ name: 'inventory' });
const KEY = 'uploads.json';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders() };
  const isAuthed = Boolean(event.clientContext?.identity?.token);
  if (!isAuthed) return resp(401, { error: 'Unauthorized' });
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Invalid JSON' }); }
  const { filename, url } = body;
  if (!filename || !url) return resp(400, { error: 'filename and url required' });

  let uploads = {};
  try {
    const raw = await store.get(KEY, { type: 'text' });
    uploads = raw ? JSON.parse(raw) : {};
  } catch { uploads = {}; }

  uploads[filename] = url;
  await store.set(KEY, JSON.stringify(uploads, null, 2), { contentType: 'application/json' });
  return resp(200, { ok: true, url });
};

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    ...extra,
  };
}
function resp(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: corsHeaders(extraHeaders), body: JSON.stringify(body) };
}
