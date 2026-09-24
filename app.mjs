/**
 * SPA shell: hash routing, one mount point, no build step.
 *
 * Every view re-renders from store state, and the play view mirrors the
 * current board into the URL so a position survives a reload or a paste.
 */

import { stateKey } from './engine.mjs';
import { app, board, subscribe, resetTo, parseCode, update } from './store.mjs';
import * as play from './view-play.mjs';
import * as patterns from './view-patterns.mjs';
import * as analyze from './view-analyze.mjs';
import * as solveView from './view-solve.mjs';
import * as matrix from './view-matrix.mjs';
import * as tray3d from './view-3d.mjs';

const ROUTES = [
  { path: 'play', label: 'Play', view: play },
  { path: '3d', label: '3D', view: tray3d },
  { path: 'patterns', label: 'Patterns', view: patterns },
  { path: 'solve', label: 'Solve', view: solveView },
  { path: 'matrix', label: 'Matrix', view: matrix },
  { path: 'analyze', label: 'Analysis', view: analyze },
];

// The current tab is app.view in the store, so a view can navigate by updating
// it — the patterns view uses this to send a pattern straight to the board.
const routeFor = (path) => ROUTES.find((r) => r.path === path) ?? ROUTES[0];
let route = ROUTES[0];

/**
 * The app may be embedded in a sandboxed frame where the URL is not ours to
 * touch. Routing still works in memory; only the shareable link is lost.
 */
function currentHash() {
  try { return location.hash; } catch { return ''; }
}

function parseHash() {
  const [, path, code] = (currentHash() || '#/play').split('/');
  const found = ROUTES.find((r) => r.path === path);
  return { route: found ?? ROUTES[0], code };
}

function syncUrl() {
  const hash = route.path === 'play'
    ? `#/play/${stateKey(board())}`
    : `#/${route.path}`;
  try {
    if (location.hash !== hash) history.replaceState(null, '', hash);
  } catch {
    /* embedded with a locked-down URL: keep routing in memory */
  }
}

function drawNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren();
  for (const entry of ROUTES) {
    // Buttons, not links. An <a href="#/..."> is a navigation, and a sandboxed
    // frame cannot navigate itself — the browser escapes to a new tab instead.
    // Routing in memory works the same everywhere; the URL is a nicety.
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = entry.label;
    if (entry === route) tab.setAttribute('aria-current', 'page');
    tab.addEventListener('click', () => {
      if (entry === route) return;
      update((s) => { s.view = entry.path; });
    });
    nav.appendChild(tab);
  }
}

function render() {
  route = routeFor(app.view);
  document.body.dataset.palette = app.palette;
  document.body.dataset.look = app.look;
  drawNav();
  const mount = document.getElementById('view');
  mount.replaceChildren(route.view.render(render));
  syncUrl();
}

function onHashChange() {
  const parsed = parseHash();
  const changedRoute = parsed.route !== route;
  route = parsed.route;
  app.view = route.path;
  if (parsed.code && parsed.code !== stateKey(board())) {
    try {
      resetTo(parseCode(parsed.code, board().board), 'loaded from the address bar');
      return; // resetTo notifies subscribers, which re-renders
    } catch {
      /* a malformed code in the URL is ignored rather than blanking the app */
    }
  }
  if (changedRoute || !parsed.code) render();
}

document.addEventListener('keydown', (event) => {
  if (route.path === 'play') play.keydown(event);
  if (route.path === '3d') tray3d.keydown(event);
});
// Free play in 3D tilts only while an arrow is held.
document.addEventListener('keyup', (event) => {
  if (route.path === '3d') tray3d.keyup(event);
});

window.addEventListener('hashchange', onHashChange);
subscribe(render);

route = parseHash().route;
app.view = route.path;
onHashChange();
render();
