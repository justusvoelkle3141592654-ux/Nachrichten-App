import { getStore } from "@netlify/blobs";

// Nimmt Protokoll-Einträge vom Dashboard entgegen und speichert sie in Netlify Blobs.
// Zum Schreiben ist kein Passwort nötig, damit das Dashboard ohne Einstellungen
// funktioniert. Texte werden gekürzt und geprüft, bevor sie gespeichert werden.

const VIDEO_ID = /^[\w-]{11}$/;
const MAX_EVENTS_PER_CALL = 500;
const MAX_EVENTS_PER_DAY = 5000;
const MAX_SECONDS = 86400; // ein Tag; verhindert offensichtlich falsche Werte

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function cleanEvent(e) {
  if (!e || typeof e !== "object") return null;
  const t = typeof e.t === "string" && !Number.isNaN(Date.parse(e.t)) ? e.t : new Date().toISOString();
  return {
    t,
    who: String(e.who ?? "unbekannt").slice(0, 30),
    kind: String(e.kind ?? "").slice(0, 40),
    text: String(e.text ?? "").slice(0, 200),
    id: typeof e.id === "string" && VIDEO_ID.test(e.id) ? e.id : "",
    seconds: Number.isFinite(e.seconds) && e.seconds > 0 ? Math.min(Math.round(e.seconds), MAX_SECONDS) : 0,
  };
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return json(400, { error: "invalid json" });
  }

  const raw = Array.isArray(body?.events) ? body.events : [];
  if (raw.length === 0 || raw.length > MAX_EVENTS_PER_CALL) {
    return json(400, { error: "invalid events" });
  }

  const cleaned = raw.map(cleanEvent).filter(Boolean);
  if (cleaned.length === 0) return json(400, { error: "nothing valid" });

  const byDay = new Map();
  for (const e of cleaned) {
    const day = localDay(e.t) ?? new Date().toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }

  const store = getStore("protokoll");
  for (const [day, events] of byDay) {
    const key = `logs/${day}`;
    const existing = (await store.get(key, { type: "json" })) || [];
    const merged = (Array.isArray(existing) ? existing : []).concat(events).slice(-MAX_EVENTS_PER_DAY);
    await store.setJSON(key, merged);
  }

  return json(200, { ok: true, stored: cleaned.length });
};
