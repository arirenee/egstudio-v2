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
  assert.match(html, /premium(?:-pages)?\.css\?v=20261103-(?:redesign|polish)/, `${page}: premium styles missing`);
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
// The owner specifically approved these new hyphenated and en dash lines.
for (const s of [
  '<span class="premium-word-keep">White-Label</span> Short Form Editing <span class="rd-h1-line">For Agencies</span>',
  'Turn one client recording into five finished clips in 1–3 days.',
  '$199 fixed price.',
  'No hiring. No subscriptions. No client contact.',
  'No Timestamping Required',
  'We review the full recording and identify the strongest moments for you.',
  'Ready To Deliver',
  'Captioned and branded clips prepared for client review.',
  'Take On More Client Content Without Hiring',
  'Use existing recordings to increase content output while keeping your strategy team focused on clients.',
  'EG Studio is a white-label production partner for agencies that need reliable short-form content editing without expanding payroll.',
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
for (const s of ['id="benefits"','id="included"','id="work"','id="why-eg"','id="how-it-works"','id="testimonials"','id="pricing"','id="faq"','id="founder"']) {
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
assert.equal((main.match(/class="faq-item"/g) || []).length, 5, 'FAQ should answer five distinct buying questions');
const assurances = main.match(/<div class="premium-includes-wrap">[\s\S]*?<\/ul><\/div>/)?.[0] || '';
assert.deepEqual([...assurances.matchAll(/<li>([^<]+)<\/li>/g)].map(m => m[1]), [
  'Fixed price', 'No contract', 'No subscription', 'White label', 'One revision', 'Delivery in 1–3 days',
], 'Pricing must display the six owner-approved assurances verbatim');
assert.match(home, /premium-hero-media/);
assert.match(home, /premium-hero-deliverable-count/, 'Overlapping hero deliverable card missing');
assert.match(home, /premium-hero-deliverable-ready/, 'Hero handoff card missing');
assert.match(home, /premium-deliverable-showcase/, 'Real editing mockups missing');
assert.match(home, /premium-polish\.css\?v=20261103-brand-copy/, 'Current finishing styles not linked');
assert.equal((home.match(/<source src="\/assets\/samples\/sample-process\.mp4\?v=20261103"/g)||[]).length, 2, 'Both hero and proof player must use the approved editing process video');
assert.doesNotMatch(home, /sample-beforeafter\.(?:jpg|mp4)/, 'Older partial comparison must not appear on the homepage');
assert.equal(fs.statSync(path.join(root, 'assets/samples/sample-process.mp4')).size, 2083296, 'Unexpected process video asset');
assert.match(home, /1 to 3 calendar days/);
assert.match(home, /data-placement="hero_primary"/);
assert(home.includes(stripe), 'Live checkout link missing');

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
console.log(`PASS: ${pages.length} redesigned pages, local assets, scripts, offer link, real quotes and CSS structure.`);
