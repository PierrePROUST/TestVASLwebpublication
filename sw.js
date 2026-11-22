// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER DE VASLweb
// L'application (VASLweb.html, manifeste, icônes) : réseau d'abord, pour
// qu'une nouvelle version publiée arrive dès la connexion suivante ; le
// cache ne sert que hors ligne.
// Les ressources VASL (raw.githubusercontent.com) et PeerJS (unpkg) :
// gardées au fil des parties, pour rejouer hors ligne les boards déjà
// vus. Les métadonnées XML et le buildFile changent avec VASL : réseau
// d'abord ; les boards, overlays et images : cache d'abord.
// ═══════════════════════════════════════════════════════════════
// VERSION change à chaque publication : le cache de la version précédente
// est alors effacé à l'activation (pas celui des ressources VASL, dont le
// nom ne change pas : les boards vus restent hors ligne d'une version à
// l'autre). La même valeur suit en « ?v=<version> » les .js et .css de APP
// et de VASLweb.html, pour qu'une page neuve ne prenne jamais un script de
// la version d'avant dans un cache HTTP.
// APP : tout fichier de l'application.
const VERSION = 'nouvelle';
const CACHE_APP = 'vaslweb-app-' + VERSION;
// Nom fixe ; « -v1 » garde le cache des boards des versions d'avant.
const CACHE_VASL = 'vaslweb-vasl-v1';
const APP = [
  './',
  './index.html',
  './VASLweb.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './modeles/nouvelle-partie.vsav',
  './pwa.js?v=nouvelle',
  './css/vaslweb.css?v=nouvelle',
  './js/outils.js?v=nouvelle',
  './js/donnees/ssr.js?v=nouvelle',
  './js/donnees/overlays-ext.js?v=nouvelle',
  './js/donnees/mouvement.js?v=nouvelle',
  './js/langue.js?v=nouvelle',
  './js/noyau.js?v=nouvelle',
  './js/fichiers.js?v=nouvelle',
  './js/carte.js?v=nouvelle',
  './js/hexagones.js?v=nouvelle',
  './js/los-moteur.js?v=nouvelle',
  './js/los-pions.js?v=nouvelle',
  './js/los-fil.js?v=nouvelle',
  './js/pieces.js?v=nouvelle',
  './js/pions.js?v=nouvelle',
  './js/boards.js?v=nouvelle',
  './js/vlog.js?v=nouvelle',
  './js/mf.js?v=nouvelle',
  './js/commandes.js?v=nouvelle',
  './js/chat-rapports.js?v=nouvelle',
  './js/flare.js?v=nouvelle',
  './js/cvp.js?v=nouvelle',
  './js/dissimulation.js?v=nouvelle',
  './js/tactile.js?v=nouvelle',
  './js/bdd.js?v=nouvelle',
  './js/qrdc.js?v=nouvelle',
  './js/oba.js?v=nouvelle',
  './js/des-utilisateurs.js?v=nouvelle',
  './js/des-3d.js?v=nouvelle',
  './js/ift.js?v=nouvelle',
  './js/reseau.js?v=nouvelle',
  './js/export.js?v=nouvelle',
  './js/preferences.js?v=nouvelle',
  './js/qc.js?v=nouvelle',
  './js/interface.js?v=nouvelle',
  './js/chat.js?v=nouvelle',
  './js/menus.js?v=nouvelle'
];
const HOTES_VASL = ['raw.githubusercontent.com', 'unpkg.com'];

// À l'installation, les fichiers sont pris au serveur, jamais dans le cache
// HTTP (10 minutes sur GitHub Pages) : sinon le cache d'une version neuve
// pourrait garder la page d'avant, qui demande des « ?v= » effacés avec
// l'ancien cache, et l'application s'ouvrirait hors ligne sans eux.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_APP).then(c => c.addAll(APP.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

// À l'activation, les caches de l'application des versions d'avant sont
// effacés : seulement les siens. Sur GitHub Pages, une autre publication
// (pierreproust.github.io/VASLweb/ et un site d'essai à côté) a la même
// origine, donc les mêmes caches : un cache n'est effacé que si toutes ses
// entrées sont sous l'adresse de ce service worker (registration.scope).
// Le cache des boards (CACHE_VASL) est commun et gardé.
async function aMoi(nom){
  const entrees = await (await caches.open(nom)).keys();
  return entrees.every(r => r.url.startsWith(self.registration.scope));
}
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k.startsWith('vaslweb-app-') && k !== CACHE_APP)
      .map(async k => { if(await aMoi(k)) await caches.delete(k); })))
    .then(() => self.clients.claim())
    // Les pages ouvertes apprennent la version active : pwa.js propose de
    // recharger celles d'une version d'avant.
    .then(() => self.clients.matchAll({type: 'window'}))
    .then(pages => pages.forEach(p => p.postMessage({vaslweb: VERSION}))));
});

async function reseauDabord(req, cache, cle = req){
  try {
    const r = await fetch(req);
    if(r.ok) (await caches.open(cache)).put(cle, r.clone());
    return r;
  } catch(err){
    const m = await caches.match(cle);
    if(m) return m;
    throw err;
  }
}

async function cacheDabord(req, cache){
  const m = await caches.match(req);
  if(m) return m;
  const r = await fetch(req);
  if(r.ok) (await caches.open(cache)).put(req, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    // « VASLweb.html?lang=en » se sert hors ligne de la même page en cache.
    // La page elle-même est revalidée auprès du serveur (no-cache) : une
    // version publiée arrive dès l'ouverture suivante, et le cache n'en
    // garde jamais une plus ancienne. Les .js / .css portent « ?v= » : le
    // cache HTTP leur suffit.
    const page = req.mode === 'navigate';
    const cle = page ? new Request(url.origin + url.pathname) : req;
    e.respondWith(reseauDabord(page ? new Request(req, {cache: 'no-cache'}) : req, CACHE_APP, cle));
    return;
  }

  if(HOTES_VASL.includes(url.hostname)){
    const variable = /\.xml$|\/buildFile$/i.test(url.pathname);
    e.respondWith(variable ? reseauDabord(req, CACHE_VASL) : cacheDabord(req, CACHE_VASL));
  }
});
