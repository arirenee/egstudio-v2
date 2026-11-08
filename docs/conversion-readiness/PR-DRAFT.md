# Pull request

**Title:** Fix conversion readiness for the $199 Agency Clip Pack

**Base:** `main` (`b1cd478`)
**Head:** `fix/conversion-readiness-20261107`
**Repository:** `arirenee/egstudio-v2`

Do not merge this pull request without Edward's explicit approval. Merging to `main` publishes https://egstudio.tech through GitHub Pages. This pull request is for independent QA, not a ship verdict.

## Summary

This branch prepares the production website for the current $199 Agency Clip Pack without changing price, checkout URL, sample assets, or live Stripe settings.

- Keep the three genuine anonymous testimonials verbatim and add a short confidentiality note, plus a factual identity line and refund link.
- Align FAQ and "Your agency provides" folder wording with the documented ingest-and-delivery workflow.
- Put the revision-scope sentence on the offer card, FAQ/JSON-LD, and white-label page. Legal terms were not rewritten; refunds already exclude a new recording, and no public page says a new recording is included.
- Make `thanks.html` verification-first. Hide legacy Sprint details with native `hidden` semantics that later `display:grid` rules cannot override.
- Isolate `thanks.html` analytics errors from the verification result. `posthog.capture("intake_payment_verified", ...)` and `pintrk('track','checkout',{event_id, order_id, value:1500, order_quantity:1, currency:'USD'})` are unchanged; a throw in one call no longer marks a verified Sprint payment as failed or prevents the other call.
- Update customer-facing webhook/scan email labels from "Episode-to-Shorts" to "Agency Clip Pack" without changing internal keys.
- Document the current offer in `AGENTS.md`.

## Independent QA recheck

Styled recheck of the hidden-attribute fix, from `recheck-playwright-results.json` and the matching `recheck-*.png` captures:

- Hidden regression **PASS** for no-session, invalid-session, and fake-session loads (`hiddenAttr: true`, computed `display: none`, `painted: false`). Sprint progress, 90-minute source, and 30-day batch details did not paint.
- Homepage hero, pricing, and testimonials captures exist, including the $199 CTA, revision-scope sentence, folder wording, approved quotes, and confidentiality note.
- `payment-confirmed.html` with no session kept the brief hidden.
- The same recheck found a separate defect on a mocked paid Sprint session: the page revealed the verified Sprint UI, then overwrote the payment row with "Could not verify payment" because `posthog.capture is not a function` ran inside the verification `try`. That isolation is fixed in this branch. Independent QA has not yet rerun the analytics edge-case against this fix.

## Tests

All four local suites pass:

- `node tests/premium-site.mjs`
- `node tests/agency-intake.mjs`
- `node --experimental-transform-types tests/agency-onboarding.mjs`
- `node tests/thanks-runtime.mjs`, including missing/invalid/unpaid/wrong-sku/paid-sprint paths; `posthog` throw, `pintrk` throw, and both throwing without overwriting verification; backend `fetch` rejection and HTTP 500 staying unverified; and the `[hidden]` stylesheet cascade.

Raw log: `docs/conversion-readiness/test-logs/all-tests.log`

## Review notes

- Complete issue register: `docs/conversion-readiness/ISSUE-REGISTER.md`
- Summary: `docs/conversion-readiness/REVIEW-SUMMARY.md`
- The only active live Payment Link remains `https://buy.stripe.com/00wdR27qNc6IfXJ7419EI0f`. Historical Sprint links exist and are inactive; none were changed.
- No live Stripe, webhook, customer, Notion, or email writes are included.

## Deploy warning

This repository has no custom GitHub Actions workflows, but GitHub Pages deploys `main` `/` to `egstudio.tech`. Opening this pull request should not publish the site. Merging it would.
