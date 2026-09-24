-- Intelli Tax Advisors — initial content (generated from assets/js/content.js)
-- Run after schema.sql. Safe to re-run: it replaces existing content rows.
-- Image paths are relative to the site root; images uploaded in the admin portal
-- will instead be full Supabase Storage URLs.

begin;

truncate public.services, public.industries, public.partners, public.clients, public.testimonials, public.insights restart identity;

insert into public.site_settings (key, value) values
  ('email', 'Info@IntelliTaxAdvisors.com'),
  ('phone', '+91 99997 94546'),
  ('address', 'A-21, Gulmohar Park, New Delhi 110049, India'),
  ('hours', 'Mon–Sat, 10:00–19:00 IST'),
  ('instagram_url', 'https://www.instagram.com/intellitaxadvisors'),
  ('linkedin_url', 'https://www.linkedin.com/search/results/all/?keywords=Intelli%20Tax%20Advisors'),
  ('clients_more', '80+')
on conflict (key) do update set value = excluded.value;

insert into public.services (code, title, summary, details, is_lead, sort_order) values
  ('ITR · TP', 'Direct Tax & Corporate Advisory', 'Corporate and international tax, handled end to end.', array['Corporate & international tax structuring, including transfer pricing', 'Annual return filing, tax audits and assessment support', 'Withholding tax and cross-border subsidiary advisory', 'Tax due diligence for transactions and business reviews']::text[], true, 10),
  ('GST', 'GST & Indirect Tax', 'Monthly and annual GST compliance, done right the first time.', array['GST compliance across multi-state registrations', 'GST audits, reconciliations and health checks', 'Refund claims and working-capital optimisation', 'Customs, incentive schemes and subsidy-based benefits']::text[], true, 20),
  ('Sec. 143(2) · ITAT', 'Litigation & Representation', 'Calm, documented responses to notices, from first reply to tribunal.', array['Replies to notices from direct and indirect tax authorities', 'Representation before assessing officers and appellate authorities', 'Tribunal-level representation on complex tax disputes', 'Strategy and documentation through the entire dispute']::text[], true, 30),
  ('Planning', 'Tax Advisory & Planning', 'Better business decisions, grounded in the law as it stands.', array['Old vs. new regime modelling', 'Capital gains & exit planning', 'Salary structuring and ESOP taxation', 'Succession and family wealth planning']::text[], false, 40),
  ('M&A · DD', 'Due Diligence', 'Financial and tax diligence before you invest, acquire or raise.', array['Financial & tax due diligence for acquisitions', 'Vendor-side diligence before fundraising', 'Contingent liability and exposure mapping', 'Findings report with deal-protection recommendations']::text[], false, 50),
  ('Review', 'Tax & Compliance Health Checks', 'Reviews that confirm 100% compliance with government norms, before the department looks.', array['Income tax, TDS & GST compliance review', 'GSTR-2B vs. books ITC reconciliation', 'ROC, FEMA & statutory register checks', 'Prioritised action plan with risk ratings']::text[], false, 60),
  ('GST · Customs', 'Incentives & Subsidies', 'Cash and subsidy-based incentives you are entitled to, actually claimed.', array['Incentives under GST and Customs schemes', 'State industrial-policy subsidies', 'Export benefits and duty remission', 'Claim filing and follow-up to disbursement']::text[], false, 70),
  ('Books', 'Bookkeeping & Accounting', 'Clean, reconciled books that stand up to any audit.', array['Monthly bookkeeping on Tally or Zoho', 'Bank, GST & vendor reconciliations', 'Payroll processing and statutory dues', 'Month-end close with MIS reporting']::text[], false, 80),
  ('Start-up', 'Startup & Business Advisory', 'Legal and financial foundations that are investor-ready from day one.', array['Entity selection — LLP, Pvt Ltd, OPC', 'Incorporation, PAN, TAN, GST & MSME registration', 'DPIIT recognition & Sec. 80-IAC', 'Due-diligence readiness for fundraising']::text[], false, 90),
  ('Ind AS', 'Financial Statement Review', 'Independent evaluation of your statements, with clear guidance.', array['Review of P&L, balance sheet & cash flow', 'Ratio and working-capital analysis', 'Schedule III and disclosure checks', 'Board-ready commentary']::text[], false, 100),
  ('ROC · FEMA', 'Regulatory & Compliance Consulting', 'Risk mitigation and alignment with changing regulations.', array['MCA / ROC annual filings', 'FEMA & foreign remittance compliance (15CA/CB)', 'Internal controls and compliance calendars', 'Policy reviews for new regulations']::text[], false, 110),
  ('Wealth', 'Financial Advisory', 'Personal financial planning grounded in tax efficiency.', array['Goal-based financial planning', 'Portfolio review with tax overlay', 'Insurance and retirement structuring', 'NRI tax and repatriation planning']::text[], false, 120);

insert into public.industries (name, tagline, sort_order) values
  ('Defence', 'Regulatory & compliance advisory', 10),
  ('Textile manufacturing', 'GST, incentives & export compliance', 20),
  ('Skincare & FMCG', 'Direct tax & transaction advisory', 30),
  ('Real estate', 'Structuring & litigation support', 40),
  ('Hospitality & heritage hotels', 'Compliance & tax review', 50),
  ('F&B & coffee manufacturing', 'Indirect tax & audits', 60),
  ('Technology & platforms', 'Advisory & due diligence', 70),
  ('Consumer & retail start-ups', 'End-to-end compliance', 80);

insert into public.partners (name, role, photo_url, highlights, linkedin_url, sort_order) values
  ('Ankit Aggarwal', 'Founding partner · Direct & international tax', 'assets/img/partners/ankit-aggarwal.jpg', array['Chartered Accountant · PGDM Finance', 'Ex Big 4 · 10+ years across direct and international tax', 'Leads corporate tax structuring, transfer pricing and cross-border advisory', 'Advises listed companies and high-growth founders']::text[], 'https://www.linkedin.com/in/caankit1410/', 10),
  ('Mohit Gupta', 'Founding partner · GST & litigation', 'assets/img/partners/mohit-gupta.jpg', array['Chartered Accountant', 'Ex Big 4 Manager, Indirect Tax · 10+ years'' experience', 'Leads GST advisory, indirect tax audits and litigation strategy', 'Represents clients before tax authorities and tribunals']::text[], 'https://www.linkedin.com/in/mohit-gupta-b2a760ba/', 20);

insert into public.clients (name, logo_url, sort_order) values
  ('IGT Solutions', 'assets/img/clients/igt-solutions.png', 10),
  ('Sirona', 'assets/img/clients/sirona.png', 20),
  ('4700BC', 'assets/img/clients/4700bc.png', 30),
  ('Del Monte', 'assets/img/clients/del-monte.png', 40),
  ('ONDC', 'assets/img/clients/ondc.png', 50),
  ('SMPP', 'assets/img/clients/smpp.png', 60),
  ('IPCA', 'assets/img/clients/ipca.png', 70),
  ('DEN', 'assets/img/clients/den.png', 80),
  ('Emiza', 'assets/img/clients/emiza.png', 90),
  ('Metro Buildtech', 'assets/img/clients/metro-buildtech.png', 100),
  ('Uniqura', 'assets/img/clients/uniqura.png', 110),
  ('The Haryana Story', 'assets/img/clients/the-haryana-story.png', 120),
  ('Dolce Vitti', 'assets/img/clients/dolce-vitti.png', 130),
  ('Carpet Couture by Rashi', 'assets/img/clients/carpet-couture-by-rashi.png', 140),
  ('Okaya', 'assets/img/clients/okaya.png', 150),
  ('HAG', 'assets/img/clients/hag.png', 160),
  ('Infonative', 'assets/img/clients/infonative.png', 170),
  ('SM Jewellers', 'assets/img/clients/sm-jewellers.png', 180),
  ('Nandini Skincare', 'assets/img/clients/nandini-skincare.png', 190);

insert into public.testimonials (quote, author_name, company, sort_order) values
  ('As a growing global company, we required personalised services that were often complex. Intelli always exceeded expectations — from MSME registration to overseas subsidiary taxation.', 'Saurabh Kathuria', 'Infonative', 10),
  ('Great team — they''ve helped us streamline finance processes and GST compliances. Their knowledge is invaluable, from fixing process gaps to optimum use of government schemes.', 'Mohit Bajaj', 'Sirona', 20),
  ('Intelli brings Big 4 rigour with the responsiveness of an in-house team. Their direct tax and GST advice is precise, timely and always commercially grounded.', 'Vipin Rustagi', 'Del Monte', 30),
  ('From routine compliance to complex GST questions, Intelli is a dependable partner. They flag issues early and explain every option clearly, which makes decisions easier.', 'Chirag Gupta', '4700BC', 40),
  ('As a fast-growing startup, we needed advisors who move at our pace. Intelli set up our tax and compliance processes cleanly and never misses a deadline.', 'Samayesh Khanna', 'Beanly', 50),
  ('Intelli handled our tax notices and representations with real expertise and calm. The partners are always accessible, and we trust their advice completely.', 'Arjun Singh Kadian', 'The Haryana Story', 60);

insert into public.insights (slug, category, read_minutes, title, excerpt, body, sort_order) values
  ('itc-eligibility-under-gst', 'GST · Sec. 16', 8, 'Input Tax Credit (ITC) eligibility under GST', 'The four conditions every claim must satisfy, the blocked credits under Section 17(5), and how to reconcile against GSTR-2B before you file.', null, 10),
  ('old-vs-new-regime-fy-2026-27', 'Income Tax', 5, 'Old vs. new regime: choosing for FY 2026–27', 'Where deductions still win, and where the new slabs quietly come out ahead.', null, 20),
  ('notice-under-sec-143-2', 'Notices', 6, 'Received a notice under Sec. 143(2)? Start here.', 'What scrutiny means, the timelines that matter, and the documents to gather first.', null, 30);

commit;
