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
  assert.doesNotMatch(html, /Google Drive|Unbranded Drive/i, `${page}: obsolete public file-service wording`);
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
// Maintain the established offer while presenting each point in its correct context.
for (const s of [
  '<span class="premium-word-keep">White Label</span> Short Form Editing <span class="rd-h1-line">For Agencies</span>',
  'One client recording becomes five captioned and branded vertical clips.',
  '$199 fixed price.',
  'Delivered in 1–3 calendar days once materials are ready.',
  'No subscription. No sales call. No contact with your client.',
  'What you send. What we do. What you get back.',
  'Send recording and assets',
  'We review and edit',
  'Your agency reviews and delivers',
  'Five separate video files',
  'Moments selected for you',
  'Checked captions and brand styling',
  'Five hook or title suggestions',
  'Your agency stays in control.',
  'You manage the client',
  'We handle post production',
  'You control delivery',
  'First batch in 1–3 calendar days once payment clears and all materials are ready.',
  'No contract',
]) assert(home.includes(s), `Missing owner-approved homepage copy: ${s}`);
for (const q of [
  'We scaled content delivery without expanding our internal team.',
  'Our clients receive consistent deliverables while our team stays focused on growth.',
  'EG Studio gave us additional production capacity without the overhead of new hires.',
  '<strong>Founder</strong><span>Healthcare Marketing Agency</span>',
  '<strong>Managing Director</strong><span>B2B Content Agency</span>',
  '<strong>Owner</strong><span>Local Advertising Agency</span>',
]) assert(home.includes(q), `Missing approved testimonial text: ${q}`);
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
assert.match(home, /A person reviews the finished batch before delivery\./, 'The human final-batch check must remain in the editing process');
assert.doesNotMatch(read('assets/css/premium-polish.css'), /rd-final-founder/, 'Removed founder block CSS must not remain');
assert.match(read('assets/css/redesign.css'), /rd-footer-email\{[^}]*min-height:44px/, 'Email tap target must remain accessible');

for (const s of ['id="benefits"','id="included"','id="work"','id="why-eg"','id="how-it-works"','id="testimonials"','id="pricing"','id="faq"']) {
  assert(home.includes(s), `Missing homepage section: ${s}`);
}
const main = home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
const mainSections = [...main.matchAll(/^\s*<section\b[^>]*class="([^"]+)"[^>]*>/gm)];
assert.equal(mainSections.length, 8, 'Homepage must have eight distinct visual sections');
assert.deepEqual(
  [...main.matchAll(/^\s*<section\b[^>]*id="([^"]+)"/gm)].map(m => m[1]),
  ['how-it-works', 'included', 'work', 'why-eg', 'testimonials', 'pricing'],
  'Homepage should show process, scope, proof and offer in the approved order',
);
assert.doesNotMatch(main, /<section\b[^>]*id="(?:comparison|white-label|benefits|faq|founder)"/, 'Redundant standalone sections remain');
assert.match(main, /<section id="pricing"[\s\S]*?<div id="faq"[^>]*>[\s\S]*?<\/section>/, 'FAQ must sit inside pricing');
assert.equal([...main.matchAll(/class="premium-included-grid"[\s\S]*?<\/div>/g)][0]?.[0].match(/<article>/g)?.length, 4, 'Offer inclusions must be concise');
assert.equal((main.match(/class="premium-benefit-card"/g) || []).length, 3, 'Agency benefits should not repeat the included list');
assert.equal((main.match(/class="faq-item"/g) || []).length, 5, 'FAQ should answer only unanswered buying questions');
assert.doesNotMatch(main, /premium-deliverable-showcase/, 'Duplicate work sample thumbnails must not compete with real video proof');
assert.doesNotMatch(main, /premium-trust-strip/, 'Repeated hero promises should not clutter the purchase action');
const inclusions = main.match(/<div class="premium-includes-wrap">[\s\S]*?<\/ul>/)?.[0] || '';
assert.deepEqual([...inclusions.matchAll(/<li>([^<]+)<\/li>/g)].map(m => m[1]), [
  'Five separate 9:16 video clips', 'Human moment selection, no timestamps needed',
  'Checked captions and supplied brand styling', 'Five hook or title suggestions',
  'One consolidated revision round', 'Private white label handoff to your agency folder',
], 'Pricing must describe the exact deliverables');
assert.match(main, /Your agency provides[\s\S]*?One usable recording/);
assert.match(main, /No contract\. No subscription\. No sales call required\./);
assert.match(home, /premium-hero-media/);
assert.match(home, /premium-hero-deliverable-count/, 'Overlapping hero deliverable card missing');
assert.match(home, /premium-hero-deliverable-ready/, 'Hero handoff card missing');
assert.match(home, /premium-polish\.css\?v=20261105-footer/, 'Current finishing styles not linked');
assert.equal((home.match(/<source src="\/assets\/samples\/sample-process\.mp4\?v=20261103"/g)||[]).length, 2, 'Both hero and proof player must use the approved editing process video');
assert.doesNotMatch(home, /sample-beforeafter\.(?:jpg|mp4)/, 'Older partial comparison must not appear on the homepage');
assert.equal(fs.statSync(path.join(root, 'assets/samples/sample-process.mp4')).size, 2083296, 'Unexpected process video asset');
assert.match(home, /1 to 3 calendar days/);
assert.match(home, /One recording, up to 60 minutes\. Five vertical clips, up to 60 seconds each/);
assert.match(home, /File sharing services can show uploader identities/, 'Private handoff caveat lost');
assert.match(home, /Public recuts are editing demonstrations only\. No endorsement or client relationship is implied\./, 'Public recut disclaimer lost');
assert.match(home, /Revision time is additional\./, 'Revision timing caveat lost');
assert.match(home, /data-placement="hero_primary"/);
assert(home.includes(stripe), 'Live checkout link missing');
for (const match of main.matchAll(/<a\b[^>]*data-placement="[^"]+"[^>]*>/g)) {
  assert(match[0].includes(`href="${stripe}"`), `Unexpected checkout target: ${match[0]}`);
}
const visibleFaqs = [...main.matchAll(/class="faq-question"[^>]*><span>([^<]+)<\/span>[\s\S]*?<div class="faq-answer"[^>]*><p>([^<]+)<\/p>/g)];
assert.equal(visibleFaqs.length, 5, 'Five FAQ questions must be visible to the accordion');
for (let index = 0; index < visibleFaqs.length; index++) {
  assert.equal(faqSchema.mainEntity[index].name, visibleFaqs[index][1], `FAQ question ${index + 1} differs from structured data`);
  assert.equal(faqSchema.mainEntity[index].acceptedAnswer.text, visibleFaqs[index][2], `FAQ answer ${index + 1} differs from structured data`);
}

for (const cssFile of ['assets/css/premium.css','assets/css/premium-polish.css','assets/css/premium-pages.css']) {
  const css = read(cssFile);
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  assert.equal((clean.match(/\{/g) || []).length, (clean.match(/\}/g) || []).length, `${cssFile}: unmatched CSS braces`);
}
const polish = read('assets/css/premium-polish.css');
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
for (const page of copyPages) {
  const html = read(page);
  const tokens = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/gi) || [];
  for (const token of tokens) {
    if (/^<script\b/i.test(token)) {
      if (/type="application\/ld\+json"/.test(token)) {
        const body = token.replace(/^<script[^>]*>/i, '').replace(/<\/script\s*>$/i, '');
        const check = (value, field) => {
          if (typeof value === 'string' && copyFields.has(field)) assert(!value.includes('-'), `${page}: structured copy contains a hyphen: ${value}`);
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
          assert(!content.includes('-'), `${page}: search preview copy contains a hyphen: ${content}`);
        }
      }
      for (const match of token.matchAll(/\b(?:alt|aria-label|aria-description|title)="([^"]*)"/gi)) {
        if (!/^(?:https?:|\/)/i.test(match[1])) assert(!match[1].includes('-'), `${page}: accessible copy contains a hyphen: ${match[1]}`);
      }
    } else {
      const value = token.trim();
      if (value && !/^\/?[\w.-]+\.(?:html?|js|css|png|svg)(?:\?.*)?$/i.test(value))
        assert(!value.includes('-'), `${page}: visible copy contains a hyphen: ${value.slice(0,120)}`);
    }
  }
}
assert(!read('payment-confirmed.html').includes('One private, agency-owned folder'), 'Verified intake copy still contains a hyphen');

console.log(`PASS: ${pages.length} redesigned pages, local assets, scripts, offer link, real quotes and CSS structure.`);
