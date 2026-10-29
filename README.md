# Passages

Prochains passages métro, RER, bus, tram et Transilien en Île-de-France, en temps réel (API PRIM d'IDFM).

- `public/` : l'appli (PWA installable sur Android)
- `api/idfm.js` : proxy vers PRIM (évite le blocage CORS)

Clé API : soit collée dans l'appli (Réglages), soit en variable d'environnement `PRIM_KEY` sur Vercel.

## Signalements voyageurs
`api/reports.js` : signalements partagés par arrêt (retard, supprimé, bondé, incident…), effacés au bout de 2 h.
Nécessite une base Upstash Redis reliée au projet Vercel (Storage → Upstash Redis). Sans base, le bouton « Signaler » est masqué.
