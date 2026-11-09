import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
let serve, saved=null, emails=[], job=null;
const db={from(table){const chain={select(){return chain},eq(){return chain},async maybeSingle(){
  if(table==='orders') return {data:{id:'order_mock'}};
  if(table==='client_onboarding_jobs') return {data:job};
  return {data:saved?{id:'intake_mock'}:null};
},insert(record){saved=record;return chain},async single(){return {data:{id:'intake_mock'}}},update(){return chain},then(resolve){resolve({data:null,error:null})}};return chain;}};
const mockFetch=async(url,init)=>{
 if(String(url).includes('api.stripe.com')) return new Response(JSON.stringify({id:'cs_live_mock',status:'complete',payment_status:'paid',metadata:{offer:'episode_to_shorts'},amount_total:19900,currency:'usd',customer_details:{email:'Agency@Example.com'}}));
 if(String(url)==='https://api.resend.com/emails'){emails.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'email_mock'}));}
 throw Error('Unexpected fetch');
};
const source=readFileSync('./supabase/functions/intake/index.ts','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(stripTypeScriptTypes(source,{mode:'transform'}),{Deno:{env:{get:()=> 'mock'},serve(fn){serve=fn}},createClient:()=>db,fetch:mockFetch,Request,Response,URL,Intl,console});
const get=async()=>(await serve(new Request('https://mock/functions/v1/intake?session_id=cs_live_mock'))).json();
// GET: private project link only once the workspace share is confirmed, and only a Drive URL
let g=await get(); assert.equal(g.paid,true); assert.equal(g.sku,'episode'); assert.equal(g.project_url,null); assert.equal(g.project_email,'agency@example.com');
job={drive_job_folder_url:'https://drive.google.com/drive/folders/ws1',share_locked_at:null};
assert.equal((await get()).project_url,null,'unshared workspace link is not shown');
job={drive_job_folder_url:'https://evil.example/ws',share_locked_at:'2026-11-09T00:00:00Z'};
assert.equal((await get()).project_url,null,'non-Drive URLs are never shown');
job={drive_job_folder_url:'https://drive.google.com/drive/folders/ws1',share_locked_at:'2026-11-09T00:00:00Z'};
assert.equal((await get()).project_url,'https://drive.google.com/drive/folders/ws1');
// POST: brief no longer requires an agency-owned folder; rights confirmation still required
const base={session_id:'cs_live_mock',expected_sku:'episode',project_name:'Agency episode',rights_confirmed:true};
async function post(body){return serve(new Request('https://mock/functions/v1/intake',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}}));}
for(const patch of [{rights_confirmed:false},{source_url:'http://insecure.example/x'},{brand_assets_url:'javascript:alert(1)'}]){
 assert.equal((await post({...base,...patch})).status,400);assert.equal(saved,null);
}
assert.equal((await post(base)).status,200);
assert.equal(saved.source_url,null);
assert.ok(saved.avoid_notes.includes('PRIVATE PROJECT WORKSPACE'));
assert.ok(saved.avoid_notes.includes('01 Recording and branding') && saved.avoid_notes.includes('02 Finished clips'));
assert.ok(saved.avoid_notes.includes('1 to 3 calendar days'));
assert.ok(saved.avoid_notes.includes('Zero end-client contact'));
assert.doesNotMatch(saved.avoid_notes,/agency-owned|edit\/upload/);
saved=null;
assert.equal((await post({...base,brand_assets_url:'https://example.com/brand',avoid_notes:'No sensitive client names'})).status,200);
assert.equal(saved.brand_assets_url,'https://example.com/brand');
assert.ok(saved.avoid_notes.includes('No sensitive client names'));
saved=null;
assert.equal((await post({...base,project_name:'',style_reference_url:null})).status,200);
assert.equal(saved.project_name,'Agency episode');
assert.equal(saved.style_reference_url,'https://egstudio.tech/#samples');
assert.equal(emails.length,3);assert.deepEqual(emails[0].to,['ops@egstudio.tech']);
assert.ok(emails[0].html.includes('01 Recording and branding'));
assert.equal((await post(base)).status,200);assert.equal(emails.length,3);
console.log('PASS: intake returns the private project link only after the per-order Drive workspace is shared, and only as a Drive URL; brief accepts no folder link, still requires rights confirmation, rejects insecure links, notifies ops only, and does not resend duplicate intake. All services mocked.');
