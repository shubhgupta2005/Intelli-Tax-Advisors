-- Intelli Tax Advisors — admin portal migration
-- Run once in Supabase → SQL Editor, after schema.sql and seed.sql. Safe to re-run.
--
-- • page_sections: editable page copy (hero, figures, about, headings, footer…), one JSON row per section
-- • insights: scheduled posts (published_at in the future) stay private until that time
-- • media bucket: 10 MB limit, images and PDFs only

create table if not exists public.page_sections (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_page_sections on public.page_sections;
create trigger touch_page_sections before update on public.page_sections
  for each row execute function public.touch_updated_at();

alter table public.page_sections enable row level security;
drop policy if exists "page_sections public read" on public.page_sections;
create policy "page_sections public read" on public.page_sections for select to anon, authenticated using (true);
drop policy if exists "page_sections admin write" on public.page_sections;
create policy "page_sections admin write" on public.page_sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Insights: hide scheduled posts from the public until their publish time
drop policy if exists "insights public read" on public.insights;
create policy "insights public read" on public.insights for select to anon, authenticated
  using ((is_published and published_at <= now()) or public.is_admin());
create index if not exists insights_published_idx on public.insights (is_published, published_at desc);

-- Media bucket limits
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','image/avif','application/pdf']
 where id = 'media';

-- Default page copy (existing rows are left untouched)
insert into public.page_sections (key, data) values
  ('seo', '{"title":"Intelli Tax Advisors","description":"Intelli Tax Advisors LLP — a New Delhi tax practice for direct tax, GST, litigation and advisory, led by two ex-Big 4 partners."}'::jsonb),
  ('hero', '{"eyebrow":"Est. 2019 · Boutique tax & advisory · New Delhi","title_lines":["Driven by expertise.","*Defined by integrity.*"],"lede":"A New Delhi practice handling direct tax, GST and litigation for 100+ businesses — from listed companies to fast-growing start-ups — led by two ex-Big 4 partners, so the numbers never catch you off guard.","cta_primary":"Book a consultation","cta_secondary":"Explore services","calendar_note":"Indicative statutory due dates. Subject to CBDT / CBIC extensions — we track them so you don''t have to."}'::jsonb),
  ('figures', '{"items":[{"value":"2019","label":"Established in New Delhi"},{"value":"100+","label":"Clients, including listed companies"},{"value":"Ex Big 4","label":"Partner pedigree"},{"value":"20+ yrs","label":"Combined partner experience"}]}'::jsonb),
  ('about', '{"eyebrow":"About the firm","statement":"A single-window practice, *built on relationships* — where good tax advice is quiet, exact and early.","paragraphs":["Founded in 2019 and headquartered in New Delhi, Intelli Tax Advisors LLP is a committed, resourceful group of like-minded professionals serving clients across India — from listed companies to fast-growing start-ups.","We work as an extension of each client''s own finance team. The partners who scope your engagement are the same people who file your returns, answer your notices and sit across the table from the tax authorities."],"pillars":[{"title":"Value","text":"Skilled advice, delivered on time — reflecting integrity, service, excellence and team-work."},{"title":"Empower","text":"Help clients make intelligent, informed decisions by explaining the legal and procedural issues."},{"title":"Advise","text":"Stay abreast of law and rulings, and be forthright about what is reasonable and attainable."}]}'::jsonb),
  ('services', '{"eyebrow":"Services","title":"Every tax question. *One point of contact.*","intro":"One team covers the full tax lifecycle — from routine filing to representation before tribunals. Select any practice area to see what an engagement covers."}'::jsonb),
  ('why', '{"eyebrow":"Why Intelli","title":"Why clients stay *well past their first filing season.*","intro":"Five reasons our clients keep coming back.","reasons":[{"title":"Single window","text":"One tax and accounting provider for every filing, review and representation you need."},{"title":"Diverse client base","text":"Depth across defence, textiles, skincare, real estate, hospitality, F&B and technology."},{"title":"Timelines & cost","text":"Our hallmark is meeting every deadline without inflating the bill."},{"title":"Embedded partnership","text":"We work as an extension of your own team, protecting your interests with diligence."},{"title":"Personal, national reach","text":"Based in New Delhi, serving clients across India — with the same partners on every engagement, wherever the work is."}]}'::jsonb),
  ('industries', '{"eyebrow":"Industries served","title":"Depth across *sectors.*","intro":"Manufacturing, consumer, real estate and technology — a breadth few boutique practices carry."}'::jsonb),
  ('method', '{"eyebrow":"Engagement model","title":"How we work *with clients.*","intro":"Every engagement follows the same four stages, so you always know what''s done, what''s pending, and who is responsible.","steps":[{"title":"Understand","text":"We scope the business, existing filings and risk areas in a working session with the partners.","when":"Week 1"},{"title":"Diagnose","text":"Due diligence and health checks find gaps and exposure before they become notices.","when":"Weeks 2–3"},{"title":"Execute","text":"Ongoing compliance, filings and advisory delivered on a fixed monthly schedule, always on time.","when":"Continuous"},{"title":"Represent","text":"We appear before tax authorities and tribunals whenever notices or disputes arise.","when":"As needed"}],"note":"An embedded extension of your finance team — not an outside vendor — with one partner-level point of contact throughout."}'::jsonb),
  ('partners', '{"eyebrow":"Leadership","title":"Meet *our partners.*","intro":"Two Chartered Accountants with more than ten years each at Big 4 firms, and a founding partner on every engagement."}'::jsonb),
  ('clients', '{"eyebrow":"Major clients","title":"Trusted by 100+ businesses, *including listed companies.*","intro":"A selection of the companies we advise, from national brands to fast-growing start-ups.","testimonials_eyebrow":"What clients say"}'::jsonb),
  ('insights', '{"eyebrow":"Insights","title":"Notes from *the practice.*","intro":"Plain-language briefings on the changes that affect Indian businesses and taxpayers."}'::jsonb),
  ('contact', '{"eyebrow":"Contact","title":"Let''s make tax *the quiet part* of your year.","promises":["A free scoping call before any engagement","Direct access to a founding partner, not a junior associate","A response within one business day, every time"],"form_note":"A partner replies within one business day. Everything you share is held in confidence.","topics":["Direct tax & corporate advisory","Tax advisory & planning","GST & indirect tax","Bookkeeping & accounting","Start-up & business advisory","Notice, scrutiny or litigation","GST / Customs incentives","Due diligence","Compliance health check","Something else"],"submit_label":"Request a call"}'::jsonb),
  ('footer', '{"copyright":"© 2026 Intelli Tax Advisors LLP · New Delhi"}'::jsonb)
on conflict (key) do nothing;
