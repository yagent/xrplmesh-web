import fs from 'node:fs';

// Single source of truth for the node registry: the proxy's git-synced
// network.json (this app runs on a proxy node). Adding/removing/replacing a
// node in network.json updates /status automatically — nothing hardcoded here.
const NETWORK_JSON_PATH =
  process.env.NETWORK_JSON_PATH || '/root/xrpl-proxy/network.json';

export interface NetworkNode {
  id: string;
  ip: string;
  region: string;
  provider: string;
  cost: number;
}

export function loadNodes(): NetworkNode[] {
  const raw = JSON.parse(fs.readFileSync(NETWORK_JSON_PATH, 'utf8'));
  const list: any[] = Array.isArray(raw) ? raw : raw.nodes || [];
  return list.map((n) => ({
    id: n.id,
    ip: new URL(n.url).hostname,
    region: n.region || '',
    provider: n.provider || '',
    cost: typeof n.cost === 'number' ? n.cost : 0,
  }));
}
