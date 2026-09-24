// Data layer. Reads published content from Supabase and saves enquiries.
// Every read falls back to window.DEFAULT_CONTENT, so the site still works
// with no Supabase config or when the network call fails.
window.Api = (function(){
  const cfg = window.SITE_CONFIG || {};
  const D = window.DEFAULT_CONTENT;
  const db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  // Published rows of a content table, in admin-defined order. Null on failure.
  async function rows(table, columns){
    const { data, error } = await db.from(table).select(columns)
      .eq('is_published', true).order('sort_order').order('id');
    if (error) { console.warn(`[api] ${table}:`, error.message); return null; }
    return data;
  }

  // Published insights, newest first. Posts dated in the future stay hidden until then.
  function insightsQuery(columns){
    return db.from('insights').select(columns).eq('is_published', true)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false }).order('sort_order');
  }

  async function sections(){
    const { data, error } = await db.from('page_sections').select('key,data');
    if (error) { console.warn('[api] page_sections:', error.message); return {}; }
    return Object.fromEntries(data.map(r => [r.key, r.data]));
  }

  // Built-in copy for every section, overlaid with whatever the admin has saved.
  function mergeSections(remote){
    const out = {};
    for (const k in D.sections) out[k] = { ...D.sections[k], ...(remote[k] || {}) };
    return out;
  }

  async function settings(){
    const { data, error } = await db.from('site_settings').select('key,value');
    if (error) { console.warn('[api] site_settings:', error.message); return null; }
    return Object.fromEntries(data.map(r => [r.key, r.value]));
  }

  return {
    enabled: !!db,
    client: db,

    // Resolves to the same shape as DEFAULT_CONTENT, or null when Supabase is off.
    async getContent(){
      if (!db) return null;
      const [s, sec, services, industries, partners, clients, testimonials, insights] = await Promise.all([
        settings(),
        sections(),
        rows('services', 'id,code,title,summary,details,is_lead'),
        rows('industries', 'id,name,tagline'),
        rows('partners', 'id,name,role,photo_url,highlights,linkedin_url'),
        rows('clients', 'id,name,logo_url'),
        rows('testimonials', 'id,quote,author_name,company'),
        insightsQuery('id,slug,category,read_minutes,title,excerpt,has_body').limit(4)
          .then(({ data, error }) => { if (error) { console.warn('[api] insights:', error.message); return null; } return data; }),
      ]);
      return {
        settings: { ...D.settings, ...(s || {}) },
        sections: mergeSections(sec),
        services: services ?? D.services,
        industries: industries ?? D.industries,
        partners: partners ?? D.partners,
        clients: clients ?? D.clients,
        testimonials: testimonials ?? D.testimonials,
        insights: insights ?? D.insights,
      };
    },

    // Admin overrides for the compliance calendar. Empty when Supabase is off or unreachable.
    async getCalendar(){
      if (!db) return [];
      const { data, error } = await db.from('compliance_dates').select('key,title,subtitle,due_date,is_hidden');
      if (error) { console.warn('[api] compliance_dates:', error.message); return []; }
      return data;
    },

    // Every published insight, for the insights index page.
    async getInsights(){
      if (db) {
        const { data, error } = await insightsQuery('id,slug,category,read_minutes,title,excerpt,has_body,published_at');
        if (!error) return data;
        console.warn('[api] insights:', error.message);
      }
      return D.insights;
    },

    async getInsight(slug){
      if (db) {
        const { data, error } = await insightsQuery('slug,category,read_minutes,title,excerpt,body,published_at')
          .eq('slug', slug).maybeSingle();
        if (!error) return data;
        console.warn('[api] insight:', error.message);
      }
      return D.insights.find(p => p.slug === slug) || null;
    },

    // Throws on failure so the form can fall back to email.
    async submitEnquiry(e){
      if (!db) throw new Error('Supabase not configured');
      const { error } = await db.from('enquiries').insert({
        name: e.name, company: e.company || null, email: e.email,
        phone: e.phone || null, topic: e.topic, message: e.message || null,
        source_page: location.pathname,
      });
      if (error) throw error;
    },
  };
})();
