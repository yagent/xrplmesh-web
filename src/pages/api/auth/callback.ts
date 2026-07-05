import type { APIRoute } from 'astro';
import { google, createSession } from '../../../lib/auth';

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export const GET: APIRoute = async ({ request }) => {
  console.log('[AUTH] Callback hit');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = getCookie(request, 'oauth_state');
  const codeVerifier = getCookie(request, 'oauth_verifier');

  console.log(`[AUTH] code=${!!code} state=${!!state} storedState=${!!storedState} codeVerifier=${!!codeVerifier} stateMatch=${state === storedState}`);
  console.log(`[AUTH] cookies: ${request.headers.get('cookie')?.substring(0, 200) || '(none)'}`);

  if (!code || !state || state !== storedState || !codeVerifier) {
    console.error(`[AUTH] FAILED: code=${!!code} state=${!!state} storedState=${!!storedState} verifier=${!!codeVerifier} match=${state === storedState}`);
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }

  try {
    console.log('[AUTH] Exchanging code for token...');
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = await userResp.json();
    console.log(`[AUTH] Login: ${user.email}`);

    const sessionId = createSession({
      email: user.email,
      name: user.name,
      picture: user.picture,
    });

    const secure = (import.meta.env.SITE_URL || '').startsWith('https') ? '; Secure' : '';
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/dashboard',
        'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly${secure}; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
      },
    });
  } catch (e) {
    console.error('[AUTH] OAuth error:', e);
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }
};
