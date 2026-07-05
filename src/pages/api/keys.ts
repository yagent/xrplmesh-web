import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/auth';

const API_URL = import.meta.env.API_URL || 'http://127.0.0.1:9000';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

export const POST: APIRoute = async ({ request }) => {
  const session = getSessionFromCookie(request);
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const { plan = 'free' } = await request.json();

  // Check existing keys for this user
  const keysResp = await fetch(`${API_URL}/admin/keys`, {
    headers: { 'X-Proxy-Token': ADMIN_TOKEN },
    signal: AbortSignal.timeout(5000),
  });

  if (keysResp.ok) {
    const allKeys = await keysResp.json();
    const userKeys = allKeys.filter((k: any) => k.owner === session.email);

    // Max 5 keys per account
    if (userKeys.length >= 5) {
      return new Response(JSON.stringify({ error: 'Maximum 5 keys per account' }), { status: 400 });
    }

    // Max 1 free key per account
    if (plan === 'free' && userKeys.some((k: any) => k.plan === 'free' && k.active)) {
      return new Response(JSON.stringify({ error: 'Only 1 free key per account. Upgrade to create more.' }), { status: 400 });
    }
  }

  const resp = await fetch(`${API_URL}/admin/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Proxy-Token': ADMIN_TOKEN },
    body: JSON.stringify({ plan, owner: session.email, label: `${session.name}'s key` }),
  });

  return new Response(await resp.text(), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
};
