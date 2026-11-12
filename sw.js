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
// VERSION est remplacée à la publication par le commit publié
// (outils/publier-vaslweb.sh) : le cache de la version précédente est
// alors effacé à l'activation (pas celui des ressources VASL, dont le nom
// ne change pas : les boards vus restent hors ligne d'une version à
// l'autre). Le même script ajoute « ?v=<commit> » aux
// .js et .css de APP et de VASLweb.html, pour qu'une page neuve ne
// prenne jamais un script de la version d'avant dans un cache HTTP.
// APP : tout fichier de l'application (le script de publication refuse
// une page qui charge un .js ou un .css absent de cette liste).
const VERSION = 'souris-chat-pc';
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
  './pwa.js?v=souris-chat-pc',
  './css/vaslweb.css?v=souris-chat-pc',
  './js/outils.js?v=souris-chat-pc',
  './js/donnees/ssr.js?v=souris-chat-pc',
  './js/donnees/overlays-ext.js?v=souris-chat-pc',
  './js/donnees/mouvement.js?v=souris-chat-pc',
  './js/langue.js?v=souris-chat-pc',
  './js/noyau.js?v=souris-chat-pc',
  './js/fichiers.js?v=souris-chat-pc',
  './js/carte.js?v=souris-chat-pc',
  './js/hexagones.js?v=souris-chat-pc',
  './js/los-moteur.js?v=souris-chat-pc',
  './js/los-pions.js?v=souris-chat-pc',
  './js/los-fil.js?v=souris-chat-pc',
  './js/pieces.js?v=souris-chat-pc',
  './js/pions.js?v=souris-chat-pc',
  './js/vlog.js?v=souris-chat-pc',
  './js/mf.js?v=souris-chat-pc',
  './js/commandes.js?v=souris-chat-pc',
  './js/chat-rapports.js?v=souris-chat-pc',
  './js/flare.js?v=souris-chat-pc',
  './js/cvp.js?v=souris-chat-pc',
  './js/dissimulation.js?v=souris-chat-pc',
  './js/tactile.js?v=souris-chat-pc',
  './js/bdd.js?v=souris-chat-pc',
  './js/qrdc.js?v=souris-chat-pc',
  './js/oba.js?v=souris-chat-pc',
  './js/des-utilisateurs.js?v=souris-chat-pc',
  './js/des-3d.js?v=souris-chat-pc',
  './js/ift.js?v=souris-chat-pc',
  './js/reseau.js?v=souris-chat-pc',
  './js/export.js?v=souris-chat-pc',
  './js/preferences.js?v=souris-chat-pc',
  './js/qc.js?v=souris-chat-pc',
  './js/interface.js?v=souris-chat-pc',
  './js/chat.js?v=souris-chat-pc',
  './js/menus.js?v=souris-chat-pc'
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
