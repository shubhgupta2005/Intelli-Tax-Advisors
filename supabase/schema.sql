-- Intelli Tax Advisors — database schema
-- Run once in Supabase → SQL Editor, then run seed.sql.
--
-- Access model
--   • Public site (anon key): reads published content, inserts enquiries. Nothing else.
--   • Admin portal: signs in with Supabase Auth; users listed in public.admins get
--     full read/write on every table and the `media` storage bucket.

-- ---------------------------------------------------------------------------
-- Admins & helpers
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------------------------------------------------------------------------
-- Content tables (edited in the admin portal)
-- All share: sort_order (ascending), is_published, created_at, updated_at.
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,          -- email, phone, address, hours, instagram_url, linkedin_url, clients_more
  value      text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id           bigint generated always as identity primary key,
  code         text not null,           -- small mono label, e.g. "ITR · TP"
  title        text not null,
  summary      text not null,
  details      text[] not null default '{}',
  is_lead      boolean not null default false,
  sort_order   int not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.industries (
  id           bigint generated always as identity primary key,
  name         text not null,
  tagline      text not null default '',
  sort_order   int not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.partners (
  id           bigint generated always as identity primary key,
  name         text not null,
  role         text not null,
  photo_url    text,
  highlights   text[] not null default '{}',
  linkedin_url text,
  sort_order   int not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.clients (
  id           bigint generated always as identity primary key,
  name         text not null,
  logo_url     text not null,
  sort_order   int not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.testimonials (
  id           bigint generated always as identity primary key,
  quote        text not null,
  author_name  text not null,
  company      text not null,
  sort_order   int not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.insights (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category     text not null,
  read_minutes int,
  title        text not null,
  excerpt      text not null default '',
  body         text,                    -- Markdown; when empty the card links to #insights
  has_body     boolean generated always as (coalesce(length(trim(body)), 0) > 0) stored,
  published_at timestamptz default now(),
  sort_order   int not null default 0,  -- homepage shows the first three
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Enquiries (written by the public contact form, managed in the admin portal)
-- ---------------------------------------------------------------------------
create table if not exists public.enquiries (
  id          bigint generated always as identity primary key,
  name        text not null check (length(name) between 1 and 200),
  company     text check (length(company) <= 200),
  email       text not null check (email ~* '^\S+@\S+\.\S+$' and length(email) <= 320),
  phone       text check (length(phone) <= 40),
  topic       text check (length(topic) <= 120),
  message     text check (length(message) <= 5000),
  source_page text check (length(source_page) <= 200),
  status      text not null default 'new' check (status in ('new','contacted','in_progress','closed','spam')),
  admin_notes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists enquiries_status_created_idx on public.enquiries (status, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['site_settings','services','industries','partners','clients','testimonials','insights','enquiries'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.admins        enable row level security;
alter table public.site_settings enable row level security;
alter table public.services      enable row level security;
alter table public.industries    enable row level security;
alter table public.partners      enable row level security;
alter table public.clients       enable row level security;
alter table public.testimonials  enable row level security;
alter table public.insights      enable row level security;
alter table public.enquiries     enable row level security;

-- admins: an admin can see the admin list; changes are made from the SQL editor.
drop policy if exists "admins read" on public.admins;
create policy "admins read" on public.admins for select to authenticated using (public.is_admin());

-- site_settings: public read, admin write
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "settings admin write" on public.site_settings;
create policy "settings admin write" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- content tables: public reads published rows; admin reads/writes everything
do $$
declare t text;
begin
  foreach t in array array['services','industries','partners','clients','testimonials','insights'] loop
    execute format('drop policy if exists "%1$s public read" on public.%1$s', t);
    execute format('create policy "%1$s public read" on public.%1$s for select to anon, authenticated using (is_published or public.is_admin())', t);
    execute format('drop policy if exists "%1$s admin write" on public.%1$s', t);
    execute format('create policy "%1$s admin write" on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- enquiries: anyone may submit a new one; only admins can read or change them
drop policy if exists "enquiries public insert" on public.enquiries;
create policy "enquiries public insert" on public.enquiries for insert to anon, authenticated
  with check (status = 'new' and admin_notes is null);
drop policy if exists "enquiries admin read" on public.enquiries;
create policy "enquiries admin read" on public.enquiries for select to authenticated using (public.is_admin());
drop policy if exists "enquiries admin update" on public.enquiries;
create policy "enquiries admin update" on public.enquiries for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "enquiries admin delete" on public.enquiries;
create policy "enquiries admin delete" on public.enquiries for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: public `media` bucket for partner photos, client logos, post images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select to anon, authenticated using (bucket_id = 'media');
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());
