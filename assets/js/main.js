(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const D = window.DEFAULT_CONTENT;
  const em = s => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>'); // *words* → italic, as edited in the admin portal
  const arrowRight = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 8h12M9 3l5 5-5 5"/></svg>';
  const arrowOut = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 12L12 4M5 4h7v7"/></svg>';

  // ---- Mobile menu
  const nav = $('nav'), mb = $('menuBtn');
  mb.addEventListener('click', () => { const o = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); mb.setAttribute('aria-expanded', false); } });

  // ---- Compliance calendar (built-in Indian due dates, corrected by the admin's overrides)
  const CAL = window.ComplianceCalendar, M = CAL.MONTHS;
  function renderCalendar(overrides){
    const t = CAL.todayIST();
    $('today').textContent = 'TODAY ' + t.slice(8,10) + ' ' + M[+t.slice(5,7) - 1];
    $('deadlines').innerHTML = CAL.upcoming(overrides, 5).map(i => {
      const label = i.days === 0 ? 'TODAY' : i.days === 1 ? 'IN 1 DAY' : 'IN ' + i.days + ' DAYS';
      return `<li class="${i.days <= 7 ? 'soon' : ''}"><span class="d">${i.due_date.slice(8,10)}<small>${M[+i.due_date.slice(5,7) - 1]}</small></span>
      <span class="what"><b>${esc(i.title)}</b><span>${esc(i.subtitle)}</span></span><span class="in">${label}</span></li>`;
    }).join('');
  }
  renderCalendar([]);
  Api.getCalendar().then(o => { if (o.length) renderCalendar(o); });

  // ---- Services
  const plus = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2v12M2 8h12"/></svg>';
  const list = $('svcList');
  function renderServices(services){
    list.innerHTML = services.map((v,i) => `
    <div class="svc${i===0?' open':''}">
      <button aria-expanded="${i===0}" aria-controls="svc-${i}"><span class="code">${esc(v.code)}${v.is_lead?'<br><span class="lead">Lead practice</span>':''}</span><h3>${esc(v.title)}</h3><span class="short">${esc(v.summary)}</span><span class="plus">${plus}</span></button>
      <div class="detail" id="svc-${i}"><div><ul>${(v.details||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>
    </div>`).join('');
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('.svc > button'); if (!b) return;
    const row = b.parentElement, open = !row.classList.contains('open');
    row.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  });

  // ---- Industries
  function renderIndustries(rows){
    $('sectors').innerHTML = rows.map(r =>
      `<div class="sector"><h3>${esc(r.name)}</h3><span class="eyebrow">${esc(r.tagline)}</span></div>`).join('');
  }

  // ---- Partners
  function renderPartners(rows){
    $('leaderGrid').innerHTML = rows.map(p => `
        <article class="leader">
          <img src="${esc(p.photo_url)}" alt="Portrait of ${esc(p.name)}" width="200" height="250">
          <div>
            <span class="eyebrow">${esc(p.role)}</span>
            <h3>${esc(p.name)}</h3>
            <ul>${(p.highlights||[]).map(h => `<li>${esc(h)}</li>`).join('')}</ul>
            ${p.linkedin_url ? `<a class="li" href="${esc(p.linkedin_url)}" target="_blank" rel="noopener">LinkedIn profile ${arrowOut}</a>` : ''}
          </div>
        </article>`).join('');
  }

  // ---- Client logos
  function renderClients(rows, more){
    $('logos').innerHTML = rows.map(l => `<div class="logo"><img src="${esc(l.logo_url)}" alt="${esc(l.name)}" loading="lazy"></div>`).join('')
      + (more ? `<div class="logo more"><strong>${esc(more)}</strong><span class="eyebrow">more clients</span></div>` : '');
  }

  // ---- Testimonials
  const qEl = $('quote'), vNav = $('voiceNav');
  let voices = [], cur = 0, timer;
  function show(i){
    cur = i; const v = voices[i]; if (!v) return;
    qEl.innerHTML = `<div class="fade"><p>${esc(v.quote)}</p><footer><b>${esc(v.author_name)}</b><span>${esc(v.company)}</span></footer></div>`;
    vNav.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-selected', j===i));
  }
  function auto(){ clearInterval(timer); if (voices.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(()=>show((cur+1)%voices.length), 7000); }
  function renderTestimonials(rows){
    voices = rows;
    vNav.innerHTML = voices.map((v,i)=>`<button role="tab" aria-selected="${i===0}" data-i="${i}"><span>${esc(v.company)}</span><span>${String(i+1).padStart(2,'0')}</span></button>`).join('');
    qEl.innerHTML = '';
    show(0); auto();
  }
  vNav.addEventListener('click', e => { const b = e.target.closest('button'); if (b){ show(+b.dataset.i); auto(); } });

  // ---- Insights (newest three; link to the full index when there are more)
  function renderInsights(rows){
    $('allInsights').hidden = rows.length <= 3;
    $('posts').innerHTML = rows.slice(0,3).map(p => {
      const href = (p.has_body || p.body) ? `post.html?slug=${encodeURIComponent(p.slug)}` : '#insights';
      return `
        <a class="post" href="${href}">
          <div class="meta"><span class="eyebrow">${esc(p.category)}</span><span class="eyebrow">${p.read_minutes ? esc(p.read_minutes) + ' min' : ''}</span></div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.excerpt)}</p>
          <span class="read">Read the briefing ${arrowRight}</span>
        </a>`;
    }).join('');
  }

  // ---- Contact details & footer links
  function applySettings(s){
    $('vEmail').textContent = s.email;
    $('vPhone').textContent = s.phone;
    $('vAddr').textContent = s.address;
    $('vHours').textContent = s.hours;
    if (s.instagram_url) $('lnInstagram').href = s.instagram_url;
    if (s.linkedin_url) $('lnLinkedin').href = s.linkedin_url;
    const wa = $('waFloat'), digits = String(s.whatsapp || '').replace(/\D/g, '');
    if (wa) { if (digits.length >= 10) wa.href = wa.href.replace(/wa\.me\/\d+/, 'wa.me/' + digits); else wa.hidden = true; }
  }

  // ---- Page sections (copy edited under "Page sections" in the admin portal)
  const svgArrow = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 8h12M9 3l5 5-5 5"/></svg>';
  const head = (id, s) => { $(id).innerHTML = `<div><p class="eyebrow">${esc(s.eyebrow)}</p><h2>${em(s.title)}</h2></div><p>${esc(s.intro)}</p>`; };
  const SECTIONS = {
    seo(s){ document.title = s.title; document.querySelector('meta[name="description"]')?.setAttribute('content', s.description); },
    hero(s){
      $('heroEyebrow').textContent = s.eyebrow;
      $('heroTitle').innerHTML = (s.title_lines||[]).map(l => `<span class="line"><span>${em(l)}</span></span>`).join('');
      $('heroLede').textContent = s.lede;
      $('heroCta1').innerHTML = esc(s.cta_primary) + ' ' + svgArrow;
      $('heroCta2').textContent = s.cta_secondary;
      $('calNote').textContent = s.calendar_note;
    },
    figures(s){
      $('figures').innerHTML = (s.items||[]).map(f => `<div class="fig"><strong>${esc(f.value)}</strong><span>${esc(f.label)}</span></div>`).join('');
    },
    about(s){
      $('aboutEyebrow').textContent = s.eyebrow;
      $('aboutStatement').innerHTML = em(s.statement);
      $('aboutBody').innerHTML = (s.paragraphs||[]).map(p => `<p>${esc(p)}</p>`).join('')
        + `<div class="pillars">${(s.pillars||[]).map(p => `<div class="pillar"><span class="eyebrow">${esc(p.title)}</span><p>${esc(p.text)}</p></div>`).join('')}</div>`;
    },
    services(s){ head('servicesHead', s); },
    why(s){
      $('whyIntro').innerHTML = `<span class="eyebrow">${esc(s.eyebrow)}</span><h2>${em(s.title)}</h2><p>${esc(s.intro)}</p>`;
      $('reasons').innerHTML = (s.reasons||[]).map(r => `<li><h3>${esc(r.title)}</h3><p>${esc(r.text)}</p></li>`).join('');
    },
    industries(s){ head('industriesHead', s); },
    method(s){
      head('methodHead', s);
      $('steps').innerHTML = (s.steps||[]).map((st,i) => `<div class="step"><span class="n">${i+1}</span><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p><span class="eyebrow when">${esc(st.when)}</span></div>`).join('');
      $('methodNote').textContent = s.note;
    },
    partners(s){ head('partnersHead', s); },
    clients(s){ head('clientsHead', s); $('voicesEyebrow').textContent = s.testimonials_eyebrow; },
    insights(s){ head('insightsHead', s); },
    contact(s){
      $('contactEyebrow').textContent = s.eyebrow;
      $('contactTitle').innerHTML = em(s.title);
      $('reach').innerHTML = (s.promises||[]).map(p => `<li>${esc(p)}</li>`).join('');
      $('formNote').textContent = s.form_note;
      $('f-topic').innerHTML = (s.topics||[]).map(t => `<option>${esc(t)}</option>`).join('');
      $('submitBtn').innerHTML = esc(s.submit_label) + ' ' + svgArrow;
    },
    footer(s){ $('footCopy').textContent = s.copyright; },
  };
  // The HTML already holds the built-in copy, so only sections the admin changed are re-rendered
  // (re-rendering the hero would restart its entrance animation).
  function renderSections(all){
    for (const k in SECTIONS) {
      if (all[k] && JSON.stringify(all[k]) !== JSON.stringify(D.sections[k])) SECTIONS[k](all[k]);
    }
  }

  // Sections that were JS-rendered in the original page render from built-in content
  // immediately; the static sections keep their HTML until live data arrives.
  renderServices(D.services);
  renderClients(D.clients, D.settings.clients_more);
  renderTestimonials(D.testimonials);

  Api.getContent().then(c => {
    if (!c) return;
    renderSections(c.sections);
    applySettings(c.settings);
    renderServices(c.services);
    renderIndustries(c.industries);
    renderPartners(c.partners);
    renderClients(c.clients, c.settings.clients_more);
    renderTestimonials(c.testimonials);
    renderInsights(c.insights);
  }).catch(err => console.warn('[site] live content unavailable, showing built-in content', err));

  // ---- Copy buttons
  document.querySelectorAll('.copy').forEach(btn => btn.addEventListener('click', () => {
    const el = $(btn.dataset.copy), txt = el.textContent.trim();
    const done = () => { btn.textContent = 'Copied'; setTimeout(()=>btn.textContent='Copy', 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selected'; setTimeout(()=>btn.textContent='Copy', 1600); };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch(e){ fallback(); }
  }));

  // ---- Enquiry form: saves to Supabase; falls back to a pre-filled email if that isn't possible.
  const form = $('enquiry'), note = $('formNote');
  const inbox = () => $('vEmail').textContent.trim().toLowerCase();
  function mailtoFallback(e){
    const lines = ['Name: '+e.name,'Company: '+e.company,'Email: '+e.email,'Phone: '+e.phone,'Topic: '+e.topic,'',e.message];
    location.href = 'mailto:' + inbox() + '?subject=' + encodeURIComponent('Consultation request — '+e.name) + '&body=' + encodeURIComponent(lines.join('\n'));
    note.textContent = 'Your email app should open with the enquiry filled in. If it doesn\'t, write to ' + inbox() + '.';
  }
  function showSent(name){
    form.innerHTML = `<div class="sent" role="status"><b>Thank you, ${esc(name.split(' ')[0])}.</b><span>Your request is with the partners. Expect a reply within one business day.</span></div>`;
  }
  let typedAt = 0;   // when a person first typed in the form (bots fill it without typing)
  form.addEventListener('input', () => { typedAt = typedAt || Date.now(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form, fld = n => f.elements.namedItem(n);
    const data = {
      name: fld('name').value.trim(), company: fld('company').value.trim(), email: fld('email').value.trim(),
      phone: fld('phone').value.trim(), topic: fld('topic').value, message: fld('message').value.trim(),
    };
    if (!data.name) { note.textContent = 'Add your name so a partner knows who to call.'; fld('name').focus(); return; }
    if (!/^\S+@\S+\.\S+$/.test(data.email)) { note.textContent = 'Enter an email like name@company.com so we can reply.'; fld('email').focus(); return; }
    if (fld('website').value) { showSent(data.name); return; } // honeypot: silently drop bots
    if (!typedAt || Date.now() - typedAt < 2500) { showSent(data.name); return; } // no typing, or form done in under 2.5 s: a bot

    if (!Api.enabled) { mailtoFallback(data); return; }
    f.setAttribute('aria-busy', 'true'); note.textContent = 'Sending…';
    try { await Api.submitEnquiry(data); showSent(data.name); }
    catch (err) { console.warn('[site] enquiry insert failed', err); mailtoFallback(data); }
    finally { f.removeAttribute('aria-busy'); }
  });
})();
