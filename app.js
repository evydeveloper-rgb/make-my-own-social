(() => {
  'use strict';

  const C = window.SOCIAL_CONFIG;
  const $ = (id) => document.getElementById(id);
  let LIVE = Boolean(C.supabaseUrl && C.supabaseAnonKey);

  const SECTIONS = [
    { id: 'daily', label: 'Daily life' },
    { id: 'ai', label: 'AI' },
    { id: 'acting', label: 'Acting' },
    { id: 'work', label: 'Work' },
  ];
  const GRID_SECTIONS = ['daily', 'ai', 'acting'];
  const THEMES = [
    { id: 'blush', name: 'Blush', sw: ['#fbf7f4', '#f7e0d9', '#c4513f'] },
    { id: 'sage', name: 'Sage', sw: ['#f5f7f2', '#dde9db', '#4f7a55'] },
    { id: 'sky', name: 'Sky', sw: ['#f4f7fb', '#dbe7f6', '#2f6db5'] },
    { id: 'lilac', name: 'Lilac', sw: ['#f8f6fc', '#e8defa', '#7a52c7'] },
    { id: 'night', name: 'Night', sw: ['#131115', '#3d2b29', '#f08a76'] },
  ];
  const sectionLabel = (id) => (SECTIONS.find(s => s.id === id) || {}).label || id;

  // ---------- tiny helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  };
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function dayLabel(iso) {
    const d = new Date(iso), t = new Date();
    const y = new Date(); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

  // Shrink a picked photo before it goes anywhere. Phones hand over 5–12MB files.
  function shrinkImage(file, max = 1440, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Could not read that image.')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }
  const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  function squareIcon(src, size = 180) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        try { resolve(c.toDataURL('image/png')); } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // =====================================================================
  //  DATA — two backends with the same shape: demo (this browser) and live (Supabase)
  // =====================================================================
  const demo = {
    key: 'es-demo-v1',
    load() {
      let d = store.get(this.key, null);
      if (!d) { d = this.seed(); store.set(this.key, d); }
      return d;
    },
    save(d) {
      if (!store.set(this.key, d)) throw new Error('This browser is out of space for demo data. Try a smaller photo.');
    },
    seed() {
      const h = (n) => new Date(Date.now() - n * 3600e3).toISOString();
      const p = (section, visibility, caption, image, hoursAgo) => ({ id: uid(), section, visibility, caption, image, created_at: h(hoursAgo) });
      return {
        users: [{ id: 'demo-friend', name: 'Sample friend', email: 'friend@example.com', created_at: h(200) }],
        me: null, owner: false,
        posts: [
          p('daily', 'everyone', 'Sample post — this is what a photo in “Daily life” looks like. Replace it with your own.', C.selfies[2] || C.ownerPhoto, 3),
          p('ai', 'everyone', 'Sample post — text-only posts show up as cards in the grid. Good for quick AI thoughts.', null, 20),
          p('acting', 'everyone', 'Sample post — headshots, set photos, audition notes go in “Acting”.', C.selfies[1] || C.ownerPhoto, 50),
          p('daily', 'everyone', 'Sample post — another daily one.', C.selfies[0] || C.ownerPhoto, 80),
          p('work', 'everyone', 'Sample work update — longer posts read like a LinkedIn update here. Shipped a thing, learned a thing, hiring, etc.', null, 30),
        ],
        comments: [], likes: [],
      };
    },
    session() {
      const d = this.load();
      if (d.owner) return { id: 'owner', name: C.ownerName, isOwner: true };
      const u = d.users.find(x => x.id === d.me);
      return u ? { id: u.id, name: u.name, email: u.email, isOwner: false } : null;
    },
    async signUp(name, email) {
      const d = this.load();
      if (d.users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('That email already has an account — log in instead.');
      const u = { id: uid(), name, email, created_at: new Date().toISOString() };
      d.users.push(u); d.me = u.id; d.owner = false; this.save(d);
    },
    async signIn(email) {
      const d = this.load();
      const u = d.users.find(x => x.email.toLowerCase() === email.toLowerCase());
      if (!u) throw new Error('No account with that email.');
      d.me = u.id; d.owner = false; this.save(d);
    },
    async signOut() { const d = this.load(); d.me = null; d.owner = false; this.save(d); },
    setOwnerPreview(on) { const d = this.load(); d.owner = on; this.save(d); },
    async posts() {
      const d = this.load(), me = this.session();
      return d.posts
        .filter(p => p.visibility === 'everyone')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(p => ({
          ...p, imageUrl: p.image,
          likeCount: d.likes.filter(l => l.post_id === p.id).length,
          commentCount: d.comments.filter(c => c.post_id === p.id).length,
          liked: !!me && d.likes.some(l => l.post_id === p.id && l.user_id === me.id),
        }));
    },
    async memberCount() { return this.load().users.length; },
    async createPost({ section, visibility, caption, blob }) {
      const d = this.load();
      const image = blob ? await blobToDataUrl(await shrinkImage(blob, 1080, 0.78)) : null;
      const id = uid();
      d.posts.push({ id, section, visibility, caption, image, created_at: new Date().toISOString() });
      this.save(d);
      return id;
    },
    async deletePost(id) {
      const d = this.load();
      d.posts = d.posts.filter(p => p.id !== id);
      d.comments = d.comments.filter(c => c.post_id !== id);
      d.likes = d.likes.filter(l => l.post_id !== id);
      this.save(d);
    },
    async comments(postId) {
      const d = this.load();
      return d.comments.filter(c => c.post_id === postId).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async addComment(postId, body) {
      const d = this.load(), me = this.session();
      d.comments.push({ id: uid(), post_id: postId, user_id: me.id, name: me.name, body, created_at: new Date().toISOString() });
      this.save(d);
    },
    async deleteComment(id) { const d = this.load(); d.comments = d.comments.filter(c => c.id !== id); this.save(d); },
    async toggleLike(postId, on) {
      const d = this.load(), me = this.session();
      d.likes = d.likes.filter(l => !(l.post_id === postId && l.user_id === me.id));
      if (on) d.likes.push({ post_id: postId, user_id: me.id });
      this.save(d);
    },
    async members() {
      return this.load().users.map(u => ({ id: u.id, name: u.name, email: u.email }));
    },
    async banner() { return this.load().banner || null; },
    async setBanner(banner) { const d = this.load(); d.banner = banner; this.save(d); },
    async linkedinPosts() { return this.load().linkedin || []; },
    async addLinkedin(urn, posted_at) {
      const d = this.load(); d.linkedin = d.linkedin || [];
      if (d.linkedin.some(x => x.urn === urn)) throw new Error('duplicate');
      d.linkedin.push({ id: uid(), urn, posted_at }); this.save(d);
    },
    async removeLinkedin(id) { const d = this.load(); d.linkedin = (d.linkedin || []).filter(x => x.id !== id); this.save(d); },
    async people() { return this.load().people || []; },
    async addPerson(url) { const d = this.load(); d.people = [...new Set([...(d.people || []), url])]; this.save(d); },
    async removePerson(url) { const d = this.load(); d.people = (d.people || []).filter(u => u !== url); this.save(d); },
    async siteLogin() { throw new Error('Logging in with your own social works once this site is live.'); },
    async connectCode() { throw new Error('Not available in demo mode.'); },
  };

  const live = {
    sb: null, me: null,
    async init() {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
        s.onload = resolve; s.onerror = () => reject(new Error('Could not load Supabase.'));
        document.head.append(s);
      });
      this.sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
      await this.refreshMe();
    },
    async refreshMe() {
      const { data: { session } } = await this.sb.auth.getSession();
      if (!session) { this.me = null; return; }
      const { data: prof } = await this.sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      this.me = {
        id: session.user.id, email: session.user.email,
        name: (prof && prof.display_name) || session.user.email,
        site: (prof && prof.site_url) || null,
        isOwner: !!(prof && prof.is_owner),
      };
    },
    session() { return this.me; },
    async token() { const { data: { session } } = await this.sb.auth.getSession(); return session ? session.access_token : ''; },
    async signUp(name, email, password) {
      const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: new URL('./', location.href).href } });
      if (error) throw error;
      if (!data.session) throw new Error('Check your email to confirm your account, then log in.');
      await this.refreshMe();
    },
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await this.refreshMe();
    },
    async signOut() { await this.sb.auth.signOut(); this.me = null; },
    async posts() {
      const { data, error } = await this.sb.from('posts')
        .select('id, section, visibility, caption, image_path, shared_to, created_at, likes(count), comments(count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // "posts/..." are photos shipped with the site itself; the rest live in storage.
      const bundled = (path) => path.startsWith('posts/');
      const paths = data.filter(p => p.image_path && !bundled(p.image_path)).map(p => p.image_path);
      const urls = {};
      if (paths.length) {
        const { data: signed } = await this.sb.storage.from('media').createSignedUrls(paths, 60 * 60 * 6);
        (signed || []).forEach(s => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
      }
      let mine = new Set();
      if (this.me) {
        const { data: l } = await this.sb.from('likes').select('post_id').eq('user_id', this.me.id);
        mine = new Set((l || []).map(x => x.post_id));
      }
      return data.map(p => ({
        ...p, imageUrl: !p.image_path ? null : bundled(p.image_path) ? p.image_path : urls[p.image_path],
        likeCount: (p.likes[0] || {}).count || 0,
        commentCount: (p.comments[0] || {}).count || 0,
        liked: mine.has(p.id),
      }));
    },
    async memberCount() {
      const { count } = await this.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_owner', false);
      return count || 0;
    },
    async createPost({ section, visibility, caption, blob }) {
      let image_path = null;
      if (blob) {
        const small = await shrinkImage(blob);
        image_path = `${visibility}/${uid()}.jpg`;
        const { error } = await this.sb.storage.from('media').upload(image_path, small, { contentType: 'image/jpeg' });
        if (error) throw error;
      }
      const { data, error } = await this.sb.from('posts').insert({ section, visibility, caption, image_path }).select('id').single();
      if (error) throw error;
      return data.id;
    },
    async deletePost(id) {
      const { data } = await this.sb.from('posts').select('image_path').eq('id', id).maybeSingle();
      const { error } = await this.sb.from('posts').delete().eq('id', id);
      if (error) throw error;
      if (data && data.image_path && !data.image_path.startsWith('posts/')) await this.sb.storage.from('media').remove([data.image_path]);
    },
    async comments(postId) {
      const { data, error } = await this.sb.from('comments')
        .select('id, body, created_at, user_id, profiles(display_name, site_url)')
        .eq('post_id', postId).order('created_at');
      if (error) throw error;
      return data.map(c => ({ ...c, name: (c.profiles && c.profiles.display_name) || 'someone', site: c.profiles && c.profiles.site_url }));
    },
    async addComment(postId, body) {
      const { error } = await this.sb.from('comments').insert({ post_id: postId, body });
      if (error) throw error;
    },
    async deleteComment(id) {
      const { error } = await this.sb.from('comments').delete().eq('id', id);
      if (error) throw error;
    },
    async toggleLike(postId, on) {
      const q = on
        ? this.sb.from('likes').insert({ post_id: postId })
        : this.sb.from('likes').delete().eq('post_id', postId).eq('user_id', this.me.id);
      const { error } = await q;
      if (error) throw error;
    },
    async members() {
      const { data, error } = await this.sb.from('profiles').select('id, display_name, site_url, created_at').eq('is_owner', false).order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(p => ({ id: p.id, name: p.display_name, site: p.site_url }));
    },
    async banner() {
      const { data, error } = await this.sb.from('site_settings').select('banner').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data ? data.banner : null;
    },
    async setBanner(banner) {
      const { error } = await this.sb.from('site_settings').upsert({ id: 1, banner, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async linkedinPosts() {
      const { data, error } = await this.sb.from('linkedin_posts').select('id, urn, posted_at').order('posted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    async addLinkedin(urn, posted_at) {
      const { error } = await this.sb.from('linkedin_posts').insert({ urn, posted_at });
      if (error) throw new Error(error.code === '23505' ? 'duplicate' : error.message);
    },
    async removeLinkedin(id) {
      const { error } = await this.sb.from('linkedin_posts').delete().eq('id', id);
      if (error) throw error;
    },
    async people() {
      const { data, error } = await this.sb.from('people').select('url').order('added_at');
      if (error) throw error;
      return data.map(r => r.url);
    },
    async addPerson(url) {
      const { error } = await this.sb.from('people').insert({ url });
      if (error && !/duplicate/i.test(error.message)) throw error;
    },
    async removePerson(url) {
      const { error } = await this.sb.from('people').delete().eq('url', url);
      if (error) throw error;
    },
    // Visitor arrives back from their own site with a one-time code.
    async siteLogin(site, code) {
      const { data, error } = await this.sb.functions.invoke('site-login', { body: { site, code } });
      if (error) {
        let msg = 'Couldn’t log you in with your site.';
        try { msg = (await error.context.json()).error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const { error: e2 } = await this.sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
      if (e2) throw e2;
      await this.refreshMe();
    },
    // Our owner approves logging in to another social: make a code for it.
    async connectCode(aud) {
      const { data, error } = await this.sb.rpc('create_connect_code', { p_aud: aud });
      if (error) throw error;
      return data;
    },
  };

  let db = LIVE ? live : demo;

  // =====================================================================
  //  STATE
  // =====================================================================
  const state = { tab: 'all', source: 'all', section: 'all', posts: [], external: [], linkedin: [], peopleView: 'feed', openPost: null, authMode: 'signup', after: null };
  const me = () => db.session();

  // ---------- carrying choices onto the home screen ----------
  // On iPhone the home-screen app gets its own empty storage, so nothing saved
  // in Safari comes along. The look travels in the address the phone saves
  // instead (iPhone saves the current address, Android the manifest's
  // start_url), and the intro is skipped whenever we're running from the
  // home screen.
  const isHomeScreenApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function appUrl() {
    const q = new URLSearchParams({ t: store.get('es-theme', 'blush') });
    return new URL('./?' + q, location.href).href;
  }
  function syncAppUrl() {
    try { history.replaceState(null, '', appUrl()); } catch (_) {}
    // Android/Chrome: a real manifest from the site (see api/manifest.js). A
    // custom upload can't live on the server, so Android falls back to the
    // first selfie there; iPhone still gets the upload via apple-touch-icon.
    if (location.protocol === 'file:' || location.hostname === 'localhost') return;   // no /api locally
    const q = new URLSearchParams(location.search);
    q.set('icon', store.get('es-icon', 'selfie-0'));
    document.querySelector('link[rel="manifest"]').href = '/api/manifest?' + q;
  }
  function readChoicesFromUrl() {
    const q = new URLSearchParams(location.search);
    const t = q.get('t');
    if (t && THEMES.some(x => x.id === t)) store.set('es-theme', t);
  }

  // ---------- look ----------
  function applyTheme(id) {
    document.documentElement.dataset.theme = id;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]').setAttribute('content', bg || '#fbf7f4');
    store.set('es-theme', id);
    document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('on', b.dataset.t === id));
    syncAppUrl();
  }
  // The banner is the owner's choice and every visitor sees the same one.
  const DEFAULT_BANNER = C.selfies[2] || C.selfies[0] || C.ownerPhoto;
  function showBanner(src) {
    state.banner = src;
    $('cover-img').src = src; $('enter-cover').src = src; $('rail-cover').src = src;
    document.querySelectorAll('.pic-opt[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === src));
  }
  async function loadBanner() {
    try {
      const src = (await db.banner()) || DEFAULT_BANNER;
      showBanner(src); store.set('es-banner', src);
    } catch (_) { /* keep the banner already showing */ }
  }
  async function chooseBanner(src) {
    const before = state.banner;
    showBanner(src);
    try {
      await db.setBanner(src); store.set('es-banner', src);
      buildPicGrid($('pic-grid-2')); toast('Banner updated for everyone');
    } catch (err) { showBanner(before); toast('Couldn’t save the banner: ' + err.message); }
  }

  // ---------- home-screen icon ----------
  const PREMADE_ICONS = [
    { id: 'blush', bg: '#c4513f', fg: '#ffffff' },
    { id: 'cream', bg: '#fbf7f4', fg: '#c4513f' },
    { id: 'sage', bg: '#4f7a55', fg: '#ffffff' },
    { id: 'sky', bg: '#2f6db5', fg: '#ffffff' },
    { id: 'night', bg: '#131115', fg: '#f08a76' },
  ];
  const premadeSvg = (p) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${p.bg}"/>` +
    (C.iconText
      ? `<text x="256" y="316" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="190" font-weight="600" fill="${p.fg}">${C.iconText.replace(/[<&>"]/g, '')}</text></svg>`
      : `<circle cx="256" cy="256" r="92" fill="${p.fg}"/></svg>`));
  function iconChoices() {
    const own = store.get('es-icon-upload', null);
    return [
      ...C.selfies.map((src, i) => ({ id: 'selfie-' + i, src })),
      ...(C.iconPhotos || []).map((src, i) => ({ id: 'photo-' + i, src })),
      ...PREMADE_ICONS.map(p => ({ id: p.id, src: premadeSvg(p) })),
      ...(own ? [{ id: 'custom', src: own }] : []),
    ];
  }
  // iPhone reads apple-touch-icon and Android reads the manifest, both at the
  // moment the person taps "Add", so both are swapped in place here.
  async function applyIcon(id) {
    const choice = iconChoices().find(c => c.id === id) || iconChoices()[0];
    const small = await squareIcon(choice.src, 180);
    if (!small) return;
    store.set('es-icon', choice.id);
    $('icon-preview-img').src = small;
    $('touch-icon').href = small;
    syncAppUrl();
    document.querySelectorAll('.icon-grid .icon-opt').forEach(b => {
      const on = b.dataset.icon === choice.id;
      b.classList.toggle('selected', on); b.setAttribute('aria-checked', String(on));
    });
  }
  function buildIconGrid() {
    for (const grid of document.querySelectorAll('.icon-grid')) {
      grid.replaceChildren(...iconChoices().map(c => el('button', {
        type: 'button', class: 'icon-opt', role: 'radio', 'data-icon': c.id, 'aria-label': 'Icon ' + c.id, onclick: () => applyIcon(c.id),
      }, el('img', { src: c.src, alt: '' }))));
    }
    applyIcon(store.get('es-icon', 'selfie-0'));
  }
  document.querySelectorAll('.icon-file').forEach(input => input.addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const url = await blobToDataUrl(await shrinkImage(f, 512, 0.85));
      if (!store.set('es-icon-upload', url)) throw new Error('That picture is too big to save here.');
      store.set('es-icon', 'custom');
      buildIconGrid();
    } catch (err) { toast(err.message); }
  }));
  function buildThemeGrid(target) {
    target.replaceChildren(...THEMES.map(t => el('button', {
      type: 'button', class: 'theme-opt', 'data-t': t.id, onclick: () => applyTheme(t.id),
    }, el('span', { class: 'swatch' }, t.sw.map(c => el('i', { style: `background:${c}` }))), el('strong', { text: t.name }))));
  }
  function buildPicGrid(target) {
    const cur = state.banner;
    const srcs = [...C.selfies, ...(cur && !C.selfies.includes(cur) ? [cur] : [])];
    target.replaceChildren(
      ...srcs.map(src => el('button', { type: 'button', class: 'pic-opt' + (src === cur ? ' on' : ''), 'data-src': src, onclick: () => chooseBanner(src), 'aria-label': 'Use this picture' },
        el('img', { src, alt: '', loading: 'lazy' }))),
      el('button', { type: 'button', class: 'pic-opt upload', onclick: () => $('pic-upload').click() }, el('span', null, el('b', { text: '+' }), 'your own')),
    );
  }
  $('pic-upload').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      let url = await blobToDataUrl(await shrinkImage(f, 1600, 0.8));
      if (url.length > 650000) url = await blobToDataUrl(await shrinkImage(f, 1100, 0.7));
      await chooseBanner(url);
    } catch (err) { toast(err.message); }
  });

  // =====================================================================
  //  ONBOARDING
  // =====================================================================
  const STEPS = 3;
  let obStep = 0;
  // Pictured steps for this exact phone and browser — copied from Sudo's
  // setup. Safari 26 hides Share behind "•••"; older iPhones show it in the
  // bottom bar; iPad and Chrome on iPhone put it at the top.
  const HOW_ICONS = {
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>',
    add: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    done: '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><circle cx="7.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="16.5" cy="12" r="1.3"/></svg>',
    burger: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    install: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 8v6M9 11l3 3 3-3"/></svg>',
    bar: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9h19M15 13.5l2 2 3-3.5"/></svg>',
  };
  HOW_ICONS.safari = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z"/></svg>';
  HOW_ICONS.dock = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M6 20h12M9 16v4M15 16v4"/></svg>';
  HOW_ICONS.link = '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
  const ADD_IOS = ['add', 'Tap Add to Home Screen (not there? Tap View More ⌄ or scroll down)'];
  // Every browser we know how to guide, keyed by what detectBrowser() returns.
  // `open` = this browser can't add to the home screen; offer a button that
  // reopens the page in one that can.
  const HOW_FLOW = {
    'ios26': { label: 'Safari on iPhone (iOS 26+)', steps: [['more', 'Tap ••• at the bottom right'], ['share', 'Tap Share'], ADD_IOS, ['done', 'Leave “Open as Web App” on and tap Add']] },
    'ios': { label: 'Safari on iPhone (iOS 16–18)', steps: [['share', 'Tap Share at the bottom (the square with an arrow)'], ADD_IOS, ['done', 'Tap Add at the top right']] },
    'ios-old': { label: 'Safari on iPhone (iOS 15 or older)', steps: [['share', 'Tap Share at the bottom (the square with an arrow)'], ['add', 'Scroll down the list and tap Add to Home Screen'], ['done', 'Tap Add at the top right']] },
    'ipad': { label: 'Safari on iPad', steps: [['share', 'Tap Share at the top right (no Share button? Tap ••• first)'], ADD_IOS, ['done', 'Tap Add']] },
    'ios-chrome': { label: 'Chrome on iPhone', steps: [['share', 'Tap Share at the right end of the address bar (no icon? Tap ••• bottom right, then Share)'], ['add', 'Scroll down and tap Add to Home Screen (not there? Tap Edit Actions and turn it on)'], ['done', 'Tap Add at the top right']] },
    'ios-firefox': { label: 'Firefox on iPhone', steps: [['burger', 'Tap ☰ at the bottom right'], ['share', 'Tap Share'], ['add', 'Tap Add to Home Screen'], ['done', 'Tap Add']] },
    'ios-edge': { label: 'Edge on iPhone', steps: [['more', 'Tap ••• at the bottom'], ['share', 'Tap Share'], ['add', 'Tap Add to Home Screen'], ['done', 'Tap Add']] },
    'ios-other': { label: 'your iPhone browser', steps: [['share', 'Find Share in your browser’s menu'], ['add', 'Tap Add to Home Screen'], ['done', 'Tap Add'], ['safari', 'Not there? Open this page in Safari instead']] },
    'ios-needs-safari': { label: 'this iPhone', open: 'safari', steps: [['safari', 'On this iPhone only Safari can add apps to the home screen'], ['link', 'Tap Open in Safari below (or copy the link and paste it in Safari)'], ['add', 'Then follow the steps you see there']] },
    'inapp-ios': { label: 'opening this in Safari', open: 'safari', steps: [['safari', 'You opened this inside another app, which can’t add it to your home screen'], ['more', 'Tap Open in Safari below, or tap ••• in this app and choose Open in Safari / Open in browser'], ['add', 'Then follow the steps you see there']] },
    'inapp-android': { label: 'opening this in Chrome', open: 'chrome', steps: [['link', 'You opened this inside another app, which can’t add it to your home screen'], ['menu', 'Tap Open in Chrome below, or tap ⋮ in this app and choose Open in browser'], ['add', 'Then follow the steps you see there']] },
    'android': { label: 'Chrome on Android', steps: [['menu', 'Tap ⋮ at the top right'], ['install', 'Tap Add to Home screen (or Install app)'], ['done', 'Tap Install']] },
    'android-edge': { label: 'Edge on Android', steps: [['burger', 'Tap ☰ at the bottom right'], ['install', 'Tap Add to phone'], ['done', 'Tap Install']] },
    'samsung': { label: 'Samsung Internet', steps: [['burger', 'Tap ☰ at the bottom right'], ['add', 'Tap Add page to, then Home screen'], ['done', 'Tap Install or Add']] },
    'android-firefox': { label: 'Firefox on Android', steps: [['menu', 'Tap ⋮ (top or bottom right)'], ['install', 'Tap Add app to Home screen (or Add to Home screen)'], ['done', 'Tap Add']] },
    'android-opera': { label: 'Opera on Android', steps: [['menu', 'Tap ⋮ at the top right'], ['add', 'Tap Add to, then Home screen'], ['done', 'Tap Add']] },
    'android-webview': { label: 'your phone’s browser', steps: [['menu', 'Tap ⋮ at the top right'], ['add', 'Tap Add shortcut (some browsers call it Add to Home screen)'], ['done', 'Tap Add if your phone asks — then look for it on your home screen']] },
    'android-other': { label: 'your Android browser', steps: [['menu', 'Open your browser’s menu'], ['install', 'Choose Add to Home screen or Install app'], ['done', 'Tap Add']] },
    'desktop-chrome': { label: 'Chrome on a computer', steps: [['bar', 'Click the install icon at the right of the address bar'], ['install', 'No icon? Click ⋮ → Cast, save and share → Install page as app'], ['done', `Click Install — ${C.handle} opens in its own window`]] },
    'desktop-edge': { label: 'Edge on a computer', steps: [['bar', 'Click “App available” at the right of the address bar'], ['install', 'Not there? Click ⋯ → Apps → Install this site as an app'], ['done', 'Click Install']] },
    'desktop-safari': { label: 'Safari on a Mac', steps: [['dock', 'Click File in the menu bar'], ['add', 'Click Add to Dock'], ['done', 'Click Add']] },
    'desktop-other': { label: 'this browser', open: 'copy', steps: [['link', 'This browser can’t add sites as apps'], ['bar', 'Copy the link below and open it in Chrome, Edge or Safari'], ['done', 'Then follow the steps you see there']] },
  };
  // Work out the exact browser, version and whether we're inside another
  // app's built-in browser (Instagram, WhatsApp on Android, TikTok, …).
  function detectBrowser() {
    const ua = navigator.userAgent;
    const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const ios = /iPad|iPhone|iPod/.test(ua) || iPadOS;
    const android = /Android/.test(ua);
    const inApp = /Instagram|FBAN|FBAV|FB_IAB|LinkedInApp|Snapchat|TikTok|musical_ly|Bytedance|Line\/|MicroMessenger|Twitter|Pinterest|GSA\//.test(ua)
      || (android && /; wv\)/.test(ua));
    if (ios) {
      if (inApp) return 'inapp-ios';
      const os = ua.match(/OS (\d+)_(\d+)/) || [];
      const osV = Number(os[1] || 0) + Number(os[2] || 0) / 100;
      const other = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/.test(ua);
      if (other && osV && osV < 16.04) return 'ios-needs-safari';   // only Safari could add before iOS 16.4
      if (/CriOS/.test(ua)) return 'ios-chrome';
      if (/FxiOS/.test(ua)) return 'ios-firefox';
      if (/EdgiOS/.test(ua)) return 'ios-edge';
      if (other || !/Safari/.test(ua)) return 'ios-other';
      if (/iPad/.test(ua) || iPadOS) return 'ipad';
      const v = Number((ua.match(/Version\/(\d+)/) || [])[1] || osV || 0);
      return v >= 26 ? 'ios26' : v >= 16 ? 'ios' : 'ios-old';
    }
    if (android) {
      // Many phones ship their own browser that copies Chrome's name; the
      // brand list is the honest part ("Android WebView" vs "Google Chrome").
      const brands = ((navigator.userAgentData && navigator.userAgentData.brands) || []).map(b => b.brand).join('|');
      const webview = /Android WebView/.test(brands);
      if (inApp) return 'inapp-android';
      if (webview) return 'android-webview';             // Jelly and other built-in phone browsers
      if (/SamsungBrowser/.test(ua)) return 'samsung';
      if (/EdgA/.test(ua)) return 'android-edge';
      if (/Firefox/.test(ua)) return 'android-firefox';
      if (/OPR|Opera/.test(ua)) return 'android-opera';
      if (/Chrome\//.test(ua) && (!brands || /Google Chrome/.test(brands))) return 'android';
      return 'android-other';
    }
    if (/Edg\//.test(ua)) return 'desktop-edge';
    if (/Chrome\//.test(ua)) return 'desktop-chrome';
    if (/Safari/.test(ua) && Number((ua.match(/Version\/(\d+)/) || [])[1]) >= 17) return 'desktop-safari';
    return 'desktop-other';
  }
  const DETECTED = detectBrowser();
  const howKey = DETECTED;
  // Chrome, Edge, Samsung and other Chromium browsers let a page offer a
  // one-tap add. Safari never does, so iPhones always get the steps.
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; renderHowTo(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast(`${C.handle} is on your home screen`); renderHowTo(); });
  $('one-tap-add').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice.catch(() => ({}));
    installEvt = null; renderHowTo();
    if (outcome === 'accepted') showStep(obStep + 1);
  });
  function openElsewhere(kind) {
    const here = location.href;
    if (kind === 'safari') location.href = 'x-safari-' + here;
    else if (kind === 'chrome') location.href = `intent://${here.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(here)};end`;
    // If nothing opened (or it's a computer), hand them the link instead.
    setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      (navigator.clipboard ? navigator.clipboard.writeText(here) : Promise.reject()).then(
        () => toast(kind === 'copy' ? 'Link copied' : `Link copied — paste it in ${kind === 'chrome' ? 'Chrome' : 'Safari'}`),
        () => prompt('Copy this link:', here));
    }, kind === 'copy' ? 0 : 1200);
  }
  $('open-elsewhere').addEventListener('click', () => openElsewhere(HOW_FLOW[howKey].open));
  function renderHowTo() {
    const flow = HOW_FLOW[howKey];
    $('how-detected').textContent = `Steps for ${flow.label}`;
    const oneTap = !!installEvt;
    $('one-tap-add').hidden = !oneTap;
    $('how-by-hand').hidden = !oneTap;
    const open = $('open-elsewhere');
    open.hidden = !flow.open;
    open.textContent = { safari: 'Open in Safari', chrome: 'Open in Chrome', copy: 'Copy the link' }[flow.open] || '';
    $('how-steps').replaceChildren(...flow.steps.map(([icon, text], i) => {
      const art = el('span', { class: 'wel-how-icon' });
      art.innerHTML = HOW_ICONS[icon];
      art.prepend(el('b', { text: String(i + 1) }));
      return el('li', { class: 'wel-how-step' }, art, el('span', { class: 'wel-how-text', text }));
    }));
    const ios = /^ios|^ipad/.test(howKey);
    $('icon-how').textContent = `Already on your home screen? Phones keep the old icon: remove ${C.handle} there, then `
      + (ios ? 'in Safari tap Share → Add to Home Screen again.' : 'add it again from your browser’s menu.');
  }
  function showStep(n) {
    obStep = Math.max(0, Math.min(STEPS - 1, n));
    document.querySelectorAll('.ob-step').forEach(s => { s.hidden = Number(s.dataset.step) !== obStep; });
    document.querySelectorAll('.steps-dots span').forEach((d, i) => d.classList.toggle('on', i === obStep));
    $('onboard').scrollTop = 0;
  }
  function startOnboarding() {
    renderHowTo();
    if (COMPUTER) $('hello-next').textContent = `Enter ${C.handle}’s social`;
    $('app').hidden = true; $('onboard').hidden = false;
    showStep(0);
  }
  // Computers get the first page only: the other steps are about the home screen.
  const COMPUTER = window.matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)').matches;
  document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => {
    if (COMPUTER && obStep === 0) { store.set('es-onboarded', true); enterApp(); return; }
    showStep(obStep + 1);
  }));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => showStep(obStep - 1)));
  $('enter-btn').addEventListener('click', () => { store.set('es-onboarded', true); enterApp(); });
  $('replay-intro').addEventListener('click', startOnboarding);

  // =====================================================================
  //  APP
  // =====================================================================
  function enterApp() {
    $('onboard').hidden = true; $('app').hidden = false;
    switchTab(state.tab);
    refresh();
  }
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + tab; });
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('main').scrollTop = 0;
    if (tab === 'you') renderYou();
    if (tab === 'people') renderPeople();
  }
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  async function refresh() {
    const m = me();
    $('compose-open').hidden = !(m && m.isOwner);
    $('mode-chip').hidden = LIVE;
    try {
      state.posts = await db.posts();
      $('stat-members').textContent = $('rail-members').textContent = await db.memberCount();
    } catch (err) {
      toast('Could not load posts: ' + err.message);
      state.posts = [];
    }
    try { state.linkedin = await db.linkedinPosts(); } catch (_) { state.linkedin = []; }
    renderAll(); renderHome(); renderWork();
    loadExternal();
    if (state.tab === 'you') renderYou();
    if (state.tab === 'people') renderPeople();
  }

  function renderStatic() {
    const vals = { name: C.ownerName, handle: C.handle, intro: C.intro || '' };
    document.querySelectorAll('[data-c]').forEach(n => { const v = vals[n.dataset.c]; if (v) n.textContent = v; });
    document.querySelectorAll('[data-c-src]').forEach(n => { n.src = C[n.dataset.cSrc]; });
    document.title = `${C.handle}’s social`;
    document.querySelector('meta[name="apple-mobile-web-app-title"]').setAttribute('content', C.handle);
    $('owner-avatar').src = C.ownerPhoto; $('work-avatar').src = C.ownerPhoto;
    $('owner-name').textContent = C.ownerName; $('owner-bio').textContent = C.bio;
    $('rail-bio').textContent = C.intro || C.bio;
    $('work-name').textContent = C.ownerName;
    $('work-headline').textContent = C.work.headline;
    $('work-location').textContent = C.work.location;
    $('work-about').textContent = C.work.about;
    $('work-links').replaceChildren(...C.work.links.map(l => el('a', { href: l.url, target: '_blank', rel: 'noopener', text: l.label })));
    const W = C.work;
    // Long descriptions show three lines with a "more" button, like LinkedIn.
    const note = (text) => {
      if (!text) return null;
      const p = el('p', { class: 'exp-note', text });
      if (text.length < 180) return p;
      p.classList.add('clamped');
      const btn = el('button', { type: 'button', class: 'more-btn', text: 'more', onclick: () => { btn.textContent = p.classList.toggle('clamped') ? 'more' : 'less'; } });
      return el('div', null, p, btn);
    };
    const row = (badge, title, lines, text) => el('li', null,
      el('span', { class: 'org-badge', text: String(badge || '?').slice(0, 1) }),
      el('div', null, el('strong', { text: title }), ...lines.filter(Boolean).map(t => el('span', { text: t })), note(text)));
    const fill = (id, items, make) => { $(id).replaceChildren(...items.map(make)); const card = $(id + '-card'); if (card) card.hidden = !items.length; };
    fill('work-exp', W.experience || [], x => row(x.org, x.role, [x.org + (x.type ? ' · ' + x.type : ''), [x.when, x.location].filter(Boolean).join(' · ')], x.note));
    fill('work-edu', W.education || [], x => row(x.school, x.school, [x.degree, x.when]));
    fill('work-cert', W.certifications || [], x => row(x.issuer || x.name, x.name, [x.issuer, x.when]));
    fill('work-lang', W.languages || [], x => row(x.name, x.name, [x.level]));
    $('section-chips').replaceChildren(...[{ id: 'all', label: 'All' }, ...SECTIONS.filter(s => GRID_SECTIONS.includes(s.id))]
      .map(s => el('button', { type: 'button', class: 'chip' + (state.section === s.id ? ' on' : ''), 'data-sec': s.id, text: s.label,
        onclick: () => { state.section = s.id; document.querySelectorAll('#section-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.sec === s.id)); renderHome(); } })));
    $('compose-section').replaceChildren(...SECTIONS.map((s, i) => el('button', { type: 'button', 'data-sec': s.id, class: i === 0 ? 'on' : '', text: s.label })));
  }

  function renderHome() {
    const pub = state.posts.filter(p => p.visibility === 'everyone' && GRID_SECTIONS.includes(p.section));
    const shown = state.section === 'all' ? pub : pub.filter(p => p.section === state.section);
    $('stat-posts').textContent = $('rail-posts').textContent = state.posts.filter(p => p.visibility === 'everyone').length;
    $('grid').replaceChildren(...shown.map(p => p.imageUrl
      ? el('button', { type: 'button', class: 'tile', onclick: () => openPost(p.id), 'aria-label': p.caption || 'Post' },
          el('img', { src: p.imageUrl, alt: '', loading: 'lazy' }),
          state.section === 'all' ? el('span', { class: 'tag', text: sectionLabel(p.section) }) : null)
      : el('button', { type: 'button', class: 'tile text', onclick: () => openPost(p.id) },
          el('span', { text: p.caption }),
          state.section === 'all' ? el('span', { class: 'tag', text: sectionLabel(p.section) }) : null)));
    $('grid-empty').hidden = shown.length > 0;
  }

  function feedCard(p, source) {
    return el('article', { class: 'feed-card', onclick: () => openPost(p.id) },
      el('div', { class: 'fc-head' }, el('img', { src: C.ownerPhoto, alt: '' }),
        el('div', null, el('strong', { text: C.ownerName }), el('span', { text: ago(p.created_at) })),
        source ? el('span', { class: 'fc-source', text: source }) : null),
      p.caption ? el('p', { class: 'fc-text', text: p.caption }) : null,
      p.imageUrl ? el('img', { class: 'fc-img', src: p.imageUrl, alt: '', loading: 'lazy' }) : null,
      el('div', { class: 'fc-foot' }, el('span', { text: `♥ ${p.likeCount}` }), el('span', { text: `${p.commentCount} comment${p.commentCount === 1 ? '' : 's'}` })));
  }

  function renderWork() {
    const items = state.posts.filter(p => p.section === 'work' && p.visibility === 'everyone');
    $('work-feed').replaceChildren(...items.map(p => feedCard(p)));
    $('work-empty').hidden = items.length > 0;
  }

  $('rail-login').addEventListener('click', () => openAuth('signup'));
  $('rail-make').addEventListener('click', () => { switchTab('you'); setTimeout(() => $('make-your-own').scrollIntoView({ behavior: 'smooth' }), 50); });

  // ---------- connected accounts ----------
  const SOCIALS = [
    { id: 'instagram', name: 'Instagram', note: 'Needs a Creator or Business account' },
    { id: 'linkedin', name: 'LinkedIn', note: 'Posts you make from here' },
  ];
  const SOURCES = [
    { id: 'all', label: 'All' }, { id: 'mine', label: 'My social' },
    { id: 'instagram', label: 'Instagram' }, { id: 'linkedin', label: 'LinkedIn' }, { id: 'x', label: 'X' },
  ];
  // A post sent to Instagram from here counts as both "My social" and "Instagram".
  function fromSource(p, source) {
    if (source === 'all') return true;
    if (source === 'mine') return !p.source;
    return p.source === source || !!(p.shared_to || {})[source];
  }
  $('all-filter').replaceChildren(...SOURCES.map(f => el('button', {
    type: 'button', class: 'chip' + (f.id === state.source ? ' on' : ''), 'data-source': f.id, text: f.label,
    'aria-pressed': String(f.id === state.source),
    onclick: () => {
      state.source = f.id;
      document.querySelectorAll('#all-filter .chip').forEach(c => {
        const on = c.dataset.source === f.id;
        c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on));
      });
      renderAll();
    },
  })));
  const socialName = (id) => (SOCIALS.find(x => x.id === id) || {}).name || id;
  function sourceLabel(p) {
    const also = Object.keys(p.shared_to || {}).map(socialName);
    return also.length ? also.join(' · ') : 'My social';
  }
  function externalCard(x) {
    return el('a', { class: 'feed-card ext-card', href: x.url, target: '_blank', rel: 'noopener' },
      el('div', { class: 'fc-head' }, el('img', { src: C.ownerPhoto, alt: '' }),
        el('div', null, el('strong', { text: C.ownerName }), el('span', { text: ago(x.created_at) })),
        el('span', { class: 'fc-source', text: socialName(x.source) })),
      x.caption ? el('p', { class: 'fc-text', text: x.caption }) : null,
      x.imageUrl ? el('img', { class: 'fc-img', src: x.imageUrl, alt: '', loading: 'lazy' }) : null,
      el('div', { class: 'fc-foot' }, el('span', { text: `♥ ${x.likeCount}` }), el('span', { text: `${x.commentCount} comment${x.commentCount === 1 ? '' : 's'}` })));
  }
  // LinkedIn lets apps post but not read, so old posts are shown through its embed.
  function linkedinCard(x) {
    const m = me();
    return el('article', { class: 'feed-card li-card' },
      el('div', { class: 'fc-head' }, el('img', { src: C.ownerPhoto, alt: '' }),
        el('div', null, el('strong', { text: C.ownerName }), el('span', { text: ago(x.created_at) })),
        el('span', { class: 'fc-source', text: 'LinkedIn' })),
      el('iframe', { class: 'li-frame', src: `https://www.linkedin.com/embed/feed/update/${x.urn}`, title: 'LinkedIn post', loading: 'lazy' }),
      el('div', { class: 'fc-foot' },
        el('a', { href: `https://www.linkedin.com/feed/update/${x.urn}/`, target: '_blank', rel: 'noopener', text: 'Open on LinkedIn →' }),
        m && m.isOwner ? el('button', { type: 'button', text: 'Remove', onclick: async () => {
          if (!confirm('Remove this post from your site? It stays on LinkedIn.')) return;
          try { await db.removeLinkedin(x.id); state.linkedin = state.linkedin.filter(y => y.id !== x.id); renderAll(); toast('Removed'); } catch (err) { toast(err.message); }
        } }) : null));
  }
  // Accepts a post link, a /feed/update/ link or LinkedIn's embed code.
  function linkedinUrn(text) {
    let t = String(text);
    try { t = decodeURIComponent(t); } catch (_) {}
    if (!/linkedin\.com|urn:li:/i.test(t)) return null;
    const m = t.match(/urn:li:(activity|share|ugcPost):(\d{10,25})/) || t.match(/(activity)[-:](\d{10,25})/);
    return m ? `urn:li:${m[1]}:${m[2]}` : null;
  }
  // The first 41 bits of a LinkedIn id are the moment the post was made.
  function linkedinDate(urn) {
    const ms = Number(BigInt(urn.split(':').pop()) >> 22n);
    return ms > Date.UTC(2003, 0, 1) && ms < Date.now() + 864e5 ? new Date(ms).toISOString() : new Date().toISOString();
  }
  $('linkedin-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('linkedin-status'); status.className = 'form-status err';
    const urn = linkedinUrn($('linkedin-url').value);
    if (!urn) { status.textContent = 'That doesn’t look like a link to a LinkedIn post.'; return; }
    $('linkedin-save').disabled = true; status.className = 'form-status'; status.textContent = 'Adding…';
    try {
      await db.addLinkedin(urn, linkedinDate(urn));
      state.linkedin = await db.linkedinPosts();
      $('linkedin-url').value = ''; status.textContent = ''; renderAll(); toast('Added');
    } catch (err) {
      status.className = 'form-status err';
      status.textContent = err.message === 'duplicate' ? 'That post is already on your site.' : err.message;
    } finally { $('linkedin-save').disabled = false; }
  });
  async function loadExternal() {
    if (!LIVE) return;
    try {
      const r = await fetch('/api/socials?action=feed');
      state.external = r.ok ? (await r.json()).items || [] : [];
      renderAll();
    } catch (_) { /* the timeline still shows this site's own posts */ }
  }
  async function socialsApi(action, body) {
    const r = await fetch('/api/socials?action=' + action, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + await db.token(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'That didn’t work. Try again.');
    return j;
  }
  $('composio-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('composio-status'); status.className = 'form-status'; status.textContent = 'Checking your key…';
    $('composio-save').disabled = true;
    try {
      await socialsApi('key', { key: $('composio-key').value.trim() });
      $('composio-key').value = ''; status.textContent = ''; toast('Composio key saved');
      await renderSocials();
    } catch (err) { status.className = 'form-status err'; status.textContent = err.message; }
    finally { $('composio-save').disabled = false; }
  });
  $('composio-remove').addEventListener('click', async () => {
    if (!confirm('Remove your Composio key? Instagram and LinkedIn stop working here until you add one again.')) return;
    try { await socialsApi('key', { key: '' }); toast('Key removed'); state.external = []; renderAll(); renderSocials(); } catch (err) { toast(err.message); }
  });
  async function renderSocials() {
    const m = me();
    $('socials-card').hidden = !(m && m.isOwner);
    if ($('socials-card').hidden) return;
    let info = { configured: false, accounts: {} };
    if (LIVE) { try { info = await socialsApi('status'); } catch (_) {} }
    $('composio-form').hidden = !LIVE || info.configured || info.fromHost;
    $('composio-saved').hidden = !info.configured || info.fromHost;
    $('socials-hint').hidden = info.configured;
    $('socials-hint').replaceChildren(...(!LIVE ? ['This works once your site is live.'] : info.keyProblem
      ? ['Composio didn’t accept your saved key. Paste a new one below.']
      : ['Open ', el('a', { href: 'https://dashboard.composio.dev', target: '_blank', rel: 'noopener', text: 'your Composio dashboard' }), ', go to your project’s Settings, then API Keys, and copy the key that starts with ak_.']));
    const row = (name, note, right) => el('li', null, el('div', null, el('strong', { text: name }), el('small', { text: note })), right);
    $('socials-list').replaceChildren(...SOCIALS.map(a => {
      if (!info.configured) return row(a.name, a.note, el('span', { text: 'Not connected' }));
      if (info.accounts[a.id]) return row(a.name, 'Connected', el('button', { type: 'button', class: 'pill-btn', text: 'Disconnect', onclick: async () => {
        if (!confirm(`Disconnect ${a.name}?`)) return;
        try { await socialsApi('disconnect', { platform: a.id }); toast(`${a.name} disconnected`); renderSocials(); loadExternal(); } catch (err) { toast(err.message); }
      } }));
      return row(a.name, a.note, el('button', { type: 'button', class: 'pill-btn', text: 'Connect', onclick: async (e) => {
        e.target.disabled = true;
        try { location.href = (await socialsApi('connect', { platform: a.id })).url; } catch (err) { e.target.disabled = false; toast(err.message); }
      } }));
    }), row('X', 'Needs your own X developer app', el('span', { text: 'Not available yet' })));
  }

  function renderAll() {
    const owner = me();
    $('linkedin-add').hidden = !(owner && owner.isOwner && state.source === 'linkedin');
    $('rail-login').hidden = !!me();
    // A post sent to Instagram from here shows once, not twice.
    const sent = new Set(state.posts.flatMap(p => Object.values(p.shared_to || {}).map(String)));
    const pasted = state.linkedin.filter(x => !sent.has(x.urn)).map(x => ({ ...x, source: 'linkedin', created_at: x.posted_at }));
    const items = [...state.posts.filter(p => p.visibility === 'everyone'), ...state.external.filter(x => !sent.has(String(x.id))), ...pasted]
      .filter(p => fromSource(p, state.source))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const out = []; let last = '';
    for (const p of items) {
      const d = dayLabel(p.created_at);
      if (d !== last) { out.push(el('p', { class: 'day-label', text: d })); last = d; }
      out.push(p.urn ? linkedinCard(p) : p.source ? externalCard(p) : feedCard(p, sourceLabel(p)));
    }
    $('all-feed').replaceChildren(...out);
    $('all-empty').hidden = items.length > 0;
    $('all-empty').textContent = state.source === 'all' ? 'Nothing here yet.'
      : `Nothing from ${SOURCES.find(f => f.id === state.source).label} yet.`;
  }

  async function renderYou() {
    const m = me();
    $('you-account').replaceChildren(el('div', { class: 'card account-card' }, ...(m
      ? [el('span', { class: 'initial', text: m.name.slice(0, 1).toUpperCase() }),
         el('div', null, el('strong', { text: m.name }), el('span', { text: (m.isOwner ? 'Owner' : 'Friend') + (m.site ? ' · via ' + new URL(m.site).hostname : '') })),
         el('button', { type: 'button', text: 'Log out', onclick: async () => { await db.signOut(); toast('Logged out'); refresh(); renderYou(); } })]
      : [el('span', { class: 'initial', text: '?' }),
         el('div', null, el('strong', { text: 'Not logged in' }), el('span', { text: 'Log in to comment.' })),
         el('button', { type: 'button', text: 'Log in', onclick: () => openAuth('signup') })])));
    renderSocials();
    $('demo-card').hidden = LIVE;
    $('demo-owner').checked = !LIVE && !!(m && m.isOwner);
    const card = $('members-card');
    card.hidden = !(m && m.isOwner);
    if (!card.hidden) {
      try {
        const list = await db.members();
        $('members').replaceChildren(...(list.length ? list.map(u =>
          el('li', null, el('span', null, u.name, u.site ? el('small', { text: 'via ' + new URL(u.site).hostname }) : u.email ? el('small', { text: u.email }) : null)))
          : [el('li', null, el('span', { class: 'muted', text: 'Nobody has signed up yet.' }))]));
      } catch (err) { toast(err.message); }
    }
  }
  $('demo-owner').addEventListener('change', (e) => { demo.setOwnerPreview(e.target.checked); refresh(); renderYou(); });

  // ---------- people (friends' own socials) ----------
  // A social is identified by its https origin; its public card lives at /social.json.
  function siteOrigin(raw) {
    let t = String(raw || '').trim();
    if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
    let u;
    try { u = new URL(t); } catch (_) { throw new Error('That doesn’t look like a web address.'); }
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) throw new Error('Use the site’s https address, like their-social.vercel.app');
    return 'https://' + u.hostname.toLowerCase();
  }
  const httpsOnly = (v) => (typeof v === 'string' && v.startsWith('https://')) ? v : null;
  async function fetchCard(origin) {
    const r = await fetch(origin + '/social.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('no card');
    return r.json();
  }
  // One request per site each time the tab opens, shared by both views.
  const cardMemo = new Map();
  function cardFor(origin) {
    if (!cardMemo.has(origin)) cardMemo.set(origin, fetchCard(origin));
    return cardMemo.get(origin);
  }
  function personCard(origin, canRemove) {
    const host = new URL(origin).hostname;
    const img = el('img', { alt: '' });
    const name = el('strong', { text: host });
    const bio = el('p', { class: 'person-bio', hidden: true });
    const strip = el('div', { class: 'person-strip', hidden: true });
    const card = el('a', { class: 'person', href: origin, target: '_blank', rel: 'noopener' },
      el('div', { class: 'person-head' }, img, el('div', null, name, el('span', { text: host })), el('span', { class: 'open', text: 'Open →' })),
      bio, strip,
      canRemove ? el('button', { class: 'person-remove', type: 'button', text: 'Remove', onclick: async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!confirm(`Remove ${host} from people?`)) return;
        try { await db.removePerson(origin); renderPeople(); } catch (err) { toast(err.message); }
      } }) : null);
    cardFor(origin).then(c => {
      if (c.name) name.textContent = String(c.name).slice(0, 60);
      if (httpsOnly(c.avatar)) img.src = c.avatar;
      if (c.bio) { bio.textContent = String(c.bio).slice(0, 200); bio.hidden = false; }
      const latest = (Array.isArray(c.latest) ? c.latest : []).slice(0, 3);
      if (latest.length) {
        strip.replaceChildren(...latest.map(p => httpsOnly(p.photo)
          ? el('img', { src: p.photo, alt: '', loading: 'lazy' })
          : el('span', { class: 't', text: String(p.caption || '').slice(0, 80) })));
        strip.hidden = false;
      }
    }).catch(() => { card.classList.add('offline'); bio.textContent = 'Couldn’t load their card right now.'; bio.hidden = false; });
    return card;
  }
  function friendPostCard(x) {
    return el('a', { class: 'feed-card', href: x.url, target: '_blank', rel: 'noopener' },
      el('div', { class: 'fc-head' }, el('img', { src: x.avatar, alt: '' }),
        el('div', null, el('strong', { text: x.name }), el('span', { text: ago(x.date) })),
        x.section ? el('span', { class: 'fc-source', text: x.section }) : null),
      x.caption ? el('p', { class: 'fc-text', text: x.caption }) : null,
      x.photo ? el('img', { class: 'fc-img', src: x.photo, alt: '', loading: 'lazy' }) : null);
  }
  // Everyone's latest public posts, newest first. Each site's card is read as
  // plain text and only https pictures are shown, since other people write it.
  let peopleFeedRun = 0;
  async function renderPeopleFeed(urls) {
    const run = ++peopleFeedRun, m = me();
    const empty = $('people-feed-empty');
    $('people-feed').replaceChildren();
    empty.hidden = false;
    if (!urls.length) {
      empty.textContent = m && m.isOwner ? 'Add someone under Following to see their posts here.' : 'Nothing here yet.';
      return;
    }
    empty.textContent = 'Loading…';
    const cards = await Promise.allSettled(urls.map(cardFor));
    if (run !== peopleFeedRun) return;
    const posts = cards.flatMap((r, i) => {
      if (r.status !== 'fulfilled') return [];
      const c = r.value, url = urls[i];
      return (Array.isArray(c.latest) ? c.latest : []).map(p => ({
        url, name: String(c.name || new URL(url).hostname).slice(0, 60), avatar: httpsOnly(c.avatar),
        section: String(p.section || '').slice(0, 24), caption: String(p.caption || '').slice(0, 600),
        photo: httpsOnly(p.photo), date: new Date(p.date),
      }));
    }).filter(p => !isNaN(p.date) && p.date <= Date.now() + 864e5 && (p.caption || p.photo))
      .map(p => ({ ...p, date: p.date.toISOString() }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const out = []; let last = '';
    for (const p of posts) {
      const d = dayLabel(p.date);
      if (d !== last) { out.push(el('p', { class: 'day-label', text: d })); last = d; }
      out.push(friendPostCard(p));
    }
    $('people-feed').replaceChildren(...out);
    empty.hidden = posts.length > 0;
    empty.textContent = cards.some(r => r.status === 'fulfilled') ? 'No posts yet.' : 'Couldn’t load their posts right now.';
  }
  function showPeopleView() {
    const feed = state.peopleView === 'feed';
    $('people-feed-view').hidden = !feed; $('people-following-view').hidden = feed;
    $('people-sub').textContent = feed ? `Posts from everyone ${C.ownerName} follows.` : `The socials ${C.ownerName} follows. Tap one to open it.`;
    document.querySelectorAll('#people-views .chip').forEach(c => {
      const on = c.dataset.view === state.peopleView;
      c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on));
    });
  }
  $('people-views').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.peopleView = b.dataset.view; showPeopleView(); $('main').scrollTop = 0;
  });
  async function renderPeople() {
    const m = me();
    showPeopleView();
    cardMemo.clear();
    $('add-person').hidden = !(m && m.isOwner);
    let urls = [];
    try { urls = await db.people(); } catch (err) { toast(err.message); }
    $('people-list').replaceChildren(...urls.map(u => personCard(u, !!(m && m.isOwner))));
    $('people-empty').hidden = urls.length > 0;
    renderPeopleFeed(urls);
  }
  $('add-person').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('add-person-status'); status.className = 'form-status'; status.textContent = 'Checking…';
    try {
      const origin = siteOrigin($('add-person-url').value);
      if (origin === location.origin) throw new Error('That’s this site.');
      try { await fetchCard(origin); } catch (_) { throw new Error('No social found there (it has no /social.json).'); }
      await db.addPerson(origin);
      $('add-person-url').value = ''; status.textContent = '';
      renderPeople();
    } catch (err) { status.className = 'form-status err'; status.textContent = err.message; }
  });

  // ---------- log in with your own social ----------
  // 1. Visitor types their site here; we send them there with ?connect_to=<us>.
  // 2. Their site (logged in as its owner) asks "log in to <us>?" and sends
  //    them back with a one-time code made only for us.
  // 3. Our site-login function asks their site to confirm the code, then signs
  //    them in here as "<name> · <their site>".
  $('site-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('site-login-status'); status.className = 'form-status';
    try {
      if (!LIVE) throw new Error('Logging in with your own social works once this site is live.');
      const origin = siteOrigin($('site-login-url').value);
      if (origin === location.origin) throw new Error('That’s this site — use your own social’s address.');
      status.textContent = 'Taking you to your site…';
      location.href = origin + '/?connect_to=' + encodeURIComponent(location.origin);
    } catch (err) { status.className = 'form-status err'; status.textContent = err.message; }
  });
  $('site-login-make').addEventListener('click', () => {
    closeSheet(); switchTab('you');
    setTimeout(() => $('make-your-own').scrollIntoView({ behavior: 'smooth' }), 50);
  });

  // We are the visitor's own site: its owner wants to log in somewhere else.
  function openConnect(aud) {
    const host = new URL(aud).hostname;
    const m = me();
    const owner = !!(m && m.isOwner);
    $('connect-q').textContent = owner ? `Log in to ${host} as ${m.name}?` : `Log in to ${host}?`;
    $('connect-note').textContent = owner
      ? `They’ll see your name and this site’s address (${location.hostname}). Nothing else is shared.`
      : 'First log in here as the owner of this social, then confirm.';
    $('connect-yes').textContent = owner ? 'Yes, log me in' : 'Log in here first';
    $('connect-yes').disabled = false;
    $('connect-status').textContent = '';
    $('connect-yes').onclick = async () => {
      if (!owner) { state.after = () => openConnect(aud); openAuth('login'); return; }
      $('connect-yes').disabled = true; $('connect-status').textContent = 'One sec…';
      try {
        const code = await db.connectCode(aud);
        location.href = aud + '/?site_code=' + encodeURIComponent(code) + '&site=' + encodeURIComponent(location.origin);
      } catch (err) { $('connect-status').textContent = err.message; $('connect-yes').disabled = false; }
    };
    showSheet('connect-sheet');
  }

  function takeParams(...names) {
    const q = new URLSearchParams(location.search);
    const got = names.map(n => q.get(n));
    names.forEach(n => q.delete(n));
    const rest = q.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '')); } catch (_) {}
    return got;
  }
  let pendingConnect = null;
  async function handleArrivals([code, site, to]) {
    if (code && site && LIVE) {
      store.set('es-onboarded', true);
      try { await db.siteLogin(siteOrigin(site), code); toast(`Hi ${me().name}!`); }
      catch (err) { toast(err.message); }
    }
    if (to) {
      try { pendingConnect = siteOrigin(to); store.set('es-onboarded', true); } catch (_) {}
    }
  }

  // ---------- sheets ----------
  let openSheet = null;
  function showSheet(id) {
    if (openSheet) $(openSheet).hidden = true;
    openSheet = id; $(id).hidden = false; $('backdrop').hidden = false;
  }
  function closeSheet() {
    if (!openSheet) return;
    $(openSheet).hidden = true; $('backdrop').hidden = true; openSheet = null; state.openPost = null;
  }
  $('settings-open').addEventListener('click', () => {
    const m = me();
    $('banner-card').hidden = !(m && m.isOwner);
    buildPicGrid($('pic-grid-2'));
    showSheet('settings-sheet');
  });
  $('backdrop').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // post detail
  async function openPost(id) {
    const p = state.posts.find(x => x.id === id); if (!p) return;
    state.openPost = id;
    const m = me();
    $('post-section-label').textContent = sectionLabel(p.section);
    $('post-media').replaceChildren(p.imageUrl ? el('img', { src: p.imageUrl, alt: '' }) : el('div', { class: 'text-media', text: p.caption }));
    $('post-caption').textContent = p.imageUrl ? p.caption : '';
    $('post-caption').hidden = !p.imageUrl || !p.caption;
    $('post-date').textContent = new Date(p.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    $('post-likes').textContent = p.likeCount;
    $('post-like').classList.toggle('on', p.liked);
    $('post-delete').hidden = !(m && m.isOwner);
    $('comment-form').hidden = !m; $('comment-signup').hidden = !!m;
    showSheet('post-sheet');
    $('post-sheet').querySelector('.sheet-body').scrollTop = 0; $('post-side').scrollTop = 0;
    loadComments(id);
  }
  async function loadComments(id) {
    const m = me();
    $('comments').replaceChildren(el('li', null, el('span', { class: 'none', text: 'Loading…' })));
    try {
      const list = await db.comments(id);
      if (state.openPost !== id) return;
      $('comments').replaceChildren(...(list.length ? list.map(c => el('li', null,
        el('span', { class: 'c-initial', text: (c.name || '?').slice(0, 1).toUpperCase() }),
        el('div', { class: 'c-body' }, el('strong', { text: c.name }),
          c.site ? el('a', { class: 'c-site', href: c.site, target: '_blank', rel: 'noopener', text: new URL(c.site).hostname }) : null,
          el('small', { text: ago(c.created_at) }), el('p', { text: c.body })),
        m && (m.isOwner || m.id === c.user_id)
          ? el('button', { class: 'c-del', type: 'button', text: 'Delete', onclick: async () => { try { await db.deleteComment(c.id); loadComments(id); bumpCount(id, -1); } catch (err) { toast(err.message); } } })
          : el('span'))) : [el('li', null, el('span', { class: 'none', text: 'No comments yet.' }))]));
    } catch (err) { $('comments').replaceChildren(el('li', null, el('span', { class: 'none', text: err.message }))); }
  }
  function bumpCount(id, n) { const p = state.posts.find(x => x.id === id); if (p) { p.commentCount += n; renderAll(); renderWork(); } }

  $('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('comment-input').value.trim(); const id = state.openPost;
    if (!body || !id) return;
    $('comment-input').value = '';
    try { await db.addComment(id, body); loadComments(id); bumpCount(id, 1); }
    catch (err) { $('comment-input').value = body; toast(err.message); }
  });
  $('comment-signup').addEventListener('click', () => { const id = state.openPost; state.after = () => openPost(id); openAuth('signup'); });

  $('post-like').addEventListener('click', async () => {
    const m = me(); const p = state.posts.find(x => x.id === state.openPost); if (!p) return;
    if (!m) { const id = p.id; state.after = () => openPost(id); openAuth('signup'); return; }
    p.liked = !p.liked; p.likeCount += p.liked ? 1 : -1;
    $('post-likes').textContent = p.likeCount; $('post-like').classList.toggle('on', p.liked);
    $('post-like').classList.remove('pop'); void $('post-like').offsetWidth; if (p.liked) $('post-like').classList.add('pop');
    try { await db.toggleLike(p.id, p.liked); renderAll(); renderWork(); }
    catch (err) { p.liked = !p.liked; p.likeCount += p.liked ? 1 : -1; $('post-likes').textContent = p.likeCount; $('post-like').classList.toggle('on', p.liked); toast(err.message); }
  });

  $('post-delete').addEventListener('click', async () => {
    const id = state.openPost; if (!id || !confirm('Delete this post for good?')) return;
    try { await db.deletePost(id); closeSheet(); toast('Deleted'); refresh(); } catch (err) { toast(err.message); }
  });

  // auth
  function openAuth(mode) { setAuthMode(mode); $('auth-status').textContent = ''; showSheet('auth-sheet'); }
  function setAuthMode(mode) {
    state.authMode = mode;
    document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('on', b.dataset.auth === mode));
    $('auth-name-wrap').hidden = mode !== 'signup';
    $('auth-name').required = mode === 'signup';
    $('auth-pass').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('auth-submit').textContent = mode === 'signup' ? 'Make my account' : 'Log in';
  }
  document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('auth-status'); status.className = 'form-status'; status.textContent = 'One sec…';
    $('auth-submit').disabled = true;
    try {
      const email = $('auth-email').value.trim(), pass = $('auth-pass').value;
      if (state.authMode === 'signup') await db.signUp($('auth-name').value.trim(), email, pass);
      else await db.signIn(email, pass);
      $('auth-pass').value = '';
      closeSheet();
      toast(`Hi ${me().name}!`);
      await refresh();
      if (state.after) { const f = state.after; state.after = null; f(); }
    } catch (err) {
      status.className = 'form-status err'; status.textContent = err.message;
    } finally { $('auth-submit').disabled = false; }
  });

  // compose (owner only — the database enforces this too)
  let composeBlob = null;
  $('compose-open').addEventListener('click', () => {
    composeBlob = null; $('compose-preview').hidden = true; $('compose-drop-text').hidden = false;
    $('compose-caption').value = ''; $('compose-status').textContent = '';
    $('compose-share-wrap').hidden = true;
    showSheet('compose-sheet');
    if (LIVE) socialsApi('status').then((info) => {
      const on = SOCIALS.filter(a => info.accounts[a.id]);
      $('compose-share').replaceChildren(...on.map(a => el('button', { type: 'button', 'data-share': a.id, text: a.name })));
      $('compose-share-wrap').hidden = !on.length;
    }).catch(() => {});
  });
  $('compose-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    composeBlob = f;
    const prev = $('compose-preview'); prev.src = URL.createObjectURL(f); prev.hidden = false; $('compose-drop-text').hidden = true;
  });
  $('compose-section').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('compose-section').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('compose-share').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b) b.classList.toggle('on');
  });
  $('compose-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const caption = $('compose-caption').value.trim();
    const section = ($('compose-section').querySelector('.on') || {}).dataset.sec || 'daily';
    const status = $('compose-status'); status.className = 'form-status';
    if (!caption && !composeBlob) { status.className = 'form-status err'; status.textContent = 'Add a photo or write something.'; return; }
    const targets = [...$('compose-share').querySelectorAll('button.on')].map(b => b.dataset.share);
    if (targets.includes('instagram') && !composeBlob) { status.className = 'form-status err'; status.textContent = 'Instagram needs a photo.'; return; }
    if (targets.includes('linkedin') && !caption) { status.className = 'form-status err'; status.textContent = 'LinkedIn needs some text.'; return; }
    status.textContent = 'Posting…'; $('compose-submit').disabled = true;
    try {
      const postId = await db.createPost({ section, visibility: 'everyone', caption, blob: composeBlob });
      let note = 'Posted';
      if (targets.length) {
        status.textContent = `Posting to ${targets.map(socialName).join(' and ')}…`;
        try {
          const { results } = await socialsApi('post', { postId, targets });
          const failed = targets.filter(t => !results[t] || !results[t].ok);
          note = failed.length
            ? `Posted here, but ${failed.map(t => `${socialName(t)} failed: ${(results[t] || {}).error || 'no reply'}`).join('. ')}`
            : `Posted to ${targets.map(socialName).join(' and ')}`;
        } catch (err) { note = `Posted here, but sharing failed: ${err.message}`; }
      }
      closeSheet(); toast(note); await refresh();
    } catch (err) { status.className = 'form-status err'; status.textContent = err.message; }
    finally { $('compose-submit').disabled = false; }
  });

  // "Open in Claude" — claude://code/new?q=... opens a Claude Code session in the
  // desktop app with this prompt typed in (the person still presses Enter).
  // Phones can't run Code sessions, so there we say so instead.
  (function setupOpenInClaude() {
    const skillUrl = new URL('skill.md', location.href).href;
    const prompt = `Make me my own social, like ${C.ownerName}'s at ${location.origin}. `
      + `Read the instructions at ${skillUrl} and follow them step by step. Ask me before anything that costs money.`;
    const btn = $('open-in-claude');
    const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (phone) {
      btn.textContent = 'Send this to my computer';
      $('claude-hint').textContent = 'Making your own runs in the Claude desktop app on a computer. Send yourself this page, open it there, and tap “Open in Claude”.';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const link = location.origin + '/#make-your-own';
        try { if (navigator.share) { await navigator.share({ title: 'Make my own social', url: link }); return; } } catch (_) { return; }
        try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (_) { toast(link); }
      });
    } else {
      btn.href = 'claude://code/new?q=' + encodeURIComponent(prompt);
      btn.addEventListener('click', () => {
        setTimeout(() => { $('claude-hint').innerHTML = 'Nothing opened? Install the Claude desktop app from <a href="https://claude.ai/download" target="_blank" rel="noopener">claude.ai/download</a>, sign in, and try again.'; }, 1500);
      });
    }
    if (location.hash === '#make-your-own') { switchTab('you'); setTimeout(() => $('make-your-own').scrollIntoView(), 80); }
  })();

  // skill copy
  $('skill-copy').addEventListener('click', async () => {
    try {
      const text = await (await fetch('skill.md', { cache: 'no-store' })).text();
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it into Claude');
    } catch (_) { toast('Couldn’t copy — use the download button'); }
  });

  // =====================================================================
  //  BOOT
  // =====================================================================
  async function boot() {
    // Read login hand-off params first: everything below rewrites the address.
    const arrival = takeParams('site_code', 'site', 'connect_to');
    // Back from connecting an account: land on the card that shows the result.
    const [linked, linkStatus] = takeParams('connected', 'status', 'connected_account_id', 'appName');
    if (linked) {
      state.tab = 'you'; store.set('es-onboarded', true);
      if (linkStatus) toast(linkStatus === 'success' ? `${socialName(linked)} connected` : `Couldn’t connect ${socialName(linked)}`);
    }
    readChoicesFromUrl();
    if (isHomeScreenApp()) store.set('es-onboarded', true);
    buildThemeGrid($('theme-grid-2'));
    applyTheme(store.get('es-theme', 'blush'));
    showBanner(store.get('es-banner', DEFAULT_BANNER));
    buildIconGrid();
    renderHowTo();
    renderStatic();
    if (!LIVE && location.protocol !== 'file:') {
      // Keys set in the host's settings (the Deploy button asks for them).
      try {
        const env = await (await fetch('/api/env', { cache: 'no-store' })).json();
        if (env.supabaseUrl && env.supabaseAnonKey) {
          C.supabaseUrl = env.supabaseUrl; C.supabaseAnonKey = env.supabaseAnonKey;
          LIVE = true; db = live;
        }
      } catch (_) { /* stays in demo mode */ }
    }
    if (LIVE) {
      try { await live.init(); live.sb.auth.onAuthStateChange(() => {}); }
      catch (err) { toast(err.message); }
    }
    loadBanner();
    await handleArrivals(arrival);
    if (store.get('es-onboarded', false)) enterApp(); else startOnboarding();
    if (pendingConnect) openConnect(pendingConnect);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
