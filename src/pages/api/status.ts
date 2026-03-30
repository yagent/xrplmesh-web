import type { APIRoute } from 'astro';

const NODES = [
  { id: 'slc-2', region: 'US West', ip: '144.225.144.34' },
  { id: 'slc-1', region: 'US West', ip: '144.225.144.33' },
  { id: 'lax-1', region: 'US West', ip: '172.99.249.123' },
  { id: 'nyc-1', region: 'US East', ip: '157.254.224.90' },
  { id: 'mia-1', region: 'US East', ip: '69.166.231.61' },
  { id: 'us-1', region: 'US East', ip: '74.208.76.39' },
  { id: 'us-2', region: 'US East', ip: '74.208.76.45' },
  { id: 'rbx-1', region: 'EU West', ip: '137.74.16.215' },
  { id: 'rbx-2', region: 'EU West', ip: '137.74.16.217' },
  { id: 'rbx-3', region: 'EU West', ip: '137.74.16.216' },
  { id: 'hel1-1', region: 'EU North', ip: '204.168.216.162' },
  { id: 'hel1-2', region: 'EU North', ip: '37.27.195.72' },
  { id: 'hel1-3', region: 'EU North', ip: '46.62.200.125' },
  { id: 'hel1-4', region: 'EU North', ip: '65.21.83.210' },
  { id: 'ded-1', region: 'EU North', ip: '65.108.227.154' },
  { id: 'de-1', region: 'EU Central', ip: '135.125.254.37' },
  { id: 'de-2', region: 'EU Central', ip: '135.125.254.47' },
  { id: 'de-3', region: 'EU Central', ip: '135.125.254.48' },
  { id: 'it-1', region: 'EU South', ip: '57.131.46.7' },
  { id: 'it-2', region: 'EU South', ip: '57.131.46.8' },
  { id: 'it-3', region: 'EU South', ip: '57.131.46.9' },
];

let cache: { data: any; expires: number } | null = null;

export const GET: APIRoute = async () => {
  if (cache && Date.now() < cache.expires) {
    return new Response(JSON.stringify(cache.data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
    });
  }

  const results = await Promise.all(
    NODES.map(async (node) => {
      const t0 = Date.now();
      try {
        const resp = await fetch(`http://${node.ip}:9000/health`, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - t0;
        if (resp.ok) {
          const h = await resp.json();
          return {
            ...node, status: 'online', latency, ledger: h.latest_ledger || 0,
            cache_hit: h.cache?.hit_rate || '0%',
            response_p50: h.latency_ms?.overall?.p50 || 0,
            response_p95: h.latency_ms?.overall?.p95 || 0,
            uptime: h.uptime || 0,
          };
        }
        return { ...node, status: 'degraded', latency, ledger: 0 };
      } catch {
        return { ...node, status: 'offline', latency: Date.now() - t0, ledger: 0 };
      }
    })
  );

  const online = results.filter(n => n.status === 'online').length;
  const ledgers = results.filter(n => n.ledger > 0).map(n => n.ledger);
  const latestLedger = Math.max(0, ...ledgers);
  const allSynced = ledgers.length > 0 && ledgers.every(l => Math.abs(l - latestLedger) < 5);

  const data = {
    overall: online === results.length ? 'operational' : online > results.length * 0.8 ? 'degraded' : 'outage',
    nodes_online: online,
    nodes_total: results.length,
    latest_ledger: latestLedger,
    synced: allSynced,
    nodes: results.map(({ ip, id, ...rest }, i) => ({ ...rest, label: `Node ${i + 1}` })),
    updated_at: new Date().toISOString(),
  };

  cache = { data, expires: Date.now() + 15000 };

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
  });
};
