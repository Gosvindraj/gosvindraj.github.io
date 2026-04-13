/// <reference types="@cloudflare/workers-types" />

interface Env {
  GROK_API_KEY: string;
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

const SYSTEM_PROMPT = `You are a friendly assistant on Gosvindraj's portfolio website. You can ONLY answer questions about Gosvindraj — his background, skills, projects, experience, interests, and how to contact him. If asked anything unrelated to Gosvindraj, politely decline and redirect to portfolio topics. Keep responses concise and conversational (2-4 sentences max).

About Gosvindraj:
- Goes by "Gosh"
- Based in Malaysia (Kuala Lumpur / Selangor area)
- Currently studying Computer Science at university
- First contact with tech around age 13 in secondary school; wrote his first real program in 2021
- Passionate about AI, blockchain, and emerging tech — builds projects to understand new things
- Describes himself as someone who gets obsessed with ideas quickly and ships projects to learn

Skills & Stack:
- Languages: JavaScript, TypeScript, Python, HTML, CSS
- Frameworks & Libraries: Astro, React, GSAP (animations)
- Tools: Git, GitHub, Node.js
- Interests: AI, web3, creative coding, interactive UI/UX

Projects:
1. 2D Snake Game — a classic snake game built with HTML Canvas API, playable live at /snake-game
2. BTC Price in MYR — fetches live BTC/USD price via CoinGecko and converts to Malaysian Ringgit, live at /crypto-api
3. This Portfolio — built with Astro + React + GSAP; features a custom cursor system, glitch text animations, 3D card tilts, orbit card layout, and a matrix rain background

Contact & Socials:
- GitHub: https://github.com/Gosvindraj
- LinkedIn: https://www.linkedin.com/in/gosvindraj-m-3306b9280/
- Instagram: https://www.instagram.com/gosv7ndraj/
- There is also a contact form on the site's /contact page

Note: The about page has some sections still being updated with more personal details. If asked about specifics not listed above, say the details are coming soon.`;

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
