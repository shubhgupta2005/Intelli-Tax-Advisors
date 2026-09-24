// Built-in site content. Used when Supabase isn't configured or can't be reached,
// and as the seed for supabase/seed.sql. Shapes match the database tables.
window.DEFAULT_CONTENT = {
  settings: {
    email: 'Info@IntelliTaxAdvisors.com',
    phone: '+91 99997 94546',
    address: 'A-21, Gulmohar Park, New Delhi 110049, India',
    hours: 'Mon–Sat, 10:00–19:00 IST',
    instagram_url: 'https://www.instagram.com/intellitaxadvisors',
    linkedin_url: 'https://www.linkedin.com/search/results/all/?keywords=Intelli%20Tax%20Advisors',
    clients_more: '80+',
  },

  services: [
    {code:'ITR · TP', is_lead:true, title:'Direct Tax & Corporate Advisory', summary:'Corporate and international tax, handled end to end.',
     details:['Corporate & international tax structuring, including transfer pricing','Annual return filing, tax audits and assessment support','Withholding tax and cross-border subsidiary advisory','Tax due diligence for transactions and business reviews']},
    {code:'GST', is_lead:true, title:'GST & Indirect Tax', summary:'Monthly and annual GST compliance, done right the first time.',
     details:['GST compliance across multi-state registrations','GST audits, reconciliations and health checks','Refund claims and working-capital optimisation','Customs, incentive schemes and subsidy-based benefits']},
    {code:'Sec. 143(2) · ITAT', is_lead:true, title:'Litigation & Representation', summary:'Calm, documented responses to notices, from first reply to tribunal.',
     details:['Replies to notices from direct and indirect tax authorities','Representation before assessing officers and appellate authorities','Tribunal-level representation on complex tax disputes','Strategy and documentation through the entire dispute']},
    {code:'Planning', title:'Tax Advisory & Planning', summary:'Better business decisions, grounded in the law as it stands.',
     details:['Old vs. new regime modelling','Capital gains & exit planning','Salary structuring and ESOP taxation','Succession and family wealth planning']},
    {code:'M&A · DD', title:'Due Diligence', summary:'Financial and tax diligence before you invest, acquire or raise.',
     details:['Financial & tax due diligence for acquisitions','Vendor-side diligence before fundraising','Contingent liability and exposure mapping','Findings report with deal-protection recommendations']},
    {code:'Review', title:'Tax & Compliance Health Checks', summary:'Reviews that confirm 100% compliance with government norms, before the department looks.',
     details:['Income tax, TDS & GST compliance review','GSTR-2B vs. books ITC reconciliation','ROC, FEMA & statutory register checks','Prioritised action plan with risk ratings']},
    {code:'GST · Customs', title:'Incentives & Subsidies', summary:'Cash and subsidy-based incentives you are entitled to, actually claimed.',
     details:['Incentives under GST and Customs schemes','State industrial-policy subsidies','Export benefits and duty remission','Claim filing and follow-up to disbursement']},
    {code:'Books', title:'Bookkeeping & Accounting', summary:'Clean, reconciled books that stand up to any audit.',
     details:['Monthly bookkeeping on Tally or Zoho','Bank, GST & vendor reconciliations','Payroll processing and statutory dues','Month-end close with MIS reporting']},
    {code:'Start-up', title:'Startup & Business Advisory', summary:'Legal and financial foundations that are investor-ready from day one.',
     details:['Entity selection — LLP, Pvt Ltd, OPC','Incorporation, PAN, TAN, GST & MSME registration','DPIIT recognition & Sec. 80-IAC','Due-diligence readiness for fundraising']},
    {code:'Ind AS', title:'Financial Statement Review', summary:'Independent evaluation of your statements, with clear guidance.',
     details:['Review of P&L, balance sheet & cash flow','Ratio and working-capital analysis','Schedule III and disclosure checks','Board-ready commentary']},
    {code:'ROC · FEMA', title:'Regulatory & Compliance Consulting', summary:'Risk mitigation and alignment with changing regulations.',
     details:['MCA / ROC annual filings','FEMA & foreign remittance compliance (15CA/CB)','Internal controls and compliance calendars','Policy reviews for new regulations']},
    {code:'Wealth', title:'Financial Advisory', summary:'Personal financial planning grounded in tax efficiency.',
     details:['Goal-based financial planning','Portfolio review with tax overlay','Insurance and retirement structuring','NRI tax and repatriation planning']},
  ],

  industries: [
    {name:'Defence', tagline:'Regulatory & compliance advisory'},
    {name:'Textile manufacturing', tagline:'GST, incentives & export compliance'},
    {name:'Skincare & FMCG', tagline:'Direct tax & transaction advisory'},
    {name:'Real estate', tagline:'Structuring & litigation support'},
    {name:'Hospitality & heritage hotels', tagline:'Compliance & tax review'},
    {name:'F&B & coffee manufacturing', tagline:'Indirect tax & audits'},
    {name:'Technology & platforms', tagline:'Advisory & due diligence'},
    {name:'Consumer & retail start-ups', tagline:'End-to-end compliance'},
  ],

  partners: [
    {name:'Ankit Aggarwal', role:'Founding partner · Direct & international tax', photo_url:'assets/img/partners/ankit-aggarwal.jpg',
     linkedin_url:'https://www.linkedin.com/in/caankit1410/',
     highlights:['Chartered Accountant · PGDM Finance','Ex Big 4 · 10+ years across direct and international tax','Leads corporate tax structuring, transfer pricing and cross-border advisory','Advises listed companies and high-growth founders']},
    {name:'Mohit Gupta', role:'Founding partner · GST & litigation', photo_url:'assets/img/partners/mohit-gupta.jpg',
     linkedin_url:'https://www.linkedin.com/in/mohit-gupta-b2a760ba/',
     highlights:['Chartered Accountant','Ex Big 4 Manager, Indirect Tax · 10+ years\' experience','Leads GST advisory, indirect tax audits and litigation strategy','Represents clients before tax authorities and tribunals']},
  ],

  clients: [
    'IGT Solutions|igt-solutions','Sirona|sirona','4700BC|4700bc','Del Monte|del-monte','ONDC|ondc','SMPP|smpp','IPCA|ipca','DEN|den',
    'Emiza|emiza','Metro Buildtech|metro-buildtech','Uniqura|uniqura','The Haryana Story|the-haryana-story','Dolce Vitti|dolce-vitti',
    'Carpet Couture by Rashi|carpet-couture-by-rashi','Okaya|okaya','HAG|hag','Infonative|infonative','SM Jewellers|sm-jewellers',
    'Nandini Skincare|nandini-skincare',
  ].map(s => { const [name, slug] = s.split('|'); return {name, logo_url:`assets/img/clients/${slug}.png`}; }),

  testimonials: [
    {quote:'As a growing global company, we required personalised services that were often complex. Intelli always exceeded expectations — from MSME registration to overseas subsidiary taxation.', author_name:'Saurabh Kathuria', company:'Infonative'},
    {quote:'Great team — they\'ve helped us streamline finance processes and GST compliances. Their knowledge is invaluable, from fixing process gaps to optimum use of government schemes.', author_name:'Mohit Bajaj', company:'Sirona'},
    {quote:'Intelli brings Big 4 rigour with the responsiveness of an in-house team. Their direct tax and GST advice is precise, timely and always commercially grounded.', author_name:'Vipin Rustagi', company:'Del Monte'},
    {quote:'From routine compliance to complex GST questions, Intelli is a dependable partner. They flag issues early and explain every option clearly, which makes decisions easier.', author_name:'Chirag Gupta', company:'4700BC'},
    {quote:'As a fast-growing startup, we needed advisors who move at our pace. Intelli set up our tax and compliance processes cleanly and never misses a deadline.', author_name:'Samayesh Khanna', company:'Beanly'},
    {quote:'Intelli handled our tax notices and representations with real expertise and calm. The partners are always accessible, and we trust their advice completely.', author_name:'Arjun Singh Kadian', company:'The Haryana Story'},
  ],

  // Posts without a body link back to #insights; add a body in the admin portal to publish a full article page.
  insights: [
    {slug:'itc-eligibility-under-gst', category:'GST · Sec. 16', read_minutes:8, title:'Input Tax Credit (ITC) eligibility under GST',
     excerpt:'The four conditions every claim must satisfy, the blocked credits under Section 17(5), and how to reconcile against GSTR-2B before you file.', body:null},
    {slug:'old-vs-new-regime-fy-2026-27', category:'Income Tax', read_minutes:5, title:'Old vs. new regime: choosing for FY 2026–27',
     excerpt:'Where deductions still win, and where the new slabs quietly come out ahead.', body:null},
    {slug:'notice-under-sec-143-2', category:'Notices', read_minutes:6, title:'Received a notice under Sec. 143(2)? Start here.',
     excerpt:'What scrutiny means, the timelines that matter, and the documents to gather first.', body:null},
  ],

  // Page copy, edited under "Page sections" in the admin portal (table page_sections).
  // In headings, *asterisks* mark the words set in italic.
  sections: {
    seo: {
      title: 'Intelli Tax Advisors',
      description: 'Intelli Tax Advisors LLP — a New Delhi tax practice for direct tax, GST, litigation and advisory, led by two ex-Big 4 partners.',
    },
    hero: {
      eyebrow: 'Est. 2019 · Boutique tax & advisory · New Delhi',
      title_lines: ['Driven by expertise.', '*Defined by integrity.*'],
      lede: 'A New Delhi practice handling direct tax, GST and litigation for 100+ businesses — from listed companies to fast-growing start-ups — led by two ex-Big 4 partners, so the numbers never catch you off guard.',
      cta_primary: 'Book a consultation',
      cta_secondary: 'Explore services',
      calendar_note: 'Indicative statutory due dates. Subject to CBDT / CBIC extensions — we track them so you don\'t have to.',
    },
    figures: {
      items: [
        {value:'2019', label:'Established in New Delhi'},
        {value:'100+', label:'Clients, including listed companies'},
        {value:'Ex Big 4', label:'Partner pedigree'},
        {value:'20+ yrs', label:'Combined partner experience'},
      ],
    },
    about: {
      eyebrow: 'About the firm',
      statement: 'A single-window practice, *built on relationships* — where good tax advice is quiet, exact and early.',
      paragraphs: [
        'Founded in 2019 and headquartered in New Delhi, Intelli Tax Advisors LLP is a committed, resourceful group of like-minded professionals serving clients across India — from listed companies to fast-growing start-ups.',
        'We work as an extension of each client\'s own finance team. The partners who scope your engagement are the same people who file your returns, answer your notices and sit across the table from the tax authorities.',
      ],
      pillars: [
        {title:'Value', text:'Skilled advice, delivered on time — reflecting integrity, service, excellence and team-work.'},
        {title:'Empower', text:'Help clients make intelligent, informed decisions by explaining the legal and procedural issues.'},
        {title:'Advise', text:'Stay abreast of law and rulings, and be forthright about what is reasonable and attainable.'},
      ],
    },
    services: {
      eyebrow: 'Services',
      title: 'Every tax question. *One point of contact.*',
      intro: 'One team covers the full tax lifecycle — from routine filing to representation before tribunals. Select any practice area to see what an engagement covers.',
    },
    why: {
      eyebrow: 'Why Intelli',
      title: 'Why clients stay *well past their first filing season.*',
      intro: 'Five reasons our clients keep coming back.',
      reasons: [
        {title:'Single window', text:'One tax and accounting provider for every filing, review and representation you need.'},
        {title:'Diverse client base', text:'Depth across defence, textiles, skincare, real estate, hospitality, F&B and technology.'},
        {title:'Timelines & cost', text:'Our hallmark is meeting every deadline without inflating the bill.'},
        {title:'Embedded partnership', text:'We work as an extension of your own team, protecting your interests with diligence.'},
        {title:'Personal, national reach', text:'Based in New Delhi, serving clients across India — with the same partners on every engagement, wherever the work is.'},
      ],
    },
    industries: {
      eyebrow: 'Industries served',
      title: 'Depth across *sectors.*',
      intro: 'Manufacturing, consumer, real estate and technology — a breadth few boutique practices carry.',
    },
    method: {
      eyebrow: 'Engagement model',
      title: 'How we work *with clients.*',
      intro: 'Every engagement follows the same four stages, so you always know what\'s done, what\'s pending, and who is responsible.',
      steps: [
        {title:'Understand', text:'We scope the business, existing filings and risk areas in a working session with the partners.', when:'Week 1'},
        {title:'Diagnose', text:'Due diligence and health checks find gaps and exposure before they become notices.', when:'Weeks 2–3'},
        {title:'Execute', text:'Ongoing compliance, filings and advisory delivered on a fixed monthly schedule, always on time.', when:'Continuous'},
        {title:'Represent', text:'We appear before tax authorities and tribunals whenever notices or disputes arise.', when:'As needed'},
      ],
      note: 'An embedded extension of your finance team — not an outside vendor — with one partner-level point of contact throughout.',
    },
    partners: {
      eyebrow: 'Leadership',
      title: 'Meet *our partners.*',
      intro: 'Two Chartered Accountants with more than ten years each at Big 4 firms, and a founding partner on every engagement.',
    },
    clients: {
      eyebrow: 'Major clients',
      title: 'Trusted by 100+ businesses, *including listed companies.*',
      intro: 'A selection of the companies we advise, from national brands to fast-growing start-ups.',
      testimonials_eyebrow: 'What clients say',
    },
    insights: {
      eyebrow: 'Insights',
      title: 'Notes from *the practice.*',
      intro: 'Plain-language briefings on the changes that affect Indian businesses and taxpayers.',
    },
    contact: {
      eyebrow: 'Contact',
      title: 'Let\'s make tax *the quiet part* of your year.',
      promises: [
        'A free scoping call before any engagement',
        'Direct access to a founding partner, not a junior associate',
        'A response within one business day, every time',
      ],
      form_note: 'A partner replies within one business day. Everything you share is held in confidence.',
      topics: [
        'Direct tax & corporate advisory', 'Tax advisory & planning', 'GST & indirect tax', 'Bookkeeping & accounting',
        'Start-up & business advisory', 'Notice, scrutiny or litigation', 'GST / Customs incentives', 'Due diligence',
        'Compliance health check', 'Something else',
      ],
      submit_label: 'Request a call',
    },
    footer: {
      copyright: '© 2026 Intelli Tax Advisors LLP · New Delhi',
    },
  },
};
