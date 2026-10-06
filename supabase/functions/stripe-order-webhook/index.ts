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

function stripeHeaders(contentType = false) {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  return {
    "Authorization": "Bearer " + key,
    ...(contentType ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
  };
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

async function retrieveStripeEvent(eventId: string) {
  const r = await fetch("https://api.stripe.com/v1/events/" + encodeURIComponent(eventId), {
    headers: stripeHeaders(),
  });
  if (!r.ok) throw new Error("Stripe event verification failed.");
  return await r.json();
}

async function getOrder(sessionId: string) {
  const url = Deno.env.get("SUPABASE_URL") + "/rest/v1/orders?stripe_session_id=eq." +
    encodeURIComponent(sessionId) + "&select=*";
  const r = await fetch(url, { headers: restHeaders() });
  if (!r.ok) throw new Error("Order lookup failed.");
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
  if (!r.ok) throw new Error("Order insert failed: " + r.status);
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
  if (Deno.env.get("SEND_PROJECT_BRIEF_EMAIL") === "false") return;
  if (!session.livemode || order.confirmation_status === "sent" || order.confirmation_status === "sending") return;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INTAKE_FROM_EMAIL");
  if (!apiKey || !from) {
    await patchOrder(order.id, {
      confirmation_status: "not_configured",
      confirmation_error: "Resend secrets are not configured.",
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const email = String(session.customer_details?.email || session.customer_email || "").toLowerCase();
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
}

Deno.serve(async (req: Request) => {

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Stripe is not configured." }, 503);

  const body = await req.text();
  if (body.length > 1_000_000) return json({ error: "Payload too large." }, 413);

  let incoming: any;
  try {
    incoming = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const eventId = typeof incoming?.id === "string" ? incoming.id : "";
  if (!/^evt_[A-Za-z0-9_]+$/.test(eventId)) return json({ error: "Invalid Stripe event id." }, 400);

  let event: any;
  try {
    event = await retrieveStripeEvent(eventId);
  } catch {
    return json({ error: "Stripe event could not be verified." }, 400);
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return json({ received: true, ignored: true });
  }

  const session: any = event.data?.object;
  if (!session || session.object !== "checkout.session") return json({ error: "Unexpected Stripe event object." }, 400);
  if (session.payment_status !== "paid") return json({ received: true, ignored: true });

  const configured = OFFER_MAP[session.metadata?.offer];
  if (!configured) return json({ error: "Unknown EG Studio offer." }, 400);
  if (session.amount_total !== configured.amount || session.currency !== "usd") {
    return json({ error: "Paid amount does not match the offer." }, 400);
  }

  const email = session.customer_details?.email || session.customer_email;
  if (!email) return json({ error: "Paid order has no customer email." }, 400);

  try {
    let order = await getOrder(session.id);
    if (!order) {
      order = await insertOrder({
        stripe_session_id: session.id,
        stripe_event_id: event.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        offer: configured.sku,
        amount_total: configured.amount,
        currency: "usd",
        customer_email: String(email).toLowerCase(),
        customer_name: session.customer_details?.name || null,
        payment_status: "paid",
        fulfillment_status: "paid",
        environment: session.livemode ? "live" : "test",
        payment_verified_at: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        confirmation_status: session.livemode ? "pending" : "not_configured",
        drive_folder_status: "waiting_for_intake",
        updated_at: new Date().toISOString(),
      });
      if (!order) order = await getOrder(session.id);
    } else {
      await patchOrder(order.id, {
        stripe_event_id: event.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : order.stripe_payment_intent_id,
        updated_at: new Date().toISOString(),
      });
      order = await getOrder(session.id);
    }

    if (!order) throw new Error("Paid order could not be created.");
    await sendConfirmation(order, session, configured);

    return json({ received: true, order_id: order.id });
  } catch (error) {
    console.error("stripe-order-webhook:", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});