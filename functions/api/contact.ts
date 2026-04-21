/// <reference types="@cloudflare/workers-types" />

interface Env {
  EMAILJS_PUBLIC_KEY: string;
  EMAILJS_PRIVATE_KEY: string;
  EMAILJS_SERVICE_ID: string;
  EMAILJS_TEMPLATE_ID: string;
}

const ALLOWED_ORIGINS = [
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

  let body: { name?: unknown; email?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const { name, email, message } = body;

  if (typeof name !== "string" || name.trim().length === 0)
    return new Response(JSON.stringify({ error: "Name is required" }), { status: 400, headers: corsHeaders });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return new Response(JSON.stringify({ error: "Valid email is required" }), { status: 400, headers: corsHeaders });
  if (typeof message !== "string" || message.trim().length === 0)
    return new Response(JSON.stringify({ error: "Message is required" }), { status: 400, headers: corsHeaders });

  if (name.length > 100 || email.length > 200 || message.length > 2000)
    return new Response(JSON.stringify({ error: "Input too long" }), { status: 400, headers: corsHeaders });

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:   env.EMAILJS_SERVICE_ID,
        template_id:  env.EMAILJS_TEMPLATE_ID,
        user_id:      env.EMAILJS_PUBLIC_KEY,
        accessToken:  env.EMAILJS_PRIVATE_KEY,
        template_params: {
          name:    name.trim(),
          email:   email.trim(),
          message: message.trim(),
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("EmailJS error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Failed to send email" }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Contact function error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
};
