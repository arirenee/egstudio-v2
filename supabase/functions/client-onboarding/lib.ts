// Pure helpers (no network) so they can be unit tested.

export type Pkg = {
  key: "episode" | "test" | "sprint";
  name: "Episode-to-Shorts" | "3-Clip Starter" | "Sprint";
  amount: number; // cents
  clips: number;
  dueDays: number; // calendar days from payment date
  label: string;
};

export const PACKAGES: Record<string, Pkg> = {
  episode: { key: "episode", name: "Episode-to-Shorts", amount: 19900, clips: 5, dueDays: 7, label: "Episode-to-Shorts" },
  test: { key: "test", name: "3-Clip Starter", amount: 30000, clips: 3, dueDays: 7, label: "3-Clip Starter" },
  sprint: { key: "sprint", name: "Sprint", amount: 150000, clips: 15, dueDays: 30, label: "15-video Sprint" },
};

// Payment Links set metadata.offer on new checkout sessions. Legacy paid_test remains accepted.
const METADATA_TO_KEY: Record<string, string> = { episode_to_shorts: "episode", starter: "test", paid_test: "test", sprint: "sprint" };

export type PriceConfig = { episode: string[]; test: string[]; sprint: string[] };

/** "price_a, price_b" -> ["price_a","price_b"] (allows separate live + test-mode price ids). */
export function parsePriceIds(v: string | undefined | null): string[] {
  return (v || "").split(",").map((x) => x.trim()).filter(Boolean);
}

/**
 * Identify the package WITHOUT looking at the amount (coupons/tax can change it).
 *  1. Price ID of the purchased line item(s), if STRIPE_PRICE_ID_STARTER / legacy _TEST / _SPRINT are configured.
 *  2. Fallback: metadata.offer tag (starter / sprint; legacy paid_test is also accepted).
 * If both are available they must agree. Anything unmatched => throws (caller ignores the payment).
 */
export function identifyPackage(
  session: { metadata?: Record<string, string> | null },
  cfg: PriceConfig = { episode: [], test: [], sprint: [] },
  linePriceIds: string[] | null = null,
): Pkg {
  let byPrice: string | undefined;
  if (linePriceIds && linePriceIds.length && (cfg.episode.length || cfg.test.length || cfg.sprint.length)) {
    const hits = new Set<string>();
    for (const id of linePriceIds) {
      if (cfg.episode.includes(id)) hits.add("episode");
      if (cfg.test.includes(id)) hits.add("test");
      if (cfg.sprint.includes(id)) hits.add("sprint");
    }
    if (hits.size > 1) throw new Error("Order contains multiple EG Studio offer prices.");
    byPrice = [...hits][0];
  }
  const offer = session.metadata?.offer;
  const byMeta = offer ? METADATA_TO_KEY[offer] : undefined;
  if (offer && !byMeta && !byPrice) throw new Error("Unknown offer tag: " + offer);
  if (byPrice && byMeta && byPrice !== byMeta) throw new Error("Price ID and offer tag disagree.");
  const key = byPrice ?? byMeta;
  if (!key) throw new Error("Payment does not match a supported EG Studio price or offer tag.");
  return PACKAGES[key];
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar date in America/Los_Angeles for a unix timestamp (seconds). */
export function pacificDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(unixSeconds * 1000));
}

export function clientDisplayName(name: string | null | undefined, email: string): string {
  const n = (name || "").trim();
  if (n) return n.slice(0, 80);
  return email.split("@")[0].slice(0, 80);
}

export function firstName(name: string | null | undefined): string {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : "";
}

export function safeFolderPart(s: string): string {
  return s.replace(/[\\/:*?"<>|\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

export function jobFolderName(client: string, pkg: Pkg, date: string, test: boolean): string {
  return "[EG] " + (test ? "TEST - " : "") + safeFolderPart(client) + " | " + pkg.name + " (" + pkg.clips + " clips) | " + date;
}

// ---- Stripe signature verification (Stripe-Signature: t=...,v1=...) ----
function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + rawBody)));
  return sigs.some((s) => timingSafeEqual(s, expected));
}

// ---- Welcome email ----
export function welcomeEmail(opts: { first: string; pkg: Pkg; uploadUrl: string; lockedEmail: string }) {
  const hi = opts.first ? "Hi " + opts.first + "," : "Hi,";
  const timing = opts.pkg.key === "sprint"
    ? "We deliver within 30 days."
    : "We deliver 3-5 business days after we confirm your files.";
  const subject = "Payment received - upload your footage";
  const text =
    hi + "\n\n" +
    "Payment received for your " + opts.pkg.label + ".\n\n" +
    "Upload your footage here:\n" + opts.uploadUrl + "\n" +
    "Open the link with the Google account for " + opts.lockedEmail + ".\n\n" +
    "That's it. " + timing + "\n\n" +
    "Reply to this email if anything won't upload.\n\n" +
    "EG Studio\nops@egstudio.tech\n";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html =
    "<p>" + esc(hi) + "</p>" +
    "<p>Payment received for your " + esc(opts.pkg.label) + ".</p>" +
    '<p>Upload your footage here:<br><a href="' + esc(opts.uploadUrl) + '">' + esc(opts.uploadUrl) + "</a><br>" +
    "Open the link with the Google account for " + esc(opts.lockedEmail) + ".</p>" +
    "<p>That's it. " + esc(timing) + "</p>" +
    "<p>Reply to this email if anything won't upload.</p>" +
    "<p>EG Studio<br>ops@egstudio.tech</p>";
  return { subject, text, html };
}
