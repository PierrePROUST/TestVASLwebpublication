// ═══ EXTENSIONS DU MODULE — ModuleExtension de VASSAL ═══
// Une extension (.vmdx) est une archive comme le module : son buildFile
// déclare des ExtensionElement, chacun ajoutant ses composants à celui du
// module que désigne son chemin (« Classe:nom/Classe/… », comme
// ComponentPathBuilder) — un onglet de la palette, des boutons de la
// carte. Ses images complètent celles du module. On fond son buildFile
// dans celui du module avant de lire la base : palette, PieceSlot par gpid
// et par chemin (Replace, PlaceMarker) en tiennent compte d'eux-mêmes.
// Les extensions viennent du dépôt de VASLweb (branche VASLweb de
// PierrePROUST/vasl), qui garde les .vmdx que VASL distribue à part.
const VASL_EXTENSIONS_URL =
  'https://raw.githubusercontent.com/PierrePROUST/vasl/VASLweb/extensions/';
const EXTENSIONS = ['Hideable Control Markers.vmdx'];
let _extPromesse = null;

// Les extensions lues : [{nom, version, doc, images}], sans celles qui
// manquent (une extension indisponible n'empêche rien d'autre).
function chargerExtensions(){
  if(!_extPromesse) _extPromesse = Promise.all(EXTENSIONS.map(_chargerExtension)).then(l => l.filter(Boolean));
  return _extPromesse;
}

async function _chargerExtension(nom){
  try {
    const r = await fetch(VASL_EXTENSIONS_URL + encodeURIComponent(nom));
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const octets = await r.arrayBuffer();
    const files = await _zipRead(octets);
    const bf = _fichier(files, 'buildFile.xml') || _fichier(files, 'buildFile');
    if(!bf) throw new Error('pas de buildFile');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bf), 'application/xml');
    if(doc.getElementsByTagName('parsererror').length) throw new Error('buildFile illisible');
    const images = new Map();
    for(const [n, d] of files) if(/^images\//i.test(n) && d.length) images.set(n.substring(7), d);
    const x = doc.documentElement;
    return {nom: nom.replace(/\.vmdx$/i, ''), version: x.getAttribute('version') || '', taille: octets.byteLength, doc, images};
  } catch(e){
    chatLog(`⚠️ Extension « ${nom} » indisponible : ${e.message}`);
    return null;
  }
}

// Composant désigné par un chemin d'ExtensionElement, depuis la racine du
// module. Un segment « Classe:nom » choisit le premier enfant de cette
// classe qui porte ce nom (entryName, name, mapName…), « Classe » seule
// le premier de la classe.
function _composantDuChemin(racine, chemin){
  let el = racine;
  for(const seg of _splitUnescaped(chemin, '/')){
    const s = seg.replace(/\\(.)/g, '$1');
    const k = s.indexOf(':');
    const classe = k < 0 ? s : s.substring(0, k), nom = k < 0 ? null : s.substring(k + 1);
    el = [...el.children].find(c => c.tagName === classe && (nom === null
      || [c.getAttribute('entryName'), c.getAttribute('name'), c.getAttribute('mapName'),
          c.getAttribute('chartName'), c.getAttribute('configureName')].includes(nom)));
    if(!el) return null;
  }
  return el;
}

// Fond une extension dans le buildFile du module. Les composants ajoutés
// portent le nom de leur extension (attribut vaslwebExtension).
function fusionnerExtension(doc, ext){
  let n = 0;
  for(const ee of ext.doc.documentElement.children){
    if(!ee.tagName.endsWith('.ExtensionElement')) continue;
    const cible = _composantDuChemin(doc.documentElement, ee.getAttribute('target') || '');
    if(!cible){ console.warn('Extension ' + ext.nom + ' : cible introuvable', ee.getAttribute('target')); continue; }
    for(const c of ee.children){
      const copie = doc.importNode(c, true);
      copie.setAttribute('vaslwebExtension', ext.nom);
      cible.appendChild(copie);
      n++;
    }
  }
  return n;
}

// Composants de la carte de jeu qu'apportent les extensions : couches de
// pièces (LayeredPieceCollection et ses LayerControl), ombres de carte
// (MapShader, HCAMapShader), boutons de sélection (GlobalKeyCommandSelect,
// MassKeyCommandSelect) et leurs menus (ToolbarMenu), bouton des
// marqueurs à poser (DCMenus). HCRefresher (« Update All » : mise à jour
// des marqueurs posés avec une version antérieure de l'extension) n'est
// pas repris — VASLweb ne pose que ceux de la version courante.
function lireComposantsCarte(mod){
  const cartes = [...mod.children].filter(m => /\.(ASLMap|Map)$/.test(m.tagName));
  const carte = cartes.find(m => m.getAttribute('mapName') === 'Main Map') || cartes[0];
  const out = {calques: null, ombreurs: new Map(), outilsCarte: null};
  if(!carte) return out;
  const at = (e, n) => e.getAttribute(n) || '';
  const lpc = [...carte.children].find(c => c.tagName.endsWith('.LayeredPieceCollection'));
  if(lpc) out.calques = {
    prop: at(lpc, 'property') || 'Layer',
    ordre: at(lpc, 'layerOrder').split(',').map(x => x.trim()).filter(Boolean),
    controles: [...lpc.children].filter(c => /LayerControl/.test(c.tagName)).map(c => ({
      commande: at(c, 'command'), couches: at(c, 'layers').split(',').map(x => x.trim()).filter(Boolean),
      saut: at(c, 'skip') === 'true', bulle: at(c, 'tooltip') || at(c, 'description'), icone: at(c, 'icon')}))
  };
  const elements = new Map(), menus = [];
  let poser = null;
  for(const c of carte.children){
    const t = c.tagName.split('.').pop();
    if(/MapShader$/.test(t)){
      if(at(c, 'alwaysOn') !== 'true' && at(c, 'startsOn') !== 'true') continue;
      out.ombreurs.set(at(c, 'name'), {type: at(c, 'type') || 'Background', couleur: _couleurJava(at(c, 'color')),
        opacite: (parseInt(at(c, 'opacity'), 10) || 0) / 100, centresHors: t === 'HCAMapShader'});
    } else if(/^(GlobalKeyCommandSelect|MassKeyCommandSelect)$/.test(t)){
      // Cible (GlobalCommandTarget) : …|propriété rapide|nom|valeur|comparaison.
      const f = at(c, 'target').split('|');
      const rapide = f[10] === 'true';
      elements.set(at(c, 'buttonText'), {genre: 'sel', nom: at(c, 'buttonText'), icone: at(c, 'icon'), bulle: at(c, 'tooltip'),
        prop: rapide ? f[11] || '' : '', valeur: rapide ? f[12] || '' : '', mode: rapide ? f[13] || 'EQUALS' : '',
        filtre: at(c, 'filter') || at(c, 'propertyFilter')});
    } else if(/^ToolbarMenu/.test(t)){
      const e = {genre: 'menu', nom: at(c, 'text'), icone: at(c, 'icon'), bulle: at(c, 'tooltip') || at(c, 'description'),
                 items: at(c, 'menuItems').split(',').map(x => x.trim()).filter(Boolean)};
      if(e.nom) elements.set(e.nom, e);
      if(t === 'ToolbarMenu') menus.push(e);
    } else if(t === 'DCMenus') poser = {icone: at(c, 'icon'), bulle: at(c, 'tooltip')};
  }
  out.outilsCarte = {elements, menus, poser};
  return out;
}

// Image d'une extension (le module n'en a pas de ce nom), en URL de Blob.
async function _imageExtension(path){
  let exts;
  try { exts = await chargerExtensions(); } catch(e){ return null; }
  const base = path.replace(/\.(svg|gif|png|jpe?g)$/i, '');
  for(const x of exts)
    for(const e of [path, base + '.png', base + '.gif', base + '.svg', base + '.jpg']){
      const d = x.images.get(e);
      if(!d) continue;
      const ext = e.split('.').pop().toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : 'image/jpeg';
      return URL.createObjectURL(new Blob([d], {type: mime}));
    }
  return null;
}
