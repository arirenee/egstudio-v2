"""Audit every published HTML page for literal ASCII hyphens in reader visible copy.

Technical URLs, HTML attributes, CSS selectors and source filenames are intentionally
excluded: altering them would break checkout, SEO routing, or functionality.
"""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import sys

IN_SCOPE = [
    p for p in Path(".").rglob("*.html")
    if ".git" not in p.parts and "node_modules" not in p.parts and p.name != "google012d8ea661ecb758.html"
]
EXCLUDE_ELEMENTS = {"script", "style", "template"}
READABLE_ATTRS = {"alt", "aria-label", "title", "placeholder"}
COPY_META_NAMES = {"description", "og:title", "og:description", "twitter:title", "twitter:description", "og:image:alt", "twitter:image:alt"}
expected_question = "How quickly will our clips be ready?"
expected_answer = "Your full order of five clips will be delivered within 1–3 calendar days. Revisions take an additional day."
client_answer = "No. We communicate with your agency only. Finished clips contain no EG Studio watermark or branding."

def is_technical_url(s):
    return s.strip().startswith(("https://", "http://", "www.", "/", "mailto:"))

class CopyParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = []
        self.issues = []
        self.page = ""
    def check(self, kind, content):
        txt = content.strip()
        if "-" in txt and not is_technical_url(txt):
            self.issues.append({"field":kind, "excerpt":re.sub(r"\\s+", " ", txt)[:160]})
    def handle_starttag(self, tag, attrs):
        if tag in EXCLUDE_ELEMENTS:
            self.skip.append(tag)
        a = dict(attrs)
        if tag == "meta" and (a.get("name", "").lower() in COPY_META_NAMES or a.get("property", "").lower() in COPY_META_NAMES):
            self.check("meta", a.get("content", ""))
        if tag not in ("script", "style"):
            for k,v in attrs:
                if k in READABLE_ATTRS and v and not (k == "placeholder" and is_technical_url(v)):
                    self.check(k,v)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag,attrs)
        if tag in EXCLUDE_ELEMENTS:
            self.handle_endtag(tag)
    def handle_endtag(self, tag):
        if self.skip and self.skip[-1] == tag:
            self.skip.pop()
    def handle_data(self, data):
        if not self.skip:
            self.check("visible text",data)

details = []
for file in sorted(IN_SCOPE):
    data = file.read_text(encoding="utf-8")
    p = CopyParser()
    p.page = str(file)
    p.feed(data)
    details.append({"page":str(file),"issues":p.issues})
all_issues = [{"page":d["page"],**i} for d in details for i in d["issues"]]
homepage = Path("index.html").read_text(encoding="utf-8")
checks = {
  "faq questions present": expected_question in homepage,
  "approved full order delivery answer": expected_answer in homepage,
  "approved client protection answer": client_answer in homepage,
  "two floating process sentences removed": "your agency handles end-client delivery." not in homepage,
  "no unverified numeric star rating": "ratingValue" not in homepage and "5 out of 5" not in homepage,
  "five approved FAQ questions in order": [
      x.split("<span>",1)[1].split("</span>",1)[0]
      for x in __import__("re").findall(r'<button class="faq-question"[^>]*>[\\s\\S]*?</button>',homepage)
      if "<span>" in x
  ] == [
      "Will EG Studio contact my client?",
      "Do we need to select the clips ourselves?",
      "What exactly do we receive for $199?",
      "What happens after payment?",
      "How quickly will our clips be ready?",
  ],
  "removed recordings FAQ": "What recordings qualify?" not in homepage,
  "eligibility terms kept in pricing": all(x in homepage for x in (
      "up to two synchronized speakers or cameras",
      "Not included: filming, posting, full episode editing, complex custom animation, or native project files.",
  )),
  "real video poster references": all(f"{name}-thumb.jpg" in homepage for name in
      ("sample-process","sample-panel","sample-saas-founder")),
  "no overlay sample labels": "data-preview-label=" not in homepage,
}
ld_marker = '<script type="application/ld+json">'
ld_scripts = [homepage.split(ld_marker,1)[1].split('</script>',1)[0]] if ld_marker in homepage else []
if ld_scripts:
    obj=json.loads(ld_scripts[0])
    faq=next((x for x in obj.get("@graph",[]) if x.get("@type") == "FAQPage"),None)
    question_map = {x["name"]:x["acceptedAnswer"]["text"] for x in faq.get("mainEntity",[])} if faq else {}
    checks["structured FAQ matches exact delivery answer"]=question_map.get(expected_question)==expected_answer
    checks["structured FAQ matches client answer"]=question_map.get("Will EG Studio contact my client?")==client_answer
    checks["structured FAQ exactly five approved questions"]=list(question_map)==[
        "Will EG Studio contact my client?",
        "Do we need to select the clips ourselves?",
        "What exactly do we receive for $199?",
        "What happens after payment?",
        "How quickly will our clips be ready?",
    ]
else:
    checks["structured FAQ present"]=False
report={"htmlPages":len(IN_SCOPE),"totalVisibleHyphens":len(all_issues),"issues":all_issues,"copyAssertions":checks}
out=Path("qa-artifacts")
out.mkdir(exist_ok=True)
(out/"sitewide-copy-qa.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
if all_issues or not all(checks.values()):
    sys.exit(1)
