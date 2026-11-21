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
const VERSION = 'persist';
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
  './pwa.js?v=persist',
  './css/vaslweb.css?v=persist',
  './js/outils.js?v=persist',
  './js/donnees/ssr.js?v=persist',
  './js/donnees/overlays-ext.js?v=persist',
  './js/donnees/mouvement.js?v=persist',
  './js/langue.js?v=persist',
  './js/noyau.js?v=persist',
  './js/fichiers.js?v=persist',
  './js/carte.js?v=persist',
  './js/hexagones.js?v=persist',
  './js/los-moteur.js?v=persist',
  './js/los-pions.js?v=persist',
  './js/los-fil.js?v=persist',
  './js/pieces.js?v=persist',
  './js/pions.js?v=persist',
  './js/boards.js?v=persist',
  './js/vlog.js?v=persist',
  './js/mf.js?v=persist',
  './js/commandes.js?v=persist',
  './js/chat-rapports.js?v=persist',
  './js/flare.js?v=persist',
  './js/cvp.js?v=persist',
  './js/dissimulation.js?v=persist',
  './js/tactile.js?v=persist',
  './js/bdd.js?v=persist',
  './js/qrdc.js?v=persist',
  './js/oba.js?v=persist',
  './js/des-utilisateurs.js?v=persist',
  './js/des-3d.js?v=persist',
  './js/ift.js?v=persist',
  './js/reseau.js?v=persist',
  './js/export.js?v=persist',
  './js/preferences.js?v=persist',
  './js/qc.js?v=persist',
  './js/interface.js?v=persist',
  './js/chat.js?v=persist',
  './js/menus.js?v=persist'
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
