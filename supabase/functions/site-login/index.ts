// "Log in with your own social", the receiving half. A visitor's own site
// handed them a one-time code; we ask that site to confirm it, then sign the
// visitor in here as "<name> from <their site>". No password, no new account.
//
// SITE_ORIGIN must be THIS social's address: codes are only accepted if they
// were made for it, so a code someone approved for another site can't be
// replayed here.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Set with: supabase secrets set SITE_ORIGIN=https://your-social.vercel.app
const SITE_ORIGIN = Deno.env.get('SITE_ORIGIN') || '';
const ALLOWED_ORIGINS = [SITE_ORIGIN];

const json = (body: unknown, status: number, origin: string) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    },
  });

Deno.serve(async (req) => {
  const reqOrigin = req.headers.get('origin') || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : SITE_ORIGIN;
  if (req.method === 'OPTIONS') return json({}, 204, corsOrigin);
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, corsOrigin);

  let site: URL, code: string;
  try {
    const body = await req.json();
    site = new URL(String(body.site));
    code = String(body.code || '');
  } catch {
    return json({ error: 'bad request' }, 400, corsOrigin);
  }
  const host = site.hostname.toLowerCase();
  const looksPrivate = site.protocol !== 'https:' || site.port !== '' || !host.includes('.')
    || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost';
  if (looksPrivate || !/^[a-f0-9]{48}$/.test(code)) return json({ error: 'That doesn’t look like a social site address.' }, 400, corsOrigin);

  // Ask their site to vouch.
  let vouch: { ok?: boolean; name?: string };
  try {
    const r = await fetch(`https://${host}/api/connect-check?code=${code}&aud=${encodeURIComponent(SITE_ORIGIN)}`, {
      redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    vouch = await r.json();
  } catch {
    return json({ error: 'Couldn’t reach your site to check.' }, 502, corsOrigin);
  }
  if (!vouch.ok) return json({ error: 'Your site didn’t confirm this login. Try again.' }, 401, corsOrigin);

  const name = String(vouch.name || host).trim().slice(0, 60) || host;
  const siteUrl = `https://${host}`;
  const email = `${host}@site-login.invalid`;   // identity = the site, not an inbox

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const created = await admin.auth.admin.createUser({
    email, email_confirm: true,
    user_metadata: { display_name: name },
    app_metadata: { site_url: siteUrl },
  });
  if (created.error && !/already/i.test(created.error.message)) return json({ error: created.error.message }, 500, corsOrigin);

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) return json({ error: 'Couldn’t start the session.' }, 500, corsOrigin);

  // Keep the name in step with what their site says now.
  await admin.from('profiles').update({ display_name: name, site_url: siteUrl }).eq('id', link.data.user.id);

  return json({ token_hash: link.data.properties.hashed_token, name, site: siteUrl }, 200, corsOrigin);
});
