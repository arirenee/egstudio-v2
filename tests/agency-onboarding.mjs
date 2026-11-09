import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac } from 'node:crypto';
import { handle } from '../supabase/functions/client-onboarding/handler.ts';
import { PACKAGES, welcomeEmail, WORKSPACE_SUBFOLDERS, projectBriefDocText } from '../supabase/functions/client-onboarding/lib.ts';

for (const path of ['client-onboarding/handler.ts','client-onboarding/lib.ts','intake/index.ts','stripe-order-webhook/index.ts']) {
  stripTypeScriptTypes(readFileSync('./supabase/functions/'+path,'utf8'),{mode:'transform'});
}
const values={STRIPE_ONBOARDING_WEBHOOK_SECRET:'mock_secret',SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock',GOOGLE_CLIENT_ID:'mock',GOOGLE_CLIENT_SECRET:'mock',GOOGLE_REFRESH_TOKEN:'mock',GOOGLE_DRIVE_PARENT_FOLDER_ID:'parent_root',NOTION_TOKEN:'mock',NOTION_JOBS_DATABASE_ID:'mock',RESEND_API_KEY:'mock'};

// In-memory Google Drive: folders/docs with appProperties tags, permissions per file, inheritance flags.
function mockDrive({ shareRejects = false, inheritedAnyone = false } = {}) {
  const files = new Map(); let n = 0;
  const perms = new Map(); // fileId -> [{type,role,emailAddress}]
  const calls = [];
  const handle = (url, init) => {
    const u = new URL(url); const method = init.method || 'GET'; calls.push(method + ' ' + u.pathname);
    const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
    if (u.host === 'oauth2.googleapis.com') return ok({ access_token: 'tok' });
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q');
      const parent = q.match(/'([^']+)' in parents/)[1], tag = q.match(/value='([^']+)'/)[1], mime = q.match(/mimeType='([^']+)'/)[1];
      return ok({ files: [...files.values()].filter(f => f.parents[0] === parent && f.appProperties?.eg_tag === tag && f.mimeType === mime && !f.trashed) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(init.body); const id = 'f' + (++n);
      const f = { id, ...body, webViewLink: 'https://drive.google.com/drive/folders/' + id }; files.set(id, f);
      perms.set(id, [{ type: 'user', role: 'owner', emailAddress: 'ops@egstudio.tech' }, ...(inheritedAnyone ? [{ type: 'anyone', role: 'reader' }] : [])]);
      return ok({ id, webViewLink: f.webViewLink });
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(init.body.split('\r\n\r\n')[1].split('\r\n--')[0]);
      const content = init.body.split('\r\n\r\n')[2].split('\r\n--')[0];
      const id = 'd' + (++n); const f = { id, ...meta, content, webViewLink: 'https://docs.google.com/document/d/' + id };
      files.set(id, f); perms.set(id, [{ type: 'user', role: 'owner', emailAddress: 'ops@egstudio.tech' }]);
      return ok({ id, webViewLink: f.webViewLink });
    }
    const pm = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/);
    if (pm && method === 'POST') {
      if (shareRejects) return new Response(JSON.stringify({ error: { message: 'invalidSharingRequest' } }), { status: 400 });
      assert.equal(u.searchParams.get('sendNotificationEmail'), 'false', 'Google must not send its own share email');
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), ['emailAddress', 'role', 'type'], 'share request must name one user and nothing else');
      assert.equal(body.type, 'user'); assert.equal(body.role, 'writer');
      perms.get(pm[1]).push(body); return ok({ id: 'perm' });
    }
    if (pm && method === 'GET') return ok({ permissions: perms.get(pm[1]) });
    throw Error('Unexpected Drive call ' + method + ' ' + url);
  };
  return { files, perms, calls, handle };
}

function harness(drive) {
  let row = null; const pages = [], emails = [];
  const f = async (url, init = {}) => {
    url = String(url);
    const data = init.body && !String(init.body).startsWith('--') ? (() => { try { return JSON.parse(init.body); } catch { return null; } })() : null;
    const result = (obj) => new Response(JSON.stringify(obj), { status: 200 });
    if (url.includes('/rest/v1/client_onboarding_jobs')) {
      if (init.method === 'POST') { row ??= { ...data }; return result([]); }
      if (init.method === 'PATCH') { Object.assign(row, data); return result(init.headers.Prefer === 'return=representation' ? [row] : []); }
      return result(row ? [row] : []);
    }
    if (url.includes('/databases/') && url.endsWith('/query')) return result({ results: [] });
    if (url === 'https://api.notion.com/v1/pages') { pages.push(data); return result({ id: 'mock_page', url: 'https://notion.so/mock' }); }
    if (url === 'https://api.resend.com/emails') { emails.push(data); return result({ id: 'mock_email' }); }
    if (/googleapis\.com/.test(url)) return drive.handle(url, init);
    throw Error('Unexpected external call ' + url);
  };
  return { f, pages, emails, row: () => row };
}
function signed(live, email = 'agency@example.com', id = live ? 'cs_live_mock' : 'cs_test_mock') {
  const event = { id: 'evt_' + id, type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: { id, object: 'checkout.session', payment_status: 'paid', livemode: live, metadata: { offer: 'episode_to_shorts' }, customer_details: { email, name: 'Agency Owner' }, payment_intent: 'pi_mock' } } };
  const raw = JSON.stringify(event), t = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', 'mock_secret').update(t + '.' + raw).digest('hex');
  return () => new Request('https://mock/functions/v1/client-onboarding', { method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
}

for (const live of [true, false]) {
  const drive = mockDrive(); const h = harness(drive); const req = signed(live);
  const res = await handle(req(), k => values[k], h.f);
  assert.equal(res.status, 200); assert.equal((await res.json()).intake, 'private_project_workspace');
  // (1)(2) one private per-order workspace with upload + return subfolders and a brief doc
  const folders = [...drive.files.values()].filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const ws = folders.find(f => f.parents[0] === 'parent_root');
  assert.ok(ws, 'workspace folder created under the private parent');
  assert.match(ws.name, live ? /^Agency Owner \| Agency Clip Pack \| \d{4}-\d{2}-\d{2}$/ : /^TEST - Agency Owner \| Agency Clip Pack/);
  assert.doesNotMatch(ws.name, /\[EG\]|EG Studio/, 'buyer-visible workspace name carries no EG branding');
  assert.deepEqual(folders.filter(f => f.parents[0] === ws.id).map(f => f.name), [...WORKSPACE_SUBFOLDERS]);
  for (const f of drive.files.values()) assert.equal(f.writersCanShare, false, `${f.name}: editors must not be able to re-share EG-owned items`);
  const doc = [...drive.files.values()].find(f => f.mimeType === 'application/vnd.google-apps.document');
  assert.equal(doc.parents[0], ws.id); assert.equal(doc.name, 'Start here - project brief');
  assert.ok(doc.content.includes('https://egstudio.tech/payment-confirmed.html?session_id=' + (live ? 'cs_live_mock' : 'cs_test_mock')), '(4) brief link inside the workspace');
  // (6) shared only with the buyer's email, writer, no link/domain sharing
  const p = drive.perms.get(ws.id);
  assert.deepEqual(p.filter(x => x.role !== 'owner'), [{ type: 'user', role: 'writer', emailAddress: 'agency@example.com' }]);
  assert.ok(!p.some(x => x.type === 'anyone' || x.type === 'domain'));
  // state row and Notion job
  const row = h.row();
  assert.equal(row.drive_job_folder_url, ws.webViewLink); assert.ok(row.share_locked_at); assert.equal(row.status, 'complete');
  assert.equal(h.pages.length, 1);
  assert.equal(h.pages[0].properties['Job folder'].url, ws.webViewLink);
  assert.equal(h.pages[0].properties['Start date'].date, null); assert.equal(h.pages[0].properties['Due date'].date, null);
  assert.equal(h.pages[0].properties['Clip slots'].number, 5);
  const notion = JSON.stringify(h.pages[0]);
  assert.ok(notion.includes('No AI first pass')); assert.ok(notion.includes('02 Finished clips'));
  assert.ok(notion.includes("never contact the end client")); assert.ok(notion.includes('no EG watermark'));
  assert.ok(!notion.includes('agency-owned'), 'ops checklist no longer asks for an agency-owned folder');
  // welcome email: private project link + brief + same workspace; no folder creation instructions
  assert.equal(h.emails.length, 1);
  assert.deepEqual(h.emails[0].to, [live ? 'agency@example.com' : 'ops@egstudio.tech']);
  const text = h.emails[0].text;
  assert.ok(text.includes('Your private project link:\n' + ws.webViewLink));
  assert.ok(text.includes('01 Recording and branding') && text.includes('02 Finished clips') && text.includes('same workspace'));
  assert.ok(text.includes('payment-confirmed.html?session_id='));
  assert.ok(text.includes('1 to 3 calendar days') && text.includes('We never contact your client') && text.includes('no EG Studio branding'));
  assert.doesNotMatch(text, /agency owns|edit\/upload|production folder|business days/);
  // idempotent on Stripe retry: no duplicate folders, shares, pages, or emails
  const before = drive.files.size;
  assert.equal((await handle(req(), k => values[k], h.f)).status, 200);
  assert.equal(drive.files.size, before); assert.equal(h.pages.length, 1); assert.equal(h.emails.length, 1);
  assert.equal(drive.perms.get(ws.id).filter(x => x.role === 'writer').length, 1);
}

// (6) a second customer gets a separate workspace and no access to the first
{
  const drive = mockDrive(); const h1 = harness(drive), h2 = harness(drive);
  await handle(signed(true, 'first@agency.example', 'cs_live_one')(), k => values[k], h1.f);
  await handle(signed(true, 'second@agency.example', 'cs_live_two')(), k => values[k], h2.f);
  const roots = [...drive.files.values()].filter(f => f.parents[0] === 'parent_root');
  assert.equal(roots.length, 2);
  const emailsOn = (id) => drive.perms.get(id).filter(x => x.role !== 'owner').map(x => x.emailAddress);
  assert.deepEqual(emailsOn(roots[0].id), ['first@agency.example']);
  assert.deepEqual(emailsOn(roots[1].id), ['second@agency.example']);
}

// Share rejected (e.g. not a Google account): no link sent, no public fallback, ops alerted
{
  const drive = mockDrive({ shareRejects: true }); const h = harness(drive);
  const r = await handle(signed(true)(), k => values[k], h.f);
  assert.equal((await r.json()).access_failed, true);
  assert.equal(h.row().status, 'access_failed');
  assert.deepEqual(h.emails.map(e => e.to[0]), ['ops@egstudio.tech']);
  assert.match(h.emails[0].subject, /UPLOAD_ACCESS_FAILED/);
  for (const [id, p] of drive.perms) assert.ok(!p.some(x => x.type === 'anyone'), id + ' must stay private');
}
// Inherited public permission: refuse to send the link
{
  const drive = mockDrive({ inheritedAnyone: true }); const h = harness(drive);
  const r = await handle(signed(true)(), k => values[k], h.f);
  assert.equal((await r.json()).access_failed, true);
  assert.ok(!h.emails.some(e => e.to[0] === 'agency@example.com'), 'no buyer link when the workspace is public');
}

let fetched = false;
const invalid = await handle(new Request('https://mock', { method: 'POST', body: '{}' }), k => values[k], async () => { fetched = true; throw Error('must not fetch'); });
assert.equal(invalid.status, 400); assert.equal(fetched, false);
assert.ok(welcomeEmail({ first: 'Legacy', pkg: PACKAGES.test, uploadUrl: 'https://drive.google.com/mock', lockedEmail: 'legacy@example.com' }).text.includes('3-5 business days'));
assert.ok(projectBriefDocText('https://egstudio.tech/x').includes('02 Finished clips'));
console.log('PASS: TypeScript syntax; signed live/test Agency Clip Pack orders create one private per-order Drive workspace (upload + finished-clips folders + brief doc), shared only with the buyer email as editor with re-sharing disabled and no link/domain access; welcome email carries the private project link and brief; second customer isolated; share rejection and inherited public access send no link and alert ops; duplicate suppression; invalid signatures; legacy email. All external calls mocked.');
