// The public list of the owner's Instagram posts for the "all socials" tab.
// The Composio key the owner saved stays in the database: only this function
// (which runs with the service role) and the owner's own login can read it.
// Results are kept for 10 minutes so visitors don't use up Composio calls.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const API = 'https://backend.composio.dev/api/v3.1';
const USER = 'owner';
const KEEP_MS = 10 * 60 * 1000;

const reply = (items: unknown) =>
  new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json' } });

async function instagramPosts(key: string) {
  const headers = { 'x-api-key': key, 'Content-Type': 'application/json' };
  const list = await fetch(`${API}/connected_accounts?user_ids=${USER}&statuses=ACTIVE`, { headers });
  if (!list.ok) throw new Error('accounts ' + list.status);
  const account = ((await list.json()).items || [])
    .find((a: any) => a.status === 'ACTIVE' && a.toolkit?.slug === 'instagram');
  if (!account) return [];
  const r = await fetch(`${API}/tools/execute/INSTAGRAM_GET_IG_USER_MEDIA`, {
    method: 'POST', headers,
    body: JSON.stringify({
      connected_account_id: account.id, user_id: USER,
      arguments: {
        ig_user_id: 'me', limit: 25,
        fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
      },
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.successful) throw new Error('media ' + r.status);
  const d = j.data || {};
  const media = [d.data, d.response_data?.data, d.items].find(Array.isArray) || [];
  return media.filter((m: any) => m.permalink && m.timestamp).map((m: any) => ({
    id: m.id, source: 'instagram', caption: m.caption || '',
    imageUrl: m.media_type === 'VIDEO' ? m.thumbnail_url || null : m.media_url || null,
    url: m.permalink, created_at: new Date(m.timestamp).toISOString(),
    likeCount: m.like_count || 0, commentCount: m.comments_count || 0,
  }));
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: kept } = await sb.from('feed_cache').select('items, fetched_at').eq('id', 1).maybeSingle();
  if (kept && Date.now() - new Date(kept.fetched_at).getTime() < KEEP_MS) return reply(kept.items);
  const { data: secret } = await sb.from('site_secrets').select('value').eq('name', 'composio_key').maybeSingle();
  if (!secret) return reply([]);
  try {
    const items = await instagramPosts(secret.value);
    if (items.length) await sb.from('feed_cache').upsert({ id: 1, items, fetched_at: new Date().toISOString() });
    return reply(items);
  } catch (_) {
    return reply(kept ? kept.items : []);
  }
});
