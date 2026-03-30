import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { getSessionFromCookie } from '../../lib/auth';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
const SITE_URL = import.meta.env.SITE_URL || 'https://xrplmesh.com';
const API_URL = import.meta.env.API_URL || 'https://s1.xrplmesh.com';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

const PRICE_MAP: Record<string, string> = {
  builder: 'price_1TFxtmKGdeOOrl7Lv5wrxwY8',
  pro: 'price_1TFxtnKGdeOOrl7LgxFEmdlR',
  scale: 'price_1TFxtoKGdeOOrl7LiTo6TayY',
};

export const POST: APIRoute = async ({ request }) => {
  const session = getSessionFromCookie(request);
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!stripe) return new Response(JSON.stringify({ error: 'billing_not_configured' }), { status: 503 });

  const { plan, key } = await request.json();
  const priceId = PRICE_MAP[plan];
  if (!priceId) return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400 });

  // Verify key belongs to this user
  try {
    const keysResp = await fetch(`${API_URL}/admin/keys`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (keysResp.ok) {
      const allKeys = await keysResp.json();
      const match = allKeys.find((k: any) => k.key === key && k.owner === session.email);
      if (!match) return new Response(JSON.stringify({ error: 'key_not_found' }), { status: 403 });
    }
  } catch {}

  // Reuse existing Stripe customer
  let customer: string | undefined;
  try {
    const customers = await stripe.customers.list({ email: session.email, limit: 1 });
    if (customers.data.length > 0) customer = customers.data[0].id;
  } catch {}

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    ...(customer ? { customer } : { customer_email: session.email }),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { api_key: key, plan, email: session.email },
    success_url: `${SITE_URL}/dashboard?upgraded=${plan}`,
    cancel_url: `${SITE_URL}/dashboard`,
  });

  return new Response(JSON.stringify({ url: checkoutSession.url }), { status: 200 });
};
