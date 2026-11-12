// ═══════════════════════════════════════════════════════════════
// ESSAI — FIGURINES FILAIRES À LA PLACE DU PION
// Page d'essai isolée (essais/figurines.html) : rien n'est branché sur
// VASLweb. Une squad américaine dessinée en fil de fer, homme par homme,
// sur une carte vue de dessus ; chaque homme est vu un peu de biais
// (« hauteur de vue »), sans quoi il se réduirait à un point.
// Sans bibliothèque : une projection écrite à la main, en Canvas 2D.
//
// Décor seulement. La composition (effectif, armes) est historique, pas
// une donnée de VASL : claude/table-effectifs-armes-figurines.md.
// La teinte est celle du fond du pion VASL de la nationalité
// (am666S.svg, rect « color » : #cddb42).
// ═══════════════════════════════════════════════════════════════
const VASL_IMAGES_URL = 'https://raw.githubusercontent.com/vasl-developers/vasl/develop/dist/images/';

// Une seule composition par nationalité. chef, puis l'arme collective,
// puis les fusiliers : la demi-squad garde les premiers.
const COMPOSITIONS = {
  am: {nom: 'Squad américaine', teinte: '#cddb42',
       pion: 'am/am666S.svg', facteur: '6-6-6', pionHS: 'am/am346H.svg', facteurHS: '3-4-6',
       hommes: ['garand', 'bar', 'garand', 'garand', 'garand', 'garand',
                'garand', 'garand', 'garand', 'garand', 'garand', 'garand']},
};
// Longueurs en mètres : crosse derrière la main droite, canon devant.
const ARMES = {
  garand: {nom: 'M1', crosse: .32, canon: .78, trait: 1},
  bar:    {nom: 'BAR', crosse: .32, canon: .90, trait: 1.5, chargeur: true, bipied: true, cadence: 5},
};

// ── Petits outils ─────────────────────────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lon = a => Math.hypot(a[0], a[1], a[2]);
const uni = a => { const l = lon(a) || 1; return mul(a, 1 / l); };
// Hasard reproductible : le même pion (uid) donne la même disposition
// chez tous les joueurs, sans rien échanger.
function hasard(graine){
  let h = 2166136261;
  for(const c of String(graine)){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ── Squelette ─────────────────────────────────────────────────
// Repère d'un homme : x à sa droite, y devant lui, z vers le haut (m).
const OS = {cuisse: .46, tibia: .48, bras: .30, avant: .28, tronc: .55, cou: .17};
// Articulation du milieu d'un membre à deux os (genou, coude).
function plier(a, b, l1, l2, sens){
  let v = sub(b, a), d = lon(v);
  const max = l1 + l2 - .005;
  if(d > max){ v = mul(v, max / d); d = max; }
  const u = uni(v);
  const k = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - k * k));
  const perp = uni(sub(sens, mul(u, dot(sens, u))));
  return add(add(a, mul(u, k)), mul(perp, h));
}
// Une pose : bassin, inclinaison du tronc vers l'avant, pieds, mains.
function corps(p){
  const pel = p.bassin, dir = [0, Math.sin(p.penche), Math.cos(p.penche)];
  const cou = add(pel, mul(dir, OS.tronc));
  const at = p.penche - (p.tete || 0);
  const tete = add(cou, mul([0, Math.sin(at), Math.cos(at)], OS.cou));
  const J = {pel, cou, tete,
    epG: add(cou, [-.2, 0, 0]), epD: add(cou, [.2, 0, 0]),
    haG: add(pel, [-.1, 0, 0]), haD: add(pel, [.1, 0, 0]),
    piG: p.piedG, piD: p.piedD};
  J.maG = p.mainG === 'tete' ? add(tete, [-.13, .03, .03]) : p.mainG;
  J.maD = p.mainD === 'tete' ? add(tete, [.13, .03, .03]) : p.mainD;
  J.geG = plier(J.haG, J.piG, OS.cuisse, OS.tibia, p.genouG || [0, 1, .2]);
  J.geD = plier(J.haD, J.piD, OS.cuisse, OS.tibia, p.genouD || [0, 1, .2]);
  J.coG = plier(J.epG, J.maG, OS.bras, OS.avant, p.coude || [-.6, -.3, -1]);
  J.coD = plier(J.epD, J.maD, OS.bras, OS.avant, p.coude ? [-p.coude[0], p.coude[1], p.coude[2]] : [.6, -.3, -1]);
  return J;
}
// L'arme suit les mains (crosse derrière la droite, canon vers la
// gauche), sauf posée à terre (p.arme : [crosse, bouche]).
function poserArme(J, p, arme){
  if(p.arme){ J.aA = p.arme[0]; J.aB = p.arme[1]; return J; }
  const d = uni(p.axe || sub(J.maG, J.maD));
  J.aA = sub(J.maD, mul(d, arme.crosse));
  J.aB = add(J.maD, mul(d, arme.canon));
  return J;
}

// ── Poses ─────────────────────────────────────────────────────
// h : l'homme (arme, écarts propres) ; ph : phase du pas.
const POSES = {
  debout(h){
    return {bassin: [0, 0, .93], penche: .06,
      piedG: [-.11, .04 * h.e1, 0], piedD: [.11, -.04 * h.e1, 0],
      mainD: [.13, .16, 1.05], mainG: [-.10, .30, 1.27 + .04 * h.e2]};
  },
  marche(h, ph){
    const s = Math.sin(ph), c = Math.cos(ph);
    return {bassin: [0, 0, .90 + .02 * Math.cos(2 * ph)], penche: .16,
      piedG: [-.10, .30 * s, .10 * Math.max(0, c)], piedD: [.10, -.30 * s, .10 * Math.max(0, -c)],
      mainD: [.14, .16 + .03 * s, 1.02], mainG: [-.10, .32 - .03 * s, 1.24]};
  },
  // Le fusilier tire un genou à terre, le fusil-mitrailleur couché sur
  // son bipied.
  tir(h){
    if(h.arme.bipied) return POSES.couche(h);
    return {bassin: [0, 0, .50], penche: .12,
      piedG: [-.12, .36, 0], piedD: [.13, -.42, .03], genouG: [0, 1, 1], genouD: [0, .6, -1],
      mainD: [.15, .22, 1.02], mainG: [.05, .54, 1.03]};
  },
  couche(h){
    return {bassin: [0, -.40, .12], penche: 1.33, tete: .75,
      piedG: [-.16, -1.30, .03], piedD: [.18, -1.28, .03], genouG: [-.4, 0, 1], genouD: [.4, 0, 1],
      mainD: [.16, .42, .16], mainG: [.04, .70, .17], coude: [-1, -.2, -.6]};
  },
  // Cassé : recroquevillé, les mains sur le casque, l'arme à terre.
  casse(h){
    return {bassin: [0, 0, .40], penche: .75, tete: .1,
      piedG: [-.13, .16, 0], piedD: [.13, .12, 0], genouG: [-.2, 1, .6], genouD: [.2, 1, .6],
      mainG: 'tete', mainD: 'tete', coude: [-1, .3, -.3],
      arme: [[.38, -.35, .03], [.42, .2 + h.arme.canon, .03]]};
  },
  // Cassé en mouvement : il court courbé, l'arme au bout du bras.
  fuite(h, ph){
    const s = Math.sin(ph), c = Math.cos(ph);
    return {bassin: [0, 0, .80 + .03 * Math.cos(2 * ph)], penche: .55, tete: .2,
      piedG: [-.10, .38 * s, .16 * Math.max(0, c)], piedD: [.10, -.38 * s, .16 * Math.max(0, -c)],
      mainD: [.24, .10 - .1 * s, .72], mainG: [-.24, .15 + .2 * s, .85], axe: [0, .95, -.25]};
  },
  tombe(h){
    const k = h.e1 > 0 ? 1 : -1;
    return {bassin: [0, 0, .10], penche: k * 1.5, tete: 0,
      piedG: [-.22, -k * .85, .03], piedD: [.12, -k * .92, .03], genouG: [-1, 0, .3], genouD: [1, 0, .3],
      mainG: [-.62, k * .55, .03], mainD: [.55, k * .25, .03], coude: [-1, 0, .2],
      arme: [[.75, -.2 * k, .03], [.95, (.9 + .3 * h.e2) * k, .03]]};
  },
};

// ── La squad ──────────────────────────────────────────────────
const S = {                     // tout l'état de la démonstration
  compo: COMPOSITIONS.am, uid: 'essai-am666S',
  etat: 'debout', cap: Math.PI / 2,   // cap : 0 = vers le haut de l'écran, π/2 = vers la droite
  pos: [0, 0], but: [0, 0],     // centre du pion, en côtés de pion
  hommes: [], hs: false,
};
const METRE = .15;              // un mètre, en côtés de pion (1,75 m ≈ ¼ de pion)

function creerSquad(){
  const r = hasard(S.uid);
  S.hommes = S.compo.hommes.map((a, i) => ({
    i, arme: ARMES[a], e1: r() * 2 - 1, e2: r() * 2 - 1, e3: r() * 2 - 1, e4: r(),
    pos: [0, 0], cap: 0, ph: r() * 6, J: null, mort: 0, eclair: 0, rafale: 0, bouge: false}));
  S.hs = false; S.etat = 'debout'; S.cap = Math.PI / 2; S.pos = [0, 0]; S.but = [0, 0];
  placer(true);
}
const vivants = () => S.hommes.filter(h => !h.mort);

// Place de chacun dans le carré du pion, selon l'état (côtés de pion,
// y vers l'avant de la squad), puis tournée selon le cap.
function placesFormation(){
  const v = vivants(), n = v.length, enRoute = lon([S.but[0] - S.pos[0], S.but[1] - S.pos[1], 0]) > .01;
  const out = new Map();
  v.forEach((h, k) => {
    let x, y, cap = S.cap;
    if(S.etat === 'casse'){
      const a = h.e4 * 6.283, d = .08 + .22 * Math.abs(h.e3);
      x = Math.cos(a) * d; y = Math.sin(a) * d; cap = S.cap + 3.1416 + h.e1 * 1.2;
    } else if(enRoute){
      const rangs = Math.ceil(n / 2), rg = Math.floor(k / 2);
      x = (k % 2 ? .09 : -.09) + .015 * h.e1; y = ((rangs - 1) / 2 - rg) * .15 + .015 * h.e2;
    } else {
      // Rangs en quinconce (trois debout, deux en position de tir ou à
      // terre) ; l'arme collective au centre du premier.
      const rangs = S.etat === 'debout' ? 3 : 2, cols = Math.ceil(n / rangs);
      const ordre = [1, 0, ...v.map((_, j) => j).slice(2)];
      const q = n > 1 ? ordre.indexOf(k) : 0, rg = Math.floor(q / cols), c = q % cols;
      const milieu = [...Array(cols).keys()].sort((a, b) => Math.abs(a - (cols - 1) / 2) - Math.abs(b - (cols - 1) / 2));
      const col = rg ? c : milieu[c];
      const pas = S.etat === 'debout' ? .2 : .15, prof = S.etat === 'debout' ? .2 : .34;
      x = (col - (cols - 1) / 2 + (rg % 2 ? .25 : -.25)) * pas + .012 * h.e1;
      y = ((rangs - 1) / 2 - rg) * prof + .012 * h.e2;
      cap += .12 * h.e3;
    }
    const s = Math.sin(S.cap), c2 = Math.cos(S.cap);
    out.set(h, {x: S.pos[0] + x * c2 + y * s, y: S.pos[1] + x * s - y * c2, cap});
  });
  return out;
}
function placer(tout){
  const pl = placesFormation();
  for(const [h, p] of pl){ h.but = p; if(tout){ h.pos = [p.x, p.y]; h.cap = p.cap; h.J = null; } }
}

// ── Actions (ce que VASLweb appellerait) ──────────────────────
function changerEtat(e){ S.etat = e; placer(); majBoutons(); }
function deplacerVers(x, y){
  const dx = x - S.pos[0], dy = y - S.pos[1];
  if(Math.hypot(dx, dy) < .01 || !vivants().length) return;
  S.but = [x, y]; S.cap = Math.atan2(dx, -dy);
  // Une unité cassée ne reste pas cassée en mouvement dans cet essai :
  // elle court (pose « fuite ») puis se recroqueville à l'arrivée.
}
function tomber(liste){
  liste.forEach((h, k) => { h.mort = performance.now() + 150 + 500 * h.e4 + 60 * k; });
}
function reduire(){
  if(S.hs) return;
  const v = vivants(); tomber(v.slice(Math.ceil(v.length / 2))); S.hs = true;
  setTimeout(placer, 900); majInfo();
}
function eliminer(){ tomber(vivants()); majInfo(); }

// ── Animation ─────────────────────────────────────────────────
const VITESSE_PION = .95, VITESSE_HOMME = 1.5, FOULEE = .11;   // côtés de pion / s
const tourner = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function avancer(dt, t){
  // Le pion glisse vers son hexagone ; les hommes rejoignent leur place.
  const dx = S.but[0] - S.pos[0], dy = S.but[1] - S.pos[1], d = Math.hypot(dx, dy);
  if(d > 0){
    const pas = Math.min(d, VITESSE_PION * dt);
    S.pos[0] += dx / d * pas; S.pos[1] += dy / d * pas;
    if(pas === d) S.pos = [...S.but];
  }
  const pl = placesFormation();
  const lisse = 1 - Math.exp(-dt * 11);
  for(const h of S.hommes){
    const tombe = h.mort && t >= h.mort;
    if(!h.mort) h.but = pl.get(h);
    let cible;
    if(tombe){ h.bouge = false; cible = POSES.tombe(h); }
    else {
      const ex = h.but.x - h.pos[0], ey = h.but.y - h.pos[1], e = Math.hypot(ex, ey);
      h.bouge = e > .004;
      if(h.bouge){
        const v = VITESSE_HOMME * (S.etat === 'casse' ? 1.25 : 1) * (.9 + .1 * h.e4);
        const pas = Math.min(e, v * dt);
        h.pos[0] += ex / e * pas; h.pos[1] += ey / e * pas;
        h.ph += pas / FOULEE * (S.etat === 'casse' ? .8 : 1);
        h.cap = tourner(h.cap, Math.atan2(ex, -ey), Math.min(1, dt * 10));
        cible = (S.etat === 'casse' ? POSES.fuite : POSES.marche)(h, h.ph);
      } else {
        h.cap = tourner(h.cap, h.but.cap, Math.min(1, dt * 6));
        cible = POSES[S.etat](h);
      }
    }
    const J = poserArme(corps(cible), cible, h.arme);
    if(!h.J) h.J = J;
    else for(const k in J) for(let a = 0; a < 3; a++) h.J[k][a] += (J[k][a] - h.J[k][a]) * (h.bouge ? Math.min(1, lisse * 2.2) : lisse);
    // Coups de feu : au hasard pour un fusil, par rafales pour le BAR.
    h.eclair = Math.max(0, h.eclair - dt);
    if(S.etat === 'tir' && !h.bouge && !h.mort){
      if(h.arme.cadence){
        if(h.rafale > 0){ h.rafale -= dt; if(Math.random() < dt * h.arme.cadence * 2.4) h.eclair = .05; }
        else if(Math.random() < dt * .7) h.rafale = .5 + Math.random() * .6;
      } else if(Math.random() < dt * .55) h.eclair = .07;
    }
  }
}

// ── Dessin ────────────────────────────────────────────────────
const cv = document.getElementById('cv'), g = cv.getContext('2d');
let COTE = 200, ELEV = 50 * Math.PI / 180, L = 0, H = 0;
const HEX_H = 64.5 / 48, HEX_A = HEX_H / Math.sqrt(3), HEX_DX = 1.5 * HEX_A;   // hexagone VASL, en côtés de pion
const ecran = (x, y) => [L / 2 + x * COTE, H / 2 + y * COTE];
function centreHex(c, r){ return [c * HEX_DX, r * HEX_H + (c & 1 ? HEX_H / 2 : 0)]; }
function hexProche(x, y){
  let m = null, dm = 1e9;
  for(let c = -12; c <= 12; c++) for(let r = -12; r <= 12; r++){
    const [hx, hy] = centreHex(c, r), d = Math.hypot(hx - x, hy - y);
    if(d < dm){ dm = d; m = [hx, hy]; }
  }
  return m;
}
// Terrain d'essai : terrain ouvert, quelques bois et bâtiments, pour
// juger la lisibilité des traits sur des fonds différents.
const TERRAIN = {'2,-1': '#5d8a3c', '2,0': '#5d8a3c', '3,-1': '#5d8a3c', '-2,1': '#9a9488', '-3,0': '#9a9488', '-1,-2': '#c9b458', '0,2': '#8fb7d6'};
function dessinerCarte(){
  g.fillStyle = '#c3d17a'; g.fillRect(0, 0, L, H);
  const nc = Math.ceil(L / 2 / (HEX_DX * COTE)) + 1, nr = Math.ceil(H / 2 / (HEX_H * COTE)) + 1;
  g.lineWidth = 1; g.strokeStyle = 'rgba(60,70,30,.45)';
  for(let c = -nc; c <= nc; c++) for(let r = -nr; r <= nr; r++){
    const [x, y] = ecran(...centreHex(c, r));
    g.beginPath();
    for(let k = 0; k < 6; k++){
      const a = k * Math.PI / 3;
      g.lineTo(x + Math.cos(a) * HEX_A * COTE, y + Math.sin(a) * HEX_A * COTE);
    }
    g.closePath();
    const f = TERRAIN[c + ',' + r];
    if(f){ g.fillStyle = f; g.fill(); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(x - 1, y - 1, 2, 2);
  }
}
function arrondi(x, y, w, h, r){
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const images = {};
function dessinerPion(alpha){
  const [x, y] = ecran(...S.pos), nomImg = S.hs ? S.compo.pionHS : S.compo.pion, im = images[nomImg];
  g.save(); g.globalAlpha = alpha;
  if(im) g.drawImage(im, x - COTE / 2, y - COTE / 2, COTE, COTE);
  else {
    arrondi(x - COTE / 2, y - COTE / 2, COTE, COTE, COTE / 12); g.fillStyle = S.compo.teinte; g.fill();
    g.fillStyle = '#000'; g.font = `bold ${COTE / 4}px Helvetica,Arial,sans-serif`; g.textAlign = 'center';
    g.fillText(S.hs ? S.compo.facteurHS : S.compo.facteur, x, y + COTE * .4);
  }
  g.restore();
}
// Un point du repère d'un homme → l'écran. Le sol de la carte reste vu
// de dessus ; seul le corps est vu sous l'angle ELEV.
function projeter(h, p){
  const s = Math.sin(h.cap), c = Math.cos(h.cap), m = METRE * COTE;
  const gx = p[0] * c + p[1] * s, gy = p[0] * s - p[1] * c;
  const [ox, oy] = ecran(h.pos[0], h.pos[1]);
  return [ox + gx * m, oy + gy * m * Math.sin(ELEV) - p[2] * m * Math.cos(ELEV)];
}
const MEMBRES = [['piG', 'geG', 'haG', 'pel', 'haD', 'geD', 'piD'], ['pel', 'cou'], ['epG', 'epD'],
                 ['epG', 'coG', 'maG'], ['epD', 'coD', 'maD']];
function dessinerHomme(h, t){
  let alpha = 1;
  if(h.mort){ const age = (t - h.mort) / 1000; if(age > 3) return; if(age > 1.4) alpha = 1 - (age - 1.4) / 1.6; }
  const J = h.J, P = k => projeter(h, J[k]), ep = Math.max(1, COTE * .011);
  g.save(); g.globalAlpha = alpha; g.lineCap = 'round'; g.lineJoin = 'round';
  // Ombre au sol.
  const [ox, oy] = projeter(h, [J.pel[0], J.pel[1], 0]);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath();
  g.ellipse(ox, oy, COTE * .035, COTE * .022, 0, 0, 6.3); g.fill();
  const corpsP = new Path2D();
  for(const m of MEMBRES) m.forEach((k, i) => { const [x, y] = P(k); i ? corpsP.lineTo(x, y) : corpsP.moveTo(x, y); });
  const armeP = new Path2D(), a = P('aA'), b = P('aB');
  armeP.moveTo(...a); armeP.lineTo(...b);
  if(h.arme.chargeur){
    const d = sub(J.aB, J.aA), q = add(J.aA, mul(d, .42));
    armeP.moveTo(...projeter(h, q)); armeP.lineTo(...projeter(h, add(q, [0, 0, -.14])));
  }
  if(h.arme.bipied){
    const d = sub(J.aB, J.aA), q = add(J.aA, mul(d, .86));
    if(q[2] < .45) for(const k of [-1, 1]){
      armeP.moveTo(...projeter(h, q)); armeP.lineTo(...projeter(h, [q[0] + k * .12, q[1], 0]));
    }
  }
  // Liseré sombre puis trait teinté : lisible sur tous les terrains.
  g.strokeStyle = '#141a08'; g.lineWidth = ep + 2; g.stroke(corpsP);
  g.lineWidth = ep * h.arme.trait + 2; g.stroke(armeP);
  g.strokeStyle = S.compo.teinte; g.lineWidth = ep; g.stroke(corpsP);
  g.strokeStyle = '#f4f1e6'; g.lineWidth = Math.max(1, ep * h.arme.trait * .8); g.stroke(armeP);
  // Tête casquée.
  const [tx, ty] = P('tete'), r = .115 * METRE * COTE;
  g.beginPath(); g.arc(tx, ty, r, 0, 6.3); g.fillStyle = S.compo.teinte; g.fill();
  g.lineWidth = Math.max(1, ep * .6); g.strokeStyle = '#141a08'; g.stroke();
  if(h.eclair > 0){
    g.fillStyle = '#fff3a0'; g.strokeStyle = '#ff9d1e'; g.lineWidth = 1;
    const e = COTE * .022 * (h.arme.cadence ? 1.2 : 1);
    g.beginPath();
    for(let k = 0; k < 8; k++){ const an = k * Math.PI / 4, rr = k % 2 ? e * .4 : e; g.lineTo(b[0] + Math.cos(an) * rr, b[1] + Math.sin(an) * rr); }
    g.closePath(); g.fill(); g.stroke();
  }
  if(etiquettes && !h.mort){
    g.font = `600 ${Math.max(9, COTE * .05)}px system-ui,sans-serif`; g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.fillStyle = '#fff';
    const txt = h.i === 0 ? 'Chef' : h.arme.nom;
    g.strokeText(txt, tx, ty - r - 3); g.fillText(txt, tx, ty - r - 3);
  }
  g.restore();
}
let etiquettes = false, plaque = true, autoLod = true;
function dessiner(t){
  dessinerCarte();
  const loin = autoLod && COTE < 100;
  if(loin){ if(vivants().length) dessinerPion(1); return; }
  if(vivants().length){
    const [x, y] = ecran(...S.pos);
    if(plaque){
      arrondi(x - COTE / 2, y - COTE / 2, COTE, COTE, COTE / 12);
      g.fillStyle = S.compo.teinte + '55'; g.fill();
      g.strokeStyle = 'rgba(20,26,8,.55)'; g.lineWidth = 1; g.stroke();
    }
    // Le facteur du pion, au pied des figurines.
    g.font = `bold ${Math.max(10, COTE * .085)}px Helvetica,Arial,sans-serif`; g.textAlign = 'left';
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.75)'; g.fillStyle = '#000';
    const txt = S.hs ? S.compo.facteurHS : S.compo.facteur;
    g.strokeText(txt, x - COTE * .46, y + COTE * .455); g.fillText(txt, x - COTE * .46, y + COTE * .455);
  }
  // Du fond vers l'avant ; les hommes à terre d'abord.
  const ordre = S.hommes.filter(h => h.J).sort((a, b) => (a.mort ? 0 : 1) - (b.mort ? 0 : 1) || a.pos[1] - b.pos[1]);
  for(const h of ordre) dessinerHomme(h, t);
}

// ── Boucle, taille, commandes ─────────────────────────────────
function tailler(){
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  L = r.width; H = r.height; cv.width = Math.round(L * d); cv.height = Math.round(H * d);
  g.setTransform(d, 0, 0, d, 0, 0);
}
let avant = 0;
function boucle(t){
  const dt = Math.min(.05, (t - avant) / 1000 || 0); avant = t;
  avancer(dt, t); dessiner(t);
  requestAnimationFrame(boucle);
}
function majBoutons(){
  document.querySelectorAll('#etats [data-etat]').forEach(b => b.classList.toggle('actif', b.dataset.etat === S.etat));
}
function majInfo(){
  const v = S.hommes.filter(h => !h.mort), n = {};
  for(const h of v) n[h.arme.nom] = (n[h.arme.nom] || 0) + 1;
  const detail = Object.entries(n).map(([k, q]) => `${q} ${k === 'M1' ? 'M1 Garand' : k}`).join(', ');
  document.getElementById('info').textContent = v.length
    ? `${S.compo.nom}${S.hs ? ' (demi-squad)' : ''} ${S.hs ? S.compo.facteurHS : S.compo.facteur} — ${v.length} hommes : ${detail}. Teinte du pion VASL : ${S.compo.teinte}.`
    : 'Squad éliminée.';
}
document.querySelectorAll('#etats [data-etat]').forEach(b => b.addEventListener('click', () => changerEtat(b.dataset.etat)));
document.getElementById('reduire').addEventListener('click', reduire);
document.getElementById('eliminer').addEventListener('click', eliminer);
document.getElementById('reinit').addEventListener('click', () => { creerSquad(); majBoutons(); majInfo(); });
const elTaille = document.getElementById('taille'), elVue = document.getElementById('vue');
function majReglages(){
  COTE = +elTaille.value; ELEV = +elVue.value * Math.PI / 180;
  document.getElementById('tailleV').textContent = COTE + ' px';
  document.getElementById('vueV').textContent = elVue.value + '°';
  autoLod = document.getElementById('auto').checked;
  plaque = document.getElementById('plaque').checked;
  etiquettes = document.getElementById('noms').checked;
}
for(const id of ['taille', 'vue', 'auto', 'plaque', 'noms']) document.getElementById(id).addEventListener('input', majReglages);
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect();
  const [hx, hy] = hexProche((e.clientX - r.left - L / 2) / COTE, (e.clientY - r.top - H / 2) / COTE);
  deplacerVers(hx, hy);
});
window.addEventListener('resize', tailler);

// Le vrai pion VASL, pour la vue de loin : SVG lu en texte, polices
// retirées, silhouette intégrée (un SVG dans une image ne charge rien).
async function chargerPion(nom){
  try {
    const r = await fetch(VASL_IMAGES_URL + nom);
    if(!r.ok) return;
    let svg = (await r.text()).replace(/@font-face\s*\{[^}]*\}/g, '')
      .replace(/font-family\s*:\s*Nimbus Sans L/g, 'font-family:Helvetica,Arial,sans-serif');
    const dir = nom.substring(0, nom.lastIndexOf('/') + 1);
    for(const m of [...svg.matchAll(/href="((?:\.\/)?(svg\/[^"]+\.(png|svg|gif)))"/gi)]){
      try {
        const pr = await fetch(VASL_IMAGES_URL + dir + m[2]);
        if(!pr.ok) throw 0;
        const buf = new Uint8Array(await pr.arrayBuffer());
        let bin = ''; for(const o of buf) bin += String.fromCharCode(o);
        const mime = m[3] === 'svg' ? 'image/svg+xml' : 'image/' + m[3];
        svg = svg.split('"' + m[1] + '"').join('"data:' + mime + ';base64,' + btoa(bin) + '"');
      } catch(e){}
    }
    if(!/viewBox/.test(svg)) svg = svg.replace(/<svg\b/, '<svg viewBox="0 0 48 48"');
    const im = new Image();
    im.onload = () => { images[nom] = im; };
    im.src = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
  } catch(e){}
}

tailler(); majReglages(); creerSquad(); majBoutons(); majInfo();
chargerPion(S.compo.pion); chargerPion(S.compo.pionHS);
requestAnimationFrame(boucle);
