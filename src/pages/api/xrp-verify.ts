import type { APIRoute } from 'astro';
import * as xrpl from 'xrpl';
import { getSessionFromCookie } from '../../lib/auth';
import { pendingPayments } from './xrp-checkout';

const XRP_ADDRESS = import.meta.env.XRP_RECEIVE_ADDRESS || '';
const XRP_NODE_URL = import.meta.env.XRP_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const API_URL = import.meta.env.API_URL || 'https://s1.xrplmesh.com';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

export const POST: APIRoute = async ({ request }) => {
  const session = getSessionFromCookie(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const { destinationTag } = await request.json();
  if (!destinationTag) {
    return new Response(JSON.stringify({ error: 'missing_destination_tag' }), { status: 400 });
  }

  const pending = pendingPayments.get(destinationTag);
  if (!pending) {
    return new Response(JSON.stringify({ error: 'payment_not_found_or_expired' }), { status: 404 });
  }

  if (pending.owner !== session.email) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 403 });
  }

  // Check on-chain for payment
  const client = new xrpl.Client(XRP_NODE_URL);
  try {
    await client.connect();

    // Get recent transactions to our address
    const resp = await client.request({
      command: 'account_tx',
      account: XRP_ADDRESS,
      limit: 50,
    });

    // Find matching payment
    const match = resp.result.transactions.find((t: any) => {
      const tx = t.tx_json || t.tx;
      if (!tx || tx.TransactionType !== 'Payment') return false;
      if (tx.Destination !== XRP_ADDRESS) return false;
      if (tx.DestinationTag !== destinationTag) return false;
      if (t.meta?.TransactionResult !== 'tesSUCCESS' && t.meta?.TransactionResult !== undefined) return false;
      // Check delivered amount (use meta.delivered_amount to prevent partial payment exploit)
      const delivered = typeof t.meta?.delivered_amount === 'string'
        ? parseInt(t.meta.delivered_amount)
        : parseInt(t.meta?.delivered_amount?.value || '0');
      return delivered >= pending.amount;
    });

    await client.disconnect();

    if (!match) {
      return new Response(JSON.stringify({ verified: false, message: 'Payment not found yet' }), { status: 200 });
    }

    // Payment verified - activate or create key
    let key = pending.existingKey;
    if (!key) {
      // Create new key
      const createResp = await fetch(`${API_URL}/admin/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
        body: JSON.stringify({ plan: pending.plan, owner: pending.owner, label: `${pending.name}'s endpoint` }),
        signal: AbortSignal.timeout(5000),
      });
      if (createResp.ok) {
        const data = await createResp.json();
        key = data.key;
      }
    } else {
      // Upgrade existing key
      await fetch(`${API_URL}/admin/keys`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
        body: JSON.stringify({ key, plan: pending.plan, active: true }),
        signal: AbortSignal.timeout(5000),
      });
    }

    // Clean up pending payment
    pendingPayments.delete(destinationTag);

    const txHash = (match.tx_json || match.tx)?.hash || match.hash;
    return new Response(JSON.stringify({
      verified: true,
      txHash,
      plan: pending.plan,
      key,
    }), { status: 200 });

  } catch (e: any) {
    try { await client.disconnect(); } catch {}
    return new Response(JSON.stringify({ error: 'verification_failed', message: e.message }), { status: 500 });
  }
};
