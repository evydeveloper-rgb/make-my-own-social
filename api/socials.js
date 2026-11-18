// Connected accounts, through Composio. The owner pastes their key in the app
// and it is kept in the database, out of reach of visitors (COMPOSIO_API_KEY in
// Vercel also works). Reading the public feed is open to anyone; everything
// else needs the site owner's login.
const crypto = require('crypto');
const C = require('../config.js');
const SB_URL = C.supabaseUrl || process.env.SUPABASE_URL;
const SB_KEY = C.supabaseAnonKey || process.env.SUPABASE_ANON_KEY;
const HOST_KEY = process.env.COMPOSIO_API_KEY;
let KEY = HOST_KEY;
const API = 'https://backend.composio.dev/api/v3.1';
const USER = 'owner';                       // one owner per site
const PLATFORMS = ['instagram', 'linkedin'];

class HttpError extends Error { constructor(status, msg, upstream) { super(msg); this.status = status; this.upstream = upstream; } }

async function composio(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, (j.error && j.error.message) || `Composio said ${r.status}`, r.status);
  return j;
}

// platform -> connected account id, for accounts that are ready to use
async function accounts() {
  const j = await composio(`/connected_accounts?user_ids=${USER}&statuses=ACTIVE`);
  const out = {};
  for (const a of j.items || []) {
    const slug = a.toolkit && a.toolkit.slug;
    if (a.status === 'ACTIVE' && PLATFORMS.includes(slug) && !out[slug]) out[slug] = a.id;
  }
  return out;
}

async function run(tool, accountId, args) {
  const j = await composio(`/tools/execute/${tool}`, {
    method: 'POST', body: JSON.stringify({ connected_account_id: accountId, user_id: USER, arguments: args }),
  });
  if (!j.successful) throw new HttpError(502, j.error || `${tool} failed`);
  return j.data || {};
}

// Tool results sometimes wrap the useful object one level down.
const inner = (d) => d.response_data || d.data || d;
const pick = (d, ...names) => { for (const o of [d, inner(d)]) for (const n of names) if (o && o[n]) return o[n]; return null; };

async function owner(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, 'Log in first.');
  const h = { apikey: SB_KEY, Authorization: 'Bearer ' + token };
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) throw new HttpError(401, 'Log in first.');
  const { id } = await u.json();
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=is_owner`, { headers: h });
  const rows = p.ok ? await p.json() : [];
  if (!rows[0] || !rows[0].is_owner) throw new HttpError(403, 'Only the owner can do this.');
  return h;
}

// Runs in the database's edge function, which can read the saved key.
async function feed() {
  const r = await fetch(`${SB_URL}/functions/v1/socials-feed`, { method: 'POST', headers: { Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY } });
  if (!r.ok) throw new Error('feed ' + r.status);
  return (await r.json()).items || [];
}

async function rpc(h, name, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
  if (!r.ok) throw new HttpError(502, 'Could not reach the database.');
  return r.status === 204 ? null : r.json();
}

async function saveKey(h, key) {
  if (key === '') return rpc(h, 'set_composio_key', { p_key: '' });
  if (typeof key !== 'string' || !/^[\w-]{10,200}$/.test(key)) throw new HttpError(400, 'That doesn’t look like a Composio key.');
  // Composio hands out several kinds of key; only a project key works here.
  if (/^(ck|uak|oak)_/.test(key)) throw new HttpError(400, `That’s a different kind of Composio key (it starts with ${key.split('_')[0]}_). You need the project key that starts with ak_.`);
  KEY = key;
  try { await composio(`/connected_accounts?user_ids=${USER}`); }
  catch (err) {
    throw new HttpError(400, err.upstream === 401 || err.upstream === 403
      ? 'Composio didn’t accept that key. Copy the project key again. It starts with ak_.'
      : 'Couldn’t reach Composio just now. Try again in a minute.');
  }
  return rpc(h, 'set_composio_key', { p_key: key });
}

async function connect(platform, origin) {
  const found = await composio(`/auth_configs?toolkit_slug=${platform}&is_composio_managed=true`);
  let cfg = (found.items || []).find(a => a.status !== 'DISABLED');
  if (!cfg) {
    const made = await composio('/auth_configs', { method: 'POST', body: JSON.stringify({
      toolkit: { slug: platform }, auth_config: { type: 'use_composio_managed_auth' } }) });
    cfg = made.auth_config;
  }
  const link = await composio('/connected_accounts/link', { method: 'POST', body: JSON.stringify({
    auth_config_id: cfg.id, user_id: USER, callback_url: `${origin}/?connected=${platform}` }) });
  return link.redirect_url;
}

async function toInstagram(accountId, post, imageUrl) {
  if (!imageUrl) throw new Error('Instagram needs a photo.');
  const info = await run('INSTAGRAM_GET_USER_INFO', accountId, { ig_user_id: 'me', fields: 'id' });
  const igId = pick(info, 'id', 'user_id');
  const box = await run('INSTAGRAM_POST_IG_USER_MEDIA', accountId, { ig_user_id: igId, image_url: imageUrl, caption: post.caption || '' });
  const done = await run('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', accountId, { ig_user_id: igId, creation_id: pick(box, 'id') });
  return String(pick(done, 'id') || 'posted');
}

// Hands the photo to Composio so its LinkedIn tool can attach it.
async function uploadForLinkedIn(imageUrl) {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error('Could not read the photo.');
  const bytes = Buffer.from(await img.arrayBuffer());
  const slot = await composio('/files/upload/request', { method: 'POST', body: JSON.stringify({
    toolkit_slug: 'linkedin', tool_slug: 'LINKEDIN_CREATE_LINKED_IN_POST', filename: 'photo.jpg', mimetype: 'image/jpeg',
    md5: crypto.createHash('md5').update(bytes).digest('hex') }) });
  const azure = slot.metadata && slot.metadata.storage_backend === 'azure_blob_storage';
  const put = await fetch(slot.new_presigned_url, { method: 'PUT', body: bytes,
    headers: { 'Content-Type': 'image/jpeg', ...(azure ? { 'x-ms-blob-type': 'BlockBlob' } : {}) } });
  if (!put.ok) throw new Error('Could not upload the photo.');
  return { name: 'photo.jpg', mimetype: 'image/jpeg', s3key: slot.key };
}

async function toLinkedIn(accountId, post, imageUrl) {
  const who = await run('LINKEDIN_GET_MY_INFO', accountId, {});
  const id = pick(who, 'sub', 'id', 'person_id');
  if (!id) throw new Error('Could not find your LinkedIn profile.');
  const args = { author: String(id).startsWith('urn:') ? id : `urn:li:person:${id}`, commentary: post.caption || ' ', visibility: 'PUBLIC', lifecycleState: 'PUBLISHED' };
  if (imageUrl) args.images = [await uploadForLinkedIn(imageUrl)];
  const done = await run('LINKEDIN_CREATE_LINKED_IN_POST', accountId, args);
  return String(pick(done, 'id', 'x_restli_id', 'share_id') || 'posted');
}

async function share(h, body, origin) {
  const targets = (Array.isArray(body.targets) ? body.targets : []).filter(t => PLATFORMS.includes(t));
  const q = `${SB_URL}/rest/v1/posts?id=eq.${encodeURIComponent(String(body.postId))}`;
  const r = await fetch(`${q}&select=caption,image_path,shared_to`, { headers: h });
  const post = (r.ok ? await r.json() : [])[0];
  if (!post) throw new HttpError(404, 'Post not found.');

  let imageUrl = null;
  if (post.image_path && post.image_path.startsWith('posts/')) imageUrl = `${origin}/${post.image_path}`;
  else if (post.image_path) {
    const s = await fetch(`${SB_URL}/storage/v1/object/sign/media/${post.image_path}`, {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) });
    if (s.ok) imageUrl = `${SB_URL}/storage/v1${(await s.json()).signedURL}`;
  }

  const acc = await accounts();
  const shared = { ...(post.shared_to || {}) };
  const results = {};
  for (const t of targets) {
    if (shared[t]) { results[t] = { ok: true }; continue; }     // never post the same thing twice
    try {
      if (!acc[t]) throw new Error('Not connected.');
      shared[t] = await (t === 'instagram' ? toInstagram : toLinkedIn)(acc[t], post, imageUrl);
      results[t] = { ok: true };
    } catch (err) { results[t] = { ok: false, error: String(err.message).slice(0, 200) }; }
  }
  await fetch(q, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ shared_to: shared }) });
  return { results, shared_to: shared };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  const action = (req.query || {}).action;
  const origin = 'https://' + req.headers.host;

  if (action === 'feed') {
    try {
      const items = await feed();
      res.setHeader('Cache-Control', items.length ? 'public, s-maxage=300, stale-while-revalidate=900' : 'public, s-maxage=60');
      return send(200, { items });
    } catch (_) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return send(200, { items: [] });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  try {
    const h = await owner(req);
    KEY = HOST_KEY || await rpc(h, 'composio_key');
    if (action === 'status') {
      if (!KEY) return send(200, { configured: false, accounts: {} });
      try {
        const acc = await accounts();
        return send(200, { configured: true, fromHost: !!HOST_KEY, accounts: Object.fromEntries(PLATFORMS.map(p => [p, !!acc[p]])) });
      } catch (_) { return send(200, { configured: false, keyProblem: true, accounts: {} }); }
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
    const body = req.body || {};
    if (action === 'key') { await saveKey(h, body.key); return send(200, { ok: true }); }
    if (!KEY) throw new HttpError(400, 'Add your Composio key first.');
    if (action === 'post') return send(200, await share(h, body, origin));
    if (!PLATFORMS.includes(body.platform)) throw new HttpError(400, 'Unknown account.');
    if (action === 'connect') return send(200, { url: await connect(body.platform, origin) });
    if (action === 'disconnect') {
      const acc = await accounts();
      if (acc[body.platform]) await composio(`/connected_accounts/${acc[body.platform]}`, { method: 'DELETE' });
      return send(200, { ok: true });
    }
    throw new HttpError(404, 'Unknown action.');
  } catch (err) {
    return send(err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
};
