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
        users: [{ id: 'demo-friend', name: 'Sample friend', email: 'friend@example.com', is_close_friend: true, created_at: h(200) }],
        me: null, owner: false,
        posts: [
          p('daily', 'everyone', 'Sample post — this is what a photo in “Daily life” looks like. Replace it with your own.', C.selfies[2] || C.ownerPhoto, 3),
          p('ai', 'everyone', 'Sample post — text-only posts show up as cards in the grid. Good for quick AI thoughts.', null, 20),
          p('acting', 'everyone', 'Sample post — headshots, set photos, audition notes go in “Acting”.', C.selfies[1] || C.ownerPhoto, 50),
          p('daily', 'everyone', 'Sample post — another daily one.', C.selfies[0] || C.ownerPhoto, 80),
          p('work', 'everyone', 'Sample work update — longer posts read like a LinkedIn update here. Shipped a thing, learned a thing, hiring, etc.', null, 30),
          p('daily', 'close', 'Sample close-friends update — only people you switch on can see this.', null, 2),
          p('daily', 'close', 'Another one from yesterday, the kind of thing you’d put in a close-friends story.', C.selfies[0] || C.ownerPhoto, 26),
        ],
        comments: [], likes: [],
      };
    },
    session() {
      const d = this.load();
      if (d.owner) return { id: 'owner', name: C.ownerName, isOwner: true, isClose: true };
      const u = d.users.find(x => x.id === d.me);
      return u ? { id: u.id, name: u.name, email: u.email, isOwner: false, isClose: !!u.is_close_friend } : null;
    },
    async signUp(name, email) {
      const d = this.load();
      if (d.users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('That email already has an account — log in instead.');
      const u = { id: uid(), name, email, is_close_friend: false, created_at: new Date().toISOString() };
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
        .filter(p => p.visibility === 'everyone' || (me && me.isClose))
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
      d.posts.push({ id: uid(), section, visibility, caption, image, created_at: new Date().toISOString() });
      this.save(d);
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
      return this.load().users.map(u => ({ id: u.id, name: u.name, email: u.email, isClose: !!u.is_close_friend }));
    },
    async setCloseFriend(id, on) {
      const d = this.load(); const u = d.users.find(x => x.id === id); if (u) u.is_close_friend = on; this.save(d);
    },
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
        isOwner: !!(prof && prof.is_owner), isClose: !!(prof && (prof.is_close_friend || prof.is_owner)),
      };
    },
    session() { return this.me; },
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
        .select('id, section, visibility, caption, image_path, created_at, likes(count), comments(count)')
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
      const { error } = await this.sb.from('posts').insert({ section, visibility, caption, image_path });
      if (error) throw error;
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
      const { data, error } = await this.sb.from('profiles').select('id, display_name, site_url, is_close_friend, created_at').eq('is_owner', false).order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(p => ({ id: p.id, name: p.display_name, site: p.site_url, isClose: p.is_close_friend }));
    },
    async setCloseFriend(id, on) {
      const { error } = await this.sb.from('profiles').update({ is_close_friend: on }).eq('id', id);
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
  const state = { tab: 'home', section: 'all', posts: [], openPost: null, authMode: 'signup', after: null };
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
    const pic = store.get('es-pic', '');
    if (pic && !pic.startsWith('data:')) q.set('pic', pic);
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
    const t = q.get('t'), pic = q.get('pic');
    if (t && THEMES.some(x => x.id === t)) store.set('es-theme', t);
    if (pic && C.selfies.includes(pic)) store.set('es-pic', pic);
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
  function currentPic() { return store.get('es-pic', C.selfies[2] || C.selfies[0] || C.ownerPhoto); }
  async function applyPic(src) {
    if (!store.set('es-pic', src)) { toast('That picture is too big to save here.'); return; }
    $('cover-img').src = src; $('enter-cover').src = src;
    document.querySelectorAll('.pic-opt[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === src));
    syncAppUrl();
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
    const uploaded = store.get('es-pic-upload', null);
    const srcs = [...C.selfies, ...(uploaded ? [uploaded] : [])];
    const cur = currentPic();
    target.replaceChildren(
      ...srcs.map(src => el('button', { type: 'button', class: 'pic-opt' + (src === cur ? ' on' : ''), 'data-src': src, onclick: () => applyPic(src), 'aria-label': 'Use this picture' },
        el('img', { src, alt: '', loading: 'lazy' }))),
      el('button', { type: 'button', class: 'pic-opt upload', onclick: () => $('pic-upload').click() }, el('span', null, el('b', { text: '+' }), 'your own')),
    );
  }
  $('pic-upload').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const url = await blobToDataUrl(await shrinkImage(f, 900, 0.8));
      store.set('es-pic-upload', url);
      await applyPic(url);
      buildPicGrid($('pic-grid-2'));
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
    'ios-other': { label: 'Another browser on iPhone', steps: [['share', 'Find Share in your browser’s menu'], ['add', 'Tap Add to Home Screen'], ['done', 'Tap Add'], ['safari', 'Not there? Open this page in Safari instead']] },
    'ios-needs-safari': { label: 'Older iPhone, not Safari', open: 'safari', steps: [['safari', 'On this iPhone only Safari can add apps to the home screen'], ['link', 'Tap Open in Safari below (or copy the link and paste it in Safari)'], ['add', 'Then follow the steps you see there']] },
    'inapp-ios': { label: 'Inside another app on iPhone', open: 'safari', steps: [['safari', 'You opened this inside another app, which can’t add it to your home screen'], ['more', 'Tap Open in Safari below, or tap ••• in this app and choose Open in Safari / Open in browser'], ['add', 'Then follow the steps you see there']] },
    'inapp-android': { label: 'Inside another app on Android', open: 'chrome', steps: [['link', 'You opened this inside another app, which can’t add it to your home screen'], ['menu', 'Tap Open in Chrome below, or tap ⋮ in this app and choose Open in browser'], ['add', 'Then follow the steps you see there']] },
    'android': { label: 'Chrome on Android', steps: [['menu', 'Tap ⋮ at the top right'], ['install', 'Tap Add to Home screen (or Install app)'], ['done', 'Tap Install']] },
    'android-edge': { label: 'Edge on Android', steps: [['burger', 'Tap ☰ at the bottom right'], ['install', 'Tap Add to phone'], ['done', 'Tap Install']] },
    'samsung': { label: 'Samsung Internet', steps: [['burger', 'Tap ☰ at the bottom right'], ['add', 'Tap Add page to, then Home screen'], ['done', 'Tap Install or Add']] },
    'android-firefox': { label: 'Firefox on Android', steps: [['menu', 'Tap ⋮ (top or bottom right)'], ['install', 'Tap Add app to Home screen (or Add to Home screen)'], ['done', 'Tap Add']] },
    'android-opera': { label: 'Opera on Android', steps: [['menu', 'Tap ⋮ at the top right'], ['add', 'Tap Add to, then Home screen'], ['done', 'Tap Add']] },
    'android-other': { label: 'Another browser on Android', steps: [['menu', 'Open your browser’s menu'], ['install', 'Choose Add to Home screen or Install app'], ['done', 'Tap Add']] },
    'desktop-chrome': { label: 'Chrome on a computer', steps: [['bar', 'Click the install icon at the right of the address bar'], ['install', 'No icon? Click ⋮ → Cast, save and share → Install page as app'], ['done', `Click Install — ${C.handle} opens in its own window`]] },
    'desktop-edge': { label: 'Edge on a computer', steps: [['bar', 'Click “App available” at the right of the address bar'], ['install', 'Not there? Click ⋯ → Apps → Install this site as an app'], ['done', 'Click Install']] },
    'desktop-safari': { label: 'Safari on a Mac', steps: [['dock', 'Click File in the menu bar'], ['add', 'Click Add to Dock'], ['done', 'Click Add']] },
    'desktop-other': { label: 'Firefox or an older browser on a computer', open: 'copy', steps: [['link', 'This browser can’t add sites as apps'], ['bar', 'Copy the link below and open it in Chrome, Edge or Safari'], ['done', 'Then follow the steps you see there']] },
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
      if (inApp) return 'inapp-android';
      if (/SamsungBrowser/.test(ua)) return 'samsung';
      if (/EdgA/.test(ua)) return 'android-edge';
      if (/Firefox/.test(ua)) return 'android-firefox';
      if (/OPR|Opera/.test(ua)) return 'android-opera';
      if (/Chrome\//.test(ua)) return 'android';
      return 'android-other';
    }
    if (/Edg\//.test(ua)) return 'desktop-edge';
    if (/Chrome\//.test(ua)) return 'desktop-chrome';
    if (/Safari/.test(ua) && Number((ua.match(/Version\/(\d+)/) || [])[1]) >= 17) return 'desktop-safari';
    return 'desktop-other';
  }
  const DETECTED = detectBrowser();
  let howKey = DETECTED;
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
  $('how-pick').replaceChildren(...Object.entries(HOW_FLOW).map(([k, f]) => el('option', { value: k, text: f.label })));
  $('how-pick').addEventListener('change', (e) => { howKey = e.target.value; renderHowTo(); });
  function renderHowTo() {
    const flow = HOW_FLOW[howKey];
    $('how-pick').value = howKey;
    $('how-detected').textContent = howKey === DETECTED ? 'Steps for your phone:' : 'Showing steps for:';
    const oneTap = !!installEvt && howKey === DETECTED;
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
    $('app').hidden = true; $('onboard').hidden = false;
    showStep(0);
  }
  document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => showStep(obStep + 1)));
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
      $('stat-members').textContent = await db.memberCount();
    } catch (err) {
      toast('Could not load posts: ' + err.message);
      state.posts = [];
    }
    renderHome(); renderWork(); renderFriends();
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
    $('work-name').textContent = C.ownerName;
    $('work-headline').textContent = C.work.headline;
    $('work-location').textContent = C.work.location;
    $('work-about').textContent = C.work.about;
    $('work-links').replaceChildren(...C.work.links.map(l => el('a', { href: l.url, target: '_blank', rel: 'noopener', text: l.label })));
    $('work-exp').replaceChildren(...C.work.experience.map(x => el('li', null,
      el('span', { class: 'org-badge', text: x.org.slice(0, 1) }),
      el('div', null, el('strong', { text: x.role }), el('span', { text: `${x.org} · ${x.when}` }), x.note ? el('span', { text: x.note }) : null))));
    $('section-chips').replaceChildren(...[{ id: 'all', label: 'All' }, ...SECTIONS.filter(s => GRID_SECTIONS.includes(s.id))]
      .map(s => el('button', { type: 'button', class: 'chip' + (state.section === s.id ? ' on' : ''), 'data-sec': s.id, text: s.label,
        onclick: () => { state.section = s.id; document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.sec === s.id)); renderHome(); } })));
    $('compose-section').replaceChildren(...SECTIONS.map((s, i) => el('button', { type: 'button', 'data-sec': s.id, class: i === 0 ? 'on' : '', text: s.label })));
  }

  function renderHome() {
    const pub = state.posts.filter(p => p.visibility === 'everyone' && GRID_SECTIONS.includes(p.section));
    const shown = state.section === 'all' ? pub : pub.filter(p => p.section === state.section);
    $('stat-posts').textContent = state.posts.filter(p => p.visibility === 'everyone').length;
    $('grid').replaceChildren(...shown.map(p => p.imageUrl
      ? el('button', { type: 'button', class: 'tile', onclick: () => openPost(p.id), 'aria-label': p.caption || 'Post' },
          el('img', { src: p.imageUrl, alt: '', loading: 'lazy' }),
          state.section === 'all' ? el('span', { class: 'tag', text: sectionLabel(p.section) }) : null)
      : el('button', { type: 'button', class: 'tile text', onclick: () => openPost(p.id) },
          el('span', { text: p.caption }),
          state.section === 'all' ? el('span', { class: 'tag', text: sectionLabel(p.section) }) : null)));
    $('grid-empty').hidden = shown.length > 0;
  }

  function feedCard(p) {
    return el('article', { class: 'feed-card', onclick: () => openPost(p.id) },
      el('div', { class: 'fc-head' }, el('img', { src: C.ownerPhoto, alt: '' }),
        el('div', null, el('strong', { text: C.ownerName }), el('span', { text: ago(p.created_at) + (p.visibility === 'close' ? ' · close friends' : '') }))),
      p.caption ? el('p', { class: 'fc-text', text: p.caption }) : null,
      p.imageUrl ? el('img', { class: 'fc-img', src: p.imageUrl, alt: '', loading: 'lazy' }) : null,
      el('div', { class: 'fc-foot' }, el('span', { text: `♥ ${p.likeCount}` }), el('span', { text: `${p.commentCount} comment${p.commentCount === 1 ? '' : 's'}` })));
  }

  function renderWork() {
    const items = state.posts.filter(p => p.section === 'work' && p.visibility === 'everyone');
    $('work-feed').replaceChildren(...items.map(feedCard));
    $('work-empty').hidden = items.length > 0;
  }

  function renderFriends() {
    const m = me();
    const gate = $('friends-gate');
    if (!m || !m.isClose) {
      gate.hidden = false; $('friends-feed').replaceChildren(); $('friends-empty').hidden = true;
      gate.replaceChildren(...(!m
        ? [el('p', { text: `This page is just for ${C.ownerName}’s close friends.` }), el('p', { class: 'muted small', text: `Log in, then ask ${C.ownerName} to add you.` }),
           el('button', { class: 'btn-primary', type: 'button', text: 'Log in', onclick: () => openAuth('signup') })]
        : [el('p', { text: `You’re in, ${m.name}.` }), el('p', { class: 'muted small', text: `${C.ownerName} hasn’t added you to close friends yet. Your name is on the list — give ${C.ownerName} a nudge.` })]));
      return;
    }
    gate.hidden = true;
    const items = state.posts.filter(p => p.visibility === 'close');
    const out = []; let last = '';
    for (const p of items) {
      const d = dayLabel(p.created_at);
      if (d !== last) { out.push(el('p', { class: 'day-label', text: d })); last = d; }
      out.push(feedCard(p));
    }
    $('friends-feed').replaceChildren(...out);
    $('friends-empty').hidden = items.length > 0;
  }

  async function renderYou() {
    const m = me();
    $('you-account').replaceChildren(el('div', { class: 'card account-card' }, ...(m
      ? [el('span', { class: 'initial', text: m.name.slice(0, 1).toUpperCase() }),
         el('div', null, el('strong', { text: m.name }), el('span', { text: (m.isOwner ? 'Owner' : m.isClose ? 'Close friend' : 'Friend') + (m.site ? ' · via ' + new URL(m.site).hostname : '') })),
         el('button', { type: 'button', text: 'Log out', onclick: async () => { await db.signOut(); toast('Logged out'); refresh(); renderYou(); } })]
      : [el('span', { class: 'initial', text: '?' }),
         el('div', null, el('strong', { text: 'Not logged in' }), el('span', { text: 'Log in to comment.' })),
         el('button', { type: 'button', text: 'Log in', onclick: () => openAuth('signup') })])));
    $('demo-card').hidden = LIVE;
    $('demo-owner').checked = !LIVE && !!(m && m.isOwner);
    const card = $('members-card');
    card.hidden = !(m && m.isOwner);
    if (!card.hidden) {
      try {
        const list = await db.members();
        $('members').replaceChildren(...(list.length ? list.map(u => {
          const box = el('input', { type: 'checkbox', 'aria-label': `Close friend: ${u.name}` });
          box.checked = u.isClose;
          box.addEventListener('change', async () => {
            try { await db.setCloseFriend(u.id, box.checked); toast(box.checked ? `${u.name} can see close friends` : `${u.name} removed from close friends`); }
            catch (err) { box.checked = !box.checked; toast(err.message); }
          });
          return el('li', null, el('span', null, u.name, u.site ? el('small', { text: 'via ' + new URL(u.site).hostname }) : u.email ? el('small', { text: u.email }) : null), box);
        }) : [el('li', null, el('span', { class: 'muted', text: 'Nobody has signed up yet.' }))]));
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
    fetchCard(origin).then(c => {
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
  async function renderPeople() {
    const m = me();
    $('add-person').hidden = !(m && m.isOwner);
    let urls = [];
    try { urls = await db.people(); } catch (err) { toast(err.message); }
    $('people-list').replaceChildren(...urls.map(u => personCard(u, !!(m && m.isOwner))));
    $('people-empty').hidden = urls.length > 0;
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
    closeSheet(); switchTab('people');
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
  $('backdrop').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // post detail
  async function openPost(id) {
    const p = state.posts.find(x => x.id === id); if (!p) return;
    state.openPost = id;
    const m = me();
    $('post-section-label').textContent = sectionLabel(p.section) + (p.visibility === 'close' ? ' · close friends' : '');
    $('post-media').replaceChildren(p.imageUrl ? el('img', { src: p.imageUrl, alt: '' }) : el('div', { class: 'text-media', text: p.caption }));
    $('post-caption').textContent = p.imageUrl ? p.caption : '';
    $('post-caption').hidden = !p.imageUrl || !p.caption;
    $('post-date').textContent = new Date(p.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    $('post-likes').textContent = p.likeCount;
    $('post-like').classList.toggle('on', p.liked);
    $('post-delete').hidden = !(m && m.isOwner);
    $('comment-form').hidden = !m; $('comment-signup').hidden = !!m;
    showSheet('post-sheet');
    $('post-sheet').querySelector('.sheet-body').scrollTop = 0;
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
  function bumpCount(id, n) { const p = state.posts.find(x => x.id === id); if (p) { p.commentCount += n; renderWork(); renderFriends(); } }

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
    try { await db.toggleLike(p.id, p.liked); renderWork(); renderFriends(); }
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
  let composeBlob = null, composeVis = 'everyone';
  $('compose-open').addEventListener('click', () => {
    composeBlob = null; $('compose-preview').hidden = true; $('compose-drop-text').hidden = false;
    $('compose-caption').value = ''; $('compose-status').textContent = '';
    showSheet('compose-sheet');
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
  $('compose-vis').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    composeVis = b.dataset.vis;
    $('compose-vis').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('compose-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const caption = $('compose-caption').value.trim();
    const section = ($('compose-section').querySelector('.on') || {}).dataset.sec || 'daily';
    const status = $('compose-status'); status.className = 'form-status';
    if (!caption && !composeBlob) { status.className = 'form-status err'; status.textContent = 'Add a photo or write something.'; return; }
    status.textContent = 'Posting…'; $('compose-submit').disabled = true;
    try {
      await db.createPost({ section, visibility: composeVis, caption, blob: composeBlob });
      closeSheet(); toast('Posted'); await refresh();
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
    if (location.hash === '#make-your-own') { switchTab('people'); setTimeout(() => $('make-your-own').scrollIntoView(), 80); }
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
    readChoicesFromUrl();
    if (isHomeScreenApp()) store.set('es-onboarded', true);
    buildThemeGrid($('theme-grid-2'));
    applyTheme(store.get('es-theme', 'blush'));
    buildPicGrid($('pic-grid-2'));
    applyPic(currentPic());
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
    await handleArrivals(arrival);
    if (store.get('es-onboarded', false)) enterApp(); else startOnboarding();
    if (pendingConnect) openConnect(pendingConnect);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
