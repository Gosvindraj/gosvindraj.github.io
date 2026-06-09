/// <reference types="@cloudflare/workers-types" />

interface Env {}

interface NativeTx {
  txHash: string;
  blockTimestamp: number;
  from?: { address: string };
  to?: { address: string };
  value: string;
  gasUsed: string;
  nonce: string;
  txStatus: string;
}

interface GlacierTx {
  nativeTransaction: NativeTx;
}

interface GlacierResponse {
  transactions: GlacierTx[];
  nextPageToken?: string;
}

// ── Isolation Forest ─────────────────────────────────────────────────────────

function avgPathLength(n: number): number {
  if (n <= 1) return 0;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

type TreeNode =
  | { leaf: true; size: number }
  | { leaf: false; feature: number; split: number; left: TreeNode; right: TreeNode };

function buildTree(data: number[][], depth: number, maxDepth: number): TreeNode {
  if (depth >= maxDepth || data.length <= 1) return { leaf: true, size: data.length };
  const f = Math.floor(Math.random() * data[0].length);
  const vals = data.map(d => d[f]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) return { leaf: true, size: data.length };
  const split = min + Math.random() * (max - min);
  return {
    leaf: false, feature: f, split,
    left:  buildTree(data.filter(d => d[f] <  split), depth + 1, maxDepth),
    right: buildTree(data.filter(d => d[f] >= split), depth + 1, maxDepth),
  };
}

function pathLength(point: number[], node: TreeNode, depth: number): number {
  if (node.leaf) return depth + avgPathLength(node.size);
  return pathLength(point, point[node.feature] < node.split ? node.left : node.right, depth + 1);
}

function isolationForest(data: number[][], nTrees = 100): number[] {
  const n = data.length;
  if (n === 0) return [];
  const subsample = Math.min(256, n);
  const maxDepth  = Math.ceil(Math.log2(subsample));
  const c         = avgPathLength(subsample);
  const trees     = Array.from({ length: nTrees }, () => {
    const s = [...data].sort(() => Math.random() - 0.5).slice(0, subsample);
    return buildTree(s, 0, maxDepth);
  });
  return data.map(pt => {
    const avg = trees.reduce((s, t) => s + pathLength(pt, t, 0), 0) / nTrees;
    return Math.pow(2, -avg / c);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWei(value: string): number {
  try {
    const big = BigInt(value.startsWith("0x") ? value : value);
    return Number(big / BigInt("1000000000")) / 1e9;
  } catch { return 0; }
}

function normalize(data: number[][]): number[][] {
  const nF   = data[0].length;
  const mins = Array.from({ length: nF }, (_, f) => Math.min(...data.map(d => d[f])));
  const maxs = Array.from({ length: nF }, (_, f) => Math.max(...data.map(d => d[f])));
  return data.map(row =>
    row.map((v, f) => maxs[f] === mins[f] ? 0 : (v - mins[f]) / (maxs[f] - mins[f]))
  );
}

function pct(allVals: number[], val: number): number {
  const below = allVals.filter(v => v < val).length;
  return Math.round((below / allVals.length) * 100);
}

// ── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://gosvindraj.com",
  "https://gosvindraj.github.io",
  "http://localhost:4321",
  "http://localhost:8788",
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith(".pages.dev")) return true;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) return true;
  return false;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const origin  = request.headers.get("Origin") ?? "";
  const allowed = isAllowedOrigin(origin);

  const corsHeaders: HeadersInit = {
    "Access-Control-Allow-Origin":  allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

  let body: { address?: unknown };
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }

  const { address } = body;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address))
    return new Response(JSON.stringify({ error: "Invalid Avalanche C-Chain address" }), { status: 400, headers: corsHeaders });

  // ── Fetch from Glacier API ────────────────────────────────────────────────
  const glacierUrl = `https://glacier-api.avax.network/v1/chains/43114/addresses/${address}/transactions?pageSize=100&sortOrder=desc`;

  let txs: GlacierTx[];
  try {
    const res = await fetch(glacierUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const err = await res.text();
      console.error("Glacier error:", res.status, err);
      return new Response(JSON.stringify({ error: "Failed to fetch transactions from Glacier API" }), { status: 502, headers: corsHeaders });
    }
    const data = await res.json() as GlacierResponse;
    txs = data.transactions ?? [];
  } catch (err) {
    console.error("Glacier fetch error:", err);
    return new Response(JSON.stringify({ error: "Could not reach Glacier API" }), { status: 502, headers: corsHeaders });
  }

  if (txs.length === 0)
    return new Response(JSON.stringify({ transactions: [], message: "No transactions found for this address on Avalanche C-Chain." }), { status: 200, headers: corsHeaders });

  txs = txs.filter(tx => !!tx.nativeTransaction?.txHash);

  if (txs.length === 0)
    return new Response(JSON.stringify({ transactions: [], message: "No valid transactions found." }), { status: 200, headers: corsHeaders });

  // ── Feature extraction (sort ascending for timeDelta) ─────────────────────
  const asc = [...txs].sort((a, b) => a.nativeTransaction.blockTimestamp - b.nativeTransaction.blockTimestamp);

  const features = asc.map((tx, i) => {
    const ntx       = tx.nativeTransaction;
    const valueAvax = parseWei(ntx.value ?? "0");
    const gasUsed   = Number(ntx.gasUsed) || 0;
    const timeDelta = i === 0 ? 0 : asc[i].nativeTransaction.blockTimestamp - asc[i - 1].nativeTransaction.blockTimestamp;
    return [
      Math.log1p(valueAvax),
      Math.log1p(gasUsed),
      Math.log1p(timeDelta),
    ];
  });

  const scores = isolationForest(normalize(features), 100);

  // Pre-compute per-feature value arrays for percentile calculation
  const allValues     = features.map(f => Math.expm1(f[0])); // un-log
  const allGas        = features.map(f => Math.expm1(f[1]));
  const allTimeDeltas = features.map(f => Math.expm1(f[2]));

  // ── Build response (most recent first) ───────────────────────────────────
  const results = asc.map((tx, i) => {
    const ntx       = tx.nativeTransaction;
    const valueAvax = parseWei(ntx.value ?? "0");
    const gasUsed   = Number(ntx.gasUsed) || 0;
    const timeDelta = i === 0 ? 0 : ntx.blockTimestamp - asc[i - 1].nativeTransaction.blockTimestamp;
    return {
      hash:      ntx.txHash,
      timestamp: ntx.blockTimestamp,
      from:      ntx.from?.address ?? "",
      to:        ntx.to?.address ?? null,
      valueAvax,
      gasUsed,
      score:     Math.round(scores[i] * 1000) / 1000,
      flag:      scores[i] > 0.62 ? "anomalous" : scores[i] > 0.52 ? "suspicious" : "normal",
      features: {
        value:     { raw: valueAvax,  pct: pct(allValues,     valueAvax)  },
        gas:       { raw: gasUsed,    pct: pct(allGas,        gasUsed)    },
        timeDelta: { raw: timeDelta,  pct: pct(allTimeDeltas, timeDelta)  },
      },
    };
  }).reverse();

  return new Response(JSON.stringify({ transactions: results }), { status: 200, headers: corsHeaders });
};
