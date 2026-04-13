import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_SESSION  = 20;
const COOLDOWN_MS  = 2000;
const MAX_CHARS    = 500;
const STORAGE_MSGS = "chatbot_msgs";
const STORAGE_CNT  = "chatbot_count";

// Design tokens matching global.css
const T = {
  bg:          "#0b0b0d",
  surface:     "#111116",
  border:      "rgba(255,255,255,0.07)",
  borderHover: "rgba(155,109,206,0.5)",
  text:        "#e4e4e8",
  muted:       "#55556a",
  accent:      "#9b6dce",
  accentDim:   "rgba(155,109,206,0.12)",
} as const;

export default function ChatBot() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [sessionCount, setCount]  = useState(0);
  const lastSend   = useRef(0);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const msgs  = localStorage.getItem(STORAGE_MSGS);
      const count = localStorage.getItem(STORAGE_CNT);
      if (msgs)  setMessages(JSON.parse(msgs) as Message[]);
      if (count) setCount(parseInt(count, 10));
    } catch { /* ignore parse errors */ }
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const trimmed = input.trim();

    if (!trimmed || loading) return;

    if (trimmed.length > MAX_CHARS) {
      setError(`Message too long (max ${MAX_CHARS} characters).`);
      return;
    }
    if (sessionCount >= MAX_SESSION) {
      setError("Session limit reached. Reload the page to start a new chat.");
      return;
    }
    const now = Date.now();
    if (now - lastSend.current < COOLDOWN_MS) {
      setError("Please wait a moment before sending again.");
      return;
    }

    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);
    lastSend.current = now;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: messages.slice(-10) }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };

      if (!res.ok || !data.reply) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        const assistantMsg: Message = { role: "assistant", content: data.reply };
        const final = [...next, assistantMsg];
        setMessages(final);
        const newCount = sessionCount + 1;
        setCount(newCount);
        localStorage.setItem(STORAGE_MSGS, JSON.stringify(final));
        localStorage.setItem(STORAGE_CNT, String(newCount));
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    setError("");
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  }

  const isExhausted = sessionCount >= MAX_SESSION;
  const canSend     = !loading && !isExhausted && input.trim().length > 0;
  const remaining   = MAX_SESSION - sessionCount;

  return (
    <>
      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      <div
        aria-hidden={!open}
        style={{
          position:       "fixed",
          bottom:         "88px",
          right:          "24px",
          width:          "340px",
          maxWidth:       "calc(100vw - 48px)",
          height:         "480px",
          background:     T.surface,
          border:         `1px solid ${open ? T.borderHover : T.border}`,
          borderRadius:   "8px",
          display:        "flex",
          flexDirection:  "column",
          zIndex:         9000,
          boxShadow:      "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(155,109,206,0.08)",
          fontFamily:     "'Montserrat', sans-serif",
          overflow:       "hidden",
          opacity:        open ? 1 : 0,
          pointerEvents:  open ? "auto" : "none",
          transform:      open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
          transition:     "opacity 0.22s ease, transform 0.22s ease, border-color 0.25s ease",
          transformOrigin:"bottom right",
        }}
      >
        {/* Header */}
        <div style={{
          padding:       "13px 16px",
          borderBottom:  `1px solid ${T.border}`,
          display:       "flex",
          alignItems:    "center",
          justifyContent:"space-between",
          flexShrink:    0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width:          "28px",
              height:         "28px",
              background:     T.accentDim,
              border:         "1px solid rgba(155,109,206,0.3)",
              borderRadius:   "4px",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: T.accent }}>G</span>
            </div>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: T.text, lineHeight: 1.3 }}>
                Ask Gosh
              </div>
              <div style={{ fontSize: "10px", color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                portfolio assistant
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ fontSize: "10px", color: T.muted, letterSpacing: "0.04em" }}>
              {remaining} / {MAX_SESSION}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                background: "none",
                border:     "none",
                color:      T.muted,
                fontSize:   "20px",
                lineHeight: 1,
                padding:    "2px",
                display:    "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex:          1,
          overflowY:     "auto",
          padding:       "16px",
          display:       "flex",
          flexDirection: "column",
          gap:           "12px",
          scrollbarWidth:"thin",
          scrollbarColor:`rgba(155,109,206,0.2) transparent`,
        }}>
          {messages.length === 0 && (
            <div style={{
              margin:     "auto",
              textAlign:  "center",
              color:      T.muted,
              fontSize:   "13px",
              lineHeight: 1.75,
              padding:    "0 12px",
            }}>
              <div style={{
                width:          "36px",
                height:         "36px",
                background:     T.accentDim,
                border:         "1px solid rgba(155,109,206,0.2)",
                borderRadius:   "50%",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                margin:         "0 auto 12px",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              Ask me anything about Gosh — his projects, skills, background, or how to get in touch.
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              display:        "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth:     "82%",
                padding:      "9px 13px",
                borderRadius: m.role === "user"
                  ? "12px 12px 2px 12px"
                  : "12px 12px 12px 2px",
                background:   m.role === "user" ? T.accent : T.bg,
                border:       m.role === "user" ? "none" : `1px solid ${T.border}`,
                color:        m.role === "user" ? "#fff" : T.text,
                fontSize:     "13px",
                lineHeight:   1.65,
                wordBreak:    "break-word",
                whiteSpace:   "pre-wrap",
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                padding:      "10px 14px",
                borderRadius: "12px 12px 12px 2px",
                background:   T.bg,
                border:       `1px solid ${T.border}`,
                display:      "flex",
                gap:          "5px",
                alignItems:   "center",
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width:        "5px",
                    height:       "5px",
                    borderRadius: "50%",
                    background:   T.muted,
                    display:      "inline-block",
                    animation:    `chatbotDot 1.2s ${i * 0.16}s ease-in-out infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              fontSize:   "11px",
              color:      "#e57373",
              textAlign:  "center",
              padding:    "4px 8px",
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding:    "10px 12px",
          borderTop:  `1px solid ${T.border}`,
          display:    "flex",
          gap:        "8px",
          alignItems: "flex-end",
          flexShrink: 0,
          background: T.surface,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isExhausted ? "Session limit reached — reload to continue" : "Ask about Gosh…"}
            disabled={isExhausted || loading}
            rows={1}
            maxLength={MAX_CHARS}
            style={{
              flex:        1,
              background:  T.bg,
              border:      `1px solid ${T.border}`,
              borderRadius:"6px",
              color:       T.text,
              fontSize:    "13px",
              padding:     "9px 12px",
              resize:      "none",
              fontFamily:  "'Montserrat', sans-serif",
              lineHeight:  1.5,
              outline:     "none",
              opacity:     isExhausted ? 0.45 : 1,
              maxHeight:   "100px",
              overflowY:   "auto",
              transition:  "border-color 0.2s ease",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = T.borderHover; }}
            onBlur={e  => { e.currentTarget.style.borderColor = T.border; }}
          />
          <button
            onClick={send}
            disabled={!canSend}
            aria-label="Send message"
            style={{
              background:   canSend ? T.accent : "rgba(155,109,206,0.2)",
              border:       "none",
              borderRadius: "6px",
              width:        "36px",
              height:       "36px",
              display:      "flex",
              alignItems:   "center",
              justifyContent:"center",
              opacity:      canSend ? 1 : 0.5,
              flexShrink:   0,
              transition:   "background 0.2s ease, opacity 0.2s ease",
              color:        "#fff",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Floating action button ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        style={{
          position:    "fixed",
          bottom:      "24px",
          right:       "24px",
          width:       "52px",
          height:      "52px",
          borderRadius:"50%",
          background:  open ? T.surface : T.accent,
          border:      `1px solid ${open ? T.borderHover : "transparent"}`,
          display:     "flex",
          alignItems:  "center",
          justifyContent:"center",
          zIndex:      9001,
          boxShadow:   open
            ? `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${T.borderHover}`
            : "0 4px 20px rgba(155,109,206,0.4)",
          transition:  "background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
          color:       open ? T.accent : "#fff",
        }}
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {/* Typing indicator keyframes */}
      <style>{`
        @keyframes chatbotDot {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
          40%            { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
