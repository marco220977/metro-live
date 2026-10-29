// Signalements des voyageurs, partagés entre tous les utilisateurs d'un arrêt.
// Stockage : Upstash Redis (Vercel → Storage → Upstash Redis), via son API REST.
// Les signalements disparaissent seuls après 2 heures.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 2 * 3600;            // durée de vie (s)
const MAX_PER_STOP = 40;
const TYPES = ["retard", "supprime", "bonde", "incident", "travaux", "propre", "autre"];

async function redis(cmds) {
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).map((x) => x.result);
}

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const validStop = (s) => typeof s === "string" && /^[A-Za-z0-9:_\-.]{3,80}$/.test(s);
const validDev = (s) => typeof s === "string" && /^[a-z0-9]{8,40}$/.test(s);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 4000) break; }
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

async function list(stop) {
  const [items, confirms] = await redis([["LRANGE", "r:" + stop, 0, MAX_PER_STOP - 1], ["HGETALL", "c:" + stop]]);
  const counts = {};
  for (let i = 0; i < (confirms || []).length; i += 2) counts[confirms[i]] = +confirms[i + 1];
  const now = Date.now();
  return (items || []).map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter((x) => x && now - x.t < TTL * 1000)
    .map((x) => ({ id: x.id, type: x.type, line: x.line, lineColor: x.lineColor, msg: x.msg, t: x.t, ok: counts[x.id] || 0 }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) { res.status(503).json({ error: "off" }); return; }
  try {
    if (req.method === "GET") {
      const stop = new URL(req.url, "http://x").searchParams.get("stop");
      if (!validStop(stop)) { res.status(400).json({ error: "Arrêt invalide" }); return; }
      res.status(200).json({ reports: await list(stop) });
      return;
    }
    if (req.method !== "POST") { res.status(405).end(); return; }

    const b = await readBody(req);
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
    if (!validStop(b.stop) || !validDev(b.device)) { res.status(400).json({ error: "Requête invalide" }); return; }

    if (b.action === "confirm") {
      const id = clean(b.id, 20);
      const [added] = await redis([["SADD", `cd:${b.stop}:${id}`, b.device], ["EXPIRE", `cd:${b.stop}:${id}`, TTL]]);
      if (added === 1) await redis([["HINCRBY", "c:" + b.stop, id, 1], ["EXPIRE", "c:" + b.stop, TTL]]);
      res.status(200).json({ reports: await list(b.stop) });
      return;
    }

    // Nouveau signalement — 6 max par appareil et par IP toutes les 10 min
    const [nd, , ni] = await redis([["INCR", "rl:d:" + b.device], ["EXPIRE", "rl:d:" + b.device, 600], ["INCR", "rl:i:" + ip], ["EXPIRE", "rl:i:" + ip, 600]]);
    if (nd > 6 || ni > 12) { res.status(429).json({ error: "Trop de signalements, réessaie dans quelques minutes." }); return; }

    const type = TYPES.includes(b.type) ? b.type : null;
    if (!type) { res.status(400).json({ error: "Type invalide" }); return; }
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      line: clean(b.line, 8),
      lineColor: /^[0-9a-f]{6}$/i.test(b.lineColor || "") ? b.lineColor : "",
      msg: clean(b.msg, 140),
      t: Date.now()
    };
    await redis([["LPUSH", "r:" + b.stop, JSON.stringify(item)], ["LTRIM", "r:" + b.stop, 0, MAX_PER_STOP - 1], ["EXPIRE", "r:" + b.stop, TTL]]);
    res.status(200).json({ reports: await list(b.stop) });
  } catch (e) {
    res.status(502).json({ error: "Signalements indisponibles pour le moment." });
  }
}
