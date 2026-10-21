# egstudio-v2
Testing ground for E.G. Studio website experiments, messaging, conversion optimization, and offer validation before deploying changes to the live site at egstudio.tech.

## Analytics / tracking

Shared script: `assets/js/eg-tracking.js` (loaded on all public pages).

- PostHog only initializes on `egstudio.tech` / `www.egstudio.tech`. GitHub Pages previews (`arirenee.github.io`), localhost and other hosts send nothing.
- Internal opt-out: open any page with `?internal=1`. This sets `localStorage.eg_internal=1` and calls `posthog.opt_out_capturing()` on every later visit in that browser. Use `?internal=0` to clear it and opt back in.
- Every `buy.stripe.com` link click fires `checkout_cta_clicked` with `page_path`, `offer: 'episode_to_shorts'`, `placement`, `sku` (from `data-sku`, if set) and `utm_source/medium/campaign`.
- Stripe links get the current page's UTM params plus `client_reference_id = <utm_source>__<utm_campaign>__<posthog distinct_id, first 12 chars>` (non `[A-Za-z0-9_-]` chars become `_`, max 200). With no UTMs it is `direct`. The link is refreshed on mousedown/touch so the distinct_id is included once PostHog has loaded. Existing link query params (e.g. prefilled_email) are kept.
