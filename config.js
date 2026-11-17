// Everything you'd want to edit without touching the app code lives here.
// (Read by the page and by the /api functions, hence the wrapper.)
(function (c) { if (typeof module !== 'undefined' && module.exports) module.exports = c; else window.SOCIAL_CONFIG = c; })({
  ownerName: 'Your Name',
  handle: 'me',                     // short, lowercase: shows as "me's social" and under the home-screen icon
  ownerPhoto: 'selfies/me-1.jpg',
  bio: 'One line about you.',
  // First screen of the intro, under "hi, this is <handle>'s social."
  intro: 'I got tired of the big apps, so I made my own. Daily life and work in one place, and the people closest to me can follow along and comment.',
  // Text on the coloured home-screen icon choices ('' = a plain dot).
  iconText: '',

  // Pictures visitors can pick from (banner + icon). Put them in /selfies.
  selfies: [
    'selfies/me-1.jpg',
  ],
  // Extra pictures offered only as home-screen icons (square crops look best).
  iconPhotos: [],

  // Leave empty and set SUPABASE_URL / SUPABASE_ANON_KEY in Vercel instead,
  // or paste them here. Empty everywhere = demo mode (saved in the browser only).
  supabaseUrl: '',
  supabaseAnonKey: '',

  // The "work" tab. Edit freely.
  work: {
    headline: 'What you do',
    location: 'Where you are',
    about: 'A few sentences about your work.',
    experience: [
      { role: 'Your role', org: 'Where', when: '2026 – now', note: 'One line about it.' },
    ],
    links: [],
  },
});
