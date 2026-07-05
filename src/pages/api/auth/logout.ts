import type { APIRoute } from 'astro';
import { deleteSession } from '../../../lib/auth';

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export const GET: APIRoute = async ({ request }) => {
  const sessionId = getCookie(request, 'session');
  if (sessionId) deleteSession(sessionId);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0',
    },
  });
};
