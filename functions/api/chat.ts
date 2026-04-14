/// <reference types="@cloudflare/workers-types" />

interface Env {
  GROK_API_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
}

const RATE_LIMIT_MAX    = 20;   // requests per window
const RATE_LIMIT_WINDOW = 3600; // seconds (1 hour)

interface RateLimitEntry {
  count: number;
  windowStart: number; // unix timestamp ms
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Add your custom domain here once it's live ─────────────────────────────
const ALLOWED_ORIGINS = [
  "https://gosvindraj.github.io",
  "http://localhost:4321",
  "http://localhost:8788",
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow all Cloudflare Pages preview & production URLs
  if (origin.endsWith(".pages.dev")) return true;
  // Allow local dev
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) return true;
  return false;
}

const SYSTEM_PROMPT = `You are a friendly assistant on Gosvindraj's portfolio website. You can ONLY answer questions about Gosvindraj — his background, skills, projects, experience, and how to contact him. If asked anything unrelated to Gosvindraj, politely decline and redirect to portfolio topics. Keep responses concise and conversational (2-4 sentences max).

About Gosvindraj:
- Full name: Gosvindraj. Goes by "Gosh" or sometimes "Raj" depending on who's asking.
- Born 22 July 1998, based in Penang, Malaysia. KL is his second home — travels there frequently.
- Not currently a student, but never stops learning. Describes himself as someone who gets obsessed with new things fast and builds to understand them.
- Deeply interested in the AI × blockchain intersection — where both worlds collide is where he thinks the most interesting stuff happens.

Education:
- Primary: SK Seri Permai, Penang (2005–2010)
- Secondary: Penang Free School (PFS), one of Malaysia's oldest schools (2011–2015), SPM 8As
- Matriculation: KMKT, Kelantan (2016–2017) — first real CS course, knew this was the path
- BSc Computer Science (AI major, Management minor) — Universiti Sains Malaysia (USM), 2017–2021
- MSc Computer Science (Mixed Mode) — USM, 2023–2024. Dissertation on AI + Cybersecurity.

Masters Dissertation:
Title: "Efficient Real-Time Detection of DDoS Attacks in Software-Defined Networking Environments Using Ensemble Machine Learning"
Summary: Explored ensemble ML methods (Random Forest, AdaBoost) to detect DDoS attacks in SDN environments in real time — balancing detection accuracy with prediction speed. RF and AdaBoost achieved 2096% and 3809% improvements over default hyperparameters after tuning.
Supervisor: Ts. Dr. Mohd Najwadi Bin Yusoff, USM.

Experience:
- ConvEx Project Director (USM, 2019) — led one of USM's biggest annual events (Convocation Expo), managed 220+ students, handled a multi-million ringgit event from A to Z
- ConvEx Project Director again (2022) — called back post-COVID to revive the event after a 3-year hiatus; became the first ever two-time director; rebuilt from scratch with a new team of 220+ students
- Web3 / Blockchain (2022–2025, part-time) — technical support and community moderation for an NFT company integrating blockchain for fashion brands
- Currently: personal projects, learning, and volunteering in blockchain education and community events

Skills & Stack:
- Languages: JavaScript, TypeScript, Python, HTML, CSS
- Frameworks: Astro, React, GSAP, Django
- Tools: Git, GitHub, Node.js, AWS, Heroku
- Heavy AI tools user; full stack capable, AI-assisted on both frontend and backend
- Beyond code: public speaking, event directing, team leadership, teaching, community building

Projects:
1. 2D Snake Game — HTML Canvas API, playable at /snake-game
2. BTC Price in MYR — live BTC/USD via CoinGecko, converts to Malaysian Ringgit, at /crypto-api
3. Portfolio — Astro + React + GSAP; custom cursor, glitch animations, 3D card tilts, orbit layout, matrix rain background
4. Bill Splitting App with AI — AI detects receipt images and auto-assigns splits (not yet public)
5. Volunteer Task Allocation System (FYP) — full stack web app (Django, PostgreSQL/AWS, Python) using Fuzzy Theory to match volunteers to tasks intelligently
6. Also has a personal productivity app and investment dashboard (private)

Fun Facts:
- Beatbox performer and public speaker — has performed beatbox and given speeches/presentations to crowds of up to ~4000 people; competed in several small beatbox competitions
- Adaptive by nature — if something new exists, he wants to understand it; sticking to old ways feels uncomfortable
- Open to opportunities but not actively job hunting; portfolio is for people to explore and get in touch

Contact & Socials:
- GitHub: https://github.com/Gosvindraj
- LinkedIn: https://www.linkedin.com/in/gosvindraj-m-3306b9280/
- Instagram: https://www.instagram.com/gosv7ndraj/
- Contact form available at /contact (routes to his email)`;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const origin = request.headers.get("Origin") ?? "";
  const allowed = isAllowedOrigin(origin);

  const corsHeaders: HeadersInit = {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  // ── Rate limiting (per IP, 20 req / hour via KV) ─────────────────────────
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const kvKey = `ratelimit:${ip}`;
  const now = Date.now();

  const raw = await env.RATE_LIMIT_KV.get(kvKey);
  const entry: RateLimitEntry = raw
    ? (JSON.parse(raw) as RateLimitEntry)
    : { count: 0, windowStart: now };

  // Reset window if it has expired
  if (now - entry.windowStart > RATE_LIMIT_WINDOW * 1000) {
    entry.count = 0;
    entry.windowStart = now;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW * 1000 - now) / 1000);
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Retry-After": String(retryAfter) } }
    );
  }

  // Increment and persist; TTL ensures the key auto-expires after one window
  entry.count += 1;
  await env.RATE_LIMIT_KV.put(kvKey, JSON.stringify(entry), { expirationTtl: RATE_LIMIT_WINDOW });

  // ── Parse & validate body ────────────────────────────────────────────────
  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const { message, history } = body;

  if (typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Message is required" }), { status: 400, headers: corsHeaders });
  }
  if (message.length > 500) {
    return new Response(JSON.stringify({ error: "Message too long (max 500 characters)" }), { status: 400, headers: corsHeaders });
  }

  if (!Array.isArray(history)) {
    return new Response(JSON.stringify({ error: "Invalid history" }), { status: 400, headers: corsHeaders });
  }

  // Sanitise history: only last 10 turns, only valid roles, truncate content
  const safeHistory: HistoryMessage[] = (history as unknown[])
    .filter(
      (m): m is { role: string; content: string } =>
        typeof m === "object" &&
        m !== null &&
        (("role" in m && m.role === "user") || ("role" in m && m.role === "assistant")) &&
        "content" in m &&
        typeof (m as Record<string, unknown>).content === "string"
    )
    .slice(-10)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: (m.content as string).slice(0, 1000),
    }));

  // ── Call xAI Grok API ────────────────────────────────────────────────────
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...safeHistory,
    { role: "user" as const, content: message.trim() },
  ];

  try {
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-non-reasoning",
        messages,
        max_tokens: 350,
        temperature: 0.7,
      }),
    });

    if (!grokRes.ok) {
      const errText = await grokRes.text();
      console.error("Grok API error:", grokRes.status, errText);
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable." }),
        { status: 502, headers: corsHeaders }
      );
    }

    const grokData = (await grokRes.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const reply =
      grokData.choices?.[0]?.message?.content?.trim() ??
      "Sorry, I couldn't generate a response right now.";

    return new Response(JSON.stringify({ reply }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Chat function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: corsHeaders }
    );
  }
};
