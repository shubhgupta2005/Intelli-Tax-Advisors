// What the admin portal can edit. Field types are handled by UI.buildForm.
window.SCHEMA = (function(){
  const ITALIC = 'Wrap words in *asterisks* to set them in italic.';

  // Ordered lists shown on the site (table rows with sort_order + is_published).
  const collections = {
    services: {
      label: 'Services', singular: 'service', anchor: 'services',
      sub: 'The practice areas in the Services accordion. The first one opens by default.',
      title: r => r.title, subtitle: r => r.code,
      fields: [
        {key:'title', label:'Title', type:'text', required:true},
        {key:'code', label:'Code label', type:'text', required:true, help:'Small label on the left, e.g. “ITR · TP”.'},
        {key:'summary', label:'One-line summary', type:'textarea', rows:2, required:true},
        {key:'details', label:'What the engagement covers', type:'strings', itemLabel:'point'},
        {key:'is_lead', label:'Mark as “Lead practice”', type:'bool'},
        {key:'is_published', label:'Show on website', type:'bool', default:true},
      ],
    },
    industries: {
      label: 'Industries', singular: 'industry', anchor: 'industries',
      sub: 'Tiles in the “Industries served” grid.',
      title: r => r.name, subtitle: r => r.tagline,
      fields: [
        {key:'name', label:'Industry', type:'text', required:true},
        {key:'tagline', label:'Tagline', type:'text', help:'Short line under the name, e.g. “GST, incentives & export compliance”.'},
        {key:'is_published', label:'Show on website', type:'bool', default:true},
      ],
    },
    partners: {
      label: 'Partners', singular: 'partner', anchor: 'partners',
      sub: 'Leadership cards. Photos are shown in black and white on the site.',
      title: r => r.name, subtitle: r => r.role, thumb: r => r.photo_url, round: true,
      fields: [
        {key:'name', label:'Full name', type:'text', required:true},
        {key:'role', label:'Role', type:'text', required:true, help:'e.g. “Founding partner · GST & litigation”.'},
        {key:'photo_url', label:'Portrait', type:'image', folder:'partners', help:'Portrait orientation (4:5) works best.'},
        {key:'highlights', label:'Highlights', type:'strings', itemLabel:'highlight'},
        {key:'linkedin_url', label:'LinkedIn URL', type:'url', full:true, placeholder:'https://www.linkedin.com/in/…'},
        {key:'is_published', label:'Show on website', type:'bool', default:true},
      ],
    },
    clients: {
      label: 'Client logos', singular: 'client', anchor: 'clients',
      sub: 'The logo wall. Logos show in greyscale and turn to colour on hover.',
      title: r => r.name, thumb: r => r.logo_url,
      fields: [
        {key:'name', label:'Client name', type:'text', required:true, full:true, help:'Used as the logo’s alt text.'},
        {key:'logo_url', label:'Logo', type:'image', folder:'clients', required:true, help:'PNG or SVG with a transparent background works best.'},
        {key:'is_published', label:'Show on website', type:'bool', default:true},
      ],
    },
    testimonials: {
      label: 'Testimonials', singular: 'testimonial', anchor: 'clients',
      sub: 'Quotes in the “What clients say” carousel.',
      title: r => r.author_name, subtitle: r => r.company, preview: r => r.quote,
      fields: [
        {key:'quote', label:'Quote', type:'textarea', rows:5, required:true},
        {key:'author_name', label:'Name', type:'text', required:true},
        {key:'company', label:'Company', type:'text', required:true},
        {key:'is_published', label:'Show on website', type:'bool', default:true},
      ],
    },
  };

  const headFields = [
    {key:'eyebrow', label:'Small label', type:'text'},
    {key:'title', label:'Heading', type:'text', full:true, help:ITALIC},
    {key:'intro', label:'Intro', type:'textarea', rows:3},
  ];
  const pair = (a, b, bType = 'textarea') => [{key:a[0], label:a[1], type:'text', required:true}, {key:b[0], label:b[1], type:bType, rows:2}];

  // Page copy (table page_sections: one JSON document per key).
  const sections = {
    seo:        {label:'Search & sharing', desc:'Browser tab title and the description search engines show.', anchor:'',
      fields:[{key:'title', label:'Page title', type:'text', full:true}, {key:'description', label:'Meta description', type:'textarea', rows:3, help:'Aim for 120–160 characters.'}]},
    hero:       {label:'Hero', desc:'The big opening statement, intro and buttons.', anchor:'top',
      fields:[
        {key:'eyebrow', label:'Small label', type:'text', full:true},
        {key:'title_lines', label:'Headline lines', type:'strings', itemLabel:'line', help:'Each line animates in separately. ' + ITALIC},
        {key:'lede', label:'Intro paragraph', type:'textarea', rows:4},
        {key:'cta_primary', label:'Main button', type:'text'},
        {key:'cta_secondary', label:'Second button', type:'text'},
        {key:'calendar_note', label:'Compliance calendar footnote', type:'textarea', rows:2},
      ]},
    figures:    {label:'Figures strip', desc:'The four numbers under the hero.', anchor:'top',
      fields:[{key:'items', label:'Figures', type:'repeater', itemLabel:'Figure', fields: pair(['value','Figure'], ['label','Caption'], 'text')}]},
    about:      {label:'About', desc:'Firm statement, story and the three pillars.', anchor:'about',
      fields:[
        {key:'eyebrow', label:'Small label', type:'text'},
        {key:'statement', label:'Statement', type:'textarea', rows:3, help:ITALIC},
        {key:'paragraphs', label:'Paragraphs', type:'repeater', itemLabel:'Paragraph', fields:[{key:'text', label:'Text', type:'textarea', rows:4, required:true}], wrap:'text'},
        {key:'pillars', label:'Pillars', type:'repeater', itemLabel:'Pillar', fields: pair(['title','Title'], ['text','Text'])},
      ]},
    services:   {label:'Services heading', desc:'Heading above the services list (edit the services themselves under Services).', anchor:'services', fields: headFields},
    why:        {label:'Why Intelli', desc:'Reasons clients stay.', anchor:'why',
      fields:[...headFields, {key:'reasons', label:'Reasons', type:'repeater', itemLabel:'Reason', fields: pair(['title','Title'], ['text','Text'])}]},
    industries: {label:'Industries heading', desc:'Heading above the industries grid.', anchor:'industries', fields: headFields},
    method:     {label:'Engagement model', desc:'The four-step process and closing note.', anchor:'method',
      fields:[...headFields,
        {key:'steps', label:'Steps', type:'repeater', itemLabel:'Step', fields:[...pair(['title','Title'], ['text','Text']), {key:'when', label:'Timing', type:'text'}]},
        {key:'note', label:'Closing note', type:'textarea', rows:2}]},
    partners:   {label:'Partners heading', desc:'Heading above the leadership cards.', anchor:'partners', fields: headFields},
    clients:    {label:'Clients heading', desc:'Heading above the logo wall and the testimonials label.', anchor:'clients',
      fields:[...headFields, {key:'testimonials_eyebrow', label:'Testimonials label', type:'text'}]},
    insights:   {label:'Insights heading', desc:'Heading above the latest three posts.', anchor:'insights', fields: headFields},
    contact:    {label:'Contact', desc:'Heading, promises, form topics and button.', anchor:'contact',
      fields:[
        {key:'eyebrow', label:'Small label', type:'text'},
        {key:'title', label:'Heading', type:'text', full:true, help:ITALIC},
        {key:'promises', label:'Promises', type:'strings', itemLabel:'promise'},
        {key:'form_note', label:'Note under the form', type:'textarea', rows:2},
        {key:'topics', label:'“What do you need help with?” options', type:'strings', itemLabel:'option'},
        {key:'submit_label', label:'Submit button', type:'text'},
      ]},
    footer:     {label:'Footer', desc:'Copyright line.', anchor:'',
      fields:[{key:'copyright', label:'Copyright line', type:'text', full:true}]},
  };

  // Contact details & links (table site_settings: key/value text).
  const settings = [
    {key:'email', label:'Email', type:'email', required:true, help:'Shown in Contact; the form’s email fallback goes here too.'},
    {key:'phone', label:'Phone', type:'text', required:true},
    {key:'address', label:'Office address', type:'text', full:true, required:true},
    {key:'hours', label:'Hours', type:'text'},
    {key:'clients_more', label:'“More clients” tile', type:'text', help:'e.g. “80+”. Leave empty to hide the tile.'},
    {key:'instagram_url', label:'Instagram URL', type:'url'},
    {key:'linkedin_url', label:'LinkedIn URL', type:'url'},
  ];

  const enquiryStatuses = [
    {value:'new', label:'New'}, {value:'contacted', label:'Contacted'}, {value:'in_progress', label:'In progress'},
    {value:'closed', label:'Closed'}, {value:'spam', label:'Spam'},
  ];

  return { collections, sections, settings, enquiryStatuses, ITALIC };
})();
