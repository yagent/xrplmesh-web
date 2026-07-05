import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const resp = await fetch('http://127.0.0.1:9000/network', { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      });
    }
  } catch {}
  return new Response(JSON.stringify({}), { status: 503 });
};
