// Indique à l'appli si une clé PRIM est déjà configurée côté serveur (sans la révéler).
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ serverKey: !!process.env.PRIM_KEY });
}
