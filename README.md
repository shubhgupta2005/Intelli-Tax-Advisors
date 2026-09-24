# Intelli Tax Advisors — website

Static site in plain HTML, CSS and JavaScript (no framework, no build step), backed by Supabase.
The design matches the original single-file page, which is kept at `reference/original-index.html`.

## Structure

```
index.html              Home page
post.html               Insight article page (post.html?slug=…)
assets/css/styles.css   All styles
assets/js/config.js     Supabase URL + anon key (fill in)
assets/js/content.js    Built-in content; fallback when Supabase is off or unreachable
assets/js/api.js        Supabase data layer (reads content, saves enquiries)
assets/js/calendar.js   Compliance calendar rules (built-in due dates + admin overrides)
assets/js/main.js       Page behaviour and rendering
assets/img/             Partner photos and client logos
supabase/schema.sql     Tables, Row Level Security, storage bucket
supabase/seed.sql       Initial content (generated from content.js)
```

## Set up Supabase

1. Create a project at supabase.com.
2. In **SQL Editor**, run `supabase/schema.sql`, `supabase/seed.sql`, `supabase/002_admin_portal.sql`, then `supabase/003_compliance_calendar.sql`.
3. Copy **Project URL** and the **anon public** key from *Project Settings → API* into `assets/js/config.js`.

With the config left empty, the site runs on the built-in content and the contact form opens a pre-filled email instead of saving to the database.

## What lives in the database

| Table           | Drives                                                 |
|-----------------|--------------------------------------------------------|
| `site_settings` | Contact email, phone, address, hours, social links, "80+ more clients" tile |
| `services`      | Services accordion                                     |
| `industries`    | Industries grid                                        |
| `partners`      | Leadership cards                                       |
| `clients`       | Client logo wall                                       |
| `testimonials`  | "What clients say" carousel                            |
| `insights`      | Homepage insight cards (first three) and article pages |
| `compliance_dates` | Changes to the homepage compliance calendar (extensions, hidden or extra dates) |
| `enquiries`     | Contact-form submissions                               |

Content tables share `sort_order` (ascending) and `is_published`. Insight `body` is Markdown; a card only links to its article page once it has a body.

The hero, figures strip, about, "why Intelli" and engagement-model sections are static HTML in `index.html`. The compliance calendar's routine due dates are generated in the browser (India time) by `assets/js/calendar.js`; rows in `compliance_dates` override them. Edit those at `admin/calendar.html` — e.g. when CBDT extends the tax-audit date, change `Tax audit report` to the new date there.

## Security model (for the admin portal)

- The public site uses the anon key. RLS lets it **read published content** and **insert enquiries**, nothing else.
- Admins sign in with Supabase Auth. Any user listed in `public.admins` gets full access to all tables and the public `media` storage bucket (for uploading photos and logos).
- To make someone an admin, create the user under *Authentication → Users*, then run:

  ```sql
  insert into public.admins (user_id, email)
  select id, email from auth.users where email = 'you@example.com';
  ```

- Never put the `service_role` key in any browser code.

## Run locally

Any static server works, e.g.

```
python -m http.server 8080
```

then open http://localhost:8080.

## Deploy

Upload the folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, cPanel). There is no build step.
