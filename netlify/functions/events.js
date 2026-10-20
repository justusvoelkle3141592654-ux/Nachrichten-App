import { getStore } from "@netlify/blobs";

// Liefert das Protokoll nur, wenn das richtige Passwort mitgeschickt wird. Das
// Passwort liegt als Umgebungsvariable auf dem Server und steht nirgends im
// Seitencode. Ohne passende Umgebungsvariable lehnt die Funktion jede Anfrage ab.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Password",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function localDayOffset(daysAgo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "GET") return json(405, { error: "method not allowed" });

  const expected = process.env.VERLAUF_PASSWORT || "";
  const given = req.headers.get("x-password") || "";
  if (!expected) return json(500, { error: "Server ist nicht eingerichtet (VERLAUF_PASSWORT fehlt)." });
  if (given !== expected) return json(401, { error: "Falsches Passwort." });

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 3, 1), 90);

  const store = getStore("protokoll");
  const events = [];
  for (let i = 0; i < days; i++) {
    const day = localDayOffset(i);
    const list = await store.get(`logs/${day}`, { type: "json" });
    if (Array.isArray(list)) events.push(...list);
  }

  return json(200, { events });
};
