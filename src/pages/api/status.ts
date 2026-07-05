import type { APIRoute } from 'astro';
import { loadNodes } from '../../lib/nodes';

let cache: { data: any; expires: number } | null = null;

export const GET: APIRoute = async () => {
  if (cache && Date.now() < cache.expires) {
    return new Response(JSON.stringify(cache.data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
    });
  }

  const NODES = loadNodes();
  const results = await Promise.all(
    NODES.map(async (node) => {
      const t0 = Date.now();
      try {
        const resp = await fetch(`http://${node.ip}:9000/health`, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - t0;
        if (resp.ok) {
          const h = await resp.json();
          const res = h.resources || {};
          return {
            ...node, status: 'online', latency, ledger: h.latest_ledger || 0,
            cache_hit: h.cache?.hit_rate || '0%',
            response_p50: h.latency_ms?.overall?.p50 || 0,
            response_p95: h.latency_ms?.overall?.p95 || 0,
            uptime: h.uptime || 0,
            cpu_cores: res.cpu_cores || 0,
            cpu_pct: res.load_pct || 0,
            mem_total_mb: res.mem_total_mb || 0,
            mem_used_mb: res.mem_used_mb || 0,
            mem_pct: res.mem_pct || 0,
            disk_total_gb: res.disk_total_gb || 0,
            disk_used_gb: res.disk_used_gb || 0,
            disk_pct: res.disk_pct || 0,
            inode_total: res.inode_total || 0,
            inode_used: res.inode_used || 0,
            inode_pct: res.inode_pct || 0,
            fd_used: res.fd_used || 0,
            fd_pct: res.fd_pct || 0,
            sock_established: res.sock_established || 0,
            sock_time_wait: res.sock_time_wait || 0,
            sock_close_wait: res.sock_close_wait || 0,
            swap_total_mb: res.swap_total_mb || 0,
            swap_used_mb: res.swap_used_mb || 0,
            swap_pct: res.swap_pct || 0,
            mem_pressure: res.mem_pressure || 0,
            entropy: res.entropy || 0,
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
