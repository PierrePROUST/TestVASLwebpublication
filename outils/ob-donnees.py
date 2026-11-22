#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════
# DONNÉES DE RÉFÉRENCE DE L'OB — js/donnees/ob-reference.js
# À relancer à la main quand VASL change. Reprend les scripts du
# prototype (outils/ob/*.py, versés tels quels) et ne garde que les
# champs utiles à la lecture d'une fiche :
#   chart   : National Capabilities Chart (outils/ob/chart.json)
#   vasl    : valeur de squad / HS / crew -> images VASL -> (gpid, case, rang)
#   sw      : armes de soutien de chaque nation (texte des SVG VASL)
#   guns    : canons (texte des SVG VASL ; nom VASL Tools par gpid)
#   veh     : véhicules (texte des SVG VASL ; à défaut vehicles.json, marqué)
# Le texte des SVG VASL fait foi ; de guns.json / vehicles.json (extension
# VASL Tools, non versée) on ne garde que les noms, sauf pour les pions
# sans SVG (champ « source »).
#
# Usage :
#   GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:limit=3m \
#       -b develop https://github.com/vasl-developers/vasl.git vasl
#   unzip VASLTools.vmdx -d vt
#   python3 -I outils/ob-donnees.py vasl vt/build/guns.json vt/build/vehicles.json
# ═══════════════════════════════════════════════════════════════
import sys, os, json, subprocess, tempfile, datetime

ICI = os.path.dirname(os.path.abspath(__file__))
DEPOT = os.path.dirname(ICI)
SORTIE = os.path.join(DEPOT, 'js', 'donnees', 'ob-reference.js')

def lancer(script, *args):
    r = subprocess.run([sys.executable, '-I', os.path.join(ICI, 'ob', script), *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'{script} : échec\n{r.stderr}')
    print(f'{script} :', r.stdout.strip().splitlines()[0] if r.stdout.strip() else '')

def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__ or 'usage : ob-donnees.py vasl guns.json vehicles.json')
    vasl, guns_vt, veh_vt = sys.argv[1:4]
    chart_f = os.path.join(ICI, 'ob', 'chart.json')
    with tempfile.TemporaryDirectory() as t:
        lancer('vaslmap.py', chart_f, vasl, os.path.join(t, 'vasl.json'))
        lancer('swmap.py', vasl, os.path.join(t, 'sw.json'))
        lancer('gunmap.py', vasl, guns_vt, os.path.join(t, 'guns.json'))
        lancer('vehmap.py', vasl, veh_vt, os.path.join(t, 'veh.json'))
        lire = lambda n: json.load(open(os.path.join(t, n), encoding='utf-8'))
        V, SW, G, VE = lire('vasl.json'), lire('sw.json'), lire('guns.json'), lire('veh.json')
    chart = json.load(open(chart_f, encoding='utf-8'))
    garder = lambda d, ks: {k: d[k] for k in ks if k in d and d[k] not in ('', None, [])}
    ref = {
        'chart': {n: {'squads': [{'squad': r['squad'], 'hs': r['hs']} for r in v['squads']],
                      'crews': [{'crew': c['crew']} for c in v['crews']]} for n, v in chart.items()},
        'vasl': V,
        'sw': {n: [garder(s, ('nom', 'gpid', 'image', 'type', 'valeurs', 'pp')) for s in l] for n, l in SW.items()},
        'guns': {n: [garder(g, ('gpid', 'nom', 'image', 'calibre', 'type', 'M', 'ROF', 'B', 'portee', 'IFE', 'nom_vt', 'source'))
                     for g in l] for n, l in G.items()},
        'veh': {n: [garder(g, ('gpid', 'nom', 'image', 'calibre', 'MP', 'MG', 'nums', 'autres', 'nom_vt', 'source'))
                    for g in l] for n, l in VE.items()},
    }
    commit = subprocess.run(['git', '-C', vasl, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    ref['version'] = {'vasl': commit, 'date': datetime.date.today().isoformat()}
    texte = ('// Données de référence de l\'OB (fiches de scénario) — fichier produit par\n'
             '// outils/ob-donnees.py ; ne pas modifier à la main.\n'
             f'// VASL develop {commit} ; National Capabilities Chart (eASLRB) ; noms VASL Tools.\n'
             'const OB_REF = ' + json.dumps(ref, ensure_ascii=False, separators=(',', ':')) + ';\n'
             "if(typeof module === 'object' && module.exports) module.exports = OB_REF;\n")
    open(SORTIE, 'w', encoding='utf-8').write(texte)
    print(SORTIE, f'{len(texte.encode()) / 1024:.0f} Ko ;',
          sum(len(l) for l in ref['sw'].values()), 'SW,', sum(len(l) for l in ref['guns'].values()), 'canons,',
          sum(len(l) for l in ref['veh'].values()), 'véhicules')

main()
