# Intelli Tax Advisors — website

Static site in plain HTML, CSS and JavaScript (no framework, no build step), backed by Supabase.
The design matches the original single-file page, which is kept at `reference/original-index.html`.

## Structure

```
index.html              Home page
insights.html           All published insights, filterable by topic
post.html               Insight article page (post.html?slug=…)
admin/                  Admin portal (admin/index.html) and compliance calendar editor (admin/calendar.html)
assets/css/styles.css   All styles
assets/js/config.js     Supabase URL + anon key (fill in)
assets/js/content.js    Built-in content; fallback when Supabase is off or unreachable
assets/js/api.js        Supabase data layer (reads content, saves enquiries)
assets/js/calendar.js   Compliance calendar rules (built-in due dates + admin overrides)
assets/js/main.js       Page behaviour and rendering
assets/img/             Partner photos and client logos
supabase/schema.sql     Tables, Row Level Security, storage bucket
supabase/seed.sql       Initial content (generated from content.js)
supabase/002_admin_portal.sql         Page sections table, scheduled posts, media limits
supabase/003_compliance_calendar.sql  Compliance calendar overrides
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
| `insights`      | Blog: homepage cards (newest three), insights.html and article pages |
| `page_sections` | Page copy: hero, figures, about, section headings, why Intelli, engagement model, contact, footer, SEO |
| `compliance_dates` | Changes to the homepage compliance calendar (extensions, hidden or extra dates) |
| `enquiries`     | Contact-form submissions                               |

Content tables share `sort_order` (ascending) and `is_published`. Insight `body` is Markdown; a card only links to its article page once it has a body.

Page copy lives in `page_sections` (one JSON document per section); `index.html` holds the same text as a fallback, so the page never flashes empty. The compliance calendar's routine due dates are generated in the browser (India time) by `assets/js/calendar.js`; rows in `compliance_dates` override them. Edit those at `admin/calendar.html` — e.g. when CBDT extends the tax-audit date, change `Tax audit report` to the new date there.

## Admin portal

Open `/admin/` on the deployed site (or http://localhost:8080/admin/ locally) and sign in with your admin account.

| Section          | What you can do |
|------------------|-----------------|
| Dashboard        | New enquiries, recent posts, quick links |
| Enquiries        | Read form submissions, set status (new → contacted → in progress → closed / spam), add private notes, reply by email, export CSV |
| Insights & blog  | Write posts in Markdown with live preview; upload, paste or drag images in; save drafts, schedule a future publish date, publish, unpublish |
| Services, Industries, Partners, Client logos, Testimonials | Add, edit, delete, reorder (↑ ↓), show/hide on the site |
| Page sections    | Edit every piece of homepage text; "Restore original text" puts the launch copy back |
| Compliance calendar | Correct or hide built-in due dates, add one-off dates (`admin/calendar.html`) |
| Media library    | Upload images/PDFs (10 MB max), copy URLs, delete files |
| Settings         | Contact details, social links, "more clients" tile, change password, see admins |

In headings, wrap words in `*asterisks*` to set them in italic, as in the original design.

**Password reset emails:** in Supabase → *Authentication → URL Configuration*, set the Site URL to your domain and add `https://your-domain/admin/` (and `http://localhost:8080/admin/` for local use) to the redirect URLs.

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
