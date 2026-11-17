// /social.json — this site's public "business card". Other people's socials
// read it to show a card for this person in their People tab. Only posts
// marked "everyone" are listed; close-friends posts never leave the site.
const C = require('../config.js');
const SB_URL = C.supabaseUrl || process.env.SUPABASE_URL;
const SB_KEY = C.supabaseAnonKey || process.env.SUPABASE_ANON_KEY;

const SECTION_LABELS = { daily: 'Daily life', ai: 'AI', acting: 'Acting', work: 'Work' };

module.exports = async (req, res) => {
  const origin = 'https://' + req.headers.host;
  const abs = (p) => new URL(p, origin + '/').href;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const card = {
    version: 1,
    name: C.ownerName,
    url: origin,
    avatar: abs(C.ownerPhoto),
    bio: C.bio,
    sections: Object.values(SECTION_LABELS),
    latest: [],
  };

  try {
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const r = await fetch(`${SB_URL}/rest/v1/posts?select=section,caption,image_path,created_at&visibility=eq.everyone&order=created_at.desc&limit=9`, { headers: h });
    const posts = r.ok ? await r.json() : [];
    for (const p of posts) {
      let photo = null;
      if (p.image_path && p.image_path.startsWith('posts/')) photo = abs(p.image_path);
      else if (p.image_path) {
        const s = await fetch(`${SB_URL}/storage/v1/object/sign/media/${p.image_path}`, {
          method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
        });
        if (s.ok) photo = SB_URL + '/storage/v1' + (await s.json()).signedURL;
      }
      card.latest.push({ section: SECTION_LABELS[p.section] || p.section, caption: (p.caption || '').slice(0, 280), photo, date: p.created_at });
    }
  } catch (_) { /* still hand out the card without posts */ }

  res.end(JSON.stringify(card, null, 2));
};
