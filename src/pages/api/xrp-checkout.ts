import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/auth';

const XRP_ADDRESS = import.meta.env.XRP_RECEIVE_ADDRESS || '';
const API_URL = import.meta.env.API_URL || 'https://s1.xrplmesh.com';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';
const XRP_NETWORK = import.meta.env.XRP_NETWORK || 'testnet';

// XRP prices per plan (in drops, 1 XRP = 1,000,000 drops)
const XRP_PRICES: Record<string, number> = {
  builder: 50_000_000,  // 50 XRP
  pro: 130_000_000,     // 130 XRP
  scale: 330_000_000,   // 330 XRP
};

// In-memory pending payments (destination_tag -> payment info)
// In production, persist to DB
const pendingPayments = new Map<number, {
  plan: string;
  owner: string;
  name: string;
  amount: number;
  created: number;
  existingKey: string;
}>();

// Clean expired payments (15 min TTL)
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [tag, p] of pendingPayments) {
    if (p.created < cutoff) pendingPayments.delete(tag);
  }
}, 60_000);

export { pendingPayments, XRP_PRICES };

export const POST: APIRoute = async ({ request }) => {
  if (!XRP_ADDRESS) {
    return new Response(JSON.stringify({ error: 'xrp_not_configured' }), { status: 503 });
  }

  const session = getSessionFromCookie(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'login_required', redirect: '/api/auth/login' }), { status: 401 });
  }

  const { plan } = await request.json();
  const amount = XRP_PRICES[plan];
  if (!amount) {
    return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400 });
  }

  // Check for existing key
  let existingKey = '';
  try {
    const keysResp = await fetch(`${API_URL}/admin/keys`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (keysResp.ok) {
      const allKeys = await keysResp.json();
      const existing = allKeys.find((k: any) => k.owner === session.email && k.active);
      if (existing) existingKey = existing.key;
    }
  } catch {}

  // Generate unique destination tag
  const destinationTag = Math.floor(Math.random() * 4_294_967_295);

  pendingPayments.set(destinationTag, {
    plan,
    owner: session.email,
    name: session.name,
    amount,
    created: Date.now(),
    existingKey,
  });

  return new Response(JSON.stringify({
    address: XRP_ADDRESS,
    destinationTag,
    amount: amount / 1_000_000, // XRP (not drops)
    amountDrops: amount,
    plan,
    network: XRP_NETWORK,
    expiresIn: 900, // 15 minutes
  }), { status: 200 });
};
