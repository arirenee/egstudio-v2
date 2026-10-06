import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OFFER_MAP: Record<string, { sku: "episode" | "test" | "sprint"; amount: number; label: string; intakeUrl: string }> = {
  episode_to_shorts: { sku: "episode", amount: 19900, label: "Episode-to-Shorts", intakeUrl: "https://egstudio.tech/payment-confirmed.html" },
  starter: { sku: "test", amount: 30000, label: "3-Clip Starter", intakeUrl: "https://egstudio.tech/payment-confirmed.html" },
  paid_test: { sku: "test", amount: 30000, label: "3-Clip Starter", intakeUrl: "https://egstudio.tech/payment-confirmed.html" },
  sprint: { sku: "sprint", amount: 150000, label: "15-video Sprint", intakeUrl: "https://egstudio.tech/thanks.html" },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function stripeHeaders() {
  return { "Authorization": "Bearer " + (Deno.env.get("STRIPE_SECRET_KEY") || "") };
}

function restHeaders(extra: Record<string, string> = {}) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return {
    "apikey": key,
    "Authorization": "Bearer " + key,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Token lives in Supabase Vault (name: eg_scan_token). Checked via a service-role-only SQL function; never stored in code.
async function scanTokenValid(token: string | null): Promise<boolean> {
  if (!token) return false;
  const r = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/verify_scan_token", {
    method: "POST", headers: restHeaders(), body: JSON.stringify({ p_token: token }),
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

async function getOrder(sessionId: string) {
  const url = Deno.env.get("SUPABASE_URL") + "/rest/v1/orders?stripe_session_id=eq." +
    encodeURIComponent(sessionId) + "&select=*";
  const r = await fetch(url, { headers: restHeaders() });
  if (!r.ok) throw new Error("Order lookup failed: " + r.status);
  const rows = await r.json();
  return rows[0] || null;
}

async function insertOrder(record: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL") + "/rest/v1/orders";
  const r = await fetch(url, {
    method: "POST",
    headers: restHeaders({ "Prefer": "return=representation" }),
    body: JSON.stringify(record),
  });
  if (r.status === 409) return null;
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 500);
    throw new Error("Order insert failed: " + r.status + " " + detail);
  }
  const rows = await r.json();
  return rows[0] || null;
}

async function patchOrder(id: string, values: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL") + "/rest/v1/orders?id=eq." + encodeURIComponent(id);
  const r = await fetch(url, {
    method: "PATCH",
    headers: restHeaders(),
    body: JSON.stringify(values),
  });
  if (!r.ok) throw new Error("Order update failed: " + r.status);
}

async function sendConfirmation(order: any, session: any, offer: any) {
  // Old "Payment received" email: ON by default. Set secret SEND_PROJECT_BRIEF_EMAIL=false to turn it off once client-onboarding is proven.
  if (Deno.env.get("SEND_PROJECT_BRIEF_EMAIL") === "false") return false;
  if (!session.livemode || order.confirmation_status === "sent" || order.confirmation_status === "sending") {
    return false;
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INTAKE_FROM_EMAIL");
  if (!apiKey || !from) {
    await patchOrder(order.id, {
      confirmation_status: "not_configured",
      confirmation_error: "Resend secrets are not configured.",
      updated_at: new Date().toISOString(),
    });
    return false;
  }

  const email = String(session.customer_details?.email || session.customer_email || "").toLowerCase();
  if (!email) return false;

  const briefUrl = offer.intakeUrl + "?session_id=" + encodeURIComponent(session.id);
  const html =
    "<p>Payment received for your <strong>" + offer.label + "</strong>.</p>" +
    "<p>Send the project brief and source links here:</p>" +
    '<p><a href="' + briefUrl + '">Complete your EG Studio project brief</a></p>' +
    "<p>Once the brief and source files are usable, we can start.</p>" +
    "<p>EG Studio<br>ops@egstudio.tech</p>";

  await patchOrder(order.id, {
    confirmation_status: "sending",
    confirmation_error: null,
    updated_at: new Date().toISOString(),
  });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: "ops@egstudio.tech",
      subject: "Payment received — EG Studio",
      html,
    }),
  });

  if (!r.ok) {
    const detail = (await r.text()).slice(0, 500);
    await patchOrder(order.id, {
      confirmation_status: "failed",
      confirmation_error: "Resend HTTP " + r.status + ": " + detail,
      updated_at: new Date().toISOString(),
    });
    throw new Error("Confirmation email failed.");
  }

  await patchOrder(order.id, {
    confirmation_status: "sent",
    confirmation_error: null,
    confirmation_sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return true;
}

async function listRecentCompletedSessions() {
  const sessions: any[] = [];
  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  let startingAfter = "";
  let page = 0;

  while (page < 10) {
    const params = new URLSearchParams({
      limit: "100",
      status: "complete",
      "created[gte]": String(since),
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions?" + params.toString(), {
      headers: stripeHeaders(),
    });

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 800);
      throw new Error("Stripe Checkout list failed: " + r.status + " " + detail);
    }

    const payload = await r.json();
    const data = Array.isArray(payload.data) ? payload.data : [];
    sessions.push(...data);

    if (!payload.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
    page += 1;
  }

  return sessions;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!(await scanTokenValid(req.headers.get("x-eg-scan-token")))) return json({ error: "Unauthorized." }, 401);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Stripe is not configured." }, 503);

  try {
    const sessions = await listRecentCompletedSessions();
    let eligible = 0;
    let created = 0;
    let confirmed = 0;
    const errors: string[] = [];

    for (const session of sessions) {
      try {
        if (session.payment_status !== "paid") continue;
        const configured = OFFER_MAP[session.metadata?.offer];
        if (!configured) continue;
        if (session.amount_total !== configured.amount || session.currency !== "usd") continue;

        const email = session.customer_details?.email || session.customer_email;
        if (!email) continue;
        eligible += 1;

        let order = await getOrder(session.id);
        if (!order) {
          order = await insertOrder({
            stripe_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            offer: configured.sku,
            amount_total: configured.amount,
            currency: "usd",
            customer_email: String(email).toLowerCase(),
            customer_name: session.customer_details?.name || null,
            payment_status: "paid",
            fulfillment_status: "paid",
            environment: session.livemode ? "live" : "test",
            payment_verified_at: new Date().toISOString(),
            confirmation_status: session.livemode ? "pending" : "not_configured",
            drive_folder_status: "waiting_for_intake",
            updated_at: new Date().toISOString(),
          });

          if (!order) order = await getOrder(session.id);
          if (order) created += 1;
        }

        if (!order) throw new Error("Order could not be created.");
        if (await sendConfirmation(order, session, configured)) confirmed += 1;
      } catch (error) {
        console.error("stripe-order-scan session:", session?.id, error);
        errors.push(String(session?.id || "unknown") + ": " + (error instanceof Error ? error.message : "failed"));
      }
    }

    return json({
      ok: errors.length === 0,
      scanned: sessions.length,
      eligible,
      created,
      confirmed,
      errors: errors.slice(0, 10),
    }, errors.length === 0 ? 200 : 207);
  } catch (error) {
    console.error("stripe-order-scan:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Scan failed." }, 500);
  }
});