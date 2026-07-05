import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { getSessionFromCookie } from '../../lib/auth';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const API_URL = import.meta.env.API_URL || 'https://s1.xrpl.stream';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

async function findKeyBySubscription(subscriptionId: string): Promise<any> {
  try {
    const resp = await fetch(`${API_URL}/admin/keys`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const keys = await resp.json();
    return keys.find((k: any) => k.stripeSubscriptionId === subscriptionId) || null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ request }) => {
  if (!stripe) {
    return new Response(JSON.stringify({ error: 'billing_not_configured' }), { status: 503 });
  }

  const session = getSessionFromCookie(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'missing_session_id' }), { status: 400 });
  }

  let checkoutSession: Stripe.Checkout.Session;
  try {
    checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return new Response(JSON.stringify({ error: 'session_not_found' }), { status: 404 });
  }

  if (checkoutSession.metadata?.owner !== session.email) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 403 });
  }

  if (checkoutSession.payment_status !== 'paid') {
    return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
  }

  const plan = checkoutSession.metadata?.plan || 'builder';
  const owner = checkoutSession.metadata?.owner || '';
  const name = checkoutSession.metadata?.name || '';
  let key = checkoutSession.metadata?.api_key || '';
  const subscriptionId = typeof checkoutSession.subscription === 'string'
    ? checkoutSession.subscription
    : (checkoutSession.subscription as any)?.id;

  // Idempotency: check if this subscription was already fulfilled
  if (subscriptionId) {
    const existing = await findKeyBySubscription(subscriptionId);
    if (existing) {
      return new Response(JSON.stringify({ status: 'paid', plan: existing.plan, key: existing.key, fulfilled: true }), { status: 200 });
    }
  }

  // Webhook hasn't fulfilled yet — do it now
  if (!key) {
    try {
      const resp = await fetch(`${API_URL}/admin/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
        body: JSON.stringify({ plan, owner, label: name ? `${name}'s endpoint` : '' }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        key = data.key;
      }
    } catch {}
  }

  if (key) {
    try {
      await fetch(`${API_URL}/admin/keys`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
        body: JSON.stringify({
          key,
          active: true,
          plan,
          ...(checkoutSession.customer && { stripeCustomerId: checkoutSession.customer }),
          ...(subscriptionId && { stripeSubscriptionId: subscriptionId }),
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }

  return new Response(JSON.stringify({ status: 'paid', plan, key, fulfilled: true }), { status: 200 });
};
