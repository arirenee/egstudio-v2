import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'index.html', 'white-label-podcast-clips/index.html',
  'content-graveyard/index.html', 'short-form-readiness-review.html',
  'payment-confirmed.html', 'thanks.html', 'terms.html',
  'privacy.html', 'refund.html',
];
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stripe = 'https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f';

for (const page of pages) {
  const html = read(page);
  assert.match(html, /premium(?:-pages)?\.css\?v=2026110[345]-(?:redesign|polish|copy|handoff)/, `${page}: premium styles missing`);
  assert.match(html, /<main\b/i, `${page}: main landmark missing`);
  assert.match(html, /<h1\b/i, `${page}: h1 missing`);
  // Legal pages must name the storage processor (private Google Drive workspace); marketing pages must not.
  assert.doesNotMatch(['terms.html', 'privacy.html'].includes(page) ? html.replace(/private project workspace \(a Google Drive folder\)|Google Drive for project files|private Google Drive workspace|EG Studio’s Google Drive account/g, '') : html, /Google Drive|Unbranded Drive/i, `${page}: obsolete public file-service wording`);
  assert.doesNotMatch(html, /written intake acceptance|intake acceptance|accept(?:ed)? (?:your|the) intake in writing|after accepted intake/i, `${page}: outdated delivery trigger wording`);
  for (const match of html.matchAll(/(?:src|href|poster)="([^"]+)"/g)) {
    const url = match[1].split(/[?#]/)[0];
    if (!url || url.startsWith('#') || /^(?:https?:|mailto:|tel:|data:)/.test(url)) continue;
    const local = url.startsWith('/') ? url.slice(1) : path.join(path.dirname(page), url);
    const file = path.join(root, local);
    const exists = fs.existsSync(file) || fs.existsSync(path.join(file, 'index.html'));
    assert(exists, `${page}: missing local asset or link ${url}`);
  }
  for (const [i, match] of [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
    if (/type="application\/ld\+json"/.test(match[1]) || !match[2].trim()) continue;
    new vm.Script(match[2], { filename: `${page} inline script ${i}` });
  }
}

const home = read('index.html');
const schema = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || '{}');
const faqSchema = schema['@graph']?.find(node => node['@type'] === 'FAQPage');
assert.equal(faqSchema?.mainEntity?.length, 5, 'Structured FAQ must match the five visible questions');
for (const s of [
  'Turn one client recording into five branded clips.',
  'We review the footage, choose the strongest moments, add captions, and return five finished clips your agency can review and deliver.',
  'No timestamps. No hiring. No client contact.',
  '$199 one time.',
  'Get 5 Clips for $199',
  'See Editing Samples',
  'See the editing quality.',
  'Before &amp; After',
  'Podcast / Panel',
  'Talking Head',
  'What we need from you',
  'Just three things:',
  '<li>The recording</li>',
  '<li>Your branding</li>',
  '<li>A quick project brief</li>',
  'We’ll handle the review, editing, captions, and clip selection.',
  'From recording to finished clips',
  '<h3>Send the recording</h3><p>Upload the recording, your logo or brand assets, and a few project details.</p><p>No timestamps required.</p>',
  '<h3>We create the clips</h3><p>We review the footage, choose the strongest moments, add captions, and apply your branding.</p>',
  '<h3>Review and deliver</h3><p>Your agency receives five finished clips privately. Make any included corrections, then deliver them when you’re ready.</p>',
  'How delivery works',
  'After checkout, you’ll receive a private project link.',
  'Upload your recording and branding there.',
  'When the clips are finished, your agency receives everything in the same workspace for review and delivery.',
  'Your client never interacts with EG Studio.',
  'What your agency gets back',
  '<h3>Five delivery-ready clips</h3><p>Enough content from a single recording to create multiple posts instead of just one.</p>',
  '<h3>No timestamps required</h3><p>Send the full recording. We’ll identify the strongest moments for you.</p>',
  '<h3>Captions already included</h3><p>Your team reviews finished clips instead of starting from raw footage.</p>',
  '<h3>Your branding applied</h3><p>The clips look consistent with the agency or client brand you provide.</p>',
  '<h3>Suggested hooks included</h3><p>Give your team a starting point instead of a blank page.</p>',
  '<h3>One revision round</h3><p>Make final corrections before delivering the clips.</p>',
  'Agency Clip Pack',
  'Turn one client recording into five branded short-form clips without adding editing work to your team’s week.',
  'We review the footage, choose the strongest moments, add captions, and prepare everything for your agency’s review.',
  'No contract. No subscription. No sales call.',
  'Have a recording ready?',
]) assert(home.includes(s), `Missing required homepage copy: ${s}`);
for (const q of [
  'We scaled content delivery without expanding our internal team.',
  'Our clients receive consistent deliverables while our team stays focused on growth.',
  'EG Studio gave us additional production capacity without the overhead of new hires.',
  '<strong>Founder</strong><span>Healthcare Marketing Agency</span>',
  '<strong>Managing Director</strong><span>B2B Content Agency</span>',
  '<strong>Owner</strong><span>Local Advertising Agency</span>',
]) assert(home.includes(q), `Missing approved testimonial text: ${q}`);
assert.doesNotMatch(home, /identities are withheld|withheld at the agencies/i, 'Testimonial withheld-identity note must be removed');
for (const gone of [/agency-owned folder/i, /edit\/upload/i, /production folder/i, /We’ll confirm what’s needed to begin/, /Turn one recording into five short clips/, /Five finished vertical clips/, /Send your recording<\/h3>/, /We edit the clips/, /Review and share/, /What you send/i]) {
  assert.doesNotMatch(home, gone, `Superseded homepage copy remains: ${gone}`);
}
assert.doesNotMatch(home, /anonymous/i, 'Testimonials must never be labelled anonymous');
assert.doesNotMatch(home, /EG Studio provides white label video editing for agencies/);
assert.doesNotMatch(home, /Review the refund policy/);
assert.doesNotMatch(home, /Anonymous agency client/i);
const footer = home.match(/<footer class="site-footer-current rd-footer">[\s\S]*?<\/footer>/)?.[0] || '';
const finalCallToAction = home.match(/<section class="rd-final">[\s\S]*?<\/section>/)?.[0] || '';
assert(footer, 'The consolidated footer must render');
assert.doesNotMatch(finalCallToAction, /rd-final-founder|id="founder"|Founder, EG Studio|private editing|mailto:/, 'The final CTA must not contain a second company block');
assert.doesNotMatch(home, /Founder, EG Studio|private editing|Los Angeles based|Los Angeles, CA(?!lifornia)|without expanding payroll/i, 'Obsolete footer messaging must be absent');
for (const phrase of ['White label short form post production for agencies.', 'Los Angeles, California', 'mailto:ops@egstudio.tech', '>ops@egstudio.tech</a>', '© 2026 EG Studio. All rights reserved.']) {
  assert.equal(footer.split(phrase).length - 1, 1, `Footer must contain ${phrase} exactly once`);
}
assert.equal((footer.match(/class="eg-wordmark"/g) || []).length, 1, 'Footer must use the shared wordmark');
assert.equal((home.match(/<a class="eg-wordmark" href="#top">EG<span>STUDIO<\/span><\/a>/g) || []).length, 2, 'Homepage header and footer must share the exact logo implementation');
assert.doesNotMatch(home, /class="(?:logo|footer-brand|rd-brand|image2-brand|brand-logo)"/, 'Legacy homepage logos must be removed');
for (const page of ['terms.html', 'privacy.html', 'refund.html']) {
  assert.equal((read(page).match(/<a class="eg-wordmark" href="index\.html">EG<span>STUDIO<\/span><\/a>/g) || []).length, 2, `${page}: legal header and footer must use one logo implementation`);
}
const wordmarkStyles = read('assets/css/eg-wordmark.css');
for (const rule of [/font-family:\s*Montserrat/, /font-size:\s*1\.15rem/, /font-weight:\s*800/, /letter-spacing:\s*-\.035em/, /color:\s*#6EA8E5\s*!important/, /color:\s*#9CA3AF\s*!important/]) {
  assert.match(wordmarkStyles, rule, `Shared legal-page wordmark styling missing: ${rule}`);
}
assert.doesNotMatch(read('assets/css/premium-pages.css'), /\.footer-brand|\.rd-home \.logo/, 'Legacy parallel logo rules must be removed');
assert.match(read('assets/css/premium-pages.css'), /@media \(max-width:599px\)\{body\.rd-home \.rd-header \.rd-nav,body\.rd-home \.rd-footer \.rd-footer-inner\{--pad-x:4vw\}/, 'Mobile homepage logos must align with the 92% legal-page content width');
const brandPages = [
  ...pages, 'pinterest-diagnostic.html', 'thanks-test.html',
  'thanks-test/index.html', 'thanks/index.html',
];
const iconRefs = [
  '/favicon.ico', '/favicon.svg', '/favicon-16x16.png',
  '/favicon-32x32.png', '/favicon-48x48.png',
  '/apple-touch-icon.png', '/safari-pinned-tab.svg', '/site.webmanifest',
  '/assets/css/eg-wordmark.css',
];
let wordmarkCount = 0;
for (const page of brandPages) {
  const source = read(page);
  for (const reference of iconRefs) {
    assert.equal(source.split(`${reference}?v=20261105-brand`).length - 1, 1, `${page}: missing or duplicate brand reference ${reference}`);
  }
  assert.doesNotMatch(source, /<a\b[^>]*class="(?:logo|rd-brand|footer-brand|brand)"[^>]*>EG<span>STUDIO<\/span>/, `${page}: old wordmark implementation remains`);
  wordmarkCount += [...source.matchAll(/class="eg-wordmark"[^>]*>EG<span>STUDIO<\/span>/g)].length;
}
assert.equal(wordmarkCount, 16, 'All 16 visible wordmarks must use the same shared implementation');
const manifest = JSON.parse(read('site.webmanifest'));
assert.equal(manifest.name, 'EG Studio');
assert.equal(manifest.icons.length, 5);
for (const icon of manifest.icons) {
  assert(fs.existsSync(path.join(root, icon.src.slice(1))), `Missing PWA icon: ${icon.src}`);
}
const pngSizes = new Map([
  ['favicon-16x16.png',16],['favicon-32x32.png',32],['favicon-48x48.png',48],
  ['favicon-64x64.png',64],['favicon-128x128.png',128],['favicon-256x256.png',256],
  ['apple-touch-icon.png',180],['android-chrome-192x192.png',192],['android-chrome-512x512.png',512],
]);
for (const [file,size] of pngSizes) {
  const png = fs.readFileSync(path.join(root, file));
  assert.equal(png.subarray(1,4).toString(), 'PNG', `${file}: invalid image format`);
  assert.equal(png.readUInt32BE(16), size, `${file}: incorrect width`);
  assert.equal(png.readUInt32BE(20), size, `${file}: incorrect height`);
}
assert.equal(fs.readFileSync(path.join(root,'favicon.ico')).readUInt16LE(4), 3, 'ICO must contain three icon resolutions');
assert.match(read('favicon.svg'), /#6EA8E5/);
assert.match(read('favicon.svg'), /#9CA3AF/);
assert.doesNotMatch(read('favicon.svg'), /<text\b/, 'Favicon cannot rely on tiny runtime text');
assert(!fs.existsSync(path.join(root, 'apple-touch-icon.svg')) && !fs.existsSync(path.join(root, 'icon-512.png')), 'Unused prior-generation icon files must be removed');
assert.equal((footer.match(/<nav\b/g) || []).length, 1, 'One accessible footer navigation required');
assert.match(footer, /<nav class="site-footer-links" aria-label="Footer navigation">/, 'Footer navigation needs an accessible label');
for (const [label, destination] of [['Privacy','privacy.html'],['Terms','terms.html'],['Refunds','refund.html']]) {
  assert(footer.includes(`href="${destination}">${label}</a>`), `Footer ${label} link changed`);
}
assert.doesNotMatch(home, /A person reviews the finished batch before delivery\./);
assert.doesNotMatch(read('assets/css/premium-polish.css'), /rd-final-founder/, 'Removed founder block CSS must not remain');
assert.match(read('assets/css/redesign.css'), /rd-footer-email\{[^}]*min-height:44px/, 'Email tap target must remain accessible');

for (const s of ['id="work"','id="what-we-need"','id="how-it-works"','id="delivery"','id="what-you-get"','id="testimonials"','id="pricing"','id="faq"']) {
  assert(home.includes(s), `Missing homepage section: ${s}`);
}
assert.doesNotMatch(home, /id="included"|id="why-eg"|id="benefits"/, 'Removed inclusion and agency-workflow sections must stay gone');
const main = home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
const mainSections = [...main.matchAll(/^\s*<section\b[^>]*class="([^"]+)"[^>]*>/gm)];
assert.equal(mainSections.length, 10, 'Homepage must have the ten-section buying journey');
assert.deepEqual(
  [...main.matchAll(/^\s*<section\b[^>]*id="([^"]+)"/gm)].map(m => m[1]),
  ['work', 'what-we-need', 'how-it-works', 'delivery', 'what-you-get', 'pricing', 'testimonials', 'faq'],
  'Homepage should show samples, needs, steps, delivery, deliverables, offer, quotes, then FAQs',
);
assert.doesNotMatch(main, /<section\b[^>]*id="(?:comparison|white-label|benefits|included|why-eg|founder)"/, 'Redundant standalone sections remain');
assert.match(main, /<section id="faq"/, 'FAQ must be its own section after testimonials');
assert.doesNotMatch(main, /premium-included-grid|premium-benefit-card/);
assert.equal((main.match(/class="faq-item"/g) || []).length, 5, 'FAQ should answer only unanswered buying questions');
assert.doesNotMatch(main, /premium-deliverable-showcase/, 'Duplicate work sample thumbnails must not compete with real video proof');
assert.doesNotMatch(main, /premium-trust-strip/, 'Repeated hero promises should not clutter the purchase action');
const pricing = main.match(/<section id="pricing"[\s\S]*?<\/section>/)?.[0] || '';
const inclusions = pricing.match(/<ul class="rd-includes premium-benefits premium-included-list">[\s\S]*?<\/ul>/)?.[0] || '';
assert.deepEqual([...inclusions.matchAll(/<li>([^<]+)<\/li>/g)].map(m => m[1]), [
  'Five clips', 'Moment selection', 'Captions', 'Brand styling', 'Hook suggestions', 'One revision round', 'First delivery in 1–3 calendar days',
], 'Pricing must list the owner-approved inclusions exactly');
assert.match(pricing, /<div class="rd-price">\$199 <span>one time<\/span><\/div>/, 'Pricing must keep $199 one time');
assert.doesNotMatch(pricing, /premium-offer-timing|One recording up to 60 minutes\. Five 9:16 clips/, 'Unapproved product-limits line must not appear under the pricing button');
assert.equal((pricing.match(/data-sku="episode"/g) || []).length, 1, 'Pricing card must have exactly one checkout action');
assert.equal((pricing.match(/1–3 calendar days/g) || []).length, 1, 'Pricing must show one concise timing statement');
assert.doesNotMatch(pricing, /project brief|What you’ll send|private project link/, 'Pricing card must not repeat the project brief explanation');
assert.doesNotMatch(main, /premium-process-timing/, 'Standalone turnaround paragraph below the process cards must be removed');
const finalCta = main.match(/<section class="rd-final">[\s\S]*?<\/section>/)?.[0] || '';
assert.match(finalCta, /Have a recording ready\?/);
assert.match(finalCta, /Get 5 Clips for \$199/);
assert.doesNotMatch(finalCta, /follows checkout|rd-final-support/, 'Final CTA must not carry the brief fine print');
const faqText = (h) => h.replace(/<ul>([\s\S]*?)<\/ul>/g, (_, l) => [...l.matchAll(/<li>([^<]+)<\/li>/g)].map(m => m[1]).join(', ') + '. ').replace(/<\/p>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const approvedFaq = [
  ['What footage can I send?', 'Podcasts, interviews, webinars, educational content, and talking-head videos work best. If you’re unsure about a recording, send us an email before ordering and we’ll let you know if it’s a good fit.'],
  ['What happens after payment?', 'We’ll send you a private project link where you can upload your recording and branding. From there, we review the footage, create the clips, and return everything to your agency for review. Most agencies spend just a few minutes getting started.'],
  ['When does the 1–3 day turnaround start?', 'Once we have: your recording, branding assets, project details. We’ll confirm everything is ready before editing begins. From there, most first batches are delivered within 1–3 calendar days.'],
  ['Can I review the clips before sending them to my client?', 'Yes. Your agency receives the finished clips first. If caption, branding, or timing adjustments are needed, one revision round is included before final delivery.'],
  ['Will my client know EG Studio is involved?', 'No. Your agency remains the point of contact throughout the project. We do not communicate with your clients, and finished clips are delivered directly to your agency for review and delivery.'],
];
const gallery = main.match(/<div class="rd-samples" id="rdSamples"[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || '';
assert.deepEqual([...gallery.matchAll(/<article class="rd-sample ([^"]+)" aria-label="([^"]+)"/g)].map(m => `${m[1]}|${m[2]}`),
  ['rd-sample-featured|Before &amp; After', 'rd-sample-support|Podcast / Panel', 'rd-sample-support|Talking Head'],
  'Before & After must lead as the featured sample with two equal supporting cards');
assert.doesNotMatch(home, /premium-hero-media|premium-hero-deliverable-count|premium-hero-deliverable-ready|premium-workflow-diagram/);
const polishHash = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(path.join(root, 'assets/css/premium-polish.css'))).digest('hex').slice(0, 12);
assert(home.includes(`premium-polish.css?v=${polishHash}`), 'Current finishing styles not linked with their content hash');

assert.equal((home.match(/<source src="\/assets\/samples\/sample-process\.mp4\?v=20261103"/g)||[]).length, 1, 'The process video should appear once in the portfolio, not again in the hero');
assert.doesNotMatch(home, /story-recording\.jpg/, 'Hero must not use the portrait labeled as the customer recording');
const publicPages = [
  'index.html', 'white-label-podcast-clips/index.html',
  'content-graveyard/index.html', 'short-form-readiness-review.html',
  'payment-confirmed.html', 'thanks.html', 'terms.html',
  'privacy.html', 'refund.html',
];
for (const page of publicPages) {
  const html = read(page);
  assert.doesNotMatch(html, /sample-podcast\.(?:jpg|mp4)|sample-executive\.(?:jpg|mp4)/, `${page}: Interview or Explainer media remains visible`);
  assert.doesNotMatch(html, />Interview<|>Explainer</, `${page}: Interview or Explainer card label remains visible`);
}
assert(fs.existsSync(path.join(root, 'assets/samples/sample-podcast.mp4')), 'Interview sample file must be kept because it may be used elsewhere');
assert(fs.existsSync(path.join(root, 'assets/samples/sample-executive.mp4')), 'Explainer sample file must be kept because it may be used elsewhere');
const hero = home.match(/<section class="rd-hero[\s\S]*?<\/section>/)?.[0] || '';
assert.match(hero, /Turn one client recording into five branded clips\./);
assert.match(hero, /\$199 one time\./, 'Hero should lead with the offer, not intake conditions');
assert.doesNotMatch(hero, /payment clears and (?:the |all )?required materials/, 'Hero must not place intake timing conditions next to the main buttons');
const deliverySection = main.match(/<section[^>]*id="delivery"[\s\S]*?<\/section>/)?.[0] || '';
assert.match(deliverySection, /Your client never interacts with EG Studio\.<\/p>\s*<p class="premium-delivery-close">That’s all you need\.<\/p>/, 'How delivery works must close with the approved line');
assert.doesNotMatch(home, /You review, then your client does/);
assert.doesNotMatch(home, /sample-beforeafter\.(?:jpg|mp4)/, 'Older partial comparison must not appear on the homepage');
assert.equal(fs.statSync(path.join(root, 'assets/samples/sample-process.mp4')).size, 2083296, 'Unexpected process video asset');
const terms = read('terms.html'), refund = read('refund.html'), refundText = refund.replace(/<[^>]+>/g, '');
assert.match(terms, /we share a private project workspace \(a Google Drive folder\) with the email used for the order/);
assert.match(terms, /deliver the finished files to the same workspace/);
assert.match(terms, /File sharing services may reveal uploader account details if workspace items are shared directly\./);
assert.doesNotMatch(terms, /agency owned production folder|folder your agency owns|edit\/upload access/, 'Terms must describe the EG private workspace, not an agency-owned folder');
assert.match(terms, /Revision time is additional\./);
assert.match(terms, /The standard pack is for one English language recording with up to two synchronized speakers or cameras\./);
assert.match(terms, /Eligible footage includes podcasts, interviews, webinars, and expert or talking head recordings\./);
assert.match(terms, /<h2>Service Scope<\/h2>\s*<p>The Agency Clip Pack includes:<\/p>\s*<ul>\s*<li>One source recording \(up to 60 minutes\)<\/li>\s*<li>Five short-form clips<\/li>\s*<li>Captions<\/li>\s*<li>Brand styling using supplied assets<\/li>\s*<li>Five hook suggestions<\/li>\s*<li>One revision round<\/li>\s*<\/ul>/, 'Terms must state the owner-approved service scope');
assert.doesNotMatch(terms, /No subscription|No call required/, 'Terms must not carry sales copy');
for (const page of ['terms.html', 'privacy.html', 'refund.html']) assert.match(read(page), /Last updated: November 9, 2026\./, `${page}: last updated date`);
for (const line of [
  'You may request cancellation before editing begins. Eligible cancellations are refunded in full.',
  'A cancellation is eligible when you email ops@egstudio.tech before we start reviewing your recording for editing.',
  'The included revision round corrects the delivered clips.',
  'We’ll let you know before editing begins and issue a refund.',
  'Orders become non-refundable once editing work has started.',
  'If EG Studio cannot finish your order for reasons within our control, we will agree with you on a refund of the unfinished work.',
  'refund the unfinished portion of the order',
  'pause the delivery clock',
]) assert(refundText.includes(line), `Refund policy line missing: ${line}`);
assert.match(refund, /<h2>Before production begins<\/h2>\s*<p>You may request cancellation before editing begins\. Eligible cancellations are refunded in full\.<\/p>\s*<h2>If the recording is not a fit<\/h2>\s*<p>We’ll let you know before editing begins and issue a refund\.<\/p>\s*<h2>After production begins<\/h2>\s*<p>Orders become non-refundable once editing work has started\.<\/p>\s*<h2>Need help\?<\/h2>/, 'Refund policy approved sections must be unaltered');
assert.match(refund, /<h2>Need help\?<\/h2>[\s\S]*<h2>Policy details<\/h2>/, 'Required refund disclosures sit after the approved sections');
assert.match(read('privacy.html'), /<h2>Service providers and storage<\/h2>/, 'Privacy must disclose processors');
const privacyPage = read('privacy.html');
assert.match(privacyPage, /<h2>Your client relationship stays yours<\/h2>\s*<p>Client recordings are used only to complete your project\.<\/p>\s*<p>We do not contact your clients, share recordings publicly, or use project materials outside your order without permission\.<\/p>\s*<p>The content stays between your agency and EG Studio\.<\/p>/, 'Privacy must use the owner-approved client relationship section');
assert.doesNotMatch(privacyPage, /Client recordings and white label work|class="assurance"/, 'Old nested privacy callout must be gone');
for (const page of ['white-label-podcast-clips/index.html', 'content-graveyard/index.html']) {
  assert.doesNotMatch(read(page), /folder your agency owns|agency-owned|production folder|uploader metadata/i, `${page}: folder mechanics remain in marketing copy`);
}
assert.doesNotMatch(read('white-label-podcast-clips/index.html'), /identities are withheld|withheld at the agencies/i, 'Landing page withheld-identity note must be removed');
assert.doesNotMatch(read('terms.html') + read('privacy.html') + read('refund.html'), /substantively updated|reworded for readability|without changing (?:those terms|that policy)/);
assert.doesNotMatch(home, /Public recuts are editing demonstrations only/);
const sampleBlock = main.match(/id="work"[\s\S]*?<\/section>/)?.[0] || '';
assert.equal((sampleBlock.match(/<article class="rd-sample[ "]/g) || []).length, 3, 'Homepage must show three editing samples');
for (const poster of ['/assets/samples/sample-process.jpg?v=20261108', '/assets/samples/sample-panel.jpg?v=20261108', '/assets/samples/sample-saas-founder.jpg?v=20261108']) {
  assert(sampleBlock.includes(`poster="${poster}"`), `Missing poster ${poster}`);
  assert(sampleBlock.includes(`<img src="${poster}"`), `Missing visible thumbnail ${poster}`);
}
assert.equal((sampleBlock.match(/preload="metadata"/g) || []).length, 3, 'Samples should preload metadata so posters can display');
assert.equal((sampleBlock.match(/webkit-playsinline/g) || []).length, 3, 'Samples need the webkit inline attribute');
assert.equal((sampleBlock.match(/<video[^>]*\splaysinline[\s>]/g) || []).length, 3, 'Samples must stay inline on mobile');
assert.match(home, /data-placement="hero_primary"/);
assert(home.includes(stripe), 'Live checkout link missing');
for (const match of main.matchAll(/<a\b[^>]*data-placement="[^"]+"[^>]*>/g)) {
  assert(match[0].includes(`href="${stripe}"`), `Unexpected checkout target: ${match[0]}`);
}
const visibleFaqs = [...main.matchAll(/class="faq-question"[^>]*><span>([^<]+)<\/span>[\s\S]*?<div class="faq-answer"[^>]*>([\s\S]*?)<\/div><\/div>/g)];
assert.equal(visibleFaqs.length, 5, 'Five FAQ questions must be visible to the accordion');
for (let index = 0; index < visibleFaqs.length; index++) {
  assert.equal(visibleFaqs[index][1], approvedFaq[index][0], `FAQ question ${index + 1} must use the owner-approved wording`);
  assert.equal(faqText(visibleFaqs[index][2]), approvedFaq[index][1], `FAQ answer ${index + 1} must use the owner-approved wording`);
  assert.equal(faqSchema.mainEntity[index].name, visibleFaqs[index][1], `FAQ question ${index + 1} differs from structured data`);
  assert.equal(faqSchema.mainEntity[index].acceptedAnswer.text, faqText(visibleFaqs[index][2]), `FAQ answer ${index + 1} differs from structured data`);
}

for (const cssFile of ['assets/css/premium.css','assets/css/premium-polish.css','assets/css/premium-pages.css']) {
  const css = read(cssFile);
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  assert.equal((clean.match(/\{/g) || []).length, (clean.match(/\}/g) || []).length, `${cssFile}: unmatched CSS braces`);
}
const polish = read('assets/css/premium-polish.css');
assert.match(polish, /--rd-sticky-header-height:\s*73px/, 'Sticky header offset must match the 72px nav min-height plus 1px header border');
assert.match(polish, /scroll-padding-top:\s*var\(--rd-sticky-header-height\)/, 'Homepage must pad in-page scroll targets below the sticky header');
assert.match(polish, /#rdSamples[^]*scroll-margin-top:\s*calc\(\s*var\(--rd-sticky-header-height\)\s*\+\s*var\(--rd-work-heading-space\)/, 'Samples target must clear the heading so it is not hidden behind the sticky header');
assert.match(polish, /\.rd-feature \.rd-player,[^]*?aspect-ratio:\s*9\s*\/\s*16;/, 'Before and after video must preserve the full vertical process frame');
assert.match(polish, /max-width:599px/, 'Missing mobile-specific polish');
assert.match(polish, /max-width:849px[^]*?\.premium-hero-deliverable\s*\{\s*position:\s*static;/, 'Hero status cards must not overlap workflow labels on mobile and tablet');
assert.match(polish, /prefers-reduced-motion:reduce/, 'Missing reduced-motion accessibility');
assert.match(polish, /premium-icon-tile[\s\S]*?background: transparent; border: 0;/, 'Benefit icons must use the minimalist outline treatment');
assert.match(polish, /premium-word-keep\s*\{\s*white-space:\s*nowrap;/, 'The White-Label headline must not split across lines at the hyphen');
assert.match(read('assets/css/premium-pages.css'), /font-size:16px!important/, 'iOS form field zoom prevention missing');
for (const page of ['content-graveyard/index.html','white-label-podcast-clips/index.html']) {
  const count = [...read(page).matchAll(/<meta name="theme-color"/g)].length;
  assert.equal(count, 1, `${page}: conflicting iOS Safari browser theme colors`);
}
const symbols = new Set([...read('assets/brand/premium-icons.svg').matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
for (const match of home.matchAll(/premium-icons\.svg#([^" ]+)/g)) {
  assert(symbols.has(match[1]), `Missing icon symbol: ${match[1]}`);
}
assert(symbols.has('clip-select'), 'Clip selection icon missing');
assert.doesNotMatch(home, /premium-icons\.svg#review/, 'Eye icon must not imply public visibility');
assert.match(read('assets/css/premium.css'), /premium-benefit-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'Three cards must balance on desktop');

const copyPages = [
  ...pages, 'pinterest-diagnostic.html', 'thanks-test.html',
  'thanks-test/index.html', 'thanks/index.html',
];
const visibleMeta = new Set(['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description', 'og:image:alt', 'twitter:image:alt']);
const copyFields = new Set(['name', 'description', 'text', 'headline', 'alternativeHeadline', 'caption']);
// Owner-approved hyphenated wording from the Nov 9 2026 copy addendum (exact customer language, not paraphrased).
const approvedHyphens = /short-form|delivery-ready|non-refundable/g;
for (const page of copyPages) {
  const html = read(page);
  const tokens = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/gi) || [];
  for (const token of tokens) {
    if (/^<script\b/i.test(token)) {
      if (/type="application\/ld\+json"/.test(token)) {
        const body = token.replace(/^<script[^>]*>/i, '').replace(/<\/script\s*>$/i, '');
        const check = (value, field) => {
          if (typeof value === 'string' && copyFields.has(field)) {
            const cleaned = (page === 'index.html' ? value.replace(/White-label|talking-head|agency-owned|one-time/g, '') : value).replace(approvedHyphens, '');
            assert(!cleaned.includes('-'), `${page}: structured copy contains a hyphen: ${value}`);
          }
          else if (Array.isArray(value)) value.forEach(item => check(item, field));
          else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => check(item, key));
        };
        check(JSON.parse(body), '');
      }
      continue;
    }
    if (/^<(?:style\b|!--)/i.test(token)) continue;
    if (token.startsWith('<')) {
      if (/^<meta\b/i.test(token)) {
        const key = token.match(/(?:name|property)="([^"]+)"/i)?.[1];
        if (visibleMeta.has(key)) {
          const content = token.match(/\bcontent="([^"]*)"/)?.[1] || '';
          const cleanedMeta = (page === 'index.html' ? content.replace(/White-label|talking-head|agency-owned|one-time/g, '') : content).replace(approvedHyphens, '');
          assert(!cleanedMeta.includes('-'), `${page}: search preview copy contains a hyphen: ${content}`);
        }
      }
      for (const match of token.matchAll(/\b(?:alt|aria-label|aria-description|title)="([^"]*)"/gi)) {
        if (!/^(?:https?:|\/)/i.test(match[1])) {
          const cleanedLabel = page === 'index.html' ? match[1].replace(/White-label|talking-head|agency-owned|one-time/g, '') : match[1];
          assert(!cleanedLabel.includes('-'), `${page}: accessible copy contains a hyphen: ${match[1]}`);
        }
      }
    } else {
      const value = token.trim();
      if (value && !/^\/?[\w.-]+\.(?:html?|js|css|png|svg)(?:\?.*)?$/i.test(value)) {
        const cleaned = (page === 'index.html' ? value.replace(/White-label|talking-head|agency-owned|one-time/g, '') : value).replace(approvedHyphens, '');
        assert(!cleaned.includes('-'), `${page}: visible copy contains a hyphen: ${cleaned.slice(0,120)}`);
      }
    }
  }
}
assert(!read('payment-confirmed.html').includes('One private, agency-owned folder'), 'Verified intake copy still contains a hyphen');


const privacy = read('privacy.html');
assert.equal((privacy.match(/mailto:ops@egstudio\.tech/g) || []).length, 1, 'Privacy page should not repeat the contact email in the body and footer');
assert.match(privacy, /contact link in the footer/, 'Privacy page must still point to a clear contact route');
assert.doesNotMatch(read('white-label-podcast-clips/index.html'), /Principal<\/strong> · Digital Agency/, 'Landing page must not invent a testimonial attribution');
assert.match(read('white-label-podcast-clips/index.html'), /<strong>Owner<\/strong> · Local Advertising Agency/, 'Landing page quote must keep the approved attribution');

const thanks = read('thanks.html');
assert.match(thanks, /<p class="kicker" id="page-kicker">Verify your order<\/p>/, 'thanks.html must not claim payment complete before verification');
assert.match(thanks, /id="verified-order">Waiting for Stripe verification</, 'thanks.html must not advertise the Sprint price before verification');
assert.match(thanks, /<form id="intake-form" novalidate hidden>/, 'thanks.html must withhold the Sprint brief until verification');
assert.match(thanks, /id="sprint-progress"[^>]*hidden/, 'thanks.html must hide Sprint journey details until verification');
assert.doesNotMatch(thanks, /<p class="kicker"[^>]*>Payment complete/, 'thanks.html default kicker still claims payment complete');
assert.doesNotMatch(thanks, /id="verified-order">15 video Sprint/, 'thanks.html default order row still advertises the Sprint');

console.log(`PASS: ${pages.length} redesigned pages, local assets, scripts, offer link, real quotes and CSS structure.`);
