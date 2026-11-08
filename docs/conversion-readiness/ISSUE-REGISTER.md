# EG Studio conversion-readiness issue register

Date: Saturday, November 7, 2026, America/Los_Angeles
Implementer: EG Studio Builder
Repository: https://github.com/arirenee/egstudio-v2
Branch: fix/conversion-readiness-20261107 (based on origin/main `b1cd478`)
Production site inspected: https://egstudio.tech (byte-identical to origin/main before these edits)
Summary: `docs/conversion-readiness/REVIEW-SUMMARY.md`
Brief: /workspace/eg-final-build/edward-final-implementation-brief.txt
Original audit: https://cursor.com/canvas/store-da65897e-20d9-4cf3-a503-72bd41655ada/75d5c23f-74fd-4b1e-9b4e-d89a73464883
Public audit page fetch on this pass returned a load-error shell; the canvas source above was read in full and used as the issue register.
Independent QA recheck of the hidden-attribute fix: **PASS** (styled preview at `http://127.0.0.1:8878/` from `/workspace/qa-copy2/egstudio-v2`; see `recheck-*` evidence). A later verified defect, paid-Sprint analytics throws overwriting verification, is fixed in this branch and has not yet been visually rechecked.
Production deployment status: unchanged until someone merges to `main`. A feature-branch push or pull request does not publish GitHub Pages. Do not merge or deploy without Edward's explicit approval.

Owner approval used for this pass only: GitHub CLI on a new branch, with the diff and evidence shown before any PR. No merge, deploy, live payment, secret, or customer-record changes were made.

Statuses used: FIXED, VERIFIED ACCEPTABLE, NEEDS APPROVAL, BLOCKED.

---

## Files changed (working tree, not pushed)

| File | Change |
| --- | --- |
| `index.html` | Confidentiality note under the testimonial heading; short identity line and refund link after the quotes; FAQ and "Your agency provides" folder wording aligned to review-the-recording plus deliver-files; revision scope on the offer card and FAQ/JSON-LD; unused mobile-drawer JS removed. The hero note was not changed. |
| `white-label-podcast-clips/index.html` | Matching revision-scope line |
| `thanks.html` | Verification-first defaults; scoped `[hidden] { display: none !important; }` for Sprint details; analytics `posthog.capture` / `pintrk` errors isolated so they cannot overwrite a verified payment |
| `AGENTS.md` | Documents the current $199 Agency Clip Pack and labels $300 / $1,500 as historical |
| `supabase/functions/client-onboarding/lib.ts` | Comments only; package keys and folder-name `name` fields unchanged |
| `supabase/functions/stripe-order-webhook/index.ts` | Customer-facing email label `Episode-to-Shorts` → `Agency Clip Pack` (key unchanged) |
| `supabase/functions/stripe-order-scan/index.ts` | Same label correction |
| `tests/premium-site.mjs` | Assertions for the new notes, revision line, and thanks.html defaults |
| `tests/thanks-runtime.mjs` | Mocked runtime checks for missing/invalid/unpaid/wrong-sku/paid-sprint sessions, analytics throws, backend failures, and the author-stylesheet `[hidden]` cascade |

No shared CSS files, checkout URL, price, sample assets, sitemap, legal-page URLs, GitHub settings, secrets, webhooks, or live Stripe configuration were changed. The only new CSS is the page-scoped `[hidden]` rule inside `thanks.html`.

---

## Tests

Runtime and static checks on this branch **PASS**. These are not a styled browser preview.

| Check | Result |
| --- | --- |
| `node tests/premium-site.mjs` | PASS, exit 0 |
| `node tests/agency-intake.mjs` | PASS, exit 0 (mocked; no external side effects) |
| `node --experimental-transform-types tests/agency-onboarding.mjs` | PASS, exit 0 (mocked) |
| `node tests/thanks-runtime.mjs` | PASS, exit 0 (mocked fetch; missing/invalid/unpaid/wrong-sku/paid-sprint; analytics throws do not overwrite verification; backend down/500 stay unverified; author cascade hides `[hidden]` Sprint details) |
| Parent-reported Health | 11/11 PASS |
| Independent QA hidden regression (`recheck-playwright-results.json`) | PASS for no-session, invalid-session, and fake-session |

Raw logs: `/workspace/eg-final-impl/test-logs/all-tests.log` and `agency-onboarding.log`.

A box-local HTTP 200 from the preview server is not proof that Chrome rendered the branch.

---

## Original findings

### P1. Anonymous agency testimonials
Source: https://egstudio.tech/#testimonials and `index.html` quote grid.
Original recommendation: delete the three quotes.
Owner correction: the quotes are genuine and must stay verbatim; add a short confidentiality note; do not invent names or companies.

Status: **FIXED**

Evidence:
- All three original quotations remain byte-for-byte:
  - "We scaled content delivery without expanding our internal team."
  - "Our clients receive consistent deliverables while our team stays focused on growth."
  - "EG Studio gave us additional production capacity without the overhead of new hires."
- Attributions unchanged: Founder / Healthcare Marketing Agency; Managing Director / B2B Content Agency; Owner / Local Advertising Agency.
- Added under the heading: "Names and company identities are withheld at the agencies' request to protect confidentiality."
- After the quotes, a short factual note plus refund link: "EG Studio provides white label video editing for agencies. Review the refund policy." The earlier ~80-word folder/confidentiality essay was removed because those facts are already covered in FAQ, how-it-works, payment-confirmed, and the footer.
- `tests/premium-site.mjs` asserts the original quotes, the confidentiality sentence, the factual identity line, and a refund policy link.
- Visual hierarchy, readability, and mobile presentation are **BLOCKED**. Parent Chrome could not load the local preview. The file-fallback mobile capture was unstyled (CSS and assets failed to load) and is not a visual pass.

### P1. Business credibility and folder-access trust
Source: homepage footer; `#why-eg`; `#pricing`; FAQ; `payment-confirmed.html`.

Status: **FIXED** (copy only; no invented legal entity, staff, qualifications, or personal name)

Evidence of added or strengthened factual explanations:
- What EG Studio does: the unsupported phrase "independent editing studio in Los Angeles" was removed. The concise note now uses the factual line requested after review, written without a hyphen to match existing site copy: "EG Studio provides white label video editing for agencies." That restates the live title/H1 ("White Label Short Form Video Editing for Agencies") and footer ("White label short form post production for agencies.") without adding an unapproved identity or repeating the footer location.
- What happens after payment: already covered by the existing FAQ and how-it-works section; the extra hero sentence was removed as repetitive and incomplete.
- Why folder access is requested: FAQ and "Your agency provides" now match the documented ingest workflow in `payment-confirmed.html` and the live `intake` function: the agency places the recording in a folder it owns and shares that folder with edit and upload access so EG Studio can review the recording and deliver finished files there. The invented "only to deliver" wording was removed.
- Ownership and control: existing "agency owned folder" / "You control delivery" copy retained.
- Why end clients should stay out: left in the existing client-relationship FAQ rather than repeated under testimonials.
- How to contact: existing footer `ops@egstudio.tech`.
- Where to review refunds: concise testimonials note plus the offer-card and footer links to `refund.html`.
- Edward's personal information was not published.

Styled mobile confirmation of the shorter testimonials note and folder wording is **BLOCKED** (no working local Chrome preview).

### P1. Editing samples are demonstrations, some with loud title treatments
Source: https://egstudio.tech/#work and `/assets/samples/`.

Status: **VERIFIED ACCEPTABLE** to keep the current files, current order, and the exact recut disclaimer. A reported `sample-podcast` glitch is not a blocker. A claimed ~0.5s black window at 28.5–29s on `sample-saas-founder` was not supported by measurement.

Evidence and video QA:
- Files were not replaced, trimmed, re-rendered, or reordered. HTTP 200 alone was not used as quality proof.
- Video QA observed a clear before/after on the process clip, readable captions, thinner captions on the panel clip, and polished B2B graphics on the executive clip. Audio was not assessed.
- `sample-podcast.mp4` (`/workspace/eg-final-impl/egstudio-v2/assets/samples/sample-podcast.mp4`): format duration 25.123991s, video 25.083333s, 1080x1920, 24 fps, 602 frames. `blackdetect` and whole-file `blackframe` (amount=90, threshold=32) found no black events. Frame-accurate stills at 10.5s, 11.0s, and 11.5s, plus every frame from 10.75–11.25s, show a normal interview picture (mean luma about 72). Video QA later corrected the ~10.5–12s black-and-white sliver as an intentional visual gag, not corruption. Do not treat it as a defect.
- `sample-saas-founder.mp4` (`/workspace/eg-final-impl/egstudio-v2/assets/samples/sample-saas-founder.mp4`): format duration 29.976961s, video 29.904875s, 1080x1920, 23.976 fps, 717 frames. The claimed black span of about 0.5s from ~28.5–29s is not supported: stills at 28.5s, 29.0s, and 29.4s still show picture (mean luma about 86–87; 29.4s still reads “AND CREATIVE IMPLEMENTATIONS”). A shorter true-black tail begins after that last picture: `blackdetect` `black_start:29.446083` `black_end:29.863167` `black_duration:0.417083`, matching 11 `blackframe` hits (frames 706–716, `pblack:100`). Stills at 29.7s and 29.85s are 100% near-black. That tail comes after the last content frame, not inside the claimed 28.5–29s window. Media were left unchanged; a brief end tail and stylistic preference are not enough to reorder or replace samples on this final pass.
- Extracted review frames (originals untouched): `/workspace/eg-final-impl/sample-frame-review/`.
- Homepage still leads with `sample-process.mp4`. Disclaimer unchanged. No fabricated case studies.

### P2. Stripe Checkout links Terms and Privacy to Stripe, not EG Studio
Source: https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f
Read-only live config: Stripe account display name “EG Studio”, livemode only (the only account returned). No writes, no customer or session objects, no secret values retrieved.

Status: **NEEDS APPROVAL** only for any remaining Payment Link copy change below. No replacement link and no unverified account-wide settings edits are proposed.

Sanitized live Payment Link facts:
- Matching URL is active in live mode and already redirects to `https://egstudio.tech/payment-confirmed.html?session_id={CHECKOUT_SESSION_ID}`.
- Line item amount is 19900 USD ($199.00), quantity 1, one-time. Product name is “Agency Clip Pack”. The line-item description string is still “EG Studio — Episode-to-Shorts”.
- `metadata` already has `offer=episode_to_shorts` and `experiment=episode_to_shorts_v1`. `payment_method_types` is `["card"]`. That does not prove Apple Pay is off.
- `consent_collection` is null. `custom_text.terms_of_service_acceptance` is null.
- `custom_text.submit.message` already explains the private brief, sharing the recording and agency-owned folder with `ops@egstudio.tech`, checking footage and folder access, delivery of five clips into that folder within 1 to 3 calendar days once materials are ready, no end-client contact or EG Studio branding, and questions to `ops@egstudio.tech`. It does not name `terms.html` or `refund.html`.
- The older `$300` Payment Link URL from the original audit is present on the same live account and is `active: false`.
- Account Public details / checkout store-policy URLs (terms, privacy, refund, support) were not available through the Payment Link or product read APIs used here, so no account-wide Dashboard URL changes are proposed.

What does not need changing on this link: amount, product name “Agency Clip Pack”, success redirect, tracking metadata, or creating a replacement Payment Link.

Optional owner-approved Payment Link edit, if Edward still wants policy URLs next to Pay: append, do not replace, one sentence on the existing submit message pointing to `https://egstudio.tech/terms.html` and `https://egstudio.tech/refund.html`. Requiring a terms checkbox should wait until someone confirms the account Public details terms URL in the Dashboard, because that setting could not be read here.

### P2. Revision limits appear only in FAQ and refunds
Source: homepage `#pricing` vs `#faq` and `refund.html`.

Status: **FIXED**

Evidence:
- Offer card list item is now: "One consolidated revision round for caption, branding, and timing corrections. A new direction or replacement moments is outside this round."
- Matching FAQ and JSON-LD answer now name the same included revision scope (caption, branding, and timing corrections) and say a new direction or replacement moments is outside this round.
- `white-label-podcast-clips/index.html` include list updated the same way.
- Price, clip count, and checkout URL unchanged.
- See the P3 legal-wording row for why FAQ/pricing, terms, and refunds do not need identical exclusion lists.

### P2. `thanks.html` shows Payment complete and a $1,500 Sprint before verification
Source: https://egstudio.tech/thanks.html (byte-identical to origin/main before this edit).

Status: **FIXED** in this branch; independent QA computed-visibility recheck is still required. Do not treat the pre-fix screenshots as a pass.

Evidence of the verified defect (Auditor, styled preview of the earlier branch copy at `http://127.0.0.1:8877/` from `/workspace/qa-copy/egstudio-v2`):
- `playwright-results.json` recorded `#sprint-progress`, `#source-row`, and `#timing-row` with `hiddenAttr: true` but computed `display: grid`, `visibility: visible`, and `painted: true` on no-session, invalid-session, and fake-session loads. The intake form correctly had `display: none` / `painted: false`.
- Screenshots `/workspace/qa-evidence/07-thanks-no-session-390x844.png`, `08-thanks-invalid-session-390x844.png`, and `09-thanks-fake-session-390x844.png` show the Sprint journey cards plus "Up to 90 minutes of source footage" and "Style sample first, then 5 video batches across 30 days".
- Cause: `body.premium-form .premium-intake-progress { display: grid }` in `assets/css/premium-pages.css` (line 52) and `.status-row { display: grid }` in `thanks.html` (inline styles) override the user-agent `[hidden] { display: none }` rule. Setting the `hidden` attribute alone was not enough.

Fix applied on this page only, after the `premium-pages.css` link:
```
#sprint-progress[hidden],
#source-row[hidden],
#timing-row[hidden],
#intake-form[hidden] {
  display: none !important;
}
```
That restores native `hidden` semantics for those elements. When `verify()` sets `.hidden = false` on a paid `sku === "sprint"` session, the attribute is removed and the existing `display:grid` layout returns. Shared `premium-pages.css` was not changed, so other premium-form layouts are untouched. `payment-confirmed.html` already uses `form[hidden],.steps[hidden]{display:none}` and its order-journey list is intentionally visible (no `hidden` attribute).

Independent QA recheck (styled, `http://127.0.0.1:8878/`, source `/workspace/qa-copy2/egstudio-v2`):
- Files: `recheck-playwright-results.json`, `recheck-thanks-no-session-390x844.png`, `recheck-thanks-invalid-session-390x844.png`, `recheck-thanks-fake-session-390x844.png`, `recheck-thanks-mocked-paid-sprint-390x844.png`, `recheck-homepage-hero-390x844.png`, `recheck-homepage-pricing-390x844.png`, `recheck-homepage-testimonials-390x844.png`, `recheck-payment-confirmed-no-session-390x844.png`.
- No-session, invalid-session, and fake-session: `#sprint-progress`, `#source-row`, `#timing-row`, and the intake form had `hiddenAttr: true`, computed `display: none`, and `painted: false`. Screenshots no longer show the Sprint cards, 90-minute source line, or 30-day batch line. Hidden regression: **PASS**.
- Mocked paid Sprint revealed a separate defect described below.

Follow-on verified defect, now **FIXED** in this branch: after a mocked paid Sprint session succeeded, the page showed "Payment complete · 15 video Sprint" and revealed the brief, then overwrote the payment row with "Could not verify payment." Recheck form text included `posthog.capture is not a function`. Cause: `posthog.capture` and `pintrk` ran inside the same `try` as payment verification, so a noncritical analytics exception entered the verification `catch`.
Fix: each analytics call is wrapped in its own `try/catch` after the verified UI is applied. Event name, properties, and Pinterest `checkout` attribution (`event_id`, `order_id`, `value: 1500`, `order_quantity: 1`, `currency: 'USD'`) are unchanged. A throw in `posthog.capture` still allows `pintrk` to run, and the reverse.
Tests now include mocked `posthog` throws, `pintrk` throws, both throwing, backend `fetch` rejection, and a 500 response. True backend failures still show "Could not verify payment" and keep Sprint details hidden.

This implementer did not launch Playwright after the analytics isolation. The hidden-attribute recheck already passed; the analytics-throw UI mix-up needs a later Auditor pass on an updated copy.

`thanks/index.html` is an old helper that points to `/thanks.html` for Sprint briefs. It does not claim "Payment complete" or show $1,500. Status for that helper: **VERIFIED ACCEPTABLE** as legacy routing, not a current checkout success URL.

### P3. Legal revision wording across FAQ, pricing, terms, and refunds
Source: homepage offer card and FAQ/JSON-LD; `white-label-podcast-clips/index.html`; `terms.html`; `refund.html`. The brief asks for consistent revision scope, not necessarily identical sentences.

Status: **VERIFIED ACCEPTABLE**. No material legal-terms edit was made.

Why this is consistent rather than contradictory:
- Every public surface that describes the included round agrees it covers caption, branding, and timing corrections: homepage pricing, homepage FAQ and JSON-LD, the white-label page, and `terms.html`.
- Homepage pricing, FAQ/JSON-LD, and the white-label page also say a new direction or replacement moments is outside that round.
- `refund.html` is more explicit: "A new direction, replacement moments, or a new recording is outside that round."
- `terms.html` states the included scope and does not list those exclusions. It never says a new recording, a new direction, or replacement moments is included.
- A new recording is additional source material. That is not caption, branding, or timing correction, so the refund line specializes an exclusion already implied by the included scope. It does not contradict the shorter marketing/FAQ sentences.
- Because the pages already agree on what the paid round covers, copying "or a new recording" into FAQ, pricing, or terms would be identical wording rather than a consistency fix. Legal terms were left unchanged.

### P2. Old off-site Sprint Payment Link
Source: live Stripe Payment Link list, EG Studio account only, livemode, read-only. No writes and no customer or session objects.

Status: **VERIFIED ACCEPTABLE** to leave historical links untouched. No deactivation is proposed, so this is not a NEEDS APPROVAL item.

Sanitized facts:
- `active=true` returned exactly one live Payment Link: `https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f` (current Agency Clip Pack, metadata `offer=episode_to_shorts`). `has_more` was false.
- The off-site Sprint checkout still exists and is inactive: `https://buy.stripe.com/eVqeV69yV8UwdPB5ZX9EI0c`, metadata `offer=sprint`, custom submit text "15 edited vertical videos in 30 days. One-time payment.", success redirect `https://egstudio.tech/thanks.html?session_id={CHECKOUT_SESSION_ID}`.
- Other historical 15-video / $1,500-style links found in the same live list are also inactive, including `https://buy.stripe.com/aFabIU9yVc6I9zl5ZX9EI06` (redirects to `thanks.html`) and `https://buy.stripe.com/7sYaEQ4eB5Ik8vh1JH9EI08` (partner-seat copy; inactive message already tells buyers the seat link is closed). The older $300 starter link `https://buy.stripe.com/dRm28k26t8Uw26T4VT9EI0e` remains `active: false`.
- None of these URLs appear on the current homepage or white-label checkout buttons, which already point only at the $199 link.
- No Payment Link was created, updated, or deactivated.

### P2. Homepage speaks only to agencies
Source: homepage H1 and offer card, contrasted with `/white-label-podcast-clips/`.

Status: **VERIFIED ACCEPTABLE**

Reason: Edward's brief says to preserve agency positioning unless he approves expanding the offer, and not to treat a deliberate niche focus as a defect. No audience-expansion copy was added.

### P2. Short-form readiness-review page
Source: https://egstudio.tech/short-form-readiness-review.html and `sitemap.xml`.

Status: **BLOCKED** pending confirmation that the form actually functions, that EG Studio still intends to offer the review, and that the two-business-day response can be fulfilled. The page was left in place and was not added to homepage navigation.

Evidence:
- The page exists in origin/main and is byte-identical to live. It already says "Editorial assessment only. This is not a free edit."
- It is in `sitemap.xml` (priority 0.9) and is not linked from the homepage nav or footer, so it does not detour ready-to-buy visitors.
- The form posts to `https://yrqpwpfpoplruqcaerdt.supabase.co/functions/v1/readiness-review`.
- Management API for project `egstudio-intake` (`yrqpwpfpoplruqcaerdt`) lists `readiness-review` as ACTIVE, version 7, last updated October 1, 2026, 8:03 AM PT, `verify_jwt=true`. Deployed files exist (`index.ts`, `deno.json`). That function's source is **not** in `arirenee/egstudio-v2` (`supabase/functions/` has only `client-onboarding`, `intake`, `stripe-order-webhook`, and `stripe-order-scan`).
- An anonymous 401 or an origin-blocked 403 from this box is **not** proof the function handles a real form POST, sends a review, or meets the two-business-day promise. Those responses only show the platform/gateway or origin check rejecting an off-site request. The form was not submitted.
- No free editing sample was offered. The page URL and sitemap entry were not changed.

If Edward cannot fulfill reviews in two business days, the smallest truthful corrections to propose later are: change the promise to a `mailto:ops@egstudio.tech` path, and/or lower or remove the sitemap entry. Deleting the public page or changing its URL still needs a separate owner approval.

### P3. Mobile header hides nav links and leftover menu JS finds no toggle
Source: `assets/css/redesign.css` max-width 767px rules; `index.html` header.

Status: **VERIFIED ACCEPTABLE** for the hidden mobile nav; **FIXED** for the dead menu JS.

Evidence:
- Styled mobile confirmation of those CSS rules is **BLOCKED**. The file-fallback mobile capture showed header nav links because stylesheets did not load; that is not evidence the live media query failed.
- `redesign.css` hides `.rd-nav-link` and `.rd-nav-cta` below 768px. The hero checkout button remains full-width on small screens (`body.rd .rd-actions .rd-btn{width:100%}`).
- The brief says not to add a mobile menu merely because desktop navigation is hidden, and only to fix observed usability problems. No hamburger was added.
- Unused `mobileMenuToggle` / `mobileDrawer` JavaScript was a no-op (those elements do not exist). It was removed after confirming no remaining references.
- Horizontal overflow, tap targets, and actual iPhone layout were not visually verified here.

### P3. Outdated internal documentation and labels
Source: `AGENTS.md`; `supabase/functions/client-onboarding/lib.ts`; webhook/scan offer maps.

Status: **FIXED** for customer-facing and instructional docs; historical backend keys preserved.

Evidence:
- `AGENTS.md` no longer treats the $300 Starter or $1,500 Sprint as current offers. It now documents the approved $199 Agency Clip Pack and agency positioning, and labels the older packages historical.
- `README.md` already correctly described production vs staging vs archive; left unchanged. It still documents the internal analytics offer tag `episode_to_shorts`, which remains the live tracking key.
- `lib.ts` comments explain that `episode.label` is Agency Clip Pack, while internal `name: "Episode-to-Shorts"` is kept because `jobFolderName()` uses `pkg.name`. Keys were not renamed.
- Legacy webhook/scan email maps now use the customer-facing label "Agency Clip Pack" instead of "Episode-to-Shorts". Offer keys (`episode_to_shorts`, `starter`, `sprint`) are unchanged.
- `intake/index.ts` already labeled the live offer "Agency Clip Pack"; left unchanged.
- GitHub repository About text still says this repo is a "Testing ground..." That is a GitHub settings field, not a file in the branch. Updating it is **NEEDS APPROVAL** (settings change): set the description to match README, e.g. "Production repository for the live EG Studio website at egstudio.tech."

### Remaining items from the original report

Checkout policy visibility: same as the Stripe item above; **NEEDS APPROVAL**.

Misleading legacy pages: `thanks.html` **FIXED**. Current success path `payment-confirmed.html` already withholds the brief until a `cs_...` session verifies as paid with sku `episode` or `test`. Live and repo copies of `payment-confirmed.html` were identical before this pass; no change required. Status for `payment-confirmed.html`: **VERIFIED ACCEPTABLE**.

Repository vs deployed website: immediately before editing, `index.html`, `thanks.html`, `payment-confirmed.html`, `short-form-readiness-review.html`, `white-label-podcast-clips/index.html`, and `refund.html` were byte-identical to https://egstudio.tech. After this pass the local branch differs in the files listed above; production is unchanged.

### Deployed Edge Functions vs `arirenee/egstudio-v2`

Read-only comparison against Supabase project `egstudio-intake` (`yrqpwpfpoplruqcaerdt`), the host used by `intake-config.js` and the readiness-review page. File contents were hashed, not pasted here.

| Function | Deployed | In this repo | vs origin/main | vs this working tree |
| --- | --- | --- | --- | --- |
| `intake` | ACTIVE v25, updated Nov 2, 2026, 7:36 PM PT | yes (`index.ts`, `deno.json`) | identical | identical |
| `client-onboarding` | ACTIVE v16, updated Nov 2, 2026, 7:35 PM PT | yes (`handler.ts`, `index.ts`, `lib.ts`); deployed also has `deno.json`, which is not in the repo folder | `handler.ts` and `index.ts` identical; `lib.ts` identical to origin/main | `lib.ts` differs only by the comments added on this branch |
| `stripe-order-webhook` | ACTIVE v14, updated Oct 19, 2026, 9:13 PM PT | yes (`index.ts`); deployed also has `deno.json` not in the repo folder | identical | differs by the local customer-facing label change (`Episode-to-Shorts` → `Agency Clip Pack`) |
| `stripe-order-scan` | ACTIVE v11, updated Oct 19, 2026, 9:13 PM PT | yes (`index.ts`); deployed also has `deno.json` not in the repo folder | identical | same local label change as the webhook |
| `readiness-review` | ACTIVE v7, updated Oct 1, 2026, 8:03 AM PT | **no** | **gap** | **gap** |

Explicit gaps:
1. `readiness-review` is live in Supabase but has no source in the production website repo, so git review and the static-site deployment path cannot change or verify it.
2. Three deployed functions include a `deno.json` that is not stored next to their TypeScript in this repo (`client-onboarding`, `stripe-order-webhook`, `stripe-order-scan`). `intake`'s `deno.json` does match.
3. Local uncommitted comment and label edits are not deployed. Live webhook/scan emails would still use the origin/main "Episode-to-Shorts" label until an approved deploy.
4. Listing a function as ACTIVE, or receiving 401/403 from an off-site GET, does not prove a buyer-facing POST succeeds. No form was submitted and no webhook was fired in this pass.

Screenshot review status: **BLOCKED**. See Browser / screenshot review. Do not treat any capture from this pass as a screenshot PASS.

Apple Pay: the original audit recorded that Apple Pay is enabled in Stripe account settings and did not appear in headless iPhone emulation. A raw fetch of the Payment Link shell contained `apple_pay` references in Stripe's checkout JavaScript, which is not proof that the button appears for a signed-in buyer. Per the brief, absence in headless emulation is not treated as proof that Apple Pay is disabled. Status: **VERIFIED ACCEPTABLE** as "not a confirmed defect"; physical iPhone Safari check remains for parent.

---

## Purchase-to-onboarding investigation

This is a code and live-route investigation only. No real purchase, refund, webhook replay, Notion job, welcome email, or customer record was created.

Observed path for the current $199 Agency Clip Pack:

1. Buyer clicks `https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f` (`data-sku="episode"`). `assets/js/eg-tracking.js` attaches UTMs and `client_reference_id`.
2. Stripe success redirect goes to `https://egstudio.tech/payment-confirmed.html?session_id=...`, not `thanks.html`.
3. `payment-confirmed.html` requires `session_id` to start with `cs_`. Otherwise it shows "Payment session missing." and keeps the brief hidden.
4. It then GET-verifies the session through the public intake function (`intake-config.js` → `.../functions/v1/intake`) using the publishable anon key only. A paid session must have sku `episode` or `test` before the form appears. A supplied session ID is not treated as proof of payment.
5. `supabase/functions/client-onboarding/handler.ts` handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`, ignores unpaid sessions, identifies the package from price IDs and/or `metadata.offer` (`episode_to_shorts` → episode), requires a customer email, upserts `client_onboarding_jobs` on `stripe_session_id`, returns `{duplicate:true}` when status is already `complete`, and otherwise claims the row.
6. For `pkg.key === "episode"`: no Google Drive folder is created. The function finds or creates a Notion job with `agencyHandoff: true`, then sends `welcomeEmail()` pointing at `https://egstudio.tech/payment-confirmed.html?session_id=...`. The email asks the agency to share an agency-owned folder with `ops@egstudio.tech` (edit/upload). Existing unit-test expectations: five clip slots, no vendor Drive URLs, no due date until acceptance, test-mode mail to `ops@egstudio.tech`, live mail to the buyer.
7. For historical `test` / `sprint` packages, the same handler still creates a Drive tree and locks it to the buyer email. That path is retained for old-order support.
8. No Stripe secret or service-role key appears in public HTML. `intake-config.js` and the readiness-review page expose only the publishable/anon key, which is expected for a browser client.

Live end-to-end webhook, Notion, and welcome-email behavior remains unverified. A controlled authorized test may suffice; no purchase or live side effect was run here.

Status: mocked onboarding code path **FIXED** / verified by test. Live end-to-end remains unverified.

`tests/agency-onboarding.mjs` was run with `node --experimental-transform-types` and passed: signed live and test agency flows, no vendor Drive calls for the episode pack, null due date until acceptance, five clip slots, agency-only transactional recipient, duplicate suppression, invalid signatures, and the legacy starter email. All external calls were mocked.

Other local tests, all mocked or static, also passed: `tests/premium-site.mjs`, `tests/agency-intake.mjs`, `tests/thanks-runtime.mjs`. Raw logs: `/workspace/eg-final-impl/test-logs/all-tests.log`.

---

## Owner approvals still required

1. Review this local diff, then explicitly approve opening a PR from `fix/conversion-readiness-20261107` to `main`. No PR has been opened.
2. Approve merge/deploy separately after independent QA. Production was not changed.
3. If he wants policy URLs on the hosted checkout, approve appending terms and refund links to the existing Payment Link submit message. Do not require a terms checkbox until Dashboard Public details are confirmed. Do not create a replacement Payment Link.
4. Optional: authorize a controlled test to verify live onboarding end-to-end.
5. Unblock the readiness-review item by confirming that the form works, the service is still offered, and the two-business-day promise can be fulfilled. Do not delete or rename that public page without a further yes.
6. Optional settings change: update the GitHub About text for `arirenee/egstudio-v2` so it no longer describes a staging sandbox.
7. Do not publish Edward's personal name unless he separately asks to.

---

## Independent QA visual recheck

Styled independent evidence exists and is not treated as blocked.

Recheck source: `http://127.0.0.1:8878/` serving `/workspace/qa-copy2/egstudio-v2` (updated copy of the branch after the `[hidden]` CSS fix, before the analytics-isolation fix). Viewport 390x844.

- Homepage hero: CTA visible, text "Get 5 Finished Clips: $199", href reaches the live $199 Payment Link. Screenshot: `/workspace/qa-evidence/recheck-homepage-hero-390x844.png`.
- Homepage pricing: `$199`, revision-scope sentence, and folder-access wording present. Screenshot: `/workspace/qa-evidence/recheck-homepage-pricing-390x844.png`.
- Homepage testimonials: the three approved quotes are present and `has_note` is true. Screenshot: `/workspace/qa-evidence/recheck-homepage-testimonials-390x844.png`.
- `payment-confirmed.html` with no session: checking copy, session-missing state, form not painted. Screenshot: `/workspace/qa-evidence/recheck-payment-confirmed-no-session-390x844.png`.
- `thanks.html` hidden regression: **PASS** for no-session, invalid-session, and fake-session, as detailed above.

The analytics-throw mix-up on the mocked paid Sprint path was found in that same recheck and is now fixed in source; it has not been visually rechecked.

## Parent browser limitation (separate)

This does not override the Auditor recheck above.
- Parent Chrome refused `http://localhost:8765/` and `http://localhost:8766/`, and received an HTTP error at `http://172.30.0.2:8766/`.
- A file-fallback open of working-tree HTML loaded markup but failed to load CSS and assets that use absolute paths, so that mobile capture was unstyled.
- Parent-reported Health check: 11/11 PASS.

Captures on file (not a visual pass):
- Before / live production homepage (styled, current live site, not this branch): `/cursor/stores/user/grok-bot/agents/85bf8f55-1aeb-4d87-801f-e9ab50950e43/assets/a42e6003edc80070e39c357b1a3c6e8b8aacc488e57e3ad982dfa89b88094eb8.png`. Shows the existing live hero and $199 offer without the new testimonials note.
- File-fallback copy-only mobile pricing (unstyled): `/cursor/stores/user/grok-bot/agents/85bf8f55-1aeb-4d87-801f-e9ab50950e43/assets/349608d583225f044c596e9fda9dc13319ac6f22345c704afdc4e92c44b0a9e2.png`. Markup includes Agency Clip Pack, $199, the refund policy link, and the new revision-scope sentence. Header nav links are visible because styles did not load. This is copy inspection only.
- Auditor pre-fix thanks.html captures: `/workspace/qa-evidence/07-thanks-no-session-390x844.png`, `08-thanks-invalid-session-390x844.png`, `09-thanks-fake-session-390x844.png`, and `/workspace/qa-evidence/playwright-results.json`. These document the verified leak and are not a post-fix pass.

Still needed after a reachable styled preview, not from production until after deploy approval:
1. Homepage desktop: testimonials note, unchanged quotes, identity/refund line, pricing revision line.
2. Homepage mobile (~375px), with CSS loaded: hero CTA, hidden header nav as designed, sample carousel, pricing, FAQ, footer; overflow and tap targets.
3. Sample wall playback in the page (order unchanged; objective frame review already done separately).
4. `thanks.html` with no query, invalid `session_id`, and a fake `cs_` session: Sprint progress, 90-minute source, and 30-day batch rows must not paint. Recheck computed `display` for `[hidden]` elements, not only the attribute.
5. `payment-confirmed.html` with no session.
6. `/white-label-podcast-clips/` revision line and $199 price.
7. Live Stripe checkout checks remain owner-gated.

Do not submit the readiness-review form or complete a Stripe payment unless Edward separately authorizes it.

---

## Deployment trigger inspection

Read-only. No workflow, Pages, hook, environment, or repo-setting changes were made.

- This clone has no `.github/workflows` directory. GitHub's contents API also returns no `.github` folder on `origin/main`.
- GitHub Pages is enabled for this repository with `build_type: legacy`, source branch `main`, source path `/`, and CNAME `egstudio.tech`. The managed workflow `pages-build-deployment` is active.
- Recent deployments were all `environment: github-pages` and `ref: main`, including sha `b1cd478` on November 5, 2026, 5:07 PM PT (shown by the API as 2026-11-06T01:07:56Z).
- The `github-pages` environment has a branch-policy protection rule. `main` itself is not branch-protected, so a direct push or merge to `main` would publish.
- No repository webhooks were returned. The only other listed environment is `copilot`.
- `origin/main` is `b1cd478`, matching this branch's base.
- Conclusion: pushing this feature branch or opening a pull request against `main` does not appear to publish production by itself. Merging that pull request, or any push to `main`, would automatically deploy https://egstudio.tech through GitHub Pages. Merge and deploy still require Edward's explicit approval.

## What this pass did not do

- No merge to `main`, production deploy, or GitHub Pages publication.
- No GitHub Actions, secrets, DNS, permissions, or live webhook changes.
- No live Stripe Payment Link writes.
- No real purchase, refund, Notion job, or outbound email.
- No deletion or URL change of the public readiness-review page.
- Independent QA hidden-attribute recheck: PASS. Paid-Sprint analytics isolation is fixed in source and pending Auditor's post-PR analytics edge-case rerun.
- Do not merge or deploy without Edward's explicit approval.
