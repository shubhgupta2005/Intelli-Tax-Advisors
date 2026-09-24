// Compliance calendar. Built-in rules generate the routine Indian due dates; rows in the
// `compliance_dates` table (edited at admin/calendar.html) override them:
//   • a row whose key matches a built-in date replaces its title, subtitle or date (e.g. a CBDT extension),
//     or hides it when is_hidden is set;
//   • a row with no key (or an unknown one) adds a one-off date.
// Dates are 'YYYY-MM-DD' strings in India time, so every visitor sees the same calendar.
window.ComplianceCalendar = (function(){
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-based

  function todayIST(){
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }

  function daysBetween(from, to){
    const u = s => Date.UTC(+s.slice(0,4), +s.slice(5,7) - 1, +s.slice(8,10));
    return Math.round((u(to) - u(from)) / 864e5);
  }

  // Built-in dates for the months around `today`. It starts a year back, so an override that
  // moved an earlier deadline forward (an extension) still has a built-in date to attach to.
  function builtIn(today){
    const y0 = +today.slice(0,4), m0 = +today.slice(5,7) - 1, out = [];
    const add = (rule, y, m, d, title, subtitle) =>
      out.push({ key: `${rule}-${y}-${pad(m + 1)}`, due_date: iso(y, m, d), title, subtitle, source: 'built-in' });
    for (let k = -12; k < 14; k++) {
      const y = y0 + Math.floor((m0 + k) / 12), m = ((m0 + k) % 12 + 12) % 12;
      // March deductions are due 30 April; every other month's by the 7th of the next.
      if (m === 3) add('tds', y, m, 30, 'TDS / TCS deposit', 'Challan 281 · March deductions');
      else add('tds', y, m, 7, 'TDS / TCS deposit', 'Challan 281 · previous month');
      add('gstr1', y, m, 11, 'GSTR-1', 'Outward supplies · monthly filers');
      add('gstr3b', y, m, 20, 'GSTR-3B', 'Summary return & tax payment');
      if (m === 5)  add('advtax', y, m, 15, 'Advance tax · 15%', 'First instalment · Sec. 211');
      if (m === 8)  add('advtax', y, m, 15, 'Advance tax · 45%', 'Second instalment · Sec. 211');
      if (m === 11) add('advtax', y, m, 15, 'Advance tax · 75%', 'Third instalment · Sec. 211');
      if (m === 2)  add('advtax', y, m, 15, 'Advance tax · 100%', 'Final instalment · Sec. 211');
      if (m === 6)  add('itr', y, m, 31, 'ITR · non-audit', 'Individuals & non-audit entities');
      if (m === 8)  add('audit', y, m, 30, 'Tax audit report', 'Form 3CA/3CB–3CD · Sec. 44AB');
      if (m === 9)  add('itr-audit', y, m, 31, 'ITR · audit cases', 'Companies & audited assessees');
    }
    return out;
  }

  // Built-in dates with the admin's overrides applied, sorted by date.
  // Each item keeps `base` (the untouched built-in) and `override` (the row) for the admin page.
  function merge(today, overrides){
    const items = builtIn(today).map(b => ({ ...b, base: b }));
    const byKey = new Map(items.map(i => [i.key, i]));
    for (const o of overrides || []) {
      const hit = o.key && byKey.get(o.key);
      if (hit) {
        Object.assign(hit, {
          title: o.title || hit.title, subtitle: o.subtitle ?? hit.subtitle,
          due_date: o.due_date || hit.due_date, hidden: !!o.is_hidden, override: o, source: 'changed',
        });
      } else if (o.title && o.due_date) {
        items.push({ key: o.key, title: o.title, subtitle: o.subtitle || '', due_date: o.due_date,
                     hidden: !!o.is_hidden, override: o, source: 'custom' });
      }
    }
    return items.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title));
  }

  // The next `n` visible deadlines from today (inclusive).
  function upcoming(overrides, n){
    const today = todayIST();
    return merge(today, overrides).filter(i => !i.hidden && i.due_date >= today).slice(0, n)
      .map(i => ({ ...i, days: daysBetween(today, i.due_date) }));
  }

  return { MONTHS, todayIST, daysBetween, builtIn, merge, upcoming };
})();
