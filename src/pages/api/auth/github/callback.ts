import type { APIRoute } from 'astro';
import { github, createSession } from '../../../../lib/auth';

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = getCookie(request, 'github_oauth_state');

  if (!code || !state || state !== storedState) {
    console.error('[AUTH] GitHub state mismatch or missing params');
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }

  try {
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    // Fetch user profile
    const userResp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'XRPL-Mesh' },
    });
    const user = await userResp.json();

    // Fetch primary email (may not be public on profile)
    let email = user.email;
    if (!email) {
      const emailResp = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'XRPL-Mesh' },
      });
      const emails = await emailResp.json();
      const primary = emails.find((e: any) => e.primary && e.verified);
      email = primary?.email || emails[0]?.email || '';
    }

    if (!email) {
      console.error('[AUTH] GitHub: no email found');
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }

    console.log(`[AUTH] GitHub login: ${email}`);

    const sessionId = createSession({
      email,
      name: user.name || user.login,
      picture: user.avatar_url || '',
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/dashboard',
        'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; Secure; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
      },
    });
  } catch (e) {
    console.error('[AUTH] GitHub OAuth error:', e);
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }
};
