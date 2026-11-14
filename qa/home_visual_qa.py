"""Browser QA for the approved EG Studio draft-PR homepage.
No deployment, checkout submission, or live analytics events.
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE = "http://127.0.0.1:4173/"
CHECKOUT = "https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f"
OUT = Path("qa-artifacts")
OUT.mkdir(exist_ok=True)
results = []
failures = []
video_results = []

def check(condition, description, info=None):
    record = {"check": description, "passed": bool(condition)}
    if info is not None:
        record["info"] = info
    results.append(record)
    if not condition:
        failures.append(record)

def block_external(route):
    url = route.request.url
    if url.startswith(BASE) or url.startswith("http://127.0.0.1:4173/"):
        route.continue_()
    elif url.startswith("https://fonts.googleapis.com/") or url.startswith("https://fonts.gstatic.com/"):
        route.continue_()
    else:
        route.abort()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    for mode in ("light", "dark"):
        for width in (320, 390, 768, 1440):
            context = browser.new_context(
                viewport={"width": width, "height": 900},
                device_scale_factor=1,
                color_scheme=mode,
                reduced_motion="reduce",
                is_mobile=width < 768,
                has_touch=width < 768,
            )
            context.route("**/*", block_external)
            page = context.new_page()
            page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector("article.eg-hero-sample .rd-player", timeout=12000)
            try:
                page.evaluate("() => document.fonts.ready")
            except Exception:
                pass
            page.screenshot(path=str(OUT / f"homepage-{width}-{mode}.png"), full_page=True, animations="disabled")
            page.locator(".eg-visual-hero").screenshot(path=str(OUT / f"hero-{width}-{mode}.png"), animations="disabled")

            geometry = page.evaluate("""() => {
                const box = sel => { const e=document.querySelector(sel);if (!e) return null;
                    const r=e.getBoundingClientRect(), s=getComputedStyle(e);
                    return {x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,display:s.display,visibility:s.visibility};
                };
                return {
                    viewport: window.innerWidth, documentWidth:document.documentElement.scrollWidth,
                    bodyWidth:document.body.scrollWidth,
                    header:box(".rd-header"), headline:box(".eg-visual-hero h1"),
                    heroCta:box(".eg-hero-copy .rd-actions a.btn-primary"),
                    mobileCta:box(".eg-mobile-checkout"), desktopCta:box(".rd-nav-cta"),
                    video:box(".eg-hero-sample .rd-player"),
                    heroMedia:box(".eg-hero-media")
                };
            }""")
            key = f"{width}px/{mode}"
            check(geometry["documentWidth"] <= width + 2, f"No horizontal page overflow — {key}", geometry["documentWidth"])
            for target in ("headline", "heroCta", "video"):
                b = geometry[target]
                valid = b is not None and b["width"] > 0 and b["height"] > 0 and b["left"] >= -2 and b["right"] <= width + 2
                check(valid, f"{target} is visible and inside viewport — {key}", b)
            if width < 768:
                m=geometry["mobileCta"]
                check(m and m["display"] != "none" and m["height"]>=44 and m["right"]<=width+2,
                      f"Mobile header purchase action is tappable — {key}",m)
                check(geometry["desktopCta"]["display"]=="none",f"Desktop purchase action hidden on phone — {key}")
            else:
                d=geometry["desktopCta"]
                check(d and d["display"]!="none" and d["height"]>=40,
                      f"Desktop header purchase action is visible — {key}",d)
                check(geometry["mobileCta"]["display"]=="none",
                      f"Mobile purchase action hidden on desktop — {key}")

            # Direct CTA path: safe click interception prevents external checkout navigation.
            all_checkout=page.locator('a[href^="https://buy.stripe.com/"]')
            hrefs=all_checkout.evaluate_all("(els)=>els.map(el=>el.href)")
            # Production tracking adds client_reference_id (and may add UTMs).
            # Verify the exact Stripe product destination, not the dynamic query string.
            expected=urlsplit(CHECKOUT)
            destinations=[urlsplit(x) for x in hrefs]
            same_product=lambda x: (x.scheme,x.netloc,x.path)==(expected.scheme,expected.netloc,expected.path)
            check(len(hrefs)>=4 and all(same_product(x) for x in destinations),
                  f"Every checkout link targets the approved Stripe product — {key}",hrefs)
            if mode=="light":
                selector=".eg-mobile-checkout" if width<768 else ".rd-nav-cta"
                page.evaluate("""(selector) => {
                   window.__ctaClicked=false;
                   document.querySelector(selector).addEventListener("click", e => {
                       window.__ctaClicked=true; e.preventDefault(); e.stopImmediatePropagation();
                   }, {capture:true,once:true});
                }""",selector)
                page.locator(selector).click()
                check(page.evaluate("window.__ctaClicked===true"),f"Header CTA responds to click without checkout navigation — {key}")
                check(page.url==BASE,f"QA click never navigates to checkout — {key}")
            if width>=768:
                a,b=geometry["headline"],geometry["heroMedia"]
                # On tablet and desktop, the hero is a split composition.
                overlap = a and b and a["right"]>b["left"]+2 and a["left"]<b["right"]-2 and a["bottom"]>b["top"]+2 and a["top"]<b["bottom"]-2
                check(not overlap,f"Hero text and media do not overlap — {key}",{"headline":a,"heroMedia":b})

            # Run real media player tests once in each main form-factor.
            if mode=="light" and width in (390,1440):
                page.evaluate("""() => {
                    window.__videoQALog=[];
                    document.querySelectorAll("video.rd-player").forEach((v,i)=>{
                        v.addEventListener("playing",()=>window.__videoQALog.push(i));
                    });
                }""")
                videos=page.locator("video.rd-player")
                check(videos.count()==3,f"Exactly 3 sample video players — {key}",videos.count())
                for i in range(min(videos.count(),3)):
                    player=videos.nth(i)
                    button=player.locator("xpath=following-sibling::button[contains(@class,'rd-play')]")
                    label=player.get_attribute("aria-label")
                    status={"viewport":width,"video":label,"index":i}
                    try:
                        button.scroll_into_view_if_needed(timeout=8000)
                        button.click(timeout=8000)
                        page.wait_for_function("(i)=>window.__videoQALog.includes(i)",arg=i,timeout=14000)
                        status["played"]=True
                    except Exception as exc:
                        status["played"]=False
                        status["error"]=str(exc)[:280]
                    status["playbackState"]=player.evaluate("""(v)=>({readyState:v.readyState,currentTime:v.currentTime,
                        duration:v.duration,paused:v.paused,error:v.error&&v.error.message})""")
                    video_results.append(status)
                    check(status["played"],f"Actual video playback: {label} — {key}",status)
            context.close()
    browser.close()

summary={"result":"PASS" if not failures else "FAIL","totalChecks":len(results),"failedChecks":len(failures),
        "failures":failures,"videoPlayback":video_results,"checks":results}
(OUT/"qa-summary.json").write_text(json.dumps(summary,indent=2),encoding="utf8")
print(json.dumps({"result":summary["result"],"total":len(results),"failed":len(failures),
                  "failures":failures,"videoPlayback":video_results},indent=2))
sys.exit(1 if failures else 0)
