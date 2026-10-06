import {
  addDays, clientDisplayName, firstName, identifyPackage, jobFolderName, pacificDate, parsePriceIds,
  verifyStripeSignature, welcomeEmail, type Pkg,
} from "./lib.ts";

type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

const SUBFOLDERS = ["01_SOURCE", "02_WORKING", "03_REVIEW", "04_FINAL"];
const OPS_EMAIL = "ops@egstudio.tech";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

// ---------------------------------------------------------------- state table (Supabase REST)
function makeStore(env: Env, f: Fetch) {
  const base = (env("SUPABASE_URL") || "") + "/rest/v1/client_onboarding_jobs";
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || "";
  const h = (extra: Record<string, string> = {}) => ({ apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...extra });
  return {
    async insertIfNew(row: Record<string, unknown>) {
      const r = await f(base + "?on_conflict=stripe_session_id", {
        method: "POST", headers: h({ Prefer: "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error("state insert failed: " + r.status + " " + (await r.text()).slice(0, 200));
    },
    async get(sessionId: string) {
      const r = await f(base + "?stripe_session_id=eq." + encodeURIComponent(sessionId) + "&select=*", { headers: h() });
      if (!r.ok) throw new Error("state read failed: " + r.status);
      return (await r.json())[0] ?? null;
    },
    /** Atomically take the lock. Returns the row if we got it, null if someone else holds it. */
    async claim(sessionId: string) {
      const stale = new Date(Date.now() - 5 * 60_000).toISOString();
      const url = base + "?stripe_session_id=eq." + encodeURIComponent(sessionId) +
        "&or=(status.in.(pending,failed,access_failed),and(status.eq.processing,locked_at.lt." + stale + "))";
      const r = await f(url, {
        method: "PATCH", headers: h({ Prefer: "return=representation" }),
        body: JSON.stringify({ status: "processing", locked_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error("state claim failed: " + r.status);
      return (await r.json())[0] ?? null;
    },
    async patch(sessionId: string, values: Record<string, unknown>) {
      const r = await f(base + "?stripe_session_id=eq." + encodeURIComponent(sessionId), {
        method: "PATCH", headers: h(), body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error("state update failed: " + r.status);
    },
  };
}

// ---------------------------------------------------------------- Google Drive
export class DriveError extends Error {
  constructor(message: string, public status: number, public body: string) { super(message); }
}
/** Raised when 01_SOURCE cannot be kept restricted to the client (nothing is ever made public as a workaround). */
export class AccessError extends Error {}
/** True only when Drive REJECTED the share itself (bad/non-Google address, sharing policy) - not outages, auth or rate limits. */
export function isShareRejection(e: unknown): boolean {
  if (e instanceof AccessError) return true;
  if (!(e instanceof DriveError)) return false;
  if (/rateLimit|userRateLimit|quotaExceeded|dailyLimit|backendError/i.test(e.body)) return false;
  return e.status === 400 || e.status === 403;
}
function makeDrive(env: Env, f: Fetch) {
  let token: string | null = null;
  async function accessToken() {
    if (token) return token;
    const r = await f("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("GOOGLE_CLIENT_ID")!, client_secret: env("GOOGLE_CLIENT_SECRET")!,
        refresh_token: env("GOOGLE_REFRESH_TOKEN")!, grant_type: "refresh_token",
      }),
    });
    if (!r.ok) throw new Error("Google token refresh failed: " + r.status + " " + (await r.text()).slice(0, 200));
    token = (await r.json()).access_token;
    return token!;
  }
  async function api(path: string, init: RequestInit = {}) {
    const r = await f("https://www.googleapis.com/drive/v3" + path, {
      ...init, headers: { Authorization: "Bearer " + (await accessToken()), "Content-Type": "application/json", ...(init.headers || {}) },
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      throw new DriveError("Drive " + path.split("?")[0] + " failed: " + r.status + " " + body, r.status, body);
    }
    return r.json();
  }
  const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  async function ensureFolder(name: string, parentId: string, tag: string) {
    const found = await api("/files?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,webViewLink)&q=" +
      encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and trashed=false and '${q(parentId)}' in parents and appProperties has { key='eg_tag' and value='${q(tag)}' }`));
    if (found.files?.length) return found.files[0] as { id: string; webViewLink: string };
    return await api("/files?supportsAllDrives=true&fields=id,webViewLink", {
      method: "POST",
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId], appProperties: { eg_tag: tag } }),
    }) as { id: string; webViewLink: string };
  }
  return {
    /** Job folder + 4 subfolders. Nothing is shared here (folders inherit only the private parent). Idempotent via appProperties tags. */
    async createJobTree(jobName: string, sessionId: string) {
      const root = env("GOOGLE_DRIVE_PARENT_FOLDER_ID")!;
      const job = await ensureFolder(jobName, root, sessionId);
      const subs: Record<string, { id: string; webViewLink: string }> = {};
      for (const s of SUBFOLDERS) subs[s] = await ensureFolder(s, job.id, sessionId + ":" + s);
      return { jobFolderId: job.id, jobFolderUrl: job.webViewLink, sourceFolderId: subs["01_SOURCE"].id, uploadUrl: subs["01_SOURCE"].webViewLink };
    },
    /**
     * Share 01_SOURCE with the paying client's email as editor (no Drive notification email). There is NO public-link
     * path: if Drive rejects the address, this throws and the folder stays restricted. Also refuses to proceed if the
     * folder is already public through inherited permissions.
     */
    async lockToClient(sourceFolderId: string, clientEmail: string) {
      await api(`/files/${sourceFolderId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
        method: "POST", body: JSON.stringify({ type: "user", role: "writer", emailAddress: clientEmail }),
      });
      const perms = await api(`/files/${sourceFolderId}/permissions?supportsAllDrives=true&fields=permissions(type,role)`);
      if ((perms.permissions || []).some((p: any) => p.type === "anyone")) {
        throw new AccessError("01_SOURCE is public (anyone with the link) through an inherited permission; not sending a link.");
      }
    },
  };
}

// ---------------------------------------------------------------- Notion
function makeNotion(env: Env, f: Fetch) {
  const headers = () => ({ Authorization: "Bearer " + env("NOTION_TOKEN"), "Notion-Version": "2022-06-28", "Content-Type": "application/json" });
  const dbId = () => env("NOTION_JOBS_DATABASE_ID")!;
  return {
    async findBySession(sessionId: string): Promise<string | null> {
      const r = await f(`https://api.notion.com/v1/databases/${dbId()}/query`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ filter: { property: "Stripe session", rich_text: { equals: sessionId } }, page_size: 1 }),
      });
      if (!r.ok) throw new Error("Notion query failed: " + r.status + " " + (await r.text()).slice(0, 300));
      return (await r.json()).results?.[0]?.id ?? null;
    },
    async markAccessOk(pageId: string) {
      const r = await f("https://api.notion.com/v1/pages/" + pageId, {
        method: "PATCH", headers: headers(),
        body: JSON.stringify({ properties: { Status: { select: { name: "Awaiting Upload" } }, "Upload access": { select: { name: "Locked to client email" } } } }),
      });
      if (!r.ok) throw new Error("Notion update failed: " + r.status + " " + (await r.text()).slice(0, 300));
    },
    async createJob(j: { client: string; email: string; pkg: Pkg; start: string; due: string; sourceUrl: string; folderUrl: string; sessionId: string; paymentIntent: string; live: boolean; locked: boolean }) {
      const t = (s: string) => [{ type: "text", text: { content: s.slice(0, 1900) } }];
      const children = [
        ...(j.locked ? [] : [{
          object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "⚠️" }, rich_text: t("UPLOAD_ACCESS_FAILED: Drive would not share 01_SOURCE with " + j.email + " (likely not a Google account). The folder is private and NO welcome email or link was sent. Share it manually, send the client an upload method, then set Status to Awaiting Upload.") },
        }]),
        { object: "block", type: "paragraph", paragraph: { rich_text: t("Workflow: Awaiting Upload > Files Received/Verifying > Ready for Production > In Production > In Review > Delivered. Edward verifies 01_SOURCE, then sets Ready for Production by hand.") } },
        { object: "block", type: "heading_2", heading_2: { rich_text: t(`Clip slots (${j.pkg.clips})`) } },
        ...Array.from({ length: j.pkg.clips }, (_, i) => ({
          object: "block", type: "to_do", to_do: { rich_text: t("Clip " + String(i + 1).padStart(2, "0")), checked: false },
        })),
      ];
      const r = await f("https://api.notion.com/v1/pages", {
        method: "POST", headers: headers(),
        body: JSON.stringify({
          parent: { database_id: dbId() },
          properties: {
            Name: { title: t(`${j.live ? "" : "TEST - "}${j.client} | ${j.pkg.name}`) },
            Client: { rich_text: t(j.client) },
            "Client email": { email: j.email },
            Package: { select: { name: j.pkg.name } },
            "Payment status": { select: { name: "Paid" } },
            "Start date": { date: { start: j.start } },
            "Due date": { date: { start: j.due } },
            "Source link": { url: j.sourceUrl },
            "Job folder": { url: j.folderUrl },
            Status: { select: { name: j.locked ? "Awaiting Upload" : "UPLOAD_ACCESS_FAILED" } },
            "Upload access": { select: { name: j.locked ? "Locked to client email" : "Access failed - fix manually" } },
            "Clip slots": { number: j.pkg.clips },
            Environment: { select: { name: j.live ? "Live" : "Test" } },
            "Stripe session": { rich_text: t(j.sessionId) },
            "Stripe payment": { rich_text: t(j.paymentIntent) },
          },
          children,
        }),
      });
      if (!r.ok) throw new Error("Notion create failed: " + r.status + " " + (await r.text()).slice(0, 300));
      const p = await r.json();
      return { id: p.id as string, url: p.url as string };
    },
  };
}

// ---------------------------------------------------------------- Email (Resend default, Gmail API optional)
function makeMailer(env: Env, f: Fetch) {
  const from = () => env("ONBOARDING_FROM") || `EG Studio <${OPS_EMAIL}>`;
  async function viaResend(to: string, m: { subject: string; text: string; html: string }) {
    const r = await f("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ from: from(), to: [to], reply_to: OPS_EMAIL, subject: m.subject, text: m.text, html: m.html }),
    });
    if (!r.ok) throw new Error("Resend failed: " + r.status + " " + (await r.text()).slice(0, 300));
  }
  async function viaGmail(to: string, m: { subject: string; text: string; html: string }) {
    const tok = await f("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID")!, client_secret: env("GOOGLE_CLIENT_SECRET")!, refresh_token: env("GOOGLE_REFRESH_TOKEN")!, grant_type: "refresh_token" }),
    });
    if (!tok.ok) throw new Error("Google token refresh failed: " + tok.status);
    const access = (await tok.json()).access_token;
    const b = "eg" + crypto.randomUUID().replaceAll("-", "");
    const mime = [
      `From: ${from()}`, `To: ${to}`, `Reply-To: ${OPS_EMAIL}`, `Subject: ${m.subject}`, "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${b}"`, "",
      `--${b}`, 'Content-Type: text/plain; charset="UTF-8"', "", m.text,
      `--${b}`, 'Content-Type: text/html; charset="UTF-8"', "", m.html, `--${b}--`, "",
    ].join("\r\n");
    const raw = btoa(String.fromCharCode(...new TextEncoder().encode(mime))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const r = await f("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
    });
    if (!r.ok) throw new Error("Gmail send failed: " + r.status + " " + (await r.text()).slice(0, 300));
  }
  return {
    send: (to: string, m: { subject: string; text: string; html: string }) =>
      (env("ONBOARDING_EMAIL_PROVIDER") === "gmail" ? viaGmail : viaResend)(to, m),
    alertOps: async (subject: string, body: string): Promise<boolean> => {
      try { await viaResend(OPS_EMAIL, { subject, text: body, html: "<pre>" + body.replace(/</g, "&lt;") + "</pre>" }); return true; } catch (_) { return false; /* best effort */ }
    },
  };
}

// ---------------------------------------------------------------- main handler
export async function handle(req: Request, env: Env = (k) => Deno.env.get(k), f: Fetch = fetch): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const secrets = (env("STRIPE_ONBOARDING_WEBHOOK_SECRET") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!secrets.length) return json({ error: "Webhook signing secret is not configured." }, 503);

  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ error: "Payload too large." }, 413);
  let valid = false;
  for (const s of secrets) if (await verifyStripeSignature(raw, req.headers.get("stripe-signature"), s)) { valid = true; break; }
  if (!valid) return json({ error: "Invalid signature." }, 400);

  const event = JSON.parse(raw);
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return json({ received: true, ignored: event.type });
  }
  const session = event.data?.object;
  if (!session || session.object !== "checkout.session") return json({ error: "Unexpected event object." }, 400);
  if (session.payment_status !== "paid") return json({ received: true, ignored: "not paid yet" });

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_DRIVE_PARENT_FOLDER_ID", "NOTION_TOKEN", "NOTION_JOBS_DATABASE_ID"].filter((k) => !env(k));
  const provider = env("ONBOARDING_EMAIL_PROVIDER") === "gmail" ? "gmail" : "resend";
  if (provider === "resend" && !env("RESEND_API_KEY")) missing.push("RESEND_API_KEY");
  if (missing.length) {
    console.error("client-onboarding missing secrets:", missing.join(","));
    return json({ error: "Not configured: " + missing.join(", ") }, 503); // 503 => Stripe retries until configured
  }

  const cfg = {
    episode: parsePriceIds(env("STRIPE_PRICE_ID_EPISODE")),
    test: parsePriceIds((env("STRIPE_PRICE_ID_STARTER") || "") + "," + (env("STRIPE_PRICE_ID_TEST") || "")),
    sprint: parsePriceIds(env("STRIPE_PRICE_ID_SPRINT")),
  };
  let linePriceIds: string[] | null = null;
  if (cfg.episode.length || cfg.test.length || cfg.sprint.length) {
    // Price IDs are not in the webhook payload; read the line items. Test-mode sessions need the test-mode key.
    const stripeKey = session.livemode ? env("STRIPE_SECRET_KEY") : (env("STRIPE_TEST_SECRET_KEY") || env("STRIPE_SECRET_KEY"));
    if (stripeKey) {
      const r = await f("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(session.id) + "/line_items?limit=20", {
        headers: { Authorization: "Bearer " + stripeKey },
      });
      if (!r.ok) {
        console.error("client-onboarding: line item lookup failed", r.status);
        return json({ error: "Could not read Stripe line items; will retry." }, 503);
      }
      linePriceIds = ((await r.json()).data || []).map((li: any) => li?.price?.id).filter(Boolean);
    } // no Stripe key => fall back to the offer tag only
  }

  let pkg: Pkg;
  try { pkg = identifyPackage(session, cfg, linePriceIds); } catch (e) {
    // Not one of our supported packages (or tampered) - do not onboard. 200 so Stripe stops retrying.
    console.error("client-onboarding ignoring session", session.id, (e as Error).message);
    return json({ received: true, ignored: (e as Error).message });
  }

  const email = String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!email) return json({ error: "Paid session has no customer email." }, 400);
  const live = session.livemode === true;
  const client = clientDisplayName(session.customer_details?.name, email);
  const start = pacificDate(event.created || Math.floor(Date.now() / 1000));
  const due = addDays(start, pkg.dueDays);

  const store = makeStore(env, f), drive = makeDrive(env, f), notion = makeNotion(env, f), mail = makeMailer(env, f);
  await store.insertIfNew({
    stripe_session_id: session.id, stripe_event_id: event.id, package: pkg.key, environment: live ? "live" : "test",
    customer_email: email, status: "pending",
  });
  const existing = await store.get(session.id);
  if (existing?.status === "complete") return json({ received: true, duplicate: true });
  const job = await store.claim(session.id);
  if (!job) return json({ error: "Another worker is processing this payment." }, 503);

  try {
    let state = job;
    if (!state.drive_source_folder_id) {
      const t = await drive.createJobTree(jobFolderName(client, pkg, start, !live), session.id);
      await store.patch(session.id, { drive_job_folder_id: t.jobFolderId, drive_job_folder_url: t.jobFolderUrl, drive_source_folder_id: t.sourceFolderId, drive_source_url: t.uploadUrl });
      state = { ...state, drive_job_folder_id: t.jobFolderId, drive_job_folder_url: t.jobFolderUrl, drive_source_folder_id: t.sourceFolderId, drive_source_url: t.uploadUrl };
    }
    // Lock 01_SOURCE to the client's email. Failure keeps it private (never opened up).
    let accessError: string | null = null;
    if (!state.share_locked_at) {
      try {
        await drive.lockToClient(state.drive_source_folder_id, email);
        const now = new Date().toISOString();
        await store.patch(session.id, { share_locked_at: now });
        state = { ...state, share_locked_at: now };
      } catch (e) {
        if (!isShareRejection(e)) throw e; // outage/auth/rate limit => normal failure + retry
        accessError = (e as Error).message.slice(0, 300);
      }
    }
    const locked = !!state.share_locked_at;
    if (!state.notion_page_id) {
      let pageId = await notion.findBySession(session.id);
      let pageUrl: string | null = null;
      if (!pageId) {
        const p = await notion.createJob({
          client, email, pkg, start, due, sourceUrl: state.drive_source_url, folderUrl: state.drive_job_folder_url,
          sessionId: session.id, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : "", live, locked,
        });
        pageId = p.id; pageUrl = p.url;
      }
      await store.patch(session.id, { notion_page_id: pageId, notion_page_url: pageUrl });
      state = { ...state, notion_page_id: pageId };
    } else if (locked && existing?.status === "access_failed") {
      await notion.markAccessOk(state.notion_page_id); // ops fixed it / retry succeeded
    }
    if (!locked) {
      // No link, no client email. Tell ops once, then stop (200 so Stripe doesn't hammer; resend the Stripe event to retry).
      if (!state.access_alerted_at) {
        const ok = await mail.alertOps("EG onboarding: UPLOAD_ACCESS_FAILED" + (live ? "" : " [TEST]"),
          `Could not share the upload folder with the client, so NO welcome email or link was sent.\n` +
          `Client: ${client} <${email}>\nPackage: ${pkg.name}\nStripe session: ${session.id}\nDrive folder: ${state.drive_job_folder_url}\n` +
          `Error: ${accessError}\n\nThe folder is still private. Notion row is set to UPLOAD_ACCESS_FAILED` +
          (state.notion_page_url ? ` (${state.notion_page_url})` : "") +
          `.\nNext: share 01_SOURCE with the client some other way (or ask for a Google-account email), email them yourself, then in Notion set Status to Awaiting Upload. ` +
          `To re-run automatically instead, resend this event in Stripe > Developers > Webhooks.`);
        if (ok) await store.patch(session.id, { access_alerted_at: new Date().toISOString() });
      }
      await store.patch(session.id, { status: "access_failed", last_error: accessError });
      return json({ received: true, access_failed: true });
    }
    if (!state.welcome_sent_at) {
      // Test-mode payments never email the "customer"; they go to ops only.
      const to = live ? email : OPS_EMAIL;
      const m = welcomeEmail({ first: firstName(session.customer_details?.name), pkg, uploadUrl: state.drive_source_url, lockedEmail: email });
      await mail.send(to, live ? m : { ...m, subject: "[TEST] " + m.subject });
      await store.patch(session.id, { welcome_sent_at: new Date().toISOString(), welcome_sent_to: to });
    }
    await store.patch(session.id, { status: "complete", last_error: null });
    return json({ received: true, ok: true, package: pkg.key });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    console.error("client-onboarding failed:", session.id, msg);
    await store.patch(session.id, { status: "failed", last_error: msg }).catch(() => {});
    await mail.alertOps("EG onboarding failed - needs a look", `Stripe session ${session.id} (${pkg.name}, ${email}) did not finish onboarding.\nError: ${msg}\nStripe will retry automatically; fix the cause and it will resume without duplicates.`);
    return json({ error: "Onboarding step failed; will retry." }, 500);
  }
}
