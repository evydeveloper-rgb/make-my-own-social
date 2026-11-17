// The web-app manifest, built per visitor so the installed app gets the icon
// and colours they picked. Chrome only installs from a manifest served by the
// site itself (a generated data: manifest is ignored), hence this endpoint.
// Icon PNGs come from icons/choices/<id>-192|512.png (tools/make-icons.py makes
// them); a choice with no PNG falls back to the default icon.
const fs = require('fs');
const path = require('path');
const C = require('../config.js');

const PREMADE = ['blush', 'cream', 'sage', 'sky', 'night'];
const THEMES = { blush: '#fbf7f4', sage: '#f5f7f2', sky: '#f4f7fb', lilac: '#f8f6fc', night: '#131115' };
const PICS = /^selfies\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/;

module.exports = (req, res) => {
  const q = req.query || {};
  const ids = [
    ...(C.selfies || []).map((_, i) => 'selfie-' + i),
    ...(C.iconPhotos || []).map((_, i) => 'photo-' + i),
    ...PREMADE,
  ];
  let icon = ids.includes(q.icon) ? q.icon : 'selfie-0';
  const has = (id) => fs.existsSync(path.join(__dirname, '..', 'icons', 'choices', `${id}-512.png`));
  const icons = has(icon)
    ? [`/icons/choices/${icon}-192.png`, `/icons/choices/${icon}-512.png`]
    : ['/icons/icon-192.png', '/icons/icon-512.png'];

  const t = Object.prototype.hasOwnProperty.call(THEMES, q.t) ? q.t : 'blush';
  const start = new URLSearchParams({ t });
  if (typeof q.pic === 'string' && PICS.test(q.pic)) start.set('pic', q.pic);

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    id: '/',
    name: `${C.handle}’s social`,
    short_name: C.handle,
    start_url: '/?' + start,
    scope: '/',
    display: 'standalone',
    background_color: THEMES[t],
    theme_color: THEMES[t],
    icons: [
      { src: icons[0], sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icons[1], sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }));
};
