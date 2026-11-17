// "Log in with your own social", the vouching half. Another site asks:
// "did your owner just approve logging in to me, with this code?" The code is
// single use, two minutes old at most, and only valid for the site it was
// made for (aud), so it can't be replayed somewhere else.
const C = require('../config.js');
const SB_URL = C.supabaseUrl || process.env.SUPABASE_URL;
const SB_KEY = C.supabaseAnonKey || process.env.SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const { code, aud } = req.query || {};
  if (typeof code !== 'string' || typeof aud !== 'string' || code.length > 100 || aud.length > 200) {
    res.statusCode = 400; return res.end(JSON.stringify({ ok: false }));
  }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/consume_connect_code`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code, p_aud: aud }),
    });
    const j = r.ok ? await r.json() : { ok: false };
    if (!j.ok) { res.statusCode = 401; return res.end(JSON.stringify({ ok: false })); }
    const origin = 'https://' + req.headers.host;
    res.end(JSON.stringify({ ok: true, name: j.name || C.ownerName, url: origin, avatar: new URL(C.ownerPhoto, origin + '/').href }));
  } catch (_) {
    res.statusCode = 502; res.end(JSON.stringify({ ok: false }));
  }
};
