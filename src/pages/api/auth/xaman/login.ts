import type { APIRoute } from 'astro';
import { XummSdk } from 'xumm-sdk';

const XAMAN_API_KEY = import.meta.env.XAMAN_API_KEY || '';
const XAMAN_API_SECRET = import.meta.env.XAMAN_API_SECRET || '';

export const GET: APIRoute = async () => {
  if (!XAMAN_API_KEY || !XAMAN_API_SECRET) {
    return new Response(JSON.stringify({ error: 'Xaman not configured' }), { status: 500 });
  }

  const sdk = new XummSdk(XAMAN_API_KEY, XAMAN_API_SECRET);

  const payload = await sdk.payload.create({
    TransactionType: 'SignIn',
  } as any);

  if (!payload) {
    return new Response(JSON.stringify({ error: 'Failed to create payload' }), { status: 500 });
  }

  return new Response(JSON.stringify({
    uuid: payload.uuid,
    qr: payload.refs.qr_png,
    ws: payload.refs.websocket_status,
    link: payload.next.always,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
