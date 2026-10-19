import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac } from 'node:crypto';
import { handle } from '../supabase/functions/client-onboarding/handler.ts';
import { PACKAGES, welcomeEmail } from '../supabase/functions/client-onboarding/lib.ts';

for (const path of ['client-onboarding/handler.ts','client-onboarding/lib.ts','intake/index.ts']) {
  stripTypeScriptTypes(readFileSync('./supabase/functions/'+path,'utf8'),{mode:'transform'});
}
const values={STRIPE_ONBOARDING_WEBHOOK_SECRET:'mock_secret',SUPABASE_URL:'https://mock.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock',GOOGLE_CLIENT_ID:'mock',GOOGLE_CLIENT_SECRET:'mock',GOOGLE_REFRESH_TOKEN:'mock',GOOGLE_DRIVE_PARENT_FOLDER_ID:'mock',NOTION_TOKEN:'mock',NOTION_JOBS_DATABASE_ID:'mock',RESEND_API_KEY:'mock'};
for (const live of [true,false]) {
  let row=null;const calls=[],pages=[],emails=[];
  const f=async(url,init={})=>{
    url=String(url);calls.push(url);
    const data=init.body?JSON.parse(init.body):null;
    const result=(obj)=>new Response(JSON.stringify(obj),{status:200});
    if(url.includes('/rest/v1/client_onboarding_jobs')) {
      if(init.method==='POST'){row??={...data};return result([]);}
      if(init.method==='PATCH'){Object.assign(row,data);return result(init.headers.Prefer==='return=representation'?[row]:[]);}
      return result(row?[row]:[]);
    }
    if(url.includes('/databases/')&&url.endsWith('/query'))return result({results:[]});
    if(url==='https://api.notion.com/v1/pages'){pages.push(data);return result({id:'mock_page',url:'https://notion.so/mock'});}
    if(url==='https://api.resend.com/emails'){emails.push(data);return result({id:'mock_email'});}
    throw Error('Unexpected external call '+url);
  };
  const event={id:'evt_mock',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:live?'cs_live_mock':'cs_test_mock',object:'checkout.session',payment_status:'paid',livemode:live,metadata:{offer:'episode_to_shorts'},customer_details:{email:'agency@example.com',name:'Agency Owner'},payment_intent:'pi_mock'}}};
  const raw=JSON.stringify(event), t=String(Math.floor(Date.now()/1000));
  const sig=createHmac('sha256','mock_secret').update(t+'.'+raw).digest('hex');
  const req=()=>new Request('https://mock/functions/v1/client-onboarding',{method:'POST',body:raw,headers:{'stripe-signature':`t=${t},v1=${sig}`}});
  assert.equal((await handle(req(),k=>values[k],f)).status,200);
  assert.equal(pages.length,1);assert.equal(emails.length,1);
  assert.equal(pages[0].properties['Due date'].date,null);
  assert.equal(pages[0].properties['Start date'].date,null);
  assert.equal(pages[0].properties['Job folder'].url,null);
  assert.equal(pages[0].properties['Clip slots'].number,5);
  assert.ok(JSON.stringify(pages[0]).includes('No AI first pass'));
  assert.equal(calls.filter(u=>/googleapis|oauth2/.test(u)).length,0);
  assert.deepEqual(emails[0].to,[live?'agency@example.com':'ops@egstudio.tech']);
  assert.ok(emails[0].text.includes('1–3 business days'));
  assert.ok(emails[0].text.includes('zero contact with the end client'));
  assert.ok(!emails[0].text.includes('/drive/folders/'));
  assert.equal((await handle(req(),k=>values[k],f)).status,200);
  assert.equal(pages.length,1);assert.equal(emails.length,1);
}
let fetched=false;
const invalid=await handle(new Request('https://mock',{method:'POST',body:'{}'}),k=>values[k],async()=>{fetched=true;throw Error('must not fetch');});
assert.equal(invalid.status,400);assert.equal(fetched,false);
assert.ok(welcomeEmail({first:'Legacy',pkg:PACKAGES.test,uploadUrl:'https://drive.google.com/mock',lockedEmail:'legacy@example.com'}).text.includes('3-5 business days'));
console.log('PASS: TypeScript syntax; signed live/test agency flows; no vendor Drive calls; null due date until acceptance; five slots; agency-only transactional recipient; duplicate suppression; invalid signatures; legacy email. All external calls mocked.');
