import type { APIRoute } from 'astro';
import { google } from '../../../lib/auth';
import { generateState, generateCodeVerifier } from 'arctic';

const IS_PROD = (import.meta.env.SITE_URL || '').startsWith('https');

export const GET: APIRoute = async () => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);

  const secure = IS_PROD ? '; Secure' : '';
  const headers = new Headers();
  headers.set('Location', url.toString());
  headers.append('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly${secure}; Max-Age=600; SameSite=Lax`);
  headers.append('Set-Cookie', `oauth_verifier=${codeVerifier}; Path=/; HttpOnly${secure}; Max-Age=600; SameSite=Lax`);

  return new Response(null, { status: 302, headers });
};
