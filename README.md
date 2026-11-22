# VASLweb

Carte VASL dans le navigateur : ouvrir, jouer et relire des parties
`.vsav` / `.vlog`. Application installable (PWA), servie par GitHub Pages :
ouvrir `VASLweb.html` (ou la racine du site), puis « Installer » /
« Ajouter à l'écran d'accueil ».

| Fichier | Rôle |
|---|---|
| `VASLweb.html` | L'application (une seule page) |
| `css/vaslweb.css` | Sa feuille de style |
| `pwa.js` | Manifeste, service worker, ouverture des `.vsav` / `.vlog` (inactif en `file://`) |
| `sw.js` | Service worker : application réseau d'abord, boards VASL gardés pour le hors-ligne |
| `manifest.webmanifest`, `icons/` | Installation |
| `index.html` | Renvoie vers `VASLweb.html` |

## Préparer une partie depuis le PDF d'un scénario (en cours)

Fichiers pas encore chargés par l'application : ils servent à la page
d'essai `outils/test-ob.html` en attendant le bouton « Depuis un PDF… ».

| Fichier | Rôle |
|---|---|
| `js/ob-image.js` | Traitements d'image du prototype Python (OpenCV), sans dépendance, au pixel près |
| `js/ob-pdf.js` | Image de la fiche (JPEG pris tel quel dans le PDF, sinon rendu pdf.js) ; bibliothèques chargées à la demande |
| `js/ob-ocr.js` | Pool de workers tesseract.js (données eng tessdata_fast 4.1.0, comme le prototype) |
| `outils/test-ob.html` | Page d'essai locale : ouvre des PDF, montre les cases et ce qui en est lu, exporte en JSON |

Les PDF de scénario et les images de fiches sont sous droits (MMP) :
jamais dans ce dépôt, les essais se font en local.
