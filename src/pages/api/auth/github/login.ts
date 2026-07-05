import type { APIRoute } from 'astro';
import { github } from '../../../../lib/auth';
import { generateState } from 'arctic';

export const GET: APIRoute = async () => {
  const state = generateState();
  const url = github.createAuthorizationURL(state, ['user:email']);

  const headers = new Headers();
  headers.set('Location', url.toString());
  headers.append('Set-Cookie', `github_oauth_state=${state}; Path=/; HttpOnly; Secure; Max-Age=600; SameSite=Lax`);

  return new Response(null, { status: 302, headers });
};
