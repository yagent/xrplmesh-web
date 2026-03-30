import { Google } from 'arctic';
import fs from 'node:fs';
import path from 'node:path';

const GOOGLE_CLIENT_ID = import.meta.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = import.meta.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = import.meta.env.SITE_URL || 'https://xrplmesh.com';

export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${BASE_URL}/api/auth/callback`);

// File-backed session store - survives PM2 restarts
const SESSION_FILE = path.join(process.cwd(), '.sessions.json');
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Session { email: string; name: string; picture: string; expires: number; }
let sessions: Record<string, Session> = {};

// Load from disk on startup
try {
  if (fs.existsSync(SESSION_FILE)) {
    sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  }
} catch {}

function persist() {
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions)); } catch {}
}

export function createSession(user: { email: string; name: string; picture: string }): string {
  const id = crypto.randomUUID();
  sessions[id] = { ...user, expires: Date.now() + SESSION_TTL };
  persist();
  return id;
}

export function getSession(id: string) {
  const s = sessions[id];
  if (!s) return null;
  if (Date.now() > s.expires) { delete sessions[id]; persist(); return null; }
  return s;
}

export function deleteSession(id: string) {
  delete sessions[id];
  persist();
}

export function getSessionFromCookie(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return getSession(match[1]);
}
