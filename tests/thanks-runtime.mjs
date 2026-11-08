import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'thanks.html'), 'utf8');
const script = html.match(/<script>\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)\s*<\/script>/);
assert(script, 'thanks.html inline verification script missing');

const MOCK_ENDPOINT = 'https://mock.local/functions/v1/intake';
const networkCalls = [];

function el(init = {}) {
  return {
    textContent: init.textContent || '',
    innerHTML: init.innerHTML || '',
    hidden: init.hidden === true,
    disabled: init.disabled === true,
    className: '',
    style: { display: '' },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
  };
}

function extractDefault(id, attr) {
  const re = new RegExp(`id="${id}"([^>]*)>`);
  const m = html.match(re);
  if (!m) return undefined;
  if (attr === 'hidden') return /\bhidden\b/.test(m[1]);
  if (attr === 'disabled') return /\bdisabled\b/.test(m[1]);
  return undefined;
}

function textBetween(id) {
  const re = new RegExp(`id="${id}"[^>]*>([^<]*)<`);
  return html.match(re)?.[1] ?? '';
}

async function runScene({ search, fetchImpl, label, onPosthog, onPintrk }) {
  const posthog = [];
  const pintrk = [];
  const fetches = [];
  const elements = {
    'payment-state': el({ textContent: textBetween('payment-state') }),
    'verified-order': el({ textContent: textBetween('verified-order') }),
    'intake-form': el({ hidden: extractDefault('intake-form', 'hidden') }),
    'submit-btn': el({ disabled: extractDefault('submit-btn', 'disabled') !== false }),
    'form-message': el(),
    'done': el(),
    'page-kicker': el({ textContent: textBetween('page-kicker') }),
    'intake-title': el({ textContent: textBetween('intake-title') }),
    'intake-lead': el({ innerHTML: (html.match(/id="intake-lead"[^>]*>([\s\S]*?)<\/p>/) || ['',''])[1] }),
    'sprint-progress': el({ hidden: extractDefault('sprint-progress', 'hidden') }),
    'source-row': el({ hidden: extractDefault('source-row', 'hidden') }),
    'timing-row': el({ hidden: extractDefault('timing-row', 'hidden') }),
    'project_name': Object.assign(el(), { value: '' }),
    'brand_assets_url': Object.assign(el(), { value: '' }),
    'style_reference_url': Object.assign(el(), { value: '' }),
    'avoid_notes': Object.assign(el(), { value: '' }),
    'rights_confirmed': Object.assign(el(), { checked: false }),
    'website': Object.assign(el(), { value: '' }),
  };

  const fakeFetch = async (url, init = {}) => {
    fetches.push({ url: String(url), method: (init.method || 'GET').toUpperCase() });
    networkCalls.push({ scene: label, url: String(url), method: (init.method || 'GET').toUpperCase() });
    if (!String(url).startsWith(MOCK_ENDPOINT)) {
      throw new Error(`${label}: unexpected URL ${url}`);
    }
    return fetchImpl(String(url), init);
  };

  const posthogGlobal = {
    capture(...args) {
      posthog.push(args);
      if (onPosthog) onPosthog(...args);
    },
  };
  function recordPintrk(...args) {
    pintrk.push(args);
    if (onPintrk) onPintrk(...args);
  }
  const context = {
    window: {
      EG_INTAKE_ENDPOINT: MOCK_ENDPOINT,
      EG_SUPABASE_ANON_KEY: 'mock_anon_not_used_on_network',
      posthog: posthogGlobal,
      pintrk: recordPintrk,
    },
    location: { search },
    document: {
      getElementById(id) { return elements[id] || null; },
    },
    URL,
    URLSearchParams,
    fetch: fakeFetch,
    pintrk: recordPintrk,
    posthog: posthogGlobal,
    console,
  };
  context.globalThis = context;

  await new Promise((resolve, reject) => {
    context.verifyDone = resolve;
    const wrapped = script[1].replace(/verify\(\);\s*\}\)\(\);?\s*$/, 'Promise.resolve(verify()).then(verifyDone, verifyDone);\n})();');
    try {
      vm.runInNewContext(wrapped, context, { filename: `thanks-runtime:${label}` });
    } catch (err) {
      reject(err);
    }
  });

  return { elements, posthog, pintrk, fetches, label };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const missing = await runScene({ search: '', fetchImpl() { throw new Error('fetch must not run without a cs_ session'); }, label: 'missing' });
assert.equal(missing.elements['page-kicker'].textContent, 'Verify your order');
assert.equal(missing.elements['verified-order'].textContent, 'Waiting for Stripe verification');
assert.equal(missing.elements['payment-state'].textContent, 'Payment session missing.');
assert.equal(missing.elements['intake-form'].hidden, true);
assert.equal(missing.elements['sprint-progress'].hidden, true);
assert.equal(missing.elements['source-row'].hidden, true);
assert.equal(missing.elements['timing-row'].hidden, true);
assert.equal(missing.elements['submit-btn'].disabled, true);
assert.equal(missing.fetches.length, 0);
assert.equal(missing.posthog.length, 0);
assert.equal(missing.pintrk.length, 0);

const invalid = await runScene({ search: '?session_id=not-a-session', fetchImpl() { throw new Error('fetch must not run for a non-cs_ session'); }, label: 'invalid' });
assert.equal(invalid.elements['payment-state'].textContent, 'Payment session missing.');
assert.equal(invalid.elements['page-kicker'].textContent, 'Verify your order');
assert.doesNotMatch(invalid.elements['page-kicker'].textContent, /Payment complete/);
assert.equal(invalid.elements['intake-form'].hidden, true);
assert.equal(invalid.elements['sprint-progress'].hidden, true);
assert.equal(invalid.elements['source-row'].hidden, true);
assert.equal(invalid.elements['timing-row'].hidden, true);
assert.equal(invalid.fetches.length, 0);
assert.equal(invalid.posthog.length, 0);

const unpaid = await runScene({
  search: '?session_id=cs_test_unpaid',
  label: 'unpaid',
  fetchImpl: async () => jsonResponse({ paid: false, error: 'Stripe does not show this order as paid.' }, 400),
});
assert.equal(unpaid.fetches.length, 1);
assert.equal(unpaid.elements['payment-state'].textContent, 'Could not verify payment.');
assert.equal(unpaid.elements['page-kicker'].textContent, 'Verify your order');
assert.doesNotMatch(unpaid.elements['page-kicker'].textContent, /Payment complete/);
assert.doesNotMatch(unpaid.elements['verified-order'].textContent, /\$1,500|15 video Sprint/);
assert.equal(unpaid.elements['intake-form'].hidden, true);
assert.equal(unpaid.elements['sprint-progress'].hidden, true);
assert.equal(unpaid.elements['source-row'].hidden, true);
assert.equal(unpaid.elements['timing-row'].hidden, true);
assert.equal(unpaid.posthog.length, 0);
assert.equal(unpaid.pintrk.length, 0);

const wrongSku = await runScene({
  search: '?session_id=cs_test_episode',
  label: 'wrong-sku',
  fetchImpl: async () => jsonResponse({
    paid: true,
    sku: 'episode',
    order_label: 'Agency Clip Pack',
    amount_display: '$199',
  }),
});
assert.equal(wrongSku.elements['payment-state'].textContent, 'Could not verify payment.');
assert.match(wrongSku.elements['form-message'].textContent, /different EG Studio offer/);
assert.equal(wrongSku.elements['page-kicker'].textContent, 'Verify your order');
assert.equal(wrongSku.elements['intake-form'].hidden, true);
assert.equal(wrongSku.elements['sprint-progress'].hidden, true);
assert.equal(wrongSku.elements['source-row'].hidden, true);
assert.equal(wrongSku.elements['timing-row'].hidden, true);
assert.equal(wrongSku.posthog.length, 0);
assert.equal(wrongSku.pintrk.length, 0);

const paidSprint = await runScene({
  search: '?session_id=cs_test_sprint',
  label: 'paid-sprint',
  fetchImpl: async () => jsonResponse({
    paid: true,
    sku: 'sprint',
    order_label: '15 video Sprint',
    amount_display: '$1,500',
  }),
});
assert.equal(paidSprint.elements['payment-state'].textContent, 'Verified · paid');
assert.equal(paidSprint.elements['page-kicker'].textContent, 'Payment complete · 15 video Sprint');
assert.equal(paidSprint.elements['verified-order'].textContent, '15 video Sprint · $1,500');
assert.equal(paidSprint.elements['intake-form'].hidden, false);
assert.equal(paidSprint.elements['sprint-progress'].hidden, false);
assert.equal(paidSprint.elements['source-row'].hidden, false);
assert.equal(paidSprint.elements['timing-row'].hidden, false);
assert.equal(paidSprint.elements['submit-btn'].disabled, false);
assert.equal(paidSprint.fetches.length, 1);
assert.ok(paidSprint.fetches[0].url.startsWith(MOCK_ENDPOINT));
assert.equal(paidSprint.fetches[0].method, 'GET');
// Tracking hooks are local recorders only; they must never be a real network client.
assert.equal(paidSprint.posthog.length, 1);
assert.equal(paidSprint.pintrk.length, 1);

const paidSprintPayload = {
  paid: true,
  sku: 'sprint',
  order_label: '15 video Sprint',
  amount_display: '$1,500',
};

function assertPaidSprintVerified(scene) {
  assert.equal(scene.elements['payment-state'].textContent, 'Verified · paid');
  assert.equal(scene.elements['page-kicker'].textContent, 'Payment complete · 15 video Sprint');
  assert.equal(scene.elements['verified-order'].textContent, '15 video Sprint · $1,500');
  assert.equal(scene.elements['intake-form'].hidden, false);
  assert.equal(scene.elements['sprint-progress'].hidden, false);
  assert.equal(scene.elements['source-row'].hidden, false);
  assert.equal(scene.elements['timing-row'].hidden, false);
  assert.equal(scene.elements['submit-btn'].disabled, false);
  assert.doesNotMatch(scene.elements['form-message'].textContent, /Could not verify payment|is not a function/);
}

const analyticsPosthogThrow = await runScene({
  search: '?session_id=cs_test_sprint_posthog',
  label: 'analytics-posthog-throw',
  fetchImpl: async () => jsonResponse(paidSprintPayload),
  onPosthog() { throw new Error('posthog.capture is not a function'); },
});
assertPaidSprintVerified(analyticsPosthogThrow);
assert.equal(analyticsPosthogThrow.posthog.length, 1);
assert.equal(analyticsPosthogThrow.posthog[0][0], 'intake_payment_verified');
assert.equal(analyticsPosthogThrow.posthog[0][1].sku, 'sprint');
assert.equal(analyticsPosthogThrow.posthog[0][1].experiment, 'native_intake_v1');
assert.equal(analyticsPosthogThrow.pintrk.length, 1);
assert.equal(analyticsPosthogThrow.pintrk[0][0], 'track');
assert.equal(analyticsPosthogThrow.pintrk[0][1], 'checkout');
assert.equal(analyticsPosthogThrow.pintrk[0][2].value, 1500);
assert.equal(analyticsPosthogThrow.pintrk[0][2].currency, 'USD');
assert.equal(analyticsPosthogThrow.pintrk[0][2].event_id, 'cs_test_sprint_posthog');
assert.equal(analyticsPosthogThrow.pintrk[0][2].order_id, 'cs_test_sprint_posthog');
assert.equal(analyticsPosthogThrow.pintrk[0][2].order_quantity, 1);

const analyticsPintrkThrow = await runScene({
  search: '?session_id=cs_test_sprint_pintrk',
  label: 'analytics-pintrk-throw',
  fetchImpl: async () => jsonResponse(paidSprintPayload),
  onPintrk() { throw new Error('pintrk failed'); },
});
assertPaidSprintVerified(analyticsPintrkThrow);
assert.equal(analyticsPintrkThrow.posthog.length, 1);
assert.equal(analyticsPintrkThrow.posthog[0][0], 'intake_payment_verified');
assert.equal(analyticsPintrkThrow.pintrk.length, 1);
assert.equal(analyticsPintrkThrow.pintrk[0][1], 'checkout');

const analyticsBothThrow = await runScene({
  search: '?session_id=cs_test_sprint_both',
  label: 'analytics-both-throw',
  fetchImpl: async () => jsonResponse(paidSprintPayload),
  onPosthog() { throw new Error('posthog.capture is not a function'); },
  onPintrk() { throw new Error('pintrk failed'); },
});
assertPaidSprintVerified(analyticsBothThrow);
assert.equal(analyticsBothThrow.posthog.length, 1);
assert.equal(analyticsBothThrow.pintrk.length, 1);

const backendDown = await runScene({
  search: '?session_id=cs_test_backend_down',
  label: 'backend-down',
  fetchImpl: async () => { throw new Error('backend unreachable'); },
});
assert.equal(backendDown.elements['payment-state'].textContent, 'Could not verify payment.');
assert.equal(backendDown.elements['page-kicker'].textContent, 'Verify your order');
assert.equal(backendDown.elements['intake-form'].hidden, true);
assert.equal(backendDown.elements['sprint-progress'].hidden, true);
assert.equal(backendDown.elements['source-row'].hidden, true);
assert.equal(backendDown.elements['timing-row'].hidden, true);
assert.match(backendDown.elements['form-message'].textContent, /backend unreachable/);
assert.equal(backendDown.posthog.length, 0);
assert.equal(backendDown.pintrk.length, 0);

const backend500 = await runScene({
  search: '?session_id=cs_test_backend_500',
  label: 'backend-500',
  fetchImpl: async () => jsonResponse({ error: 'Intake backend unavailable.' }, 500),
});
assert.equal(backend500.elements['payment-state'].textContent, 'Could not verify payment.');
assert.equal(backend500.elements['page-kicker'].textContent, 'Verify your order');
assert.equal(backend500.elements['intake-form'].hidden, true);
assert.equal(backend500.elements['sprint-progress'].hidden, true);
assert.match(backend500.elements['form-message'].textContent, /Intake backend unavailable/);
assert.equal(backend500.posthog.length, 0);
assert.equal(backend500.pintrk.length, 0);

const allowedFetchScenes = new Set([
  'paid-sprint',
  'unpaid',
  'wrong-sku',
  'analytics-posthog-throw',
  'analytics-pintrk-throw',
  'analytics-both-throw',
  'backend-down',
  'backend-500',
]);
assert.ok(networkCalls.every((call) => call.url.startsWith(MOCK_ENDPOINT)), 'a scene escaped the mock endpoint');
assert.ok(networkCalls.every((call) => allowedFetchScenes.has(call.scene)), 'an unexpected scene called fetch');

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stylesheetOrder(pageHtml) {
  const sheets = [];
  const tokenRe = /<style\b[^>]*>([\s\S]*?)<\/style\s*>|<link\b[^>]*>/gi;
  let token;
  while ((token = tokenRe.exec(pageHtml))) {
    if (token[0].toLowerCase().startsWith('<style')) {
      sheets.push({ href: 'inline', css: token[1] });
      continue;
    }
    if (!/rel=["']stylesheet["']/i.test(token[0])) continue;
    const href = token[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || /^(?:https?:|\/\/)/i.test(href)) continue;
    const file = href.split(/[?#]/)[0].replace(/^\//, '');
    sheets.push({ href, css: fs.readFileSync(path.join(root, file), 'utf8') });
  }
  return sheets;
}

function displayRules(css) {
  const rules = [];
  const blockRe = /([^{}@]+)\{([^{}]*)\}/g;
  let block;
  const cleaned = stripCssComments(css);
  while ((block = blockRe.exec(cleaned))) {
    const display = block[2].match(/display\s*:\s*([^;!]+)(!\s*important)?/i);
    if (!display) continue;
    for (const selector of block[1].split(',').map((part) => part.trim()).filter(Boolean)) {
      rules.push({
        selector,
        display: display[1].trim(),
        important: Boolean(display[2]),
      });
    }
  }
  return rules;
}

function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const attrs = (selector.match(/\[[^\]]+\]/g) || []).length;
  const classes = (selector.match(/\.[\w-]+/g) || []).length;
  const elements = (
    selector
      .replace(/#[\w-]+/g, ' ')
      .replace(/\.[\w-]+/g, ' ')
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/::?[\w-]+(\([^)]*\))?/g, ' ')
      .match(/\b[A-Za-z][\w-]*/g) || []
  ).length;
  return [ids, attrs + classes, elements];
}

function cmpSpec(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function parseCompound(compound) {
  return {
    tag: compound.match(/^[A-Za-z][\w-]*/)?.[0]?.toLowerCase() || null,
    id: compound.match(/#([\w-]+)/)?.[1] || null,
    classes: [...compound.matchAll(/\.([\w-]+)/g)].map((match) => match[1]),
    hasHidden: /\[hidden\]/i.test(compound),
  };
}

function compoundMatches(compound, el) {
  const parsed = parseCompound(compound);
  if (parsed.tag && parsed.tag !== el.tag) return false;
  if (parsed.id && parsed.id !== el.id) return false;
  if (parsed.classes.some((name) => !el.classes.includes(name))) return false;
  if (parsed.hasHidden && !el.hidden) return false;
  return true;
}

function selectorMatches(selector, el) {
  const parts = selector.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  if (!compoundMatches(parts[parts.length - 1], el)) return false;
  const ancestors = parts.slice(0, -1).join(' ');
  if (ancestors.includes('premium-form') && el.bodyClass !== 'premium-form') return false;
  return true;
}

function computedDisplay(el, rules) {
  let winner = { display: '', important: false, spec: [0, 0, 0], order: -1, selector: '' };
  rules.forEach((rule, order) => {
    if (!selectorMatches(rule.selector, el)) return;
    const spec = specificity(rule.selector);
    const better = (rule.important && !winner.important)
      || (rule.important === winner.important && (cmpSpec(spec, winner.spec) > 0 || (cmpSpec(spec, winner.spec) === 0 && order > winner.order)));
    if (better) winner = { display: rule.display, important: rule.important, spec, order, selector: rule.selector };
  });
  return winner;
}

const authorRules = stylesheetOrder(html).flatMap((sheet) => displayRules(sheet.css));
assert.ok(authorRules.some((rule) => rule.selector.includes('#sprint-progress') && rule.selector.includes('[hidden]') && rule.display === 'none' && rule.important), 'thanks.html must scope a [hidden] display:none !important rule to sprint-progress');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'assets/css/premium-pages.css'), 'utf8'), /\[hidden\]\s*\{[^}]*display\s*:\s*none/, 'do not add a global [hidden] override to shared premium-pages.css');

const hiddenEls = [
  { name: 'sprint-progress', tag: 'ol', id: 'sprint-progress', classes: ['premium-intake-progress'], hidden: true, bodyClass: 'premium-form' },
  { name: 'source-row', tag: 'div', id: 'source-row', classes: ['status-row'], hidden: true, bodyClass: 'premium-form' },
  { name: 'timing-row', tag: 'div', id: 'timing-row', classes: ['status-row'], hidden: true, bodyClass: 'premium-form' },
  { name: 'intake-form', tag: 'form', id: 'intake-form', classes: [], hidden: true, bodyClass: 'premium-form' },
];

for (const el of hiddenEls) {
  const winner = computedDisplay(el, authorRules);
  assert.equal(winner.display, 'none', `${el.name}: author cascade should hide [hidden] (won by ${winner.selector || 'no rule'})`);
  assert.equal(winner.important, true, `${el.name}: hiding rule must win with !important over later display:grid`);
}

const revealedProgress = computedDisplay({ ...hiddenEls[0], hidden: false }, authorRules);
assert.equal(revealedProgress.display, 'grid', `verified sprint progress should return to display:grid (won by ${revealedProgress.selector || 'no rule'})`);
const revealedSource = computedDisplay({ ...hiddenEls[1], hidden: false }, authorRules);
assert.equal(revealedSource.display, 'grid', `verified source row should return to display:grid (won by ${revealedSource.selector || 'no rule'})`);

console.log('PASS: thanks.html runtime — missing and invalid sessions stay on Verify your order with the brief hidden; unpaid and wrong-sku responses do not reveal Sprint details or fire tracking; a mocked paid sprint session reveals the legacy brief; analytics throws do not overwrite verification; backend failures stay unverified. Fetch stayed on the mock endpoint. Author stylesheet cascade hides [hidden] Sprint details despite display:grid rules.');
