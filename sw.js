// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER DE VASLweb
// L'application (VASLweb.html, manifeste, icônes) : réseau d'abord, pour
// qu'une nouvelle version publiée arrive dès la connexion suivante ; le
// cache ne sert que hors ligne.
// Les ressources VASL (raw.githubusercontent.com), PeerJS (unpkg) et les
// bibliothèques de lecture des PDF de scénario (cdn.jsdelivr.net, versions
// fixées) : gardées au fil des parties, pour rejouer hors ligne les boards
// déjà vus. Les métadonnées XML et le buildFile changent avec VASL : réseau
// d'abord ; les boards, overlays et images : cache d'abord.
// ═══════════════════════════════════════════════════════════════
// VERSION change à chaque publication : le cache de la version précédente
// est alors effacé à l'activation (pas celui des ressources VASL, dont le
// nom ne change pas : les boards vus restent hors ligne d'une version à
// l'autre). La même valeur suit en « ?v=<version> » les .js et .css de APP
// et de VASLweb.html, pour qu'une page neuve ne prenne jamais un script de
// la version d'avant dans un cache HTTP.
// APP : tout fichier de l'application.
const VERSION = 'maj-cartes';
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
  './pwa.js?v=maj-cartes',
  './css/vaslweb.css?v=maj-cartes',
  './js/outils.js?v=maj-cartes',
  './js/donnees/ssr.js?v=maj-cartes',
  './js/donnees/overlays-ext.js?v=maj-cartes',
  './js/donnees/mouvement.js?v=maj-cartes',
  './js/langue.js?v=maj-cartes',
  './js/noyau.js?v=maj-cartes',
  './js/fichiers.js?v=maj-cartes',
  './js/carte.js?v=maj-cartes',
  './js/hexagones.js?v=maj-cartes',
  './js/los-moteur.js?v=maj-cartes',
  './js/los-pions.js?v=maj-cartes',
  './js/los-fil.js?v=maj-cartes',
  './js/pieces.js?v=maj-cartes',
  './js/pions.js?v=maj-cartes',
  './js/boards.js?v=maj-cartes',
  './js/vlog.js?v=maj-cartes',
  './js/mf.js?v=maj-cartes',
  './js/commandes.js?v=maj-cartes',
  './js/chat-rapports.js?v=maj-cartes',
  './js/flare.js?v=maj-cartes',
  './js/cvp.js?v=maj-cartes',
  './js/dissimulation.js?v=maj-cartes',
  './js/tactile.js?v=maj-cartes',
  './js/bdd.js?v=maj-cartes',
  './js/qrdc.js?v=maj-cartes',
  './js/oba.js?v=maj-cartes',
  './js/des-utilisateurs.js?v=maj-cartes',
  './js/des-3d.js?v=maj-cartes',
  './js/ift.js?v=maj-cartes',
  './js/reseau.js?v=maj-cartes',
  './js/export.js?v=maj-cartes',
  './js/preferences.js?v=maj-cartes',
  './js/qc.js?v=maj-cartes',
  './js/interface.js?v=maj-cartes',
  './js/chat.js?v=maj-cartes',
  './js/menus.js?v=maj-cartes'
];
const HOTES_VASL = ['raw.githubusercontent.com', 'unpkg.com', 'cdn.jsdelivr.net'];

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

async function rafraichir(req, cache){
  const r = await fetch(req);
  if(r.ok) (await caches.open(cache)).put(req.url, r.clone());
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
    // « Mise à jour des cartes » (roue ⚙) : la page demande le fichier
    // avec cache: 'reload' ; il est pris au réseau et remplace celui du
    // cache. Pas de repli sur le cache : un échec doit se voir.
    if(req.cache === 'reload'){ e.respondWith(rafraichir(req, CACHE_VASL)); return; }
    const variable = /\.xml$|\/buildFile$/i.test(url.pathname);
    e.respondWith(variable ? reseauDabord(req, CACHE_VASL) : cacheDabord(req, CACHE_VASL));
  }
});
