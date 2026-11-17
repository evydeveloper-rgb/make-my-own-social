// Hands the page the Supabase address + public (anon) key when they're set in
// the host's settings (SUPABASE_URL / SUPABASE_ANON_KEY) instead of config.js.
// Both are public by design; row-level security protects the data.
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  }));
};
