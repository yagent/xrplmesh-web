import type { APIRoute } from 'astro';
import Stripe from 'stripe';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const API_URL = import.meta.env.API_URL || 'https://s1.xrplmesh.com';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

async function patchKey(body: Record<string, unknown>) {
  return fetch(`${API_URL}/admin/keys`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

async function findKeyBySubscription(subscriptionId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${API_URL}/admin/keys`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const keys = await resp.json();
    const match = keys.find((k: any) => k.stripeSubscriptionId === subscriptionId);
    return match?.key || null;
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!stripe) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  if (WEBHOOK_SECRET) {
    const sig = request.headers.get('stripe-signature') || '';
    try {
      event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 400 });
    }
  } else {
    // No webhook secret = reject (don't accept unsigned events)
    return new Response(JSON.stringify({ error: 'webhook_secret_not_configured' }), { status: 503 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const key = session.metadata?.api_key;
    const plan = session.metadata?.plan;
    if (key) {
      await patchKey({
        key,
        active: true,
        ...(plan && { plan }),
        ...(session.customer && { stripeCustomerId: session.customer }),
        ...(session.subscription && { stripeSubscriptionId: session.subscription }),
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const key = await findKeyBySubscription(sub.id);
    if (key) {
      await patchKey({ key, active: false });
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const key = await findKeyBySubscription(sub.id);
    if (key && sub.status !== 'active' && sub.status !== 'trialing') {
      // past_due, unpaid, canceled, incomplete_expired
      await patchKey({ key, active: false });
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (subId) {
      const key = await findKeyBySubscription(subId);
      if (key) {
        await patchKey({ key, active: false });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};
