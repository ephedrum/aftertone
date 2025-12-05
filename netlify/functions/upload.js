const { getStore } = require('@netlify/blobs');
const { createRemoteJWKSet, jwtVerify } = require('jose');

// Placeholder: wire Large Media uploads by returning a final URL after upload.
const store = getStore({ name: 'inventory' });
const KEY = 'uploads.json';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const ISSUER = AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}/` : null;
const JWKS = ISSUER ? createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`)) : null;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders() };
  try { await verifyAuth(event.headers.authorization, 'inventory:write'); }
  catch (err) { return resp(err.status || 401, { error: err.message || 'Unauthorized' }); }
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

async function verifyAuth(authHeader, scopeNeeded) {
  if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
    const err = new Error('Auth not configured');
    err.status = 500;
    throw err;
  }
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const token = authHeader.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUTH0_AUDIENCE,
    });
    if (scopeNeeded) {
      const scopes = (payload.scope || '').split(' ');
      if (!scopes.includes(scopeNeeded)) {
        const err = new Error('Forbidden: missing scope');
        err.status = 403;
        throw err;
      }
    }
    return payload;
  } catch (err) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
}
