// Proxy vers l'API PRIM d'Île-de-France Mobilités.
// Évite les blocages CORS du navigateur. La clé vient de la variable
// d'environnement PRIM_KEY (Vercel) ou de l'en-tête x-apikey envoyé par l'appli.

const BASE = "https://prim.iledefrance-mobilites.fr/marketplace/";
const ALLOWED = [/^v2\/navitia\/[A-Za-z0-9_:;.\-\/%]+$/, /^stop-monitoring$/];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url, "http://x");
  const path = url.searchParams.get("p") || "";
  if (!ALLOWED.some((r) => r.test(path))) {
    res.status(400).json({ error: "Chemin non autorisé" });
    return;
  }
  url.searchParams.delete("p");
  const key = process.env.PRIM_KEY || req.headers["x-apikey"];
  if (!key) {
    res.status(401).json({ error: "Clé API manquante" });
    return;
  }
  const target = BASE + path + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "");
  try {
    const r = await fetch(target, { headers: { apikey: String(key), Accept: "application/json" } });
    const body = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: "Serveur IDFM injoignable" });
  }
}
