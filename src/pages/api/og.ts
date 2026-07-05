import type { APIRoute } from 'astro';
import sharp from 'sharp';

const PAGES: Record<string, { title: string; subtitle: string; color: string }> = {
  '/':        { title: 'XRPL Stream', subtitle: 'Full History XRP Ledger API', color: '#58a6ff' },
  '/pricing': { title: 'Pricing', subtitle: 'Simple, transparent API pricing', color: '#3ecf8e' },
  '/docs':    { title: 'Documentation', subtitle: 'API reference & quickstart guides', color: '#a78bfa' },
  '/blog':    { title: 'Blog', subtitle: 'Guides, tutorials & XRPL insights', color: '#f59e0b' },
  '/agents':  { title: 'AI Agents', subtitle: 'Build intelligent XRPL agents', color: '#ec4899' },
  '/status':  { title: 'Network Status', subtitle: 'Real-time node health & performance', color: '#3ecf8e' },
  '/login':   { title: 'Sign In', subtitle: 'Access your XRPL Stream dashboard', color: '#6366f1' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Manage your API endpoint', color: '#06b6d4' },
};

function buildSvg(title: string, subtitle: string, color: string, path: string): string {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="#58a6ff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="4" fill="url(#accent)"/>
  ${Array.from({length: 20}, (_, i) =>
    Array.from({length: 10}, (_, j) =>
      `<circle cx="${60 + i * 57}" cy="${60 + j * 57}" r="1" fill="#ffffff" opacity="0.05"/>`
    ).join('')
  ).join('')}
  <circle cx="120" cy="270" r="36" fill="${color}" opacity="0.12"/>
  <circle cx="120" cy="270" r="8" fill="${color}"/>
  <text x="190" y="290" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="#ffffff">${escXml(title)}</text>
  <text x="190" y="345" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#9ca3af">${escXml(subtitle)}</text>
  <rect x="80" y="470" width="40" height="4" rx="2" fill="${color}"/>
  <text x="80" y="520" font-family="Courier New, monospace" font-size="28" font-weight="700" fill="#58a6ff">xrpl<tspan fill="${color}">.</tspan>stream</text>
  <text x="330" y="520" font-family="Courier New, monospace" font-size="22" fill="#4b5563">${escXml(path === '/' ? '' : path)}</text>
  <rect x="80" y="555" width="1040" height="1" fill="#1f2937"/>
  <text x="80" y="585" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#6b7280">Full History API  |  WebSocket + JSON-RPC  |  21 Global Nodes</text>
</svg>`;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  let path = url.searchParams.get('path') || '/';

  // Match blog sub-pages
  let page = PAGES[path];
  if (!page && path.startsWith('/blog/')) {
    const slug = path.replace('/blog/', '').replace(/-/g, ' ');
    const title = slug.charAt(0).toUpperCase() + slug.slice(1);
    page = { title, subtitle: 'XRPL Stream Blog', color: '#f59e0b' };
  }
  if (!page) {
    page = PAGES['/'];
  }

  const svg = buildSvg(page.title, page.subtitle, page.color, path);

  try {
    const png = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    });
  } catch {
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  }
};
