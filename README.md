# Table-Filling DFA Engine (installable web app)

Enter an unminimized DFA table and get its distinct equivalence classes of states, found with the
table-filling algorithm that rests on the Myhill-Nerode theorem. The app is a Progressive Web App:
it runs in the browser, has an **Install app** button for desktop and phone, and works offline.

Course: Theory of Computation, TAE-II seminar project.

## What it shows

| Tab | Content |
| --- | --- |
| Table filling | The triangular distinguishability table, step by step (previous, next, play). Click any cell to see why a pair was marked, with the distinguishing string traced through both states, or why it is equivalent. |
| Classes | The equivalence classes, the Myhill-Nerode class each one stands for (shortest string and sample strings reaching it) and a shortest separating string for every pair of classes. |
| Minimal DFA | State diagrams of the minimal and the original DFA, the minimal transition table and three correctness checks. |
| Test a string | Runs a string through both DFAs side by side. |
| Test suite | Runs 6 valid and 7 invalid built-in examples through the validator and the algorithm. |
| Theory | Theorem, algorithm, correctness argument, cost and limits. |

Correctness checks used by the app and by `tests/engine.test.js`:

1. Product-automaton search proves the original and minimal DFA accept the same language.
2. Moore partition refinement, an independent algorithm, gives the same classes.
3. Minimizing the minimal DFA again finds nothing to merge.
4. Every marked pair has a distinguishing string that really separates the two states.

Input rules: complete DFA, up to 15 states, up to 5 single-character symbols. Invalid input (missing
transition, undefined target, start or accepting state not in the state set, duplicate state names,
multi-character symbol, empty alphabet) is rejected with the exact problem named.

## Files

```
index.html            page
styles.css            styling (light and dark)
engine.js             validator, table-filling algorithm, Moore check, equivalence check, examples
app.js                user interface, install button, theme toggle, service worker registration
sw.js                 offline cache
manifest.webmanifest  install information (name, icons, colours)
icons/                favicon and app icons
privacy.html          privacy policy page
terms.html            terms and conditions page
tests/engine.test.js  automated tests (Node.js)
```

## Run it on your computer

A service worker and the install button need `http://localhost` or HTTPS, so do not just double-click
`index.html`. From this folder:

```
python3 -m http.server 8080
```
then open http://localhost:8080 in Chrome or Edge. (Any static server works, for example `npx serve`.)

Run the tests (Node.js 18 or newer):

```
node tests/engine.test.js
```

## Install it as an app

- Chrome or Edge on desktop: click **Install app** in the page header (or the install icon at the right
  end of the address bar). The app gets its own window, a Start menu or Applications entry and works offline.
- Android Chrome: menu, Install app. iPhone Safari: Share, Add to Home Screen. Mac Safari: File, Add to Dock.

## Deploy (free, with HTTPS)

### Option 1: GitHub Pages

1. Create an empty repository on github.com (for example `dfa-table-filling-engine`).
2. In this folder run:
   ```
   git init
   git add .
   git commit -m "Table-filling DFA engine"
   git branch -M main
   git remote add origin https://github.com/<your-username>/dfa-table-filling-engine.git
   git push -u origin main
   ```
3. On GitHub open the repository, Settings, Pages. Under Build and deployment choose
   Source: Deploy from a branch, Branch: `main`, Folder: `/ (root)`, then Save.
4. After about a minute the app is live at `https://<your-username>.github.io/dfa-table-filling-engine/`.
   Open it in Chrome or Edge and the Install app button works.

### Option 2: Netlify Drop (fastest)

Open https://app.netlify.com/drop and drag this whole folder onto the page. You get an HTTPS link at once.

### Custom domain

Buy a domain, then in GitHub Settings, Pages, Custom domain enter it and add the DNS records GitHub shows
(an A or CNAME record at your domain registrar). Turn on Enforce HTTPS. On Netlify use Domain management.

## Before you call it launched

- [ ] Custom domain connected (optional for a college demo, required for a public launch)
- [x] Favicon and app icons added (`icons/`)
- [x] No "made with AI" badge anywhere on the page
- [x] Privacy policy page (`privacy.html`)
- [x] Terms and conditions page (`terms.html`)

## Updating after you change a file

Installed copies keep an offline cache. Change `VERSION` in `sw.js` (for example `dfa-engine-v2`) whenever
you edit any file, then redeploy, so users receive the new version.

## Optional: an Android APK

Chrome can install this app straight from the website. If you need an actual `.apk` file, give the
deployed HTTPS link to https://www.pwabuilder.com, choose Android, and download the package it builds.
