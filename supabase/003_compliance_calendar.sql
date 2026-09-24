-- Intelli Tax Advisors — compliance calendar overrides
-- Run once in Supabase → SQL Editor, after 002_admin_portal.sql. Safe to re-run.
--
-- The site generates routine due dates itself (assets/js/calendar.js). Rows here correct them:
--   key = a built-in date's key (e.g. 'audit-2026-09') → replaces its title/subtitle/date, or hides it
--   key = null                                          → a one-off extra date
-- Edited at admin/calendar.html.

create table if not exists public.compliance_dates (
  id         bigint generated always as identity primary key,
  key        text unique check (key ~ '^[a-z0-9-]+$'),
  title      text check (length(title) <= 120),       -- null = keep the built-in title
  subtitle   text check (length(subtitle) <= 200),    -- null = keep the built-in subtitle
  due_date   date,                                    -- null = keep the built-in date
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key is not null or (title is not null and due_date is not null))
);

drop trigger if exists touch_compliance_dates on public.compliance_dates;
create trigger touch_compliance_dates before update on public.compliance_dates
  for each row execute function public.touch_updated_at();

-- Public read (hidden rows too: the site needs them to hide built-in dates); admin write.
alter table public.compliance_dates enable row level security;
drop policy if exists "compliance_dates public read" on public.compliance_dates;
create policy "compliance_dates public read" on public.compliance_dates for select to anon, authenticated using (true);
drop policy if exists "compliance_dates admin write" on public.compliance_dates;
create policy "compliance_dates admin write" on public.compliance_dates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
