import type { APIRoute } from 'astro';

const CF_API_TOKEN = import.meta.env.CF_API_TOKEN || '';
const CF_ZONE_ID = import.meta.env.CF_ZONE_ID || '';

// Cache response for 5 minutes to avoid hammering CF API
let cache: { data: any; expires: number } | null = null;

export const GET: APIRoute = async () => {
  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503 });
  }

  if (cache && Date.now() < cache.expires) {
    return new Response(JSON.stringify(cache.data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  }

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `{
    viewer {
      zones(filter: { zoneTag: "${CF_ZONE_ID}" }) {
        last24h: httpRequests1hGroups(limit: 24, filter: { datetime_geq: "${since24h}" }, orderBy: [datetime_ASC]) {
          dimensions { datetime }
          sum { requests cachedRequests bytes cachedBytes threats }
          uniq { uniques }
        }
        last7d: httpRequests1dGroups(limit: 7, filter: { date_geq: "${since7d.slice(0, 10)}" }, orderBy: [date_ASC]) {
          dimensions { date }
          sum { requests cachedRequests bytes cachedBytes threats pageViews }
          uniq { uniques }
        }
        last30d: httpRequests1dGroups(limit: 30, filter: { date_geq: "${since30d.slice(0, 10)}" }, orderBy: [date_ASC]) {
          dimensions { date }
          sum { requests cachedRequests bytes cachedBytes }
          uniq { uniques }
        }
        countries: httpRequests1dGroups(limit: 1, filter: { date_geq: "${since7d.slice(0, 10)}" }) {
          sum {
            countryMap { clientCountryName requests bytes }
          }
        }
        statusCodes: httpRequests1dGroups(limit: 1, filter: { date_geq: "${since24h.slice(0, 10)}" }) {
          sum {
            responseStatusMap { edgeResponseStatus requests }
          }
        }
      }
    }
  }`;

  try {
    const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'cf_error', status: resp.status }), { status: 502 });
    }

    const json = await resp.json();
    const zone = json.data?.viewer?.zones?.[0];
    if (!zone) {
      return new Response(JSON.stringify({ error: 'no_zone_data' }), { status: 404 });
    }

    // Aggregate totals
    const totals24h = zone.last24h.reduce((acc: any, h: any) => ({
      requests: acc.requests + h.sum.requests,
      cached: acc.cached + h.sum.cachedRequests,
      bytes: acc.bytes + h.sum.bytes,
      cachedBytes: acc.cachedBytes + h.sum.cachedBytes,
      threats: acc.threats + h.sum.threats,
      uniques: acc.uniques + h.uniq.uniques,
    }), { requests: 0, cached: 0, bytes: 0, cachedBytes: 0, threats: 0, uniques: 0 });

    const totals7d = zone.last7d.reduce((acc: any, d: any) => ({
      requests: acc.requests + d.sum.requests,
      cached: acc.cached + d.sum.cachedRequests,
      bytes: acc.bytes + d.sum.bytes,
      cachedBytes: acc.cachedBytes + d.sum.cachedBytes,
      uniques: acc.uniques + d.uniq.uniques,
    }), { requests: 0, cached: 0, bytes: 0, cachedBytes: 0, uniques: 0 });

    const data = {
      totals: {
        last24h: totals24h,
        last7d: totals7d,
      },
      timeseries: {
        hourly: zone.last24h.map((h: any) => ({
          time: h.dimensions.datetime,
          requests: h.sum.requests,
          cached: h.sum.cachedRequests,
          bytes: h.sum.bytes,
        })),
        daily: zone.last30d.map((d: any) => ({
          date: d.dimensions.date,
          requests: d.sum.requests,
          cached: d.sum.cachedRequests,
          bytes: d.sum.bytes,
          uniques: d.uniq.uniques,
        })),
      },
      countries: zone.countries?.[0]?.sum?.countryMap
        ?.sort((a: any, b: any) => b.requests - a.requests)
        .slice(0, 20) || [],
      statusCodes: zone.statusCodes?.[0]?.sum?.responseStatusMap || [],
      updated_at: now.toISOString(),
    };

    cache = { data, expires: Date.now() + 300000 };

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'fetch_failed', message: e.message }), { status: 502 });
  }
};
