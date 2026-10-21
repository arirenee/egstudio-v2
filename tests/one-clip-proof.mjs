import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handle } from '../supabase/functions/client-onboarding/handler.ts';
import { PACKAGES, welcomeEmail, identifyPackage } from '../supabase/functions/client-onboarding/lib.ts';

const pkg = identifyPackage({ metadata: { offer: 'one_clip_proof' } });
assert.equal(pkg, PACKAGES.proof); assert.equal(pkg.key, 'episode'); assert.equal(pkg.clips, 1); assert.equal(pkg.amount, 4900);
assert.equal(identifyPackage({ metadata: { offer: 'episode_to_shorts' } }).clips, 5);
const m = welcomeEmail({ first: 'Ana', pkg, uploadUrl: 'https://egstudio.tech/payment-confirmed.html?session_id=x', lockedEmail: 'a@b.c' });
assert.match(m.text, /One Clip Proof/); assert.match(m.text, /white label and ready to post/); assert.doesNotMatch(m.text, /five/i);
for (const f of ['intake','stripe-order-webhook','stripe-order-scan']) {
  const s = readFileSync('./supabase/functions/'+f+'/index.ts','utf8');
  assert.match(s, /one_clip_proof: \{ sku: "episode", amount: 4900/); assert.match(s, /amount_discount/);
}
const values={STRIPE_ONBOARDING_WEBHOOK_SECRET:'mock_secret',SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock',GOOGLE_CLIENT_ID:'mock',GOOGLE_CLIENT_SECRET:'mock',GOOGLE_REFRESH_TOKEN:'mock',GOOGLE_DRIVE_PARENT_FOLDER_ID:'mock',NOTION_TOKEN:'mock',NOTION_JOBS_DATABASE_ID:'mock',RESEND_API_KEY:'mock',INTAKE_FROM_EMAIL:'EG <ops@egstudio.tech>'};
let row=null;const pages=[],emails=[];
const f=async(url,init={})=>{url=String(url);const data=init.body?JSON.parse(init.body):null;const r=(o)=>new Response(JSON.stringify(o),{status:200});
  if(url.includes('/rest/v1/client_onboarding_jobs')){if(init.method==='POST'){row??={...data};return r([]);}if(init.method==='PATCH'){Object.assign(row,data);return r(init.headers?.Prefer==='return=representation'?[row]:[]);}return r(row?[row]:[]);}
  if(url.includes('/databases/')&&url.endsWith('/query'))return r({results:[]});
  if(url==='https://api.notion.com/v1/pages'){pages.push(data);return r({id:'p',url:'https://notion.so/p'});}
  if(url==='https://api.resend.com/emails'){emails.push(data);return r({id:'e'});}
  throw Error('Unexpected '+url);};
const event={id:'evt',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:'cs_live_p',object:'checkout.session',payment_status:'paid',livemode:true,amount_total:4900,currency:'usd',metadata:{offer:'one_clip_proof'},customer_details:{email:'agency@example.com',name:'Ana'},payment_intent:'pi'}}};
const raw=JSON.stringify(event),t=String(Math.floor(Date.now()/1000));const sig=createHmac('sha256','mock_secret').update(t+'.'+raw).digest('hex');
const res=await handle(new Request('https://x/f',{method:'POST',body:raw,headers:{'stripe-signature':`t=${t},v1=${sig}`}}),(k)=>values[k],f);
const body=await res.json(); assert.equal(body.ok,true,JSON.stringify(body));
assert.equal(row.package,'episode'); assert.equal(pages[0].properties['Clip slots'].number,1); assert.equal(pages[0].properties.Package.select.name,'One Clip Proof');
assert.equal(pages[0].properties['Due date'].date,null); assert.match(emails[0].text,/One Clip Proof/);
console.log('PASS: one_clip_proof maps to 1 clip episode flow, Notion 1 slot, null due until acceptance, proof welcome email, discount aware amount checks.');
