import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
let serve, saved=null, emails=[];
const db={from(table){const chain={select(){return chain},eq(){return chain},async maybeSingle(){return {data:table==='orders'?{id:'order_mock'}:saved?{id:'intake_mock'}:null}},insert(record){saved=record;return chain},async single(){return {data:{id:'intake_mock'}}},update(){return chain},then(resolve){resolve({data:null,error:null})}};return chain;}};
const mockFetch=async(url,init)=>{
 if(String(url).includes('api.stripe.com')) return new Response(JSON.stringify({id:'cs_live_mock',status:'complete',payment_status:'paid',metadata:{offer:'episode_to_shorts'},amount_total:19900,currency:'usd',customer_details:{email:'agency@example.com'}}));
 if(String(url)==='https://api.resend.com/emails'){emails.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'email_mock'}));}
 throw Error('Unexpected fetch');
};
const source=readFileSync('./supabase/functions/intake/index.ts','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(stripTypeScriptTypes(source,{mode:'transform'}),{Deno:{env:{get:()=> 'mock'},serve(fn){serve=fn}},createClient:()=>db,fetch:mockFetch,Request,Response,URL,Intl,console});
const base={session_id:'cs_live_mock',expected_sku:'episode',project_name:'Agency episode',source_url:'https://drive.google.com/drive/folders/mock_folder',agency_owned_folder_confirmed:true,style_reference_url:'https://example.com/style',rights_confirmed:true};
async function post(body){return serve(new Request('https://mock/functions/v1/intake',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}}));}
for(const patch of [{source_url:null},{source_url:'https://evil.example/drive/folders/mock'},{agency_owned_folder_confirmed:false},{rights_confirmed:false}]){
 assert.equal((await post({...base,...patch})).status,400);assert.equal(saved,null);
}
assert.equal((await post(base)).status,200);
assert.equal(saved.source_url,base.source_url);
assert.ok(saved.avoid_notes.includes('manual verification'));
assert.ok(saved.avoid_notes.includes('upload new copies'));
assert.ok(saved.avoid_notes.includes('never forward source_url'));
assert.equal(emails.length,1);assert.deepEqual(emails[0].to,['ops@egstudio.tech']);
assert.equal((await post(base)).status,200);assert.equal(emails.length,1);
console.log('PASS: server rejects missing folder, wrong host, missing agency attestation and rights; saves folder, acceptance gate and mandatory reupload instruction; notifies ops only; duplicate intake does not resend. All services mocked.');
