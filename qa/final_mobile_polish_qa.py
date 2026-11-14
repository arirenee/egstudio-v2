"""Final proof and layout checks for the approved EG Studio refinement.

Reuses the production HTML and real poster assets. Does not modify accounts or checkout.
WebKit on Linux simulates iPhone Safari but is not a physical-device test.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE="http://127.0.0.1:4173/"
OUT=Path("qa-artifacts")
OUT.mkdir(exist_ok=True)
results=[]
QUESTIONS=[
  "Will EG Studio contact my client?",
  "Do we need to select the clips ourselves?",
  "What exactly do we receive for $199?",
  "What happens after payment?",
  "How quickly will our clips be ready?",
]

def record(ok,label,details=None):
    results.append({"passed":bool(ok),"name":label,"details":details})

def block_other(route):
    u=route.request.url
    if u.startswith(BASE) or u.startswith("https://fonts.googleapis.com/") or u.startswith("https://fonts.gstatic.com/"):
        route.continue_()
    else:
        route.abort()

with sync_playwright() as p:
    for engine in ("chromium","webkit"):
        browser=getattr(p,engine).launch(headless=True)
        widths=(320,390,768,1440) if engine=="chromium" else (320,390)
        for width in widths:
            for scheme in ("light","dark"):
                ctx=browser.new_context(viewport={"width":width,"height":850},
                    is_mobile=width<768,has_touch=width<768,
                    color_scheme=scheme,reduced_motion="reduce",device_scale_factor=1)
                ctx.route("**/*",block_other)
                page=ctx.new_page()
                page.goto(BASE,wait_until="domcontentloaded",timeout=25000)
                page.wait_for_function("""() => [...document.querySelectorAll('.rd-play img')].length===3 &&
                    [...document.querySelectorAll('.rd-play img')].every(i=>i.complete && i.naturalWidth>0)""",timeout=16000)
                page.evaluate("() => document.fonts.ready")
                key=f"{engine} {width}px {scheme}"
                audit=page.evaluate("""() => {
                    const rect = el => {if(!el)return null; const r=el.getBoundingClientRect();
                      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
                    const hero=document.querySelector('.eg-visual-hero');
                    const h=document.querySelector('.eg-visual-hero h1');
                    const span=document.querySelector('.eg-visual-hero .eg-emphasis');
                    const price=document.querySelector('.eg-visual-hero .premium-hero-price');
                    const cta=document.querySelector('.eg-visual-hero .rd-actions .btn-primary');
                    const pseudo=getComputedStyle(hero,'::before');
                    const sample=document.querySelectorAll('.rd-play img');
                    const scores=[...sample].map(img=>{
                      const c=document.createElement('canvas'); c.width=60;c.height=106;
                      const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0,c.width,c.height);
                      const pix=x.getImageData(0,0,c.width,c.height).data;
                      let total=0,bright=0,count=0;
                      for(let i=0;i<pix.length;i+=4){
                        const v=.2126*pix[i]+.7152*pix[i+1]+.0722*pix[i+2];
                        total+=v; if(v>50)bright++;count++;
                      }
                      return {source:img.src,mean:Math.round(total/count),litFraction:Math.round(bright/count*100)/100,
                        width:img.naturalWidth,height:img.naturalHeight};
                    });
                    return {
                      viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
                      hero:rect(hero),headline:rect(h),price:rect(price),cta:rect(cta),
                      hColor:getComputedStyle(h).color,emphasisColor:getComputedStyle(span).color,
                      priceColor:getComputedStyle(price).color,
                      pseudoDisplay:pseudo.display,pseudoContent:pseudo.content,
                      questions:[...document.querySelectorAll('.eg-buyers-faq .faq-question span:first-child')].map(x=>x.textContent.trim()),
                      posterScores:scores,labels:[...document.querySelectorAll('[data-preview-label]')].length,
                      excludes:document.querySelector('#pricing')?.innerText.includes('Not included: filming, posting, full episode editing')
                    };
                }""")
                record(audit["scrollWidth"]<=width+2,f"No horizontal overflow: {key}",audit["scrollWidth"])
                record(audit["questions"]==QUESTIONS,f"Five FAQ questions in approved order: {key}",audit["questions"])
                record(audit["excludes"],f"Eligibility and exclusions remain in pricing: {key}")
                record(audit["labels"]==0,f"No duplicate overlaid video labels: {key}")
                # WebKit may return a zero-filled canvas for an offscreen image even after
                # the image loads; its screenshot verifies the actual rendering instead.
                # Pixel luminance is evaluated in Chromium, dimensions in both engines.
                poster_files=all(x["width"]>=720 and x["height"]>=1280 and "-thumb.jpg" in x["source"]
                                 for x in audit["posterScores"])
                visible_color=all(x["mean"]>45 and x["litFraction"]>=.35 for x in audit["posterScores"])
                record(len(audit["posterScores"])==3 and poster_files and
                       (engine=="webkit" or visible_color),
                       f"Real video posters, image dimensions and Chromium visual color: {key}",
                       audit["posterScores"])
                if width<768:
                    hero,headline,price,cta=(audit[k] for k in ("hero","headline","price","cta"))
                    record(all(v is not None for v in (hero,headline,price,cta)) and
                           headline["left"]>=-1 and headline["right"]<=width+2 and
                           hero["top"]<=price["top"] and price["bottom"]<=hero["bottom"]+1 and
                           hero["top"]<=cta["top"] and cta["bottom"]<=hero["bottom"]+1,
                           f"Headline price and purchase button remain inside the mobile hero: {key}",audit)
                    record(audit["hColor"]=="rgb(255, 255, 255)" and
                           audit["emphasisColor"]=="rgb(255, 255, 255)" and
                           audit["priceColor"]=="rgb(255, 255, 255)",
                           f"Mobile hero uses readable white headline and price: {key}",
                           {k:audit[k] for k in ("hColor","emphasisColor","priceColor")})
                    record(audit["pseudoDisplay"]=="none" or audit["pseudoContent"]=="none",
                           f"Mobile hero decorative curve removed: {key}",
                           {"display":audit["pseudoDisplay"],"content":audit["pseudoContent"]})
                if width==390:
                    page.locator(".eg-visual-hero").screenshot(path=str(OUT/f"final-hero-{engine}-{scheme}.png"),animations="disabled")
                    page.locator("#work").screenshot(path=str(OUT/f"final-samples-{engine}-{scheme}.png"),animations="disabled")
                    page.locator("#faq").screenshot(path=str(OUT/f"final-faq-{engine}-{scheme}.png"),animations="disabled")
                ctx.close()
        browser.close()
report={"total":len(results),"passed":sum(x["passed"] for x in results),
        "failed":sum(not x["passed"] for x in results),
        "failures":[x for x in results if not x["passed"]]}
(OUT/"final-polish-qa.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
if report["failed"]:
    raise SystemExit(1)
