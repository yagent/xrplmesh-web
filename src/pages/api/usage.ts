import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/auth';

const API_URL = import.meta.env.API_URL || 'https://s1.xrplmesh.com';
const ADMIN_TOKEN = import.meta.env.ADMIN_TOKEN || '';

export const GET: APIRoute = async ({ request }) => {
  const session = getSessionFromCookie(request);
  if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  try {
    // Get keys for this user
    const keysResp = await fetch(`${API_URL}/admin/keys`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (!keysResp.ok) return new Response(JSON.stringify({}), { status: 200 });
    const allKeys = await keysResp.json();
    const userKeyIds = allKeys.filter((k: any) => k.owner === session.email).map((k: any) => k.key);

    // Get usage
    const usageResp = await fetch(`${API_URL}/admin/usage`, {
      headers: { 'X-Proxy-Token': ADMIN_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    if (!usageResp.ok) return new Response(JSON.stringify({}), { status: 200 });
    const usageData = await usageResp.json();

    // Match by owner email (primary) or key ID
    const usage: Record<string, number> = {};
    const allUsage = usageData.usage || {};
    // Direct email match
    if (allUsage[session.email]) {
      usage[session.email] = allUsage[session.email] as number;
    }
    // Also check by key IDs
    for (const [key, credits] of Object.entries(allUsage)) {
      if (userKeyIds.includes(key)) {
        usage[key] = credits as number;
      }
    }

    return new Response(JSON.stringify({ month: usageData.month, usage }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response(JSON.stringify({}), { status: 200 });
  }
};
