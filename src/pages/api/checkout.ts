import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { getSessionFromCookie } from '../../lib/auth';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const API_URL = import.meta.env.API_URL || 'https://s1.xrplmesh.com';
const SITE_URL = import.meta.env.SITE_URL || 'https://xrplmesh.com';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

const PRICE_MAP: Record<string, string> = {
  builder: 'price_1TFxtmKGdeOOrl7Lv5wrxwY8',
  pro: 'price_1TFxtnKGdeOOrl7LgxFEmdlR',
  scale: 'price_1TFxtoKGdeOOrl7LiTo6TayY',
};

export const POST: APIRoute = async ({ request }) => {
  if (!stripe) {
    return new Response(JSON.stringify({ error: 'billing_not_configured' }), { status: 503 });
  }

  // Require login
  const session = getSessionFromCookie(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'login_required', redirect: '/api/auth/login' }), { status: 401 });
  }

  const { plan } = await request.json();
  const priceId = PRICE_MAP[plan];
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400 });
  }

  // Check if user already has an active key — upgrade it instead of creating a new one
  let key = '';
  try {
    const keysResp = await fetch(`${API_URL}/admin/keys`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (keysResp.ok) {
      const allKeys = await keysResp.json();
      const existing = allKeys.find((k: any) => k.owner === session.email && k.active);
      if (existing) key = existing.key;
    }
  } catch {}

  // Create key if user doesn't have one
  if (!key) {
    const keyResp = await fetch(`${API_URL}/admin/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
      body: JSON.stringify({ plan, owner: session.email, label: `${session.name}'s endpoint` }),
    });
    const data = await keyResp.json();
    key = data.key;

    // Set inactive until payment completes
    await fetch(`${API_URL}/admin/keys`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
      body: JSON.stringify({ key, active: false }),
    });
  }

  // Create Stripe checkout session with user's email pre-filled
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: session.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { api_key: key, plan, owner: session.email },
    success_url: `${SITE_URL}/dashboard`,
    cancel_url: `${SITE_URL}/#pricing`,
  });

  return new Response(JSON.stringify({ url: checkoutSession.url }), { status: 200 });
};
