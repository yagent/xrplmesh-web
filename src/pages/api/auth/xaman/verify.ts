import type { APIRoute } from 'astro';
import { XummSdk } from 'xumm-sdk';
import { createSession } from '../../../../lib/auth';

const XAMAN_API_KEY = import.meta.env.XAMAN_API_KEY || '';
const XAMAN_API_SECRET = import.meta.env.XAMAN_API_SECRET || '';

export const POST: APIRoute = async ({ request }) => {
  const { uuid } = await request.json();
  if (!uuid) return new Response(JSON.stringify({ error: 'missing uuid' }), { status: 400 });

  const sdk = new XummSdk(XAMAN_API_KEY, XAMAN_API_SECRET);
  const result = await sdk.payload.get(uuid);

  if (!result || !result.meta.signed || !result.response.account) {
    return new Response(JSON.stringify({ error: 'not_signed' }), { status: 401 });
  }

  const account = result.response.account;
  console.log(`[AUTH] Xaman login: ${account}`);

  const sessionId = createSession({
    email: account, // r-address as identifier
    name: account.slice(0, 8) + '...',
    picture: '',
  });

  return new Response(JSON.stringify({ ok: true, sessionId }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
