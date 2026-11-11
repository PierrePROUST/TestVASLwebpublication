// ═══ INTERFACE — BARRE QC (VASL.build.module.map.QC) ═══
// La barre « Quick Counters » de VASL : des boutons de marqueurs (Prep
// Fire, DM, CX…) qu'on tire sur la carte, et des boutons à sous-menu
// (triangle rouge QC/mnubtn.png) qui ouvrent une liste de marqueurs.
// Configuration intégrée de QC.loadConfigurations() (VASL 6.7), dans le
// même ordre ; chaque entrée nomme le gpid d'un PieceSlot du module.
// Un gpid absent de la base est sauté, comme dans VASL (203).
const QC_CONFIG = [
  '0', '11', '12', '13', '15', '18', '19', '21', '1', '2', '4', '63',
  {texte: 'Residual Fires', e: ['47', '48', '49', '50', '51', '52']},
  {texte: 'Fire Lanes', e: ['53', '54', '55', '56']},
  {texte: 'Smokes', e: ['6', '57', '59', '61', '72', '58', '60', '62', '114']},
  '69', '146', '64',
  {texte: 'CC, HW', e: ['73', '74', '83', '85', '88']},
  {texte: 'Prisoners', e: ['6390', '6391']},
  {texte: 'TI, Labor, CA, Low Ammo', e: ['68', '66', '5903', '5902']},
  {texte: 'Acquisitions', e: ['423', '773', '1066', '1589', '1939', '2122', '3b5:4188', '11430', '2353',
                              '2831', '3192', '3380', '3573', '11487', '3916', '11542', '3b5:7863']},
  {texte: 'AFV Bad Things', e: ['41', '5918', '5919', '5920']},
  {texte: 'AFV Motion status', e: ['101', '111', '116', '109', '113']},
  '126', '128', '129', '123', '104', '344',
  {texte: 'Building Levels', e: ['171', '167', '169', '163', '165', '202', '203', '204']}
];
// Taille des icônes : SizedImageIcon de 30 × 30 dans VASL.
const QC_ICONE = 30;

function construireBarreQC(){
  const b = document.createElement('div');
  b.className = 'barreIcones barreQC';
  b.setAttribute('role', 'toolbar');
  b.setAttribute('aria-label', 'Quick Counters (QC)');
  chargerBDD().then(bdd => {
    for(const e of QC_CONFIG){
      const el = _boutonQC(e, bdd);
      if(el) b.appendChild(el);
    }
  }).catch(() => {});
  return b;
}

// Nom d'un pion du sous-menu : GamePiece.getName(), à défaut le nom du slot.
const _nomQC = x => { try { return lireSlot(x).nom || x.n; } catch(e){ return x.n; } };

// Vignette d'un PieceSlot, recadrée au carré (CreateButtonIcon).
function _vignetteQC(x, cote = QC_ICONE){
  const mini = document.createElement('div');
  mini.className = 'mini';
  mini.style.width = mini.style.height = cote + 'px';
  if(x) composerVignette(mini, lireSlot(x), cote);
  return mini;
}

function _boutonQC(e, bdd){
  const menu = typeof e === 'object';
  const slots = menu ? e.e.map(g => bdd.parGpid.get(g)).filter(Boolean) : [];
  const x = menu ? slots[0] : bdd.parGpid.get(e);
  if(!menu && !x) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'act qc' + (menu ? ' qcMenu' : '');
  // Sous-menu sans pion : le carré blanc de CreateButtonMenuIcon.
  const mini = _vignetteQC(x);
  if(!x) mini.style.background = '#fff';
  btn.appendChild(mini);
  if(menu){
    const tri = document.createElement('img');
    tri.className = 'qcTri';
    tri.alt = '';
    chargerImage('QC/mnubtn.png').then(u => { if(u) tri.src = u; });
    btn.appendChild(tri);
    btn.title = e.texte;
    btn.setAttribute('aria-label', e.texte);
    btn.setAttribute('aria-haspopup', 'true');
    btn._ouvrir = focus => ouvrirMenuQC(btn, e.texte, slots, focus);
    btn.addEventListener('pointerdown', ev => ev.stopPropagation());
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      if(_menuOuvert && _menuOuvert.titre === btn) fermerDeroulants(); else btn._ouvrir(ev.detail === 0);
    });
  } else {
    const nom = _nomQC(x);
    btn.title = `${nom} — glisser vers la carte, ou cliquer pour le poser sur la pile sélectionnée`;
    btn.setAttribute('aria-label', nom);
    btn.addEventListener('pointerdown', ev => _tirerQC(ev, x, mini));
    // Clavier (Entrée, Espace) : pas de pointerdown, on pose directement.
    btn.addEventListener('click', ev => { if(ev.detail === 0) _poserQC(x); });
  }
  return btn;
}

// Le sous-menu (QCButtonMenu) : chaque ligne se tire vers la carte, ou se
// clique. Il se ferme dès que le glissé part, comme le JPopupMenu de VASL.
function ouvrirMenuQC(btn, titre, slots, focusPremier){
  fermerDeroulants(); fermerMenu();
  const m = document.createElement('div');
  m.className = 'deroulant menuQC';
  m.setAttribute('role', 'menu');
  m.setAttribute('aria-label', titre);
  for(const x of slots){
    const it = document.createElement('div');
    it.className = 'it';
    it.tabIndex = -1;
    it.setAttribute('role', 'menuitem');
    const mini = _vignetteQC(x);
    const lb = document.createElement('span');
    lb.className = 'lb';
    lb.textContent = _nomQC(x);
    it.append(mini, lb);
    it.title = 'Glisser vers la carte, ou cliquer pour le poser sur la pile sélectionnée';
    it.addEventListener('pointerdown', ev => { ev.stopPropagation(); _tirerQC(ev, x, mini, true); });
    it.addEventListener('click', ev => { if(ev.detail === 0){ fermerDeroulants(); _poserQC(x); } });
    m.appendChild(it);
  }
  m.addEventListener('pointerdown', ev => ev.stopPropagation());
  document.body.appendChild(m);
  // Ouvert au coin bas-droit du bouton, comme popupMenu.show(w - 5, h - 5).
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(r.right - 5, window.innerWidth - m.offsetWidth - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(r.bottom - 5, window.innerHeight - m.offsetHeight - 4)) + 'px';
  btn.classList.add('ouvert');
  btn.setAttribute('aria-expanded', 'true');
  _menuOuvert = {titre: btn, liste: m, items: [...m.querySelectorAll('.it')], i: focusPremier ? 0 : -1};
  if(focusPremier) _focusItem(0);
}

// Glissé d'un marqueur QC vers la carte (le DragBuffer de QCButton) ; un
// simple clic le pose sur la pile sélectionnée, sinon au centre de la vue ;
// au doigt, il s'arme et l'appui suivant sur la carte le pose.
function _tirerQC(ev, x, mini, depuisMenu){
  if(ev.button) return;
  const fermer = () => { if(depuisMenu) fermerDeroulants(); };
  glisser(ev, (mini.querySelector('img') || {}).src, 48 * SC * zoom, (cx, cy) => {
    const c = clientVersCarte(cx, cy);
    if(c) poserDepuisPalette(x, c.x, c.y);
    else chatLog('Lâché hors de la carte : rien posé');
  }, e => {
    fermer();
    if(e && e.pointerType && e.pointerType !== 'mouse') armerPose(x);
    else _poserQC(x);
  }, {appuiLong: 300, debut: fermer});
}

function _poserQC(x){
  const p = [..._sel].find(q => !q.deleted);
  if(p) poserDepuisPalette(x, p.x, p.y);
  else _poserAuCentre(x);
}
