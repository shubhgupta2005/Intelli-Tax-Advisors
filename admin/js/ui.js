// Shared admin UI toolkit: escaping, toasts, dialogs, uploads and a schema-driven form builder.
window.UI = (function(){
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = str => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; };
  const uid = () => 'f' + Math.random().toString(36).slice(2, 9);
  const db = () => window.Admin.db;

  // Images stored as site-relative paths (assets/img/…) need ../ when shown inside /admin/.
  const mediaUrl = u => !u ? '' : /^(https?:|data:|blob:)/i.test(u) ? u : '../' + String(u).replace(/^\/+/, '');

  const slugify = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');

  const fmtDate = (d, time) => !d ? '' : new Date(d).toLocaleString('en-IN', time
    ? {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}
    : {day:'2-digit', month:'short', year:'numeric'});
  const fmtSize = b => b == null ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(0) + ' KB' : (b/1048576).toFixed(1) + ' MB';
  // <input type=datetime-local> works in local time without a zone.
  const toLocalInput = d => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const fromLocalInput = v => v ? new Date(v).toISOString() : null;

  // Unwraps a Supabase response, throwing its error.
  async function must(q){ const r = await q; if (r.error) throw r.error; return r.data; }

  function errText(e){
    if (!e) return 'Something went wrong.';
    if (e.code === '23505') return 'That value is already in use — it must be unique.';
    if (e.code === '42501' || /row-level security/i.test(e.message)) return 'Permission denied. Is this account an admin?';
    if (e.code === '42P01') return 'A database table is missing — run the SQL files in /supabase.';
    return e.message || String(e);
  }

  function toast(msg, kind = 'ok'){
    const t = el(`<div class="toast ${kind === 'err' ? 'err' : ''}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(msg)}</div>`);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
  }
  const fail = e => { console.error(e); toast(errText(e), 'err'); };

  function confirmBox(message, okLabel = 'Delete'){
    const d = $('#confirm');
    $('#confirmMsg').textContent = message;
    $('#confirmOk').textContent = okLabel;
    d.returnValue = '';
    d.showModal();
    return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), {once:true}));
  }

  // Side drawer. `buttons` = [{label, cls, onClick, left}] — onClick may return false to keep it open.
  function drawer({title, body, buttons = []}){
    const d = $('#drawer');
    $('#drawerTitle').textContent = title;
    const b = $('#drawerBody'); b.replaceChildren(body);
    const foot = $('#drawerFoot'); foot.innerHTML = '<div class="grp"></div><div class="grp"></div>';
    const [left, right] = foot.children;
    for (const btn of buttons) {
      const x = el(`<button type="button" class="btn ${btn.cls || ''}">${esc(btn.label)}</button>`);
      x.addEventListener('click', async () => {
        x.disabled = true;
        try { if (await btn.onClick() !== false) d.close(); } catch (e) { fail(e); } finally { x.disabled = false; }
      });
      (btn.left ? left : right).append(x);
    }
    const cancel = el('<button type="button" class="btn">Cancel</button>');
    cancel.addEventListener('click', () => d.close());
    right.prepend(cancel);
    d.querySelector('[data-close]').onclick = () => d.close();
    d.showModal(); b.scrollTop = 0;
    const first = b.querySelector('input,textarea,select'); if (first) first.focus();
    return { close: () => d.close() };
  }

  // Uploads to the public `media` bucket and returns the public URL.
  const MAX = 10 * 1024 * 1024;
  async function uploadFile(file, folder = 'uploads'){
    if (!/^image\/|^application\/pdf$/.test(file.type)) throw new Error(`${file.name}: only images and PDFs can be uploaded.`);
    if (file.size > MAX) throw new Error(`${file.name} is larger than 10 MB.`);
    const dot = file.name.lastIndexOf('.');
    const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
    const base = slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || 'file';
    const path = `${folder}/${Date.now().toString(36)}-${base}.${ext}`;
    await must(db().storage.from('media').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type }));
    return db().storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  // Media library listing for one folder, newest first.
  async function listMedia(folder){
    const items = await must(db().storage.from('media').list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } }));
    return items.filter(i => i.id && i.name !== '.emptyFolderPlaceholder').map(i => ({
      name: i.name, path: `${folder}/${i.name}`, size: i.metadata?.size, type: i.metadata?.mimetype || '', created: i.created_at,
      url: db().storage.from('media').getPublicUrl(`${folder}/${i.name}`).data.publicUrl,
    }));
  }
  const MEDIA_FOLDERS = ['blog', 'partners', 'clients', 'uploads'];

  // Modal grid of uploaded images; resolves with the chosen URL or null.
  async function pickMedia(){
    const d = $('#picker'), body = $('#pickerBody');
    body.innerHTML = '<p class="muted">Loading…</p>';
    d.returnValue = ''; d.showModal();
    let chosen = null;
    const closed = new Promise(res => d.addEventListener('close', () => res(chosen), {once:true}));
    try {
      const all = (await Promise.all(MEDIA_FOLDERS.map(listMedia))).flat()
        .filter(m => m.type.startsWith('image/')).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      body.innerHTML = all.length ? `<div class="media-grid">${all.map((m, i) => `
        <button type="button" class="media-item" data-i="${i}"><span class="img"><img src="${esc(m.url)}" alt="" loading="lazy"></span>
        <span class="meta"><b>${esc(m.name)}</b><span>${esc(fmtSize(m.size))}</span></span></button>`).join('')}</div>`
        : '<p class="muted">No images uploaded yet. Use “Upload” instead.</p>';
      body.onclick = e => { const b = e.target.closest('.media-item'); if (b) { chosen = all[+b.dataset.i].url; d.close('ok'); } };
    } catch (e) { body.innerHTML = `<p class="muted">${esc(errText(e))}</p>`; }
    return closed;
  }

  // ---------------------------------------------------------------------------
  // Form builder. Field: {key, label, type, required, help, placeholder, rows, options, folder, fields, full}
  // Types: text url email number textarea bool select datetime image strings repeater
  // ---------------------------------------------------------------------------
  const FULL = new Set(['textarea', 'strings', 'repeater', 'image']);

  function buildForm(fields, values = {}){
    const root = el('<div class="form"></div>');
    const ctls = {};
    for (const f of fields) {
      const id = uid();
      const wrap = el(`<div class="field${f.full || FULL.has(f.type) ? ' full' : ''}"></div>`);
      if (f.type !== 'bool') wrap.append(el(`<label for="${id}">${esc(f.label)}${f.required ? ' <i>*</i>' : ''}</label>`));
      const c = control(f, values[f.key], id);
      wrap.append(c.el);
      if (f.help) wrap.append(el(`<small class="help">${esc(f.help)}</small>`));
      root.append(wrap);
      ctls[f.key] = { ...c, wrap, f };
    }
    return {
      el: root,
      values(){ const o = {}; for (const k in ctls) o[k] = ctls[k].get(); return o; },
      set(values){ for (const k in ctls) ctls[k].set(values[k]); },
      // Returns an error message for the first invalid field (and focuses it), or null.
      validate(){
        for (const k in ctls) {
          const { f, get, wrap } = ctls[k], v = get();
          wrap.classList.remove('invalid');
          const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
          let msg = null;
          if (f.required && empty) msg = `${f.label} is required.`;
          else if (!empty && f.type === 'url' && !/^(https?:\/\/|mailto:|tel:)/i.test(v)) msg = `${f.label} must start with https://`;
          else if (!empty && f.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) msg = `${f.label} must be a valid email.`;
          else if (!empty && f.pattern && !f.pattern.test(v)) msg = f.patternMsg || `${f.label} is not valid.`;
          else if (f.type === 'repeater') { for (const sub of ctls[k].forms()) { const m = sub.validate(); if (m) { msg = m; break; } } }
          if (msg) { wrap.classList.add('invalid'); wrap.querySelector('input,textarea,select')?.focus(); return msg; }
        }
        return null;
      },
    };
  }

  function control(f, v, id){
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    switch (f.type) {
      case 'textarea': {
        const t = el(`<textarea id="${id}" rows="${f.rows || 3}"${ph}></textarea>`); t.value = v ?? '';
        return { el: t, get: () => t.value.trim(), set: x => t.value = x ?? '' };
      }
      case 'bool': {
        const w = el(`<label class="switch"><input type="checkbox" id="${id}"><span class="track"></span><span>${esc(f.label)}</span></label>`);
        const i = w.querySelector('input'); i.checked = v ?? f.default ?? false;
        return { el: w, get: () => i.checked, set: x => i.checked = !!x };
      }
      case 'select': {
        const s = el(`<select id="${id}">${f.options.map(o => `<option value="${esc(o.value ?? o)}">${esc(o.label ?? o)}</option>`).join('')}</select>`);
        s.value = v ?? f.options[0]?.value ?? f.options[0];
        return { el: s, get: () => s.value, set: x => s.value = x };
      }
      case 'number': {
        const i = el(`<input id="${id}" type="number" min="${f.min ?? 0}" step="1"${ph}>`); i.value = v ?? '';
        return { el: i, get: () => i.value === '' ? null : Number(i.value), set: x => i.value = x ?? '' };
      }
      case 'datetime': {
        const i = el(`<input id="${id}" type="datetime-local">`); i.value = toLocalInput(v);
        return { el: i, get: () => fromLocalInput(i.value), set: x => i.value = toLocalInput(x) };
      }
      case 'image': return imageControl(f, v, id);
      case 'strings': return stringsControl(f, v, id);
      case 'repeater': return repeaterControl(f, v, id);
      default: {
        const type = f.type === 'url' ? 'url' : f.type === 'email' ? 'email' : 'text';
        const i = el(`<input id="${id}" type="${type}"${ph}${f.list ? ` list="${f.list}"` : ''}>`); i.value = v ?? '';
        return { el: i, get: () => i.value.trim(), set: x => i.value = x ?? '' };
      }
    }
  }

  function imageControl(f, v, id){
    const w = el(`<div class="imgfield">
      <div class="preview"></div>
      <div class="ctl">
        <input id="${id}" type="text" placeholder="Image URL — or upload / pick below">
        <div class="row">
          <label class="btn btn-sm file-btn">Upload<input type="file" accept="image/*"></label>
          <button type="button" class="btn btn-sm" data-lib>Media library</button>
          <button type="button" class="btn btn-sm" data-clear>Remove</button>
        </div>
      </div></div>`);
    const input = w.querySelector(`#${id}`), prev = w.querySelector('.preview'), file = w.querySelector('input[type=file]');
    const show = () => { prev.innerHTML = input.value ? `<img src="${esc(mediaUrl(input.value))}" alt="">` : 'No image'; };
    const setVal = x => { input.value = x ?? ''; show(); input.dispatchEvent(new Event('input', {bubbles:true})); };
    input.value = v ?? ''; show();
    input.addEventListener('change', show);
    file.addEventListener('change', async () => {
      const fl = file.files[0]; if (!fl) return;
      prev.textContent = 'Uploading…';
      try { setVal(await uploadFile(fl, f.folder || 'uploads')); toast('Image uploaded'); }
      catch (e) { show(); fail(e); }
      file.value = '';
    });
    w.querySelector('[data-lib]').addEventListener('click', async () => { const u = await pickMedia(); if (u) setVal(u); });
    w.querySelector('[data-clear]').addEventListener('click', () => setVal(''));
    return { el: w, get: () => input.value.trim(), set: x => { input.value = x ?? ''; show(); } };
  }

  const MOVE = `<button type="button" class="icon-btn" data-up aria-label="Move up">↑</button><button type="button" class="icon-btn" data-down aria-label="Move down">↓</button><button type="button" class="icon-btn" data-del aria-label="Remove">✕</button>`;
  function wireMoves(list, onChange){
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-up],[data-down],[data-del]'); if (!b) return;
      const item = b.closest('.str-row,.rep-item'); if (item.parentElement !== list) return;
      if (b.hasAttribute('data-del')) item.remove();
      else if (b.hasAttribute('data-up') && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
      else if (b.hasAttribute('data-down') && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
      onChange();
    });
  }
  const bump = node => node.dispatchEvent(new Event('input', {bubbles:true}));

  function stringsControl(f, v, id){
    const w = el(`<div class="strings"><div class="strings" data-list></div><button type="button" class="btn btn-sm add-btn">+ Add ${esc(f.itemLabel || 'line')}</button></div>`);
    const list = w.querySelector('[data-list]');
    const add = (val = '', focus) => {
      const r = el(`<div class="str-row"><input type="text">${MOVE}</div>`);
      r.querySelector('input').value = val; list.append(r);
      if (focus) r.querySelector('input').focus();
    };
    const set = arr => { list.innerHTML = ''; (arr || []).forEach(x => add(x)); if (!list.children.length) add(''); };
    set(v);
    list.firstElementChild?.querySelector('input').setAttribute('id', id);
    w.querySelector('.add-btn').addEventListener('click', () => { add('', true); bump(w); });
    wireMoves(list, () => bump(w));
    return { el: w, get: () => $$('input', list).map(i => i.value.trim()).filter(Boolean), set };
  }

  function repeaterControl(f, v, id){
    const w = el(`<div class="rep"><div class="rep" data-list id="${id}"></div><button type="button" class="btn btn-sm add-btn">+ Add ${esc(f.itemLabel || 'item')}</button></div>`);
    const list = w.querySelector('[data-list]');
    const renumber = () => $$(':scope > .rep-item', list).forEach((it, i) => it.querySelector('.eyebrow').textContent = `${f.itemLabel || 'Item'} ${i + 1}`);
    const add = (val = {}, focus) => {
      const it = el(`<div class="rep-item"><header><span class="eyebrow"></span><span>${MOVE}</span></header></div>`);
      const form = buildForm(f.fields, val);
      it._form = form; it.append(form.el); list.append(it); renumber();
      if (focus) form.el.querySelector('input,textarea')?.focus();
    };
    const set = arr => { list.innerHTML = ''; (arr || []).forEach(x => add(x)); };
    set(v);
    w.querySelector('.add-btn').addEventListener('click', () => { add({}, true); bump(w); });
    wireMoves(list, () => { renumber(); bump(w); });
    const forms = () => $$(':scope > .rep-item', list).map(it => it._form);
    return { el: w, get: () => forms().map(fm => fm.values()), set, forms };
  }

  function toCsv(rows, cols){
    const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(c.get(r))).join(','))].join('\r\n');
  }
  function download(name, text, type = 'text/csv'){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], {type}));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { esc, $, $$, el, must, errText, toast, fail, confirmBox, drawer, uploadFile, listMedia, pickMedia, MEDIA_FOLDERS,
    mediaUrl, slugify, fmtDate, fmtSize, buildForm, toCsv, download };
})();
