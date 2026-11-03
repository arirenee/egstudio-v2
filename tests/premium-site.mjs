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
const publicHome = home
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const visibleHomeText = [...publicHome.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim()).join(' ');
assert.doesNotMatch(visibleHomeText, /[-–—]/, 'Homepage customer-facing text should not contain dashes');
for (const match of publicHome.matchAll(/\b(?:alt|aria-label)="([^"]+)"/g)) {
  assert.doesNotMatch(match[1], /[-–—]/, 'Homepage image and accessibility labels should not contain dashes');
}
assert.doesNotMatch(home.match(/<title>([^<]+)<\/title>/)?.[1] || '', /[-–—]/, 'Homepage title should not contain dashes');
for (const q of [
  'We scaled content delivery without expanding our internal team.',
  'Our clients receive consistent deliverables while our team stays focused on growth.',
  'EG Studio gave us additional production capacity without the overhead of new hires.',
  'Growth Marketing Agency', 'Creative Agency', 'Digital Agency',
]) assert(home.includes(q), `Missing approved testimonial text: ${q}`);
assert.doesNotMatch(home, /Anonymous agency client/i);
for (const s of ['id="benefits"','id="included"','id="work"','id="comparison"','id="how-it-works"','id="white-label"','id="testimonials"','id="pricing"']) {
  assert(home.includes(s), `Missing homepage section: ${s}`);
}
assert.match(home, /premium-hero-media/);
assert.match(home, /premium-hero-deliverable-count/, 'Overlapping hero deliverable card missing');
assert.match(home, /premium-hero-deliverable-ready/, 'Hero handoff card missing');
assert.match(home, /premium-deliverable-showcase/, 'Real editing mockups missing');
assert.match(home, /premium-polish\.css\?v=20261103-c/, 'Finishing styles not linked');
assert.match(home, /1 to 3 calendar days/);
assert.match(home, /data-placement="hero_primary"/);
assert(home.includes(stripe), 'Live checkout link missing');

for (const cssFile of ['assets/css/premium.css','assets/css/premium-polish.css','assets/css/premium-pages.css']) {
  const css = read(cssFile);
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  assert.equal((clean.match(/\{/g) || []).length, (clean.match(/\}/g) || []).length, `${cssFile}: unmatched CSS braces`);
}
const polish = read('assets/css/premium-polish.css');
assert.match(polish, /max-width:599px/, 'Missing mobile-specific polish');
assert.match(polish, /prefers-reduced-motion:reduce/, 'Missing reduced-motion accessibility');
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
