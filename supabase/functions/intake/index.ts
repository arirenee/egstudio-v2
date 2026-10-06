import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://arirenee.github.io",
  "https://egstudio.tech",
  "https://www.egstudio.tech",
]);

const OFFER_MAP = {
  episode_to_shorts: { sku: "episode", amount: 19900, label: "Episode-to-Shorts" },
  starter: { sku: "test", amount: 30000, label: "3-Clip Starter" },
  paid_test: { sku: "test", amount: 30000, label: "3-Clip Starter" },
  sprint: { sku: "sprint", amount: 150000, label: "15-video Sprint" },
};

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://egstudio.tech";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeUrl(value: unknown, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  if (typeof value !== "string" || value.length > 2000) throw new Error("Invalid URL.");
  const u = new URL(value);
  if (u.protocol !== "https:") throw new Error("Only HTTPS links are accepted.");
  return u.toString();
}

function cleanText(value: unknown, max: number, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  if (typeof value !== "string") throw new Error("Invalid text.");
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error("Required field is missing.");
  if (cleaned.length > max) throw new Error("Field is too long.");
  return cleaned || null;
}

async function verifyStripeSession(sessionId: string) {
  if (!/^cs_(test_)?[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid Stripe session.");
  const isTest = sessionId.startsWith("cs_test_");
  const stripeKey = Deno.env.get(isTest ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error(isTest ? "Test payment verification is not configured." : "Payment verification is not configured.");

  const response = await fetch(
    "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
    { headers: { Authorization: "Bearer " + stripeKey } },
  );

  if (!response.ok) throw new Error("Payment could not be verified.");

  const session = await response.json();
  if (session.status !== "complete" || session.payment_status !== "paid") {
    throw new Error("Stripe does not show this order as paid.");
  }

  const offerKey = session.metadata?.offer;
  const configured = OFFER_MAP[offerKey as keyof typeof OFFER_MAP];
  if (!configured) throw new Error("Unknown EG Studio offer.");
  if (session.amount_total !== configured.amount || session.currency !== "usd") {
    throw new Error("Paid amount does not match the offer.");
  }

  const email = session.customer_details?.email || session.customer_email;
  if (!email || typeof email !== "string") throw new Error("Paid order has no customer email.");

  return {
    session,
    sku: configured.sku,
    orderLabel: configured.label,
    amount: configured.amount,
    amountDisplay: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(configured.amount / 100),
    email,
    environment: sessionId.startsWith("cs_test_") ? "test" : "live",
  };
}



async function ensureOrder(supabase: any, paid: any) {
  const { data: existing, error: lookupError } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_session_id", paid.session.id)
    .maybeSingle();

  if (lookupError) throw new Error("Could not check the paid order.");
  if (existing) return existing;

  const record = {
    stripe_session_id: paid.session.id,
    stripe_payment_intent_id: typeof paid.session.payment_intent === "string" ? paid.session.payment_intent : null,
    offer: paid.sku,
    amount_total: paid.amount,
    currency: "usd",
    customer_email: paid.email.toLowerCase(),
    customer_name: paid.session.customer_details?.name || null,
    payment_status: "paid",
    fulfillment_status: "paid",
    environment: paid.environment,
    payment_verified_at: new Date().toISOString(),
    confirmation_status: paid.environment === "live" ? "pending" : "not_configured",
    drive_folder_status: "waiting_for_intake",
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from("orders")
    .insert(record)
    .select("*")
    .single();

  if (!error && inserted) return inserted;

  const { data: raced } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_session_id", paid.session.id)
    .maybeSingle();

  if (raced) return raced;
  throw new Error("Could not create the paid order.");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendIntakeNotification(record: any) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INTAKE_FROM_EMAIL");
  if (!apiKey || !from || record.environment !== "live") {
    return { configured: false, sent: false, error: "Notification secrets are not configured." };
  }

  const offerLabel = record.offer === "episode" ? "Episode-to-Shorts" : record.offer === "test" ? "3-Clip Starter" : "15-video Sprint";
  const subject = "New paid EG Studio brief — " + record.project_name;
  const optionalBrand = record.brand_assets_url
    ? '<p><strong>Brand assets:</strong> <a href="' + escapeHtml(record.brand_assets_url) + '">' + escapeHtml(record.brand_assets_url) + "</a></p>"
    : "";
  const optionalAvoid = record.avoid_notes
    ? "<p><strong>Avoid:</strong> " + escapeHtml(record.avoid_notes) + "</p>"
    : "";

  const html =
    "<h2>New paid project brief</h2>" +
    "<p><strong>Offer:</strong> " + escapeHtml(offerLabel) + "</p>" +
    "<p><strong>Project:</strong> " + escapeHtml(record.project_name) + "</p>" +
    "<p><strong>Customer:</strong> " + escapeHtml(record.customer_email) + "</p>" +
    (record.source_url
      ? '<p><strong>Source:</strong> <a href="' + escapeHtml(record.source_url) + '">' + escapeHtml(record.source_url) + "</a></p>"
      : "<p><strong>Source:</strong> client uploads to their Drive link (see EG Client Jobs in Notion)</p>") +
    optionalBrand +
    '<p><strong>Style reference:</strong> <a href="' + escapeHtml(record.style_reference_url) + '">' + escapeHtml(record.style_reference_url) + "</a></p>" +
    optionalAvoid +
    "<p><strong>Rights confirmed:</strong> yes</p>" +
    "<p><strong>Stripe session:</strong> " + escapeHtml(record.stripe_session_id) + "</p>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: ["ops@egstudio.tech"],
      reply_to: record.customer_email,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Intake notification failed:", response.status, detail.slice(0, 500));
    return { configured: true, sent: false, error: "Resend HTTP " + response.status + ": " + detail.slice(0, 500) };
  }
  return { configured: true, sent: true, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (req.method === "GET") {
      const sessionId = new URL(req.url).searchParams.get("session_id") || "";
      const paid = await verifyStripeSession(sessionId);
      await ensureOrder(supabase, paid);
      return json(req, {
        paid: true,
        sku: paid.sku,
        order_label: paid.orderLabel,
        amount_display: paid.amountDisplay,
        amount_value: paid.amount / 100,
      });
    }

    if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
    const body = await req.json();

    if (typeof body.website === "string" && body.website.trim()) {
      return json(req, { ok: true });
    }

    const paid = await verifyStripeSession(String(body.session_id || ""));
    if (body.expected_sku !== paid.sku) throw new Error("Order type does not match the paid checkout.");
    const order = await ensureOrder(supabase, paid);

    const notificationConfigured =
      Boolean(Deno.env.get("RESEND_API_KEY")) &&
      Boolean(Deno.env.get("INTAKE_FROM_EMAIL"));

    const record = {
      order_id: order.id,
      stripe_session_id: paid.session.id,
      offer: paid.sku,
      amount_total: paid.amount,
      currency: "usd",
      customer_email: paid.email.toLowerCase(),
      project_name: cleanText(body.project_name, 120, true),
      source_url: safeUrl(body.source_url, false), // optional now: client uploads to the Drive link from the welcome email
      brand_assets_url: safeUrl(body.brand_assets_url, false),
      style_reference_url: safeUrl(body.style_reference_url, true),
      avoid_notes: cleanText(body.avoid_notes, 1200, false),
      rights_confirmed: body.rights_confirmed === true,
      notification_status: paid.environment === "live" && notificationConfigured ? "pending" : "not_configured",
      environment: paid.environment,
    };

    if (!record.rights_confirmed) throw new Error("Rights confirmation is required.");

    const { data: existing } = await supabase
      .from("intake_submissions")
      .select("id,order_id")
      .eq("stripe_session_id", record.stripe_session_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("orders")
        .update({
          fulfillment_status: "intake_received",
          intake_received_at: new Date().toISOString(),
          drive_folder_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      return json(req, { ok: true, duplicate: true });
    }

    const { data: inserted, error } = await supabase
      .from("intake_submissions")
      .insert(record)
      .select("id")
      .single();
    if (error || !inserted) throw new Error("The brief could not be saved.");

    await supabase
      .from("orders")
      .update({
        fulfillment_status: "intake_received",
        intake_received_at: new Date().toISOString(),
        drive_folder_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (record.environment === "live") {
      try {
        const notification = await sendIntakeNotification(record);
        if (notification.configured) {
          await supabase
            .from("intake_submissions")
            .update({ notification_status: notification.sent ? "sent" : "failed", notification_error: notification.error })
            .eq("id", inserted.id);
        }
      } catch (notifyError) {
        console.error("Intake notification exception:", notifyError);
        await supabase
          .from("intake_submissions")
          .update({ notification_status: "failed", notification_error: notifyError instanceof Error ? notifyError.message.slice(0, 500) : "Notification exception." })
          .eq("id", inserted.id);
      }
    }

    return json(req, { ok: true });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Request failed." }, 400);
  }
});