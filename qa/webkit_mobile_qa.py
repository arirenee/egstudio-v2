"""iPhone-like WebKit verification for the unmerged EG Studio homepage.
Playwright WebKit on Linux approximates Safari layout behavior; it is not a real iPhone.
"""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

BASE="http://127.0.0.1:4173/"
CHECKOUT="https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f"
OUT=Path("qa-artifacts")
OUT.mkdir(exist_ok=True)
checks=[]

def record(ok,name,details=None):
    item={"passed":bool(ok),"check":name}
    if details is not None:item["details"]=details
    checks.append(item)

def route_analytics(r):
    url=r.request.url
    if url.startswith(BASE) or url.startswith("https://fonts.googleapis.com/") or url.startswith("https://fonts.gstatic.com/"):
        r.continue_()
    else:
        r.abort()

with sync_playwright() as p:
    browser=p.webkit.launch(headless=True)
    for width in (320,390):
        for scheme in ("light","dark"):
            ctx=browser.new_context(viewport={"width":width,"height":844},
                                    is_mobile=True,has_touch=True,color_scheme=scheme,
                                    device_scale_factor=1,reduced_motion="reduce")
            ctx.route("**/*",route_analytics)
            page=ctx.new_page()
            page.goto(BASE,wait_until="domcontentloaded",timeout=30000)
            page.wait_for_selector(".eg-visual-hero .eg-hero-sample",timeout=15000)
            page.evaluate("() => document.fonts.ready")
            page.wait_for_function("() => [...document.querySelectorAll('.rd-play img')].every(i => i.complete && i.naturalWidth > 0)",timeout=15000)
            page.screenshot(path=str(OUT/f"webkit-iphone-{width}-{scheme}.png"),full_page=True,animations="disabled")
            metrics=page.evaluate("""() => {
              const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
                  return {left:r.left,right:r.right,width:r.width,height:r.height,display:getComputedStyle(e).display};};
              return {scrollWidth:document.documentElement.scrollWidth,viewport:window.innerWidth,
                  nav:rect(".eg-mobile-checkout"),h1:rect(".eg-visual-hero h1"),
                  cta:rect(".eg-hero-copy .rd-actions .rd-btn"),video:rect(".eg-hero-sample video"),
                  allLinks:[...document.querySelectorAll('a[href^="https://buy.stripe.com/"]')].map(e=>e.href)};
            }""")
            label=f"WebKit iPhone-like {width}px/{scheme}"
            record(metrics["scrollWidth"]<=width+2, f"No horizontal overflow: {label}",metrics["scrollWidth"])
            for selector in ("nav","h1","cta","video"):
                r=metrics[selector]
                record(bool(r and r["width"]>0 and r["height"]>0 and r["left"]>=-2 and r["right"]<=width+2),
                       f"Visible {selector}: {label}",r)
            record(metrics["nav"]["height"]>=44,f"Tappable header CTA: {label}",metrics["nav"])
            base=urlsplit(CHECKOUT)
            dest=[urlsplit(href) for href in metrics["allLinks"]]
            record(len(dest)>=4 and all((x.scheme,x.netloc,x.path)==(base.scheme,base.netloc,base.path) for x in dest),
                   f"Stripe product URL preserved: {label}",metrics["allLinks"])
            if width==390 and scheme=="light":
                page.evaluate("""() => {
                    window.__played=[];
                    document.querySelectorAll("video.rd-player").forEach((v,i)=>
                        v.addEventListener("playing",()=>window.__played.push(i)));
                }""")
                for i in range(3):
                    video=page.locator("video.rd-player").nth(i)
                    button=video.locator("xpath=following-sibling::button[contains(@class,'rd-play')]")
                    try:
                        button.scroll_into_view_if_needed(timeout=8000)
                        button.click(timeout=8000)
                        page.wait_for_function("(i)=>window.__played.includes(i)",arg=i,timeout=12000)
                        played=True
                    except Exception as ex:
                        played=False
                        info={"error":str(ex)[:160],"videoState":video.evaluate("(v)=>({paused:v.paused,readyState:v.readyState,error:v.error?.message})")}
                    else:
                        info=video.evaluate("(v)=>({paused:v.paused,readyState:v.readyState,error:v.error?.message})")
                    record(played,f"WebKit video playback sample {i+1}",info)
            ctx.close()
    browser.close()
(OUT/"webkit-summary.json").write_text(json.dumps({"total":len(checks),"failed":sum(not c["passed"] for c in checks),"checks":checks},indent=2),encoding="utf-8")
print(json.dumps({"total":len(checks),"failed":sum(not c["passed"] for c in checks),"failedChecks":[c for c in checks if not c["passed"]]},indent=2))
assert all(c["passed"] for c in checks), "WebKit QA failed"
