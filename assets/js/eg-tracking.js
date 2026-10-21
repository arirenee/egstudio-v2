/* EG Studio shared tracking: PostHog init (prod hosts only + internal opt-out),
 * checkout_cta_clicked capture, and UTM/client_reference_id on Stripe links.
 * Internal opt-out: visit any page with ?internal=1 (sets localStorage eg_internal=1
 * and posthog.opt_out_capturing()); ?internal=0 clears it and opts back in.
 * PostHog only initializes on egstudio.tech / www.egstudio.tech. */
(function(){
var PROD_HOSTS=['egstudio.tech','www.egstudio.tech'];
var isProd=PROD_HOSTS.indexOf(window.location.hostname)!==-1;
var q;try{q=new URLSearchParams(window.location.search);}catch(e){q={get:function(){return null;}};}
var internalParam=q.get('internal');
try{
  if(internalParam==='1')localStorage.setItem('eg_internal','1');
  else if(internalParam==='0')localStorage.removeItem('eg_internal');
}catch(e){}
var isInternal=false;try{isInternal=localStorage.getItem('eg_internal')==='1';}catch(e){}
window.EG_TRACKING={prod:isProd,internal:isInternal};
!function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="vu fu pu gu bu init Hu zu qu ju Gu Xl Bu Qu Du eh ih nh sh rh oh capture getExtension Uu cu hh calculateEventProperties uh register register_once register_for_session unregister unregister_for_session gh Nu dh getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync mh identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset yh shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty fh Xu createPersonProfile setInternalOrTestUser ph wu opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing Ju debug Yl Os getPageViewId captureTraceFeedback captureTraceMetric Ru".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
if(isProd){
  posthog.init('phc_ABQhr5obJDzxwBjYt4qZc6gGWUsBzB5jN8zFG46tjc52',{
    api_host:'https://us.i.posthog.com',
    defaults:'2026-05-30',
    person_profiles:'identified_only',
    loaded:function(ph){
      if(isInternal){ph.opt_out_capturing();}
      else if(internalParam==='0'){ph.opt_in_capturing();}
    }
  });
  if(isInternal)posthog.opt_out_capturing();
}

/* PLACEHOLDER: One Clip Proof ($49) Stripe Payment Link. NOT LIVE.
 * Replace with the real buy.stripe.com URL after Edward approves creating the link. */
var ONE_CLIP_PROOF_URL='https://buy.stripe.com/PLACEHOLDER_ONE_CLIP_PROOF';
window.EG_TRACKING.oneClipProofUrl=ONE_CLIP_PROOF_URL;
var UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
var utm={};
UTM_KEYS.forEach(function(k){var v=(q.get(k)||'').trim().slice(0,200);if(v)utm[k]=v;});
function clean(s){return (s||'').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');}
function distinctShort(){
  try{if(isProd&&window.posthog&&posthog.__loaded&&posthog.get_distinct_id)return clean(String(posthog.get_distinct_id())).slice(0,12);}catch(e){}
  return '';
}
function clientRef(){
  var src=clean(utm.utm_source),camp=clean(utm.utm_campaign);
  var parts=[src||'direct'];
  if(camp)parts.push(camp);
  var id=distinctShort();
  if(id){if(!camp)parts.push('none');parts.push(id);}
  return parts.join('__').slice(0,200);
}
function decorate(a){
  try{
    var u=new URL(a.getAttribute('href'),window.location.href);
    UTM_KEYS.forEach(function(k){if(utm[k]&&!u.searchParams.has(k))u.searchParams.set(k,utm[k]);});
    if(!a.hasAttribute('data-eg-ref-fixed')){
      if(u.searchParams.has('client_reference_id')&&!a.hasAttribute('data-eg-ref'))a.setAttribute('data-eg-ref-fixed','');
      else{u.searchParams.set('client_reference_id',clientRef());a.setAttribute('data-eg-ref','');}
    }
    a.setAttribute('href',u.toString());
  }catch(e){}
}
window.EG_TRACKING.clientRef=clientRef;
function setup(){
  document.querySelectorAll('a[data-offer="one_clip_proof"]').forEach(function(a){a.setAttribute('href',ONE_CLIP_PROOF_URL);});
  var links=document.querySelectorAll('a[href*="buy.stripe.com"]');
  links.forEach(function(a){
    decorate(a);
    var refresh=function(){decorate(a);};
    a.addEventListener('mousedown',refresh);
    a.addEventListener('touchstart',refresh,{passive:true});
    a.addEventListener('click',function(){
      decorate(a);
      if(window.posthog){
        var props={page_path:window.location.pathname,offer:a.getAttribute('data-offer')||'episode_to_shorts',placement:a.getAttribute('data-placement')||'unknown',
          utm_source:utm.utm_source||null,utm_medium:utm.utm_medium||null,utm_campaign:utm.utm_campaign||null};
        var sku=a.getAttribute('data-sku');if(sku)props.sku=sku;
        posthog.capture('checkout_cta_clicked',props);
      }
    });
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
