// ═══════════════════════════════════════════════════════════════
// « PICK NEW BOARDS FOR THIS SCENARIO » — BoardSwapper de VASL
// (VASL/build/module/map/BoardSwapper.java, entrée du menu de la carte).
// Le dialogue est le BoardPicker de VASSAL tel que l'étendent
// ASLBoardPicker et ASLBoardSlot : grille de cases pré-remplie par la
// disposition actuelle, Add row / Add column / Clear, et dans chaque case
// une recherche, la liste des boards, « flip » et l'aperçu à l'échelle 0,2.
// Ok recompose la carte (SetBoards exécutée localement : ni log, ni
// réseau) puis replace chaque pièce dans son hexagone : même board, même
// point de l'image (recordPiecePositions / restorePiecePositions).
// Les boutons Add overlays, Crop boards et Terrain SSR viendront ensuite.
// ═══════════════════════════════════════════════════════════════
const VASL_BOARD_VERSIONS_URL =         // boardVersionURL du buildFile
  'https://raw.githubusercontent.com/vasl-developers/vasl/develop/boards/v5boardVersions.xml';
const BP_ECHELLE = 0.2;                 // slotScale
const BP_CASE_VIDE = {w: 350, h: 125};  // slotWidth × slotHeight
const BP_SELECT = 'Select board';       // BoardPicker.select_board
const BP_ORDRE = ['New', 'Updated', 'Geoboard', 'Double-sided', 'Starter Kit', 'HASL', 'Deluxe'];

// ── Liste des boards (ASLBoardPicker.getallboards puis le tri de
// refreshPossibleBoards), téléchargée une fois.
let _listeBoards = null;
function listeBoards(){
  if(!_listeBoards){
    _listeBoards = fetch(VASL_BOARD_VERSIONS_URL, {cache: 'no-cache'}).then(r => {
      if(!r.ok) throw new Error('v5boardVersions.xml introuvable (HTTP ' + r.status + ')');
      return r.text();
    }).then(t => _trierBoards(_lireVersionsBoards(t)));
    _listeBoards.catch(() => { _listeBoards = null; });
  }
  return _listeBoards;
}

// Jour (UTC) d'une date « yyyy/MM/dd », ou une erreur si elle est invalide.
function _jourBoard(s){
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s || '');
  if(!m) throw new Error('date ' + s);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
  if(d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error('date ' + s);
  return t / 864e5;
}

// parseBoardVersionFile : « nom  type » (deux espaces) ; un board mis à
// jour depuis 90 jours au plus, ou paru depuis 90 jours au plus, figure une
// seconde fois avec son statut « Updated » ou « New » (New l'emporte).
function _lireVersionsBoards(texte){
  const doc = new DOMParser().parseFromString(texte, 'application/xml');
  const racine = doc.documentElement, out = [];
  if(!racine || racine.nodeName !== 'boardsMetadata') return out;
  const d = new Date(), aujourdhui = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
  for(const section of racine.children) for(const e of section.children){
    const nom = e.getAttribute('name');
    if(!nom) continue;
    const type = e.getAttribute('boardType') || '';
    out.push(nom + '  ' + type);
    let statut = '';
    try {
      if(aujourdhui - _jourBoard(e.getAttribute('versionDate')) <= 90) statut = 'Updated';
      const paru = e.getAttribute('issued') || '';
      if(paru && aujourdhui - _jourBoard(paru) <= 90) statut = 'New';
    } catch(err){ /* date illisible : statut inchangé */ }
    if(statut) out.push(nom + '  ' + type + '  ' + statut);
  }
  return out;
}

// Le comparateur de refreshPossibleBoards, bogue compris : deux libellés du
// même rang prioritaire sont égaux (o1Parts[0] comparé à lui-même) et
// gardent, le tri étant stable, l'ordre du fichier.
function _trierBoards(liste){
  const parts = s => { const i = s.indexOf(' '); return i < 0 ? [s, ''] : [s.substring(0, i), s.substring(i + 1).trim()]; };
  const rang = s => BP_ORDRE.findIndex(o => s.includes(o));
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  return liste.slice().sort((o1, o2) => {
    const [a1, b1] = parts(o1), [a2, b2] = parts(o2);
    const i1 = rang(b1), i2 = rang(b2);
    if(i1 !== -1 && i2 !== -1) return i1 === i2 ? 0 : i1 - i2;
    if(i1 !== -1) return -1;
    if(i2 !== -1) return 1;
    return cmp(b1, b2) || cmp(a1, a2);
  });
}

// ASLBoardPicker.getBoard : le texte avant le premier espace ; « 2 » →
// « 02 », « A » → « dxa ».
function nomDuLibelle(lib){
  let n = lib.split(' ')[0];
  if(/^[0-9]$/.test(n)) n = '0' + n;
  else if(/^[A-H]$/.test(n)) n = 'dx' + n.toLowerCase();
  return n;
}

// ── État écrit d'un board (ASLBoard.getState). Un board de la carte
// garde le sien mot pour mot, place et retournement mis à jour ; un board
// neuf n'a que sa place, son nom et sa version.
function etatBoard(b){
  const r = b.reversed ? 'r' : '';
  if(b.etat){
    const t = b.etat.split('\t');
    t[0] = String(b.col); t[1] = String(b.row); t[2] = r + b.nomEcrit;
    return t.join('\t');
  }
  const g = geoBoard(b);
  return `${b.col}\t${b.row}\t${r}${g.nomImage || b.name}\tVER\t${g.version || '0.0'}\t`;
}
// ASLBoardPicker.encode
const segmentBoards = boards => 'bd\t' + boards.map(etatBoard).join('bd\t');

// Nom écrit d'un board lu dans la sauvegarde, sans le « r » du retournement.
function _nomEcrit(b){
  const t = (b.etat || '').split('\t')[2];
  if(!t) return b.name;
  return b.reversed ? t.substring(1) : t;
}

// Copie d'un board pour le dialogue : Cancel ne touche à rien.
function _copieBoard(b){
  return {name: b.name, reversed: !!b.reversed, crop: b.crop ? Object.assign({}, b.crop) : null,
          zoom: b.zoom || 1, ssrList: (b.ssrList || []).slice(),
          overlays: (b.overlays || []).map(o => Object.assign({}, o)),
          etat: b.etat || null, nomEcrit: b.etat ? (b.nomEcrit || _nomEcrit(b)) : null,
          _comp: b._comp || null};
}
const _boardNeuf = nom => ({name: nom, reversed: false, crop: null, zoom: 1, ssrList: [], overlays: [],
                            etat: null, nomEcrit: null, _comp: null});

// ═══ LE DIALOGUE ═══
let _bp = null;            // dialogue ouvert
let _bpEnCours = false;    // carte en cours de recomposition

function ouvrirChoixBoards(){
  if(_bp || _bpEnCours) return;
  if(!_source || !_losBoards){ chatLog('⚠️ Aucune partie ouverte'); return; }
  fermerMenu();
  // recordPiecePositions : avant l'ouverture du dialogue.
  const releve = releverPions(_losBoards);
  const voile = document.createElement('div');
  voile.className = 'voile';
  const w = document.createElement('div');
  w.className = 'fenetre fenBoards';
  w.setAttribute('role', 'dialog');
  w.setAttribute('aria-modal', 'true');
  w.setAttribute('aria-label', 'Pick new boards for this scenario');
  w.innerHTML = `<div class="ft">Pick new boards for this scenario</div><div class="fc">
      <div class="bpEtat" aria-live="polite"></div>
      <div class="bpCorps">
        <div class="bpOutils">
          <button type="button" data-bp="ligne">Add row</button>
          <button type="button" data-bp="colonne">Add column</button>
          <button type="button" data-bp="vider">Clear</button>
        </div>
        <div class="bpDefile"><div class="bpGrille"></div></div>
      </div>
      <div class="fb"><button type="button" class="prim" data-bp="ok">Ok</button><button type="button" data-bp="annuler">Cancel</button></div>
    </div>`;
  document.body.append(voile, w);
  _bp = {w, voile, releve, nx: 1, ny: 1, cases: [], liste: null, etatMin: null};
  // Les touches ne vont ni aux pions sélectionnés ni aux raccourcis.
  w.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); fermerChoixBoards(); }
  });
  w.addEventListener('pointerdown', e => e.stopPropagation());
  voile.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
  _deplacableParTitre(w);
  const q = s => w.querySelector(`[data-bp="${s}"]`);
  q('ligne').onclick = () => { _bpAjouterLigne(); _bpRendre(); };
  q('colonne').onclick = () => { _bpAjouterColonne(); _bpRendre(); };
  q('vider').onclick = () => { _bpReset(); _bpRendre(); };
  q('annuler').onclick = () => fermerChoixBoards();
  q('ok').onclick = () => validerChoixBoards();
  // getControls : reset(), puis setBoards(map.getBoards()).
  _bpPoserBoards(_losBoards.map(b => Object.assign(_copieBoard(b), {col: b.col, row: b.row})));
  _bpRendre();
  listeBoards().then(l => {
    if(_bp && _bp.w === w){ _bp.liste = l; for(const c of _bp.cases) _bpRemplirListe(c, c.rech.value); }
  }).catch(e => {
    if(_bp && _bp.w === w){ _bp.liste = []; _bpEtat('⚠️ ' + e.message); for(const c of _bp.cases) _bpRemplirListe(c, c.rech.value); }
  });
  setTimeout(() => { if(_profil === 'pc') q('ok').focus(); }, 0);
}

function fermerChoixBoards(){
  if(!_bp) return;
  for(const c of _bp.cases) _bpOublierCase(c);
  clearInterval(_bp.etatMin);
  _bp.w.remove(); _bp.voile.remove();
  _bp = null;
}

// Fenêtre déplacée par sa barre de titre (PC ; au doigt, elle est plein écran).
function _deplacableParTitre(w){
  const t = w.querySelector('.ft');
  t.addEventListener('pointerdown', e => {
    if(e.button > 0 || _profil !== 'pc') return;
    e.preventDefault();
    const r = w.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    t.setPointerCapture(e.pointerId);
    const bouge = ev => {
      w.style.transform = 'none';
      w.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + 'px';
      w.style.top = Math.max(0, Math.min(innerHeight - 30, ev.clientY - dy)) + 'px';
    };
    const fin = () => { t.removeEventListener('pointermove', bouge); t.removeEventListener('pointerup', fin); t.removeEventListener('pointercancel', fin); };
    t.addEventListener('pointermove', bouge);
    t.addEventListener('pointerup', fin);
    t.addEventListener('pointercancel', fin);
  });
}

// Ligne d'état (BoardPicker.warn).
function _bpEtat(s){
  if(_bp) _bp.w.querySelector('.bpEtat').textContent = s;
}

// ── Grille : les cases dans l'ordre de GridLayout, case (i, j) à l'indice
// i + nx·j.
function _bpNouvelleCase(){
  const el = document.createElement('div');
  el.className = 'bpCase';
  el.innerHTML = `<div class="bpChoix">
      <input type="search" class="bpRech" title="Search for a board" aria-label="Search for a board" placeholder="Search" autocomplete="off" spellcheck="false">
      <select class="bpListe" aria-label="Board"></select>
      <label class="coche bpFlip" hidden><input type="checkbox"><span>flip</span></label>
    </div><canvas class="bpApercu"></canvas>`;
  const c = {el, board: null, minuteur: null, attente: null, gen: 0,
             rech: el.querySelector('.bpRech'), sel: el.querySelector('.bpListe'),
             flip: el.querySelector('.bpFlip'), cv: el.querySelector('.bpApercu')};
  c.rech.addEventListener('input', () => _bpFiltrer(c));
  c.sel.addEventListener('change', () => {
    if(c.sel.size > 1) c.sel.size = 1;
    _bpChoisir(c, c.sel.value);
  });
  c.flip.querySelector('input').addEventListener('change', e => {
    if(!c.board) return;
    c.board.reversed = e.target.checked;
    _bpApercu(c);
  });
  _bpRemplirListe(c);
  return c;
}
function _bpOublierCase(c){
  clearTimeout(c.minuteur);
  c.minuteur = c.attente = null;
  c.gen++;
}
function _bpReset(){
  if(_bp.cases) for(const c of _bp.cases) _bpOublierCase(c);
  _bp.nx = _bp.ny = 1;
  _bp.cases = [_bpNouvelleCase()];
  _bpEtat('');
}
function _bpAjouterLigne(){
  _bp.ny++;
  for(let i = 0; i < _bp.nx; i++) _bp.cases.push(_bpNouvelleCase());
}
function _bpAjouterColonne(){
  _bp.nx++;
  for(let j = 0; j < _bp.ny; j++) _bp.cases.splice((j + 1) * _bp.nx - 1, 0, _bpNouvelleCase());
}
// BoardPicker.setBoards
function _bpPoserBoards(boards){
  _bpReset();
  for(const b of boards){
    while(b.col > _bp.nx - 1) _bpAjouterColonne();
    while(b.row > _bp.ny - 1) _bpAjouterLigne();
  }
  for(const b of boards){
    const c = _bp.cases[b.col + _bp.nx * b.row];
    _bpPoser(c, b);
    _bpRemplirListe(c);
  }
}
function _bpRendre(){
  const g = _bp.w.querySelector('.bpGrille');
  g.style.gridTemplateColumns = `repeat(${_bp.nx}, max-content)`;
  g.replaceChildren(..._bp.cases.map(c => c.el));
  for(const c of _bp.cases) if(!c.board) _bpApercu(c);
}

// ── Liste d'une case : « Select board », puis tous les boards. Une case
// pré-remplie montre son board ; un board absent de la liste y est ajouté.
function _bpLibelles(){
  return [BP_SELECT, ...(_bp && _bp.liste || [])];
}
function _bpLibelleDe(c){
  if(!c.board) return BP_SELECT;
  const l = _bpLibelles().find(x => x !== BP_SELECT && nomDuLibelle(x) === c.board.name);
  return l || c.board.name;
}
function _bpRemplirListe(c, filtre){
  const tous = _bpLibelles();
  const actuel = _bpLibelleDe(c);
  if(!tous.includes(actuel)) tous.splice(1, 0, actuel);
  const f = (filtre || '').toLowerCase();
  const vus = f ? tous.filter(x => x.toLowerCase().includes(f)) : tous;
  const frag = document.createDocumentFragment();
  for(const x of vus){
    const o = document.createElement('option');
    o.value = x === BP_SELECT ? '' : x;
    o.textContent = x;
    frag.appendChild(o);
  }
  c.sel.replaceChildren(frag);
  if(f){
    // ASLBoardSlot.filterBoards : la liste filtrée s'ouvre. Rien n'y est
    // choisi d'avance : tout choix, même le premier, change de board.
    c.sel.selectedIndex = -1;
    c.sel.size = Math.max(2, Math.min(8, vus.length));
  } else {
    c.sel.size = 1;
    c.sel.value = actuel === BP_SELECT ? '' : actuel;
  }
}
function _bpFiltrer(c){
  _bpRemplirListe(c, c.rech.value);
}

// ── Choix d'un board : « Select board » vide la case aussitôt ; un board
// est chargé 500 ms après le dernier choix (Timer d'ASLBoardSlot).
function _bpChoisir(c, lib){
  clearTimeout(c.minuteur);
  c.minuteur = null;
  if(!lib){ c.attente = null; c.gen++; _bpPoser(c, null); return; }
  c.attente = lib;
  c.minuteur = setTimeout(() => { c.minuteur = null; _bpCharger(c); }, 500);
}
// Le board choisi est posé dans la case (un nouvel objet : le même board
// peut figurer deux fois), puis son aperçu se charge.
function _bpCharger(c){
  const lib = c.attente;
  c.attente = null;
  if(!lib) return;
  _bpPoser(c, _boardNeuf(nomDuLibelle(lib)));
}
function _bpPoser(c, b){
  c.board = b;
  c.flip.hidden = !b;
  c.flip.querySelector('input').checked = !!(b && b.reversed);
  _bpApercu(c);
}

// ── Aperçu à l'échelle slotScale : l'image composée du board de la carte
// (recadrage, SSR, overlays), à défaut l'image du board ; retourné si
// « flip ». Une case vide prend la taille de la première case.
async function _bpApercu(c){
  const gen = ++c.gen, b = c.board, cv = c.cv;
  const k = window.devicePixelRatio || 1;
  const taille = (w, h) => {
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
  };
  if(!b){
    const c0 = _bp && _bp.cases[0];
    const t = c0 && c0 !== c && c0.board && c0.cv.style.width
      ? {w: parseInt(c0.cv.style.width, 10), h: parseInt(c0.cv.style.height, 10)} : BP_CASE_VIDE;
    taille(t.w, t.h);
    cv.classList.add('vide');
    return;
  }
  cv.classList.remove('vide');
  const nom = b.name;
  let alterne = false;
  _bpEtat('loading ' + nom);
  clearInterval(_bp.etatMin);
  _bp.etatMin = setInterval(() => { alterne = !alterne; _bpEtat((alterne ? 'loading ... ' : 'loading ') + nom); }, 1000);
  const fini = s => { if(gen !== c.gen || !_bp) return false; clearInterval(_bp.etatMin); _bpEtat(s); return true; };
  try {
    const g = await chargerGeoBoard(nom);
    let src = b._comp, sx = 0, sy = 0;
    const sw = (b.crop && b.crop.w > 0) ? b.crop.w : g.w, sh = (b.crop && b.crop.h > 0) ? b.crop.h : g.h;
    if(!src){
      src = new Image();
      await new Promise((res, rej) => { src.onload = res; src.onerror = () => rej(new Error('bd' + nom + '.gif illisible')); _fetchBoardImage(nom).then(u => src.src = u, rej); });
      if(b.crop){ sx = b.crop.x || 0; sy = b.crop.y || 0; }
    }
    if(gen !== c.gen) return;
    const z = b.zoom || 1;
    const w = Math.trunc(BP_ECHELLE * Math.round(sw * z)), h = Math.trunc(BP_ECHELLE * Math.round(sh * z));
    taille(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if(b.reversed){ ctx.translate(cv.width, cv.height); ctx.scale(-1, -1); }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    fini(nom + ' loaded');
    // Les cases vides suivent la taille de la première.
    if(_bp && c === _bp.cases[0]) for(const x of _bp.cases) if(!x.board) _bpApercu(x);
  } catch(e){
    if(fini('Unable to find board ' + nom + ' — ' + e.message)){
      taille(BP_CASE_VIDE.w, BP_CASE_VIDE.h);
      cv.classList.add('vide');
    }
  }
}

// ── Ok : ASLBoardPicker.finish, puis SetBoards et restorePiecePositions.
async function validerChoixBoards(){
  if(!_bp) return;
  // Un choix encore en attente de son délai compte.
  for(const c of _bp.cases) if(c.minuteur){ clearTimeout(c.minuteur); c.minuteur = null; _bpCharger(c); }
  // getBoardsFromControls : colonne par colonne.
  const boards = [];
  for(let i = 0; i < _bp.nx; i++) for(let j = 0; j < _bp.ny; j++){
    const c = _bp.cases[i + _bp.nx * j];
    if(c && c.board) boards.push(Object.assign(_copieBoard(c.board), {col: i, row: j}));
  }
  if(!boards.length){ _bpEtat('No boards selected'); return; }
  const manque = _bp.nx * _bp.ny !== boards.length, releve = _bp.releve;
  fermerChoixBoards();
  if(manque){
    // Chatter.send : affiché, envoyé et consigné.
    const msg = 'Board missing. Your board configuration must match X by X row/column matrix. Use NUL or NULV boards if required';
    _logCmd('CHAT' + msg);
    afficherChat(msg);
  }
  await appliquerBoards(boards, releve);
}

// SetBoards exécutée ici seulement (ni M/, ni log, ni réseau), puis les
// pièces reprennent leur place sur leur board, s'il est encore là.
async function appliquerBoards(boards, releve){
  _bpEnCours = true;
  try {
    replierTout();
    selectionner([]);
    chatLog('🗺️ Pick new boards — boards : '
      + boards.map(b => b.name + (b.reversed ? ' (retourné)' : '')).join(', '));
    for(const b of boards) delete b._comp;
    await _renderBoards(boards);
    const n = restaurerPions(boards, releve);
    if(releve.length) chatLog(`♟️ ${n} pion(s) replacé(s) sur leur board` + (n < releve.length ? `, ${releve.length - n} laissé(s) en place (board retiré)` : ''));
    // Le segment « bd » de la sauvegarde.
    const seg = segmentBoards(boards);
    _source = _source.map(s => s.startsWith('bd\t') ? seg + s.match(/\\*$/)[0] : s);
    _etendreCarte();
    rendreToutes();
    afficherPile();
    poserTables();
    if(typeof planifierOverlaysExt === 'function') planifierOverlaysExt();
    if(typeof carteLOS === 'function') carteLOS();
    _partieModifiee = true;
    if(typeof _planifierSecours === 'function') _planifierSecours();
    majBoutons();
  } catch(e){
    chatLog('❌ Changement de boards impossible : ' + (e && e.message ? e.message : e));
    console.error(e);
  } finally {
    _bpEnCours = false;
  }
}

// recordPiecePositions : chaque pièce de la carte posée sur un board, avec
// le nom de ce board et son point dans l'image non recadrée.
function releverPions(boards){
  const out = [];
  for(const p of vivants()){
    const b = boardSous(boards, p.x, p.y);
    if(!b) continue;
    out.push({p, nom: b.name, l: localCoordinates(b, {x: p.x - BOARD_MARGIN - b.px, y: p.y - BOARD_MARGIN - b.py})});
  }
  return out;
}

// restorePiecePositions : le premier board du même nom ; sans lui, la
// pièce garde ses coordonnées. Rend le nombre de pièces replacées.
function restaurerPions(boards, releve){
  let n = 0;
  for(const r of releve){
    if(r.p.deleted || !pions.includes(r.p)) continue;
    const b = boards.find(x => x.name === r.nom);
    if(!b) continue;
    const g = globalCoordinates(b, r.l);
    r.p.x = g.x + b.px + BOARD_MARGIN;
    r.p.y = g.y + b.py + BOARD_MARGIN;
    _majSeg(r.p);
    n++;
  }
  return n;
}
