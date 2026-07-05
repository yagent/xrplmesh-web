import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/auth';

const XRP_ADDRESS = import.meta.env.XRP_RECEIVE_ADDRESS || '';
const API_URL = import.meta.env.API_URL || 'https://s1.xrpl.stream';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';
const XRP_NETWORK = import.meta.env.XRP_NETWORK || 'testnet';

// USD prices per plan (must match pricing.astro / dashboard.astro)
const USD_PRICES: Record<string, number> = {
  builder: 39,
  pro: 149,
  scale: 299,
  enterprise: 699,
};

let cachedXrpPrice = { usd: 0, ts: 0 };

async function getXrpUsdPrice(): Promise<number> {
  if (cachedXrpPrice.usd > 0 && Date.now() - cachedXrpPrice.ts < 5 * 60_000) {
    return cachedXrpPrice.usd;
  }
  try {
    const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd', {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json() as { ripple?: { usd?: number } };
    const price = data?.ripple?.usd;
    if (price && price > 0) {
      cachedXrpPrice = { usd: price, ts: Date.now() };
      return price;
    }
  } catch {}
  return cachedXrpPrice.usd || 0;
}

function getXrpDropsForPlan(plan: string, xrpUsd: number): number {
  const usd = USD_PRICES[plan];
  if (!usd || !xrpUsd) return 0;
  const xrp = Math.ceil(usd / xrpUsd);
  return xrp * 1_000_000;
}

// Keep static export for xrp-verify (it only needs the pending map)
const XRP_PRICES: Record<string, number> = {};

import fs from 'node:fs';
import path from 'node:path';

type PendingPayment = {
  plan: string;
  owner: string;
  name: string;
  amount: number;
  created: number;
  existingKey: string;
};

const PENDING_FILE = path.join(process.cwd(), '.xrp-pending-payments.json');

function loadPending(): Map<number, PendingPayment> {
  try {
    const data = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    const map = new Map<number, PendingPayment>();
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of Object.entries(data)) {
      const p = v as PendingPayment;
      if (p.created >= cutoff) map.set(Number(k), p);
    }
    return map;
  } catch {
    return new Map();
  }
}

function savePending(map: Map<number, PendingPayment>) {
  const obj: Record<string, PendingPayment> = {};
  for (const [k, v] of map) obj[String(k)] = v;
  try { fs.writeFileSync(PENDING_FILE, JSON.stringify(obj)); } catch {}
}

const pendingPayments = loadPending();

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  let changed = false;
  for (const [tag, p] of pendingPayments) {
    if (p.created < cutoff) { pendingPayments.delete(tag); changed = true; }
  }
  if (changed) savePending(pendingPayments);
}, 60_000);

export { pendingPayments, savePending, XRP_PRICES };

export const POST: APIRoute = async ({ request }) => {
  if (!XRP_ADDRESS) {
    return new Response(JSON.stringify({ error: 'xrp_not_configured' }), { status: 503 });
  }

  const session = getSessionFromCookie(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'login_required', redirect: '/login' }), { status: 401 });
  }

  const { plan } = await request.json();
  if (!USD_PRICES[plan]) {
    return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400 });
  }

  const xrpUsd = await getXrpUsdPrice();
  if (!xrpUsd) {
    return new Response(JSON.stringify({ error: 'xrp_price_unavailable' }), { status: 503 });
  }

  const amount = getXrpDropsForPlan(plan, xrpUsd);

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
  savePending(pendingPayments);

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
