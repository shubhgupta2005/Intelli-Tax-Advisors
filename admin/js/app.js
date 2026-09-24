// Admin portal: auth, routing and views. Data access is protected by RLS (see supabase/*.sql).
(function(){
  const { esc, $, $$, el, must, toast, fail, confirmBox, drawer, buildForm, fmtDate, fmtSize, mediaUrl, slugify } = UI;
  const S = window.SCHEMA, D = window.DEFAULT_CONTENT, cfg = window.SITE_CONFIG || {};
  const Admin = window.Admin = { db: null, user: null };

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const authPanels = { login: 'loginForm', reset: 'resetForm', newpass: 'newPassForm', notadmin: 'notAdmin', noconfig: 'noConfig' };
  const authMsg = (text, kind = 'err') => { const m = $('#authMsg'); m.textContent = text || ''; m.className = 'auth-msg ' + kind; };

  function showAuth(panel){
    $('#boot').hidden = true; $('#app').hidden = true; $('#auth').hidden = false;
    for (const k in authPanels) $('#' + authPanels[k]).hidden = k !== panel;
    authMsg('');
    $('#' + authPanels[panel]).querySelector('input')?.focus();
  }

  async function enter(user){
    Admin.user = user;
    const { data, error } = await Admin.db.from('admins').select('user_id').eq('user_id', user.id);
    if (error || !data.length) { $('#naEmail').textContent = user.email; showAuth('notadmin'); return; }
    $('#whoami').textContent = user.email;
    $('#boot').hidden = true; $('#auth').hidden = true; $('#app').hidden = false;
    if (!location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname + '#/dashboard');
    route();
    refreshNewCount();
  }

  async function boot(){
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return showAuth('noconfig');
    const db = Admin.db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    let recovering = /type=recovery/.test(location.hash);
    db.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; showAuth('newpass'); }
    });
    const { data: { session } } = await db.auth.getSession();
    if (recovering) showAuth('newpass');
    else if (session) enter(session.user);
    else showAuth('login');
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#lEmail').value.trim(), password = $('#lPass').value;
    if (!email || !password) return authMsg('Enter your email and password.');
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; authMsg('');
    const { data, error } = await Admin.db.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) return authMsg(/invalid/i.test(error.message) ? 'Email or password is incorrect.' : error.message);
    $('#lPass').value = '';
    enter(data.user);
  });

  $('#resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#rEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return authMsg('Enter the email you sign in with.');
    const { error } = await Admin.db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return authMsg(error.message);
    authMsg('If that account exists, a reset link is on its way. Check your inbox.', 'ok');
  });

  $('#newPassForm').addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('#nPass').value, b = $('#nPass2').value;
    if (a.length < 8) return authMsg('Use at least 8 characters.');
    if (a !== b) return authMsg('The two passwords don’t match.');
    const { data, error } = await Admin.db.auth.updateUser({ password: a });
    if (error) return authMsg(error.message);
    history.replaceState(null, '', location.pathname + '#/dashboard');
    toast('Password updated');
    enter(data.user);
  });

  document.addEventListener('click', async e => {
    const sw = e.target.closest('[data-auth]'); if (sw) showAuth(sw.dataset.auth);
    if (e.target.closest('[data-signout]')) {
      if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
      dirty = false;
      await Admin.db.auth.signOut();
      showAuth('login');
    }
  });

  // Mobile sidebar
  const side = $('#side'), scrim = $('#scrim'), sideToggle = $('#sideToggle');
  const setSide = open => { side.classList.toggle('open', open); scrim.classList.toggle('open', open); sideToggle.setAttribute('aria-expanded', open); };
  sideToggle.addEventListener('click', () => setSide(!side.classList.contains('open')));
  scrim.addEventListener('click', () => setSide(false));

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  let dirty = false, lastHash = '', navToken = 0;
  const setDirty = v => { dirty = v; };
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', route);

  const routes = [
    [/^#\/dashboard$/, viewDashboard],
    [/^#\/enquiries$/, viewEnquiries],
    [/^#\/insights$/, viewInsights],
    [/^#\/insights\/new$/, () => viewInsightEditor(null)],
    [/^#\/insights\/(\d+)$/, m => viewInsightEditor(+m[1])],
    [/^#\/c\/(\w+)$/, m => viewCollection(m[1])],
    [/^#\/sections$/, viewSections],
    [/^#\/sections\/(\w+)$/, m => viewSectionEditor(m[1])],
    [/^#\/media$/, viewMedia],
    [/^#\/settings$/, viewSettings],
  ];

  async function route(){
    if ($('#app').hidden) return;
    const h = location.hash;
    if (!h.startsWith('#/')) return;               // auth callback fragments
    if (h === lastHash) return;
    if (dirty) {
      if (!confirm('You have unsaved changes. Leave without saving?')) { history.replaceState(null, '', lastHash); return; }
      dirty = false;
    }
    lastHash = h; setSide(false);
    const key = h.slice(2);
    $$('#sideNav a').forEach(a => a.toggleAttribute('aria-current', key === a.dataset.nav || key.startsWith(a.dataset.nav + '/')));
    $$('#sideNav a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page'));
    const match = routes.map(([re, fn]) => [h.match(re), fn]).find(([m]) => m);
    if (!match) { location.hash = '#/dashboard'; return; }
    const token = ++navToken, view = $('#view');
    view.innerHTML = '<p class="muted">Loading…</p>';
    let node;
    try { node = await match[1](match[0]); }
    catch (e) { fail(e); node = el(`<div class="empty"><p>${esc(UI.errText(e))}</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>`); }
    if (token !== navToken) return;               // user navigated away while loading
    view.replaceChildren(node);
    window.scrollTo(0, 0); view.focus({ preventScroll: true });
  }
  const go = hash => { dirty = false; lastHash = ''; if (location.hash === hash) route(); else location.hash = hash; };

  const pageHead = ({ eyebrow, title, sub, actions = '' }) => `
    <header class="page-head"><div>${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>
    <div class="actions">${actions}</div></header>`;

  async function refreshNewCount(){
    const { count } = await Admin.db.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
    const b = $('#newCount'); b.hidden = !count; b.textContent = count || '';
  }
  const countOf = async q => { const { count, error } = await q; if (error) throw error; return count || 0; };

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------
  async function viewDashboard(){
    const db = Admin.db, since = new Date(Date.now() - 30 * 864e5).toISOString();
    const head = (t, o = {}) => db.from(t).select('id', { count: 'exact', head: true, ...o });
    const [newQ, monthQ, live, drafts, recent, posts] = await Promise.all([
      countOf(head('enquiries').eq('status', 'new')),
      countOf(head('enquiries').gte('created_at', since)),
      countOf(head('insights').eq('is_published', true).lte('published_at', new Date().toISOString())),
      countOf(head('insights').eq('is_published', false)),
      must(db.from('enquiries').select('id,name,company,email,topic,status,created_at').order('created_at', { ascending: false }).limit(6)),
      must(db.from('insights').select('id,title,is_published,published_at,updated_at').order('updated_at', { ascending: false }).limit(5)),
    ]);
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Overview', title: `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}.`, sub: 'Everything on intellitaxadvisors.com, in one place.',
        actions: `<a class="btn" href="../index.html" target="_blank" rel="noopener">View website ↗</a><a class="btn btn-primary" href="#/insights/new">New blog post</a>` })}
      <div class="stats">
        <a class="stat" href="#/enquiries"><strong>${newQ}</strong><span>New enquiries</span></a>
        <a class="stat" href="#/enquiries"><strong>${monthQ}</strong><span>Enquiries, last 30 days</span></a>
        <a class="stat" href="#/insights"><strong>${live}</strong><span>Live posts</span></a>
        <a class="stat" href="#/insights"><strong>${drafts}</strong><span>Drafts</span></a>
      </div>
      <div class="grid-2">
        <section class="card"><header><h2>Latest enquiries</h2><a class="btn btn-sm" href="#/enquiries">All enquiries</a></header>
          ${recent.length ? `<div class="table-wrap" style="border:0"><table class="table"><tbody>${recent.map(r => `
            <tr class="click${r.status === 'new' ? ' unread' : ''}" data-href="#/enquiries"><td><div class="t-main">${esc(r.name)}</div><div class="t-sub">${esc(r.company || r.email)}</div></td>
            <td class="t-sub">${esc(r.topic || '')}</td><td>${statusBadge(r.status)}</td><td class="t-sub" style="white-space:nowrap">${esc(fmtDate(r.created_at))}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty"><p>No enquiries yet. Submissions from the contact form land here.</p></div>'}
        </section>
        <div style="display:flex;flex-direction:column;gap:24px">
          <section class="card"><header><h2>Quick actions</h2></header><nav class="quick">
            <a href="#/insights/new">Write a blog post <span>→</span></a>
            <a href="#/sections/hero">Edit the hero <span>→</span></a>
            <a href="#/c/services">Update services <span>→</span></a>
            <a href="#/c/clients">Add a client logo <span>→</span></a>
            <a href="#/settings">Change contact details <span>→</span></a>
            <a href="#/media">Upload images <span>→</span></a>
          </nav></section>
          <section class="card"><header><h2>Recently edited posts</h2></header><nav class="quick">
            ${posts.length ? posts.map(p => `<a href="#/insights/${p.id}"><span>${esc(p.title)}</span>${postBadge(p)}</a>`).join('') : '<div class="empty"><p>No posts yet.</p></div>'}
          </nav></section>
        </div>
      </div></div>`);
    node.addEventListener('click', e => { const r = e.target.closest('tr[data-href]'); if (r) location.hash = r.dataset.href; });
    refreshNewCount();
    return node;
  }

  // ---------------------------------------------------------------------------
  // Enquiries
  // ---------------------------------------------------------------------------
  const statusLabel = v => (S.enquiryStatuses.find(s => s.value === v) || {}).label || v;
  const statusBadge = v => `<span class="badge ${esc(v)}">${esc(statusLabel(v))}</span>`;

  async function viewEnquiries(){
    let rows = await must(Admin.db.from('enquiries').select('*').order('created_at', { ascending: false }).limit(2000));
    let filter = 'open', q = '';
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Inbox', title: 'Enquiries', sub: 'Everything submitted through the website’s contact form.',
        actions: '<button class="btn" type="button" data-export>Export CSV</button>' })}
      <div class="toolbar"><div class="tabs" data-tabs></div><input class="search" type="search" placeholder="Search name, email, company…" aria-label="Search enquiries"></div>
      <div data-list></div></div>`);
    const tabs = node.querySelector('[data-tabs]'), list = node.querySelector('[data-list]');
    const FILTERS = [{ value: 'open', label: 'Open' }, ...S.enquiryStatuses, { value: 'all', label: 'All' }];
    const inFilter = (r, f) => f === 'all' ? true : f === 'open' ? !['closed', 'spam'].includes(r.status) : r.status === f;
    const matches = r => !q || [r.name, r.email, r.company, r.phone, r.topic, r.message].some(v => (v || '').toLowerCase().includes(q));
    const shown = () => rows.filter(r => inFilter(r, filter) && matches(r));

    function render(){
      tabs.innerHTML = FILTERS.map(f => `<button type="button" data-f="${f.value}" aria-pressed="${f.value === filter}">${esc(f.label)}<small>${rows.filter(r => inFilter(r, f.value)).length}</small></button>`).join('');
      const list_ = shown();
      list.innerHTML = list_.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>From</th><th>Topic</th><th>Status</th><th>Received</th></tr></thead>
        <tbody>${list_.map(r => `<tr class="click${r.status === 'new' ? ' unread' : ''}" data-id="${r.id}" tabindex="0">
          <td><div class="t-main">${esc(r.name)}</div><div class="t-sub">${esc([r.company, r.email].filter(Boolean).join(' · '))}</div></td>
          <td><div>${esc(r.topic || '—')}</div><div class="t-sub">${esc((r.message || '').slice(0, 90))}${(r.message || '').length > 90 ? '…' : ''}</div></td>
          <td>${statusBadge(r.status)}</td><td class="t-sub" style="white-space:nowrap">${esc(fmtDate(r.created_at, true))}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="table-wrap"><div class="empty"><p>${rows.length ? 'Nothing matches this filter.' : 'No enquiries yet. Submissions from the contact form will appear here.'}</p></div></div>`;
    }

    function open(r){
      const body = el(`<div>
        <dl class="kv">
          <dt>Received</dt><dd>${esc(fmtDate(r.created_at, true))}</dd>
          <dt>Name</dt><dd>${esc(r.name)}</dd>
          ${r.company ? `<dt>Company</dt><dd>${esc(r.company)}</dd>` : ''}
          <dt>Email</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd>
          ${r.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a></dd>` : ''}
          <dt>Topic</dt><dd>${esc(r.topic || '—')}</dd>
        </dl>
        ${r.message ? `<p class="eyebrow" style="margin-bottom:8px">Message</p><p class="msg">${esc(r.message)}</p>` : ''}
      </div>`);
      const form = buildForm([
        { key: 'status', label: 'Status', type: 'select', options: S.enquiryStatuses },
        { key: 'admin_notes', label: 'Internal notes', type: 'textarea', rows: 4, help: 'Only visible to admins.' },
      ], r);
      body.append(form.el);
      const subject = encodeURIComponent('Re: your enquiry — Intelli Tax Advisors');
      drawer({ title: r.name, body, buttons: [
        { label: 'Delete', cls: 'btn-danger', left: true, onClick: async () => {
          if (!await confirmBox(`Delete the enquiry from ${r.name}? This can’t be undone.`)) return false;
          await must(Admin.db.from('enquiries').delete().eq('id', r.id));
          rows = rows.filter(x => x.id !== r.id); render(); refreshNewCount(); toast('Enquiry deleted');
        } },
        { label: 'Reply by email', left: true, onClick: () => { location.href = `mailto:${r.email}?subject=${subject}`; return false; } },
        { label: 'Save', cls: 'btn-primary', onClick: async () => {
          const v = form.values();
          const saved = await must(Admin.db.from('enquiries').update({ status: v.status, admin_notes: v.admin_notes || null }).eq('id', r.id).select().single());
          rows = rows.map(x => x.id === r.id ? saved : x); render(); refreshNewCount(); toast('Enquiry updated');
        } },
      ] });
    }

    tabs.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; render(); } });
    node.querySelector('.search').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
    list.addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) open(rows.find(r => r.id === +tr.dataset.id)); });
    list.addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(rows.find(r => r.id === +tr.dataset.id)); } });
    node.querySelector('[data-export]').addEventListener('click', () => {
      const cols = [['Received', r => fmtDate(r.created_at, true)], ['Name', r => r.name], ['Company', r => r.company], ['Email', r => r.email],
        ['Phone', r => r.phone], ['Topic', r => r.topic], ['Message', r => r.message], ['Status', r => statusLabel(r.status)], ['Notes', r => r.admin_notes]]
        .map(([label, get]) => ({ label, get }));
      UI.download(`enquiries-${new Date().toISOString().slice(0, 10)}.csv`, UI.toCsv(shown(), cols));
    });
    render();
    return node;
  }

  // ---------------------------------------------------------------------------
  // Generic ordered collections (services, industries, partners, clients, testimonials)
  // ---------------------------------------------------------------------------
  async function viewCollection(key){
    const def = S.collections[key];
    if (!def) throw new Error('Unknown section.');
    const db = Admin.db;
    let rows = await must(db.from(key).select('*').order('sort_order').order('id'));
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Content', title: def.label, sub: def.sub,
        actions: `<a class="btn" href="../index.html#${def.anchor}" target="_blank" rel="noopener">View on site ↗</a><button class="btn btn-primary" type="button" data-add>Add ${esc(def.singular)}</button>` })}
      <div data-list></div>
      <p class="list-note">Use ↑ ↓ to change the order on the website. Hidden items stay here but don’t show on the site.</p></div>`);
    const list = node.querySelector('[data-list]');

    function render(){
      list.innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>
        ${def.thumb ? '<th></th>' : ''}<th>${esc(def.singular[0].toUpperCase() + def.singular.slice(1))}</th><th>On site</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr data-id="${r.id}">
          ${def.thumb ? `<td style="width:72px"><div class="thumb${def.round ? ' round' : ''}">${def.thumb(r) ? `<img src="${esc(mediaUrl(def.thumb(r)))}" alt="" loading="lazy">` : ''}</div></td>` : ''}
          <td><div class="t-main">${esc(def.title(r))}</div>${def.subtitle ? `<div class="t-sub">${esc(def.subtitle(r) || '')}</div>` : ''}
            ${def.preview ? `<div class="t-sub">${esc((def.preview(r) || '').slice(0, 110))}…</div>` : ''}</td>
          <td style="width:90px"><label class="switch" title="Show on website"><input type="checkbox" data-pub ${r.is_published ? 'checked' : ''} aria-label="Show ${esc(def.title(r))} on website"><span class="track"></span></label></td>
          <td class="t-actions">
            <button class="icon-btn" type="button" data-up aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" type="button" data-down aria-label="Move down" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-sm" type="button" data-edit>Edit</button>
            <button class="icon-btn" type="button" data-del aria-label="Delete">✕</button>
          </td></tr>`).join('')}</tbody></table></div>`
        : `<div class="table-wrap"><div class="empty"><p>No ${esc(def.label.toLowerCase())} yet.</p><button class="btn btn-primary" type="button" data-add>Add ${esc(def.singular)}</button></div></div>`;
    }

    async function reload(){ rows = await must(db.from(key).select('*').order('sort_order').order('id')); render(); }

    // Renumber everything in steps of 10 and save only rows whose position changed.
    async function saveOrder(){
      const changed = rows.map((r, i) => ({ r, o: (i + 1) * 10 })).filter(({ r, o }) => r.sort_order !== o);
      await Promise.all(changed.map(({ r, o }) => must(db.from(key).update({ sort_order: o }).eq('id', r.id))));
      changed.forEach(({ r, o }) => r.sort_order = o);
    }

    function edit(row){
      const isNew = !row;
      const form = buildForm(def.fields, row || {});
      drawer({ title: isNew ? `New ${def.singular}` : `Edit ${def.singular}`, body: form.el, buttons: [
        ...(isNew ? [] : [{ label: 'Delete', cls: 'btn-danger', left: true, onClick: () => remove(row) }]),
        { label: isNew ? `Add ${def.singular}` : 'Save changes', cls: 'btn-primary', onClick: async () => {
          const err = form.validate(); if (err) { toast(err, 'err'); return false; }
          const v = form.values();
          if (isNew) await must(db.from(key).insert({ ...v, sort_order: (Math.max(0, ...rows.map(r => r.sort_order)) + 10) }));
          else await must(db.from(key).update(v).eq('id', row.id));
          await reload(); toast(isNew ? `${def.singular[0].toUpperCase() + def.singular.slice(1)} added` : 'Changes saved');
        } },
      ] });
    }

    async function remove(row){
      if (!await confirmBox(`Delete “${def.title(row)}”? This can’t be undone. To take it off the site temporarily, switch “On site” off instead.`)) return false;
      await must(db.from(key).delete().eq('id', row.id));
      await reload(); toast('Deleted');
    }

    node.addEventListener('click', async e => {
      if (e.target.closest('[data-add]')) return edit(null);
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const i = rows.findIndex(r => r.id === +tr.dataset.id), row = rows[i];
      try {
        if (e.target.closest('[data-edit]')) edit(row);
        else if (e.target.closest('[data-del]')) await remove(row);
        else if (e.target.closest('[data-up]') || e.target.closest('[data-down]')) {
          const j = e.target.closest('[data-up]') ? i - 1 : i + 1;
          [rows[i], rows[j]] = [rows[j], rows[i]]; render();
          await saveOrder(); toast('Order saved');
        }
      } catch (err) { fail(err); reload(); }
    });
    node.addEventListener('change', async e => {
      const cb = e.target.closest('[data-pub]'); if (!cb) return;
      const row = rows.find(r => r.id === +cb.closest('tr').dataset.id);
      try { await must(db.from(key).update({ is_published: cb.checked }).eq('id', row.id)); row.is_published = cb.checked; toast(cb.checked ? 'Now showing on the site' : 'Hidden from the site'); }
      catch (err) { cb.checked = !cb.checked; fail(err); }
    });
    render();
    return node;
  }

  // ---------------------------------------------------------------------------
  // Insights / blog
  // ---------------------------------------------------------------------------
  const postStatus = p => !p.is_published ? 'draft' : (p.published_at && new Date(p.published_at) > new Date()) ? 'scheduled' : 'live';
  const postBadge = p => { const s = postStatus(p); return `<span class="badge ${s}">${s === 'live' ? 'Live' : s === 'scheduled' ? 'Scheduled' : 'Draft'}</span>`; };

  async function viewInsights(){
    const db = Admin.db;
    let rows = await must(db.from('insights').select('id,slug,title,category,excerpt,is_published,published_at,has_body,updated_at').order('published_at', { ascending: false, nullsFirst: false }).order('sort_order'));
    let filter = 'all';
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Content', title: 'Insights & blog', sub: 'The homepage shows the three newest live posts; every live post is listed on the Insights page.',
        actions: '<a class="btn" href="../insights.html" target="_blank" rel="noopener">View Insights page ↗</a><a class="btn btn-primary" href="#/insights/new">New post</a>' })}
      <div class="toolbar"><div class="tabs" data-tabs></div></div><div data-list></div></div>`);
    const tabs = node.querySelector('[data-tabs]'), list = node.querySelector('[data-list]');
    const F = [['all', 'All'], ['live', 'Live'], ['scheduled', 'Scheduled'], ['draft', 'Drafts']];
    function render(){
      tabs.innerHTML = F.map(([v, l]) => `<button type="button" data-f="${v}" aria-pressed="${v === filter}">${l}<small>${rows.filter(r => v === 'all' || postStatus(r) === v).length}</small></button>`).join('');
      const shown = rows.filter(r => filter === 'all' || postStatus(r) === filter);
      list.innerHTML = shown.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Post</th><th>Topic</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
        ${shown.map(p => `<tr class="click" data-id="${p.id}">
          <td><div class="t-main">${esc(p.title)}</div><div class="t-sub">${p.has_body ? '/post.html?slug=' + esc(p.slug) : 'Card only — add body text to publish a full article'}</div></td>
          <td class="t-sub">${esc(p.category)}</td><td>${postBadge(p)}</td>
          <td class="t-sub" style="white-space:nowrap">${esc(fmtDate(p.published_at))}</td>
          <td class="t-actions">${postStatus(p) === 'live' && p.has_body ? `<a class="btn btn-sm" href="../post.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener" data-stop>View ↗</a>` : ''}
            <a class="btn btn-sm" href="#/insights/${p.id}">Edit</a><button class="icon-btn" type="button" data-del aria-label="Delete">✕</button></td></tr>`).join('')}
        </tbody></table></div>`
        : `<div class="table-wrap"><div class="empty"><p>${rows.length ? 'No posts in this view.' : 'No posts yet.'}</p><a class="btn btn-primary" href="#/insights/new">Write the first post</a></div></div>`;
    }
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; render(); } });
    list.addEventListener('click', async e => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const p = rows.find(r => r.id === +tr.dataset.id);
      if (e.target.closest('[data-del]')) {
        if (!await confirmBox(`Delete “${p.title}”? This can’t be undone.`)) return;
        try { await must(db.from('insights').delete().eq('id', p.id)); rows = rows.filter(r => r.id !== p.id); render(); toast('Post deleted'); } catch (err) { fail(err); }
      } else location.hash = `#/insights/${p.id}`;
    });
    render();
    return node;
  }

  async function viewInsightEditor(id){
    const db = Admin.db;
    const [post, cats] = await Promise.all([
      id ? must(db.from('insights').select('*').eq('id', id).single()) : null,
      must(db.from('insights').select('category')),
    ]);
    const p = post || { title: '', slug: '', category: '', read_minutes: null, excerpt: '', body: '', is_published: false, published_at: new Date().toISOString() };
    const isNew = !post;
    let slugTouched = !isNew && !!p.slug;

    const node = el(`<div>
      ${pageHead({ eyebrow: isNew ? 'New post' : 'Edit post', title: isNew ? 'Write a new briefing' : p.title,
        actions: `<a class="back-link" href="#/insights">← All posts</a>` })}
      <datalist id="catList">${[...new Set(cats.map(c => c.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="editor-grid">
        <div>
          <input class="title-input" data-title type="text" placeholder="Post title" aria-label="Post title">
          <div class="md">
            <div class="md-bar" role="toolbar" aria-label="Formatting">
              <button type="button" data-md="bold" title="Bold (Ctrl+B)"><b>B</b></button>
              <button type="button" data-md="italic" title="Italic (Ctrl+I)"><i>I</i></button>
              <span class="sep"></span>
              <button type="button" data-md="h2" title="Heading">H2</button>
              <button type="button" data-md="h3" title="Sub-heading">H3</button>
              <button type="button" data-md="quote" title="Quote">❝</button>
              <button type="button" data-md="ul" title="Bulleted list">• List</button>
              <button type="button" data-md="ol" title="Numbered list">1. List</button>
              <button type="button" data-md="link" title="Link">Link</button>
              <span class="sep"></span>
              <label class="file-btn" style="display:inline-flex;align-items:center;padding:0 8px;height:32px;font-size:13px;color:var(--muted);cursor:pointer" title="Upload image">Image<input type="file" accept="image/*" data-img></label>
              <button type="button" data-md="library" title="Insert from media library">Library</button>
              <div class="md-tabs"><button type="button" data-mode="write" aria-pressed="true">Write</button><button type="button" data-mode="split" aria-pressed="false">Split</button><button type="button" data-mode="preview" aria-pressed="false">Preview</button></div>
            </div>
            <div class="md-panes"><textarea data-body placeholder="Write in Markdown. ## for headings, **bold**, *italic*, - lists. Drop or paste images straight in." aria-label="Post body"></textarea><div class="md-preview" hidden></div></div>
            <div class="md-foot"><span data-count></span><span>Markdown supported</span></div>
          </div>
        </div>
        <aside class="editor-side">
          <section class="side-card"><h3>Publishing</h3><div data-pub></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="button" data-save style="flex:1">Save</button>
            ${isNew ? '' : `<a class="btn" data-view href="../post.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">View ↗</a>`}</div>
            <p class="muted" style="margin:0;font-size:12.5px" data-state></p>
          </section>
          <section class="side-card"><h3>Details</h3><div data-meta></div></section>
          ${isNew ? '' : '<button class="btn btn-danger" type="button" data-delete>Delete post</button>'}
        </aside>
      </div></div>`);

    const titleI = node.querySelector('[data-title]'), ta = node.querySelector('[data-body]'), pv = node.querySelector('.md-preview'), panes = node.querySelector('.md-panes');
    titleI.value = p.title; ta.value = p.body || '';
    const pubForm = buildForm([
      { key: 'is_published', label: 'Published', type: 'bool' },
      { key: 'published_at', label: 'Publish date', type: 'datetime', help: 'Set a future date to schedule the post.' },
    ], p);
    const metaForm = buildForm([
      { key: 'slug', label: 'URL slug', type: 'text', required: true, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, patternMsg: 'Slug may only use lowercase letters, numbers and single dashes.', help: 'post.html?slug=…' },
      { key: 'category', label: 'Topic', type: 'text', required: true, list: 'catList', placeholder: 'e.g. GST · Sec. 16' },
      { key: 'read_minutes', label: 'Reading time (min)', type: 'number', help: 'Leave empty to calculate from the text.' },
      { key: 'excerpt', label: 'Summary', type: 'textarea', rows: 4, help: 'Shown on the post card and under the title.' },
    ], p);
    node.querySelector('[data-pub]').append(pubForm.el);
    node.querySelector('[data-meta]').append(metaForm.el);
    const slugI = metaForm.el.querySelector('input');
    const state = node.querySelector('[data-state]');
    const words = () => (ta.value.match(/\S+/g) || []).length;
    const updateCount = () => { const w = words(); node.querySelector('[data-count]').textContent = `${w} words · ~${Math.max(1, Math.ceil(w / 200))} min read`; };
    const describe = () => {
      const v = pubForm.values();
      const s = postStatus({ is_published: v.is_published, published_at: v.published_at });
      state.textContent = s === 'draft' ? 'Draft — not visible on the website.' : s === 'scheduled' ? `Scheduled — goes live ${fmtDate(v.published_at, true)}.` : 'Live on the website once saved.';
    };
    updateCount(); describe();

    // Preview
    let mode = 'write', t;
    const renderPreview = () => { pv.innerHTML = ta.value.trim() ? DOMPurify.sanitize(marked.parse(ta.value)) : '<p class="muted">Nothing to preview yet.</p>'; };
    node.querySelector('.md-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      mode = b.dataset.mode;
      $$('.md-tabs button', node).forEach(x => x.setAttribute('aria-pressed', x === b));
      ta.hidden = mode === 'preview'; pv.hidden = mode === 'write'; panes.classList.toggle('split', mode === 'split');
      if (mode !== 'write') renderPreview();
    });

    // Change tracking
    node.addEventListener('input', e => {
      setDirty(true);
      if (e.target === titleI && !slugTouched) slugI.value = slugify(titleI.value);
      if (e.target === slugI) slugTouched = true;
      if (e.target === ta) { updateCount(); if (mode !== 'write') { clearTimeout(t); t = setTimeout(renderPreview, 150); } }
      describe();
    });
    node.addEventListener('change', describe);

    // Markdown toolbar
    const changed = () => ta.dispatchEvent(new Event('input', { bubbles: true }));
    function wrap(before, after = before, ph = 'text'){
      const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
      ta.focus(); ta.setRangeText(before + sel + after, s, e, 'end');
      ta.setSelectionRange(s + before.length, s + before.length + sel.length); changed();
    }
    function prefix(fn){
      const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1, le = v.indexOf('\n', e), end = le === -1 ? v.length : le;
      ta.focus(); ta.setRangeText(v.slice(ls, end).split('\n').map((l, i) => fn(i) + l.replace(/^(#{1,6} |> |- |\d+\. )/, '')).join('\n'), ls, end, 'select'); changed();
    }
    function insert(text){
      const s = ta.selectionStart, before = ta.value.slice(0, s);
      const pad = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
      ta.focus(); ta.setRangeText(pad + text + '\n', s, ta.selectionEnd, 'end'); changed();
    }
    async function insertImages(files){
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        toast(`Uploading ${f.name}…`);
        try { const url = await UI.uploadFile(f, 'blog'); insert(`![${f.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')}](${url})`); }
        catch (err) { fail(err); }
      }
    }
    const MD = {
      bold: () => wrap('**'), italic: () => wrap('*'),
      h2: () => prefix(() => '## '), h3: () => prefix(() => '### '), quote: () => prefix(() => '> '),
      ul: () => prefix(() => '- '), ol: () => prefix(i => `${i + 1}. `),
      link: () => { const url = prompt('Link address (https://…)'); if (url) wrap('[', `](${url})`, 'link text'); },
      library: async () => { const url = await UI.pickMedia(); if (url) insert(`![](${url})`); },
    };
    node.querySelector('.md-bar').addEventListener('click', e => { const b = e.target.closest('[data-md]'); if (b) MD[b.dataset.md](); });
    node.querySelector('[data-img]').addEventListener('change', e => { insertImages([...e.target.files]); e.target.value = ''; });
    ta.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])]; if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); insertImages(files); } });
    ta.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    ta.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); insertImages([...e.dataTransfer.files]); } });
    node.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); save(); }
      else if (e.target === ta && k === 'b') { e.preventDefault(); MD.bold(); }
      else if (e.target === ta && k === 'i') { e.preventDefault(); MD.italic(); }
    });

    // Save / delete
    const saveBtn = node.querySelector('[data-save]');
    async function save(){
      const title = titleI.value.trim();
      if (!title) { toast('Give the post a title.', 'err'); titleI.focus(); return; }
      if (!slugI.value.trim()) slugI.value = slugify(title);
      const err = metaForm.validate(); if (err) { toast(err, 'err'); return; }
      const m = metaForm.values(), pub = pubForm.values();
      const payload = {
        title, slug: m.slug, category: m.category, excerpt: m.excerpt || '',
        read_minutes: m.read_minutes || (ta.value.trim() ? Math.max(1, Math.ceil(words() / 200)) : null),
        body: ta.value.trim() ? ta.value : null,
        is_published: pub.is_published, published_at: pub.published_at || new Date().toISOString(),
      };
      saveBtn.disabled = true;
      try {
        if (isNew) {
          const saved = await must(db.from('insights').insert(payload).select('id').single());
          toast(payload.is_published ? 'Post published' : 'Draft saved');
          go(`#/insights/${saved.id}`);
        } else {
          await must(db.from('insights').update(payload).eq('id', id));
          setDirty(false); toast('Post saved');
          node.querySelector('.page-head h1').textContent = title;
          const view = node.querySelector('[data-view]'); if (view) view.href = `../post.html?slug=${encodeURIComponent(payload.slug)}`;
        }
      } catch (e) { fail(e); } finally { saveBtn.disabled = false; }
    }
    saveBtn.addEventListener('click', save);
    node.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!await confirmBox(`Delete “${p.title}”? This can’t be undone.`)) return;
      try { await must(db.from('insights').delete().eq('id', id)); toast('Post deleted'); go('#/insights'); } catch (e) { fail(e); }
    });
    setTimeout(() => (isNew ? titleI : ta).focus(), 0);
    return node;
  }

  // ---------------------------------------------------------------------------
  // Page sections
  // ---------------------------------------------------------------------------
  async function viewSections(){
    const rows = await must(Admin.db.from('page_sections').select('key,updated_at'));
    const edited = Object.fromEntries(rows.map(r => [r.key, r.updated_at]));
    return el(`<div>
      ${pageHead({ eyebrow: 'Content', title: 'Page sections', sub: 'The text of every part of the homepage. Lists such as services, partners and client logos are edited in their own sections.' })}
      <div class="sec-list">${Object.entries(S.sections).map(([k, s]) => `
        <a class="sec-card" href="#/sections/${k}"><h3>${esc(s.label)}</h3><p>${esc(s.desc)}</p>
        <span class="eyebrow">${edited[k] ? 'Edited ' + esc(fmtDate(edited[k])) : 'Original text'}</span></a>`).join('')}</div></div>`);
  }

  async function viewSectionEditor(key){
    const def = S.sections[key];
    if (!def) throw new Error('Unknown page section.');
    const row = await must(Admin.db.from('page_sections').select('data,updated_at').eq('key', key).maybeSingle());
    // Some fields store plain strings but are edited as {text} items so each gets a textarea.
    const toForm = d => { const o = { ...d }; def.fields.forEach(f => { if (f.wrap && Array.isArray(o[f.key])) o[f.key] = o[f.key].map(x => ({ [f.wrap]: x })); }); return o; };
    const fromForm = v => { const o = { ...v }; def.fields.forEach(f => { if (f.wrap) o[f.key] = (o[f.key] || []).map(x => x[f.wrap]).filter(Boolean); }); return o; };
    const defaults = D.sections[key] || {};
    const form = buildForm(def.fields, toForm({ ...defaults, ...(row?.data || {}) }));
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Page section', title: def.label, sub: def.desc,
        actions: `<a class="back-link" href="#/sections">← All sections</a>${def.anchor !== undefined ? `<a class="btn" href="../index.html${def.anchor ? '#' + def.anchor : ''}" target="_blank" rel="noopener">View on site ↗</a>` : ''}` })}
      <div class="form-panel" data-form></div>
      <div class="form-actions"><div class="left">${row ? 'Last saved ' + esc(fmtDate(row.updated_at, true)) : 'Showing the original website text.'}</div>
        <div class="actions"><button class="btn" type="button" data-reset>Restore original text</button><button class="btn btn-primary" type="button" data-save>Save changes</button></div></div></div>`);
    node.querySelector('[data-form]').append(form.el);
    node.addEventListener('input', () => setDirty(true));
    node.querySelector('[data-reset]').addEventListener('click', async () => {
      if (!await confirmBox('Put the original website text back into this form? Nothing changes on the site until you save.', 'Restore')) return;
      form.el.replaceWith((() => { const f2 = buildForm(def.fields, toForm(defaults)); Object.assign(form, f2); return f2.el; })());
      setDirty(true);
    });
    node.querySelector('[data-save]').addEventListener('click', async e => {
      const err = form.validate(); if (err) return toast(err, 'err');
      e.target.disabled = true;
      try {
        await must(Admin.db.from('page_sections').upsert({ key, data: fromForm(form.values()) }));
        setDirty(false); toast('Saved — live on the website');
        node.querySelector('.form-actions .left').textContent = 'Last saved ' + fmtDate(new Date(), true);
      } catch (x) { fail(x); } finally { e.target.disabled = false; }
    });
    return node;
  }

  // ---------------------------------------------------------------------------
  // Media library
  // ---------------------------------------------------------------------------
  async function viewMedia(){
    let folder = 'all', items = [];
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Site', title: 'Media library', sub: 'Images and PDFs stored in Supabase. Up to 10 MB each.',
        actions: '<label class="btn btn-primary file-btn">Upload files<input type="file" multiple accept="image/*,application/pdf" data-file></label>' })}
      <div class="dropzone" data-drop>Drop images or PDFs here to upload</div>
      <div class="toolbar"><div class="tabs" data-tabs></div></div>
      <div data-grid><p class="muted">Loading…</p></div></div>`);
    const grid = node.querySelector('[data-grid]'), tabs = node.querySelector('[data-tabs]'), drop = node.querySelector('[data-drop]');
    const FOLDERS = [['all', 'All'], ['blog', 'Blog'], ['partners', 'Partners'], ['clients', 'Clients'], ['uploads', 'Uploads']];

    async function load(){
      items = (await Promise.all(UI.MEDIA_FOLDERS.map(UI.listMedia))).flat().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      render();
    }
    function render(){
      tabs.innerHTML = FOLDERS.map(([v, l]) => `<button type="button" data-f="${v}" aria-pressed="${v === folder}">${l}<small>${items.filter(i => v === 'all' || i.path.startsWith(v + '/')).length}</small></button>`).join('');
      const shown = items.filter(i => folder === 'all' || i.path.startsWith(folder + '/'));
      grid.innerHTML = shown.length ? `<div class="media-grid">${shown.map((m, i) => `
        <div class="media-item" data-path="${esc(m.path)}">
          <div class="img">${m.type.startsWith('image/') ? `<img src="${esc(m.url)}" alt="" loading="lazy">` : '<span class="eyebrow">PDF</span>'}</div>
          <div class="meta"><b title="${esc(m.name)}">${esc(m.name)}</b><span>${esc(fmtSize(m.size))} · ${esc(fmtDate(m.created))}</span></div>
          <div class="row"><button class="btn btn-sm" type="button" data-copy>Copy URL</button><a class="btn btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener">Open</a><button class="icon-btn" type="button" data-del aria-label="Delete">✕</button></div>
        </div>`).join('')}</div>` : '<div class="table-wrap"><div class="empty"><p>No files here yet.</p></div></div>';
    }
    async function upload(files){
      const target = folder === 'all' ? 'uploads' : folder;
      let ok = 0;
      for (const f of files) { try { await UI.uploadFile(f, target); ok++; } catch (e) { fail(e); } }
      if (ok) { toast(`${ok} file${ok > 1 ? 's' : ''} uploaded`); await load(); }
    }
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { folder = b.dataset.f; render(); } });
    node.querySelector('[data-file]').addEventListener('change', e => { upload([...e.target.files]); e.target.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); });
    grid.addEventListener('click', async e => {
      const item = e.target.closest('[data-path]'); if (!item) return;
      const m = items.find(i => i.path === item.dataset.path);
      if (e.target.closest('[data-copy]')) {
        try { await navigator.clipboard.writeText(m.url); toast('URL copied'); } catch { prompt('Copy this URL:', m.url); }
      } else if (e.target.closest('[data-del]')) {
        if (!await confirmBox(`Delete ${m.name}? Any page, post or logo using it will show a broken image.`)) return;
        try { await must(Admin.db.storage.from('media').remove([m.path])); toast('File deleted'); await load(); } catch (x) { fail(x); }
      }
    });
    load().catch(e => { grid.innerHTML = `<div class="empty"><p>${esc(UI.errText(e))}</p></div>`; });
    return node;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  async function viewSettings(){
    const db = Admin.db;
    const [rows, admins] = await Promise.all([must(db.from('site_settings').select('key,value')), must(db.from('admins').select('email,created_at').order('created_at'))]);
    const values = { ...D.settings, ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
    const form = buildForm(S.settings, values);
    const pass = buildForm([
      { key: 'a', label: 'New password', type: 'text', required: true },
      { key: 'b', label: 'Repeat new password', type: 'text', required: true },
    ]);
    pass.el.querySelectorAll('input').forEach(i => { i.type = 'password'; i.autocomplete = 'new-password'; });
    const node = el(`<div>
      ${pageHead({ eyebrow: 'Site', title: 'Settings', sub: 'Contact details, social links and your account.' })}
      <div class="grid-2">
        <section class="card"><header><h2>Contact details & links</h2></header><div class="card-body" data-contact></div>
          <div class="card-body" style="border-top:1px solid var(--line);display:flex;justify-content:flex-end"><button class="btn btn-primary" type="button" data-save>Save changes</button></div></section>
        <div style="display:flex;flex-direction:column;gap:24px">
          <section class="card"><header><h2>Your account</h2></header><div class="card-body">
            <p class="muted" style="margin:0 0 16px">Signed in as <b>${esc(Admin.user.email)}</b></p><div data-pass></div>
            <button class="btn" type="button" data-pw style="margin-top:16px">Change password</button></div></section>
          <section class="card"><header><h2>Admins</h2></header><div class="card-body">
            <ul style="margin:0 0 16px;padding-left:18px">${admins.map(a => `<li>${esc(a.email)} <span class="muted">· since ${esc(fmtDate(a.created_at))}</span></li>`).join('')}</ul>
            <p class="muted" style="margin:0;font-size:13.5px">To add an admin: create the user in Supabase → Authentication → Users, then run in the SQL editor:</p>
            <pre class="msg" style="margin:10px 0 0;font:12px/1.6 var(--mono);white-space:pre-wrap">insert into public.admins (user_id, email)
select id, email from auth.users where email = 'name@example.com';</pre></div></section>
        </div>
      </div></div>`);
    node.querySelector('[data-contact]').append(form.el);
    node.querySelector('[data-pass]').append(pass.el);
    form.el.addEventListener('input', () => setDirty(true));
    node.querySelector('[data-save]').addEventListener('click', async e => {
      const err = form.validate(); if (err) return toast(err, 'err');
      e.target.disabled = true;
      try {
        const v = form.values();
        await must(db.from('site_settings').upsert(Object.entries(v).map(([key, value]) => ({ key, value: value ?? '' }))));
        setDirty(false); toast('Settings saved — live on the website');
      } catch (x) { fail(x); } finally { e.target.disabled = false; }
    });
    node.querySelector('[data-pw]').addEventListener('click', async () => {
      const { a, b } = pass.values();
      if (a.length < 8) return toast('Use at least 8 characters.', 'err');
      if (a !== b) return toast('The two passwords don’t match.', 'err');
      try { await must(db.auth.updateUser({ password: a })); pass.set({ a: '', b: '' }); toast('Password changed'); } catch (x) { fail(x); }
    });
    return node;
  }

  boot().catch(e => { console.error(e); showAuth('login'); authMsg(UI.errText(e)); });
})();
