/**
 * 3D view — the tray as the physical object, rendered with three.js.
 *
 * Two modes:
 *
 *   Strict  Every move goes through the engine and onto the shared history, so
 *           undo, replay codes and the target all work as on the Play tab. A
 *           tilt turns the tray and the marbles the engine moved fall along
 *           their columns; the engine decides, the scene only shows it.
 *
 *   Free    Real gravity (freeplay.mjs). The tray can be held at any angle,
 *           marbles roll, stack and can be caught between rows. Bars take time
 *           to move and can be held part-way with a finger, so the physical
 *           tricks work: shut a bar while marbles stream through it and it keeps
 *           the ones still above. When everything is at rest in holes the
 *           position is an ordinary board again and can go back to strict mode.
 *
 * Tilt in free mode is felt in screen space: an arrow key or a tipped phone
 * rolls marbles toward that edge of the screen, however the tray has been
 * turned on screen. Only the slider is measured along the tray's own rows.
 *
 * Geometry follows the engine exactly: one column and one row are one unit,
 * row r's bar holds hole j at column 2j + (r % 2) + shift. Everything visual
 * — frame, bezels, ribbed bar ends, the smoked backing — is taken from photos
 * of the 1993 tray.
 *
 * The view is rebuilt on every store change like the others, but the canvas
 * and scene are created once and reused, so WebGL is never torn down mid-game.
 */
import { resolve, slide, stateKey, columnOf, EMPTY } from './engine.mjs';
import {
  app, board, commit, note, undo, canUndo, moveCount, lastMove, resetTo, replayCode, load, update,
} from './store.mjs';
import { compare, patternByNumber } from './patterns.mjs';
import {
  createWorld, cloneWorld, step, trySlide, holdBar, releaseBar, toState, atRest, jammedRows, tiltAlong,
} from './freeplay.mjs';

const ROWS = 8;
const SLOTS = 4;
const MAX_TILT = 70 * Math.PI / 180;
const KEY_TILT = 40 * Math.PI / 180;
const STRICT_LEAN = 0.62;          // how far strict mode tips the tray for a tilt
const FALL = 60;                   // rows / s^2 for the strict-mode fall animation
const SLIDE_TIME = 0.16;           // seconds for a strict-mode bar slide

const ui = {
  mode: 'strict',
  angleSetting: 0,                 // free mode: the slider, in degrees along the rows
  keys: new Set(),                 // free mode: arrow keys held down
  phone: null,                     // free mode: { beta, gamma } calibration while phone tilt is on
  phoneGravity: { x: 0, y: 0 },    // free mode: the phone's pull, in screen space
  copied: '',                      // brief confirmation after a copy
};

let root = null;                   // the persistent element this view returns
let stage = null;                  // canvas host
let panel = null;                  // controls, rebuilt on every render
let live = {};                     // per-frame readouts in the panel
let ctx = null;                    // three.js scene, once loaded
let loading = false;
let running = false;
let lastTime = 0;

// --- what the scene is showing ----------------------------------------------
// Both modes drive the same display: a bar offset per row and a list of
// marbles with a column (x) and a row (y), both in board units. Nothing is
// eased toward a target: every position comes straight from the engine's
// animation or from the physics, so a marble is drawn exactly where the model
// says it is and never inside a block.
const disp = {
  angle: 0,                        // tray tilt drawn, radians
  bars: new Array(ROWS).fill(0),
  marbles: [],                     // { value, x, y }
  flash: new Array(ROWS).fill(0),  // seconds of red left on a locked bar
  rowAxis: { x: 0, y: -1 },        // screen direction of increasing row
};

// Strict mode: the engine state on screen, and moves waiting to be animated.
const strict = { shown: null, queue: [], anim: null, marbles: [] };
// Free mode: the physics world, and still positions to undo back to.
let world = null;
const freeHistory = [];
let lastStill = null;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

const hasWebGL = () => typeof window !== 'undefined'
  && (typeof window.WebGL2RenderingContext !== 'undefined' || typeof window.WebGLRenderingContext !== 'undefined');

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function button(label, onClick, className = '') {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function copyText(text, what) {
  try {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  } catch { /* no clipboard: the code is still shown to copy by hand */ }
  ui.copied = `${what} copied`;
  if (live.copied) live.copied.textContent = ui.copied;
  setTimeout(() => { ui.copied = ''; if (live.copied) live.copied.textContent = ''; }, 1800);
}

// =============================================================================
// Strict mode: the engine decides, the scene animates
// =============================================================================

/** Put the scene straight onto a board, with no animation. */
function snapTo(state) {
  strict.shown = state;
  strict.queue = [];
  strict.anim = null;
  strict.marbles = [];
  state.cells.forEach((value, cell) => { if (value !== EMPTY) strict.marbles.push({ value, cell, y: null }); });
}

/** Line the scene up with the store: animate the newest move, or snap. */
function syncStrict() {
  const current = board();
  if (!strict.shown) { snapTo(current); return; }
  const endKey = stateKey(strict.queue.length ? strict.queue[strict.queue.length - 1].to : strict.shown);
  if (stateKey(current) === endKey) return;
  const history = app.history;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last.move && prev && stateKey(prev.state) === endKey && !reducedMotion()) {
    strict.queue.push({ move: last.move, from: prev.state, to: current });
  } else {
    snapTo(current);
  }
}

function startNextMove() {
  const next = strict.queue.shift();
  if (!next) return;
  const hurry = strict.queue.length > 1 ? 3 : 1;   // catch up when moves are queued
  if (next.move.type === 'slide') {
    strict.anim = { type: 'slide', t: 0, hurry, row: next.move.row, target: next.to,
                    from: next.from.shifts[next.move.row], to: next.to.shifts[next.move.row] };
    return;
  }
  const direction = next.move.direction;
  const { moved } = resolve(next.from, direction);
  const byCell = new Map(strict.marbles.map((m) => [m.cell, m]));
  const falls = moved.map(({ from, to }) => {
    const a = Math.floor(from / SLOTS), b = Math.floor(to / SLOTS);
    return { m: byCell.get(from), from: a, to: b, cell: to, time: Math.sqrt(2 * Math.abs(b - a) / FALL) };
  });
  strict.anim = {
    type: 'tilt', t: 0, hurry, target: next.to,
    lean: direction === 'down' ? STRICT_LEAN : -STRICT_LEAN,
    falls, fallTime: Math.max(0, ...falls.map((f) => f.time)),
  };
}

const ease = (u) => u * u * (3 - 2 * u);

function land(anim) {
  for (const f of anim.falls) { f.m.cell = f.cell; f.m.y = null; }
  strict.shown = anim.target;
  anim.landed = true;
}

function advanceStrict(dt) {
  if (!strict.anim) startNextMove();
  const anim = strict.anim;
  const bars = [...strict.shown.shifts];
  if (anim) anim.t += dt * anim.hurry;

  if (anim && anim.type === 'slide') {
    const u = Math.min(1, anim.t / SLIDE_TIME);
    bars[anim.row] = anim.from + (anim.to - anim.from) * ease(u);
    if (u >= 1) { strict.shown = anim.target; strict.anim = null; bars[anim.row] = anim.to; }
  } else if (anim && anim.type === 'tilt') {
    // Lean the tray, let the marbles fall, stand it back up.
    const LEAN = 0.18;
    const t = anim.t;
    if (t < LEAN) {
      disp.angle = anim.lean * ease(t / LEAN);
    } else if (t < LEAN + anim.fallTime) {
      disp.angle = anim.lean;
      const u = t - LEAN;
      for (const f of anim.falls) {
        f.m.y = f.from + Math.sign(f.to - f.from) * Math.min(Math.abs(f.to - f.from), 0.5 * FALL * u * u);
      }
    } else if (t < 2 * LEAN + anim.fallTime) {
      if (!anim.landed) land(anim);
      disp.angle = anim.lean * (1 - ease((t - LEAN - anim.fallTime) / LEAN));
    } else {
      if (!anim.landed) land(anim);
      disp.angle = 0;
      strict.anim = null;
    }
  } else {
    disp.angle = 0;
  }

  disp.bars = bars;
  // A marble's column is its hole's, at wherever its bar is drawn; while it
  // falls its column cannot change, and no bar moves during a tilt.
  disp.marbles = strict.marbles.map((m) => {
    const row = Math.floor(m.cell / SLOTS);
    return { value: m.value, x: 2 * (m.cell % SLOTS) + (row % 2) + bars[row], y: m.y ?? row };
  });
}

function doTilt(direction) {
  const before = board();
  const after = resolve(before, direction).state;
  if (stateKey(after) === stateKey(before)) {
    note(`tilt ${direction} — nothing could move`);
    return;
  }
  commit(after, `tilt ${direction}`, { type: 'tilt', direction });
}

function doSlide(row) {
  commit(slide(board(), row), `slide row ${row + 1}`, { type: 'slide', row });
}

// =============================================================================
// Free mode: gravity
// =============================================================================

function startFree(state) {
  world = createWorld(state);
  freeHistory.length = 0;
  lastStill = cloneWorld(world);
}

function freeUndo(rerender) {
  if (!freeHistory.length) return;
  world = freeHistory.pop();
  lastStill = cloneWorld(world);
  // Put the tray down level too, or it would roll straight off again.
  ui.angleSetting = 0;
  if (ui.phone) ui.phone = { beta: null, gamma: null };
  rerender();
}

function freeSlide(row) {
  if (!trySlide(world, row)) disp.flash[row] = 0.45;
}

/** The pull in screen space from held arrow keys, or null if none are held. */
function keyGravity() {
  if (!ui.keys.size) return null;
  let x = 0, y = 0;
  if (ui.keys.has('ArrowUp')) y += 1;
  if (ui.keys.has('ArrowDown')) y -= 1;
  if (ui.keys.has('ArrowRight')) x += 1;
  if (ui.keys.has('ArrowLeft')) x -= 1;
  const len = Math.hypot(x, y) || 1;
  return { x: (x / len) * Math.sin(KEY_TILT), y: (y / len) * Math.sin(KEY_TILT) };
}

/** Tilt along the rows that the physics should feel right now. */
function freeAngle() {
  const keys = keyGravity();
  if (keys) return tiltAlong(keys, disp.rowAxis);
  if (ui.phone) return tiltAlong(ui.phoneGravity, disp.rowAxis);
  return ui.angleSetting * Math.PI / 180;
}

let physicsAngle = 0;
function advanceFree(dt) {
  const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, freeAngle()));
  physicsAngle += (target - physicsAngle) * Math.min(1, dt * 8);
  const wasStill = atRest(world);
  step(world, dt, physicsAngle);
  const still = atRest(world);
  if (wasStill && !still && lastStill) freeHistory.push(lastStill);
  if (still) lastStill = cloneWorld(world);
  if (freeHistory.length > 200) freeHistory.shift();
  // With the phone, the phone itself is the tray: don't tip the picture too.
  disp.angle = ui.phone ? 0 : physicsAngle;
  disp.bars = [...world.bar];
  disp.marbles = world.marbles.map((m) => ({ value: m.value, x: m.x, y: m.y }));
}

function freeStatus() {
  if (!world) return '';
  if (!atRest(world)) return 'Rolling…';
  const position = toState(world);
  if (world.bar.some((b) => b !== 0 && b !== 1)) return 'A bar is held part-way — let go and it clicks to the nearer end.';
  if (!position) return 'At rest, with a marble caught between two rows — its bars are locked.';
  if (stateKey(position) === stateKey(board())) return 'At rest, on the same board as strict mode.';
  return 'At rest in holes — a board position strict mode can take from here.';
}

function onOrientation(event) {
  if (!ui.phone || event.beta == null || event.gamma == null) return;
  if (ui.phone.beta == null) ui.phone = { beta: event.beta, gamma: event.gamma };
  const rad = Math.PI / 180;
  // In the phone's own frame: tipping the right edge down pulls right, lifting
  // the top edge pulls down the screen.
  const gx = Math.sin((event.gamma - ui.phone.gamma) * rad);
  const gy = -Math.sin((event.beta - ui.phone.beta) * rad);
  // Then into screen space, which turns with the phone in landscape.
  let turn = 0;
  try { turn = (screen.orientation?.angle ?? window.orientation ?? 0) * rad; } catch { turn = 0; }
  ui.phoneGravity = {
    x: gx * Math.cos(turn) - gy * Math.sin(turn),
    y: gx * Math.sin(turn) + gy * Math.cos(turn),
  };
}

async function togglePhone(rerender) {
  if (ui.phone) {
    ui.phone = null;
    window.removeEventListener('deviceorientation', onOrientation);
    rerender();
    return;
  }
  const D = window.DeviceOrientationEvent;
  try {
    if (D && typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return;
  } catch { return; }
  ui.phone = { beta: null, gamma: null };   // whatever angle it is held at now counts as level
  ui.phoneGravity = { x: 0, y: 0 };
  window.addEventListener('deviceorientation', onOrientation);
  rerender();
}

// =============================================================================
// Frame loop
// =============================================================================

function frame(now) {
  if (!root || !root.isConnected) { running = false; return; }
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (ui.mode === 'free' && world) advanceFree(dt); else advanceStrict(dt);
  for (let r = 0; r < ROWS; r++) disp.flash[r] = Math.max(0, disp.flash[r] - dt);

  if (ui.mode === 'free' && live.status) {
    const text = freeStatus();
    if (live.status.textContent !== text) live.status.textContent = text;
    const position = atRest(world) ? toState(world) : null;
    live.adopt.disabled = !position || stateKey(position) === stateKey(board());
    live.copy.disabled = !position;
    live.undo.disabled = !freeHistory.length;
    live.angle.textContent = angleLabel(physicsAngle);
    const jammed = jammedRows(world);
    live.rows.forEach((b, r) => b.classList.toggle('jammed', jammed.has(r)));
  }
  if (ctx) draw();
  requestAnimationFrame(frame);
}

function startLoop() {
  if (running || typeof requestAnimationFrame === 'undefined') return;
  running = true;
  lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
  requestAnimationFrame(frame);
}

const angleLabel = (a) => {
  const deg = Math.round(a * 180 / Math.PI);
  if (deg === 0) return 'level';
  return `${Math.abs(deg)}° toward row ${deg > 0 ? 8 : 1}`;
};

// =============================================================================
// three.js scene
// =============================================================================

const COLOURS = {
  '1993': { 1: 0x7a5fd0, 2: 0x3fcab4 },   // purple and teal, as in the photos
  '1998': { 1: 0xf2994a, 2: 0x6fbf73 },
};

async function loadScene() {
  if (ctx || loading || !hasWebGL()) return;
  loading = true;
  try {
    const THREE = await import('./vendor/three.module.min.js');
    ctx = buildScene(THREE);
    stage.replaceChildren(ctx.renderer.domElement, el('div', 'stage-hint',
      'Drag to turn the tray, scroll or pinch to zoom. Tap a bar to slide it.'));
    resize();
  } catch (error) {
    ctx = null;
    stage.replaceChildren(el('p', 'note', `The 3D view could not start: ${error.message}`));
  } finally {
    loading = false;
  }
}

function roundedRect(THREE, w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

/** The tray's outline: straight sides, top and bottom bowed outwards. */
function outline(THREE, w, inner, outer, bow, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -inner);
  s.lineTo(-w / 2, -outer + r);
  s.quadraticCurveTo(-w / 2, -outer, -w / 2 + r, -outer - bow * 0.15);
  s.quadraticCurveTo(0, -outer - bow, w / 2 - r, -outer - bow * 0.15);
  s.quadraticCurveTo(w / 2, -outer, w / 2, -outer + r);
  s.lineTo(w / 2, outer - r);
  s.quadraticCurveTo(w / 2, outer, w / 2 - r, outer + bow * 0.15);
  s.quadraticCurveTo(0, outer + bow, -w / 2 + r, outer + bow * 0.15);
  s.quadraticCurveTo(-w / 2, outer, -w / 2, outer - r);
  s.lineTo(-w / 2, -inner);
  return s;
}

/** One bezel: the part of the outline above (sign 1) or below (-1) the window. */
function bezel(THREE, w, inner, outer, bow, r, sign) {
  const s = new THREE.Shape();
  const y = (v) => sign * v;
  s.moveTo(-w / 2, y(inner));
  s.lineTo(w / 2, y(inner));
  s.lineTo(w / 2, y(outer - r));
  s.quadraticCurveTo(w / 2, y(outer), w / 2 - r, y(outer + bow * 0.15));
  s.quadraticCurveTo(0, y(outer + bow), -w / 2 + r, y(outer + bow * 0.15));
  s.quadraticCurveTo(-w / 2, y(outer), -w / 2, y(outer - r));
  s.lineTo(-w / 2, y(inner));
  return s;
}

/** A booklet-style print of a board: a 9 x 8 grid with its marbles. */
function printTexture(THREE, state, palette) {
  const canvas = document.createElement('canvas');
  const cell = 26, pad = 8;
  canvas.width = 9 * cell + 2 * pad;
  canvas.height = 8 * cell + 2 * pad;
  const g = canvas.getContext('2d');
  g.fillStyle = '#a7adb1';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  for (let row = 0; row < 8; row++) {
    for (let slot = 0; slot < 4; slot++) {
      const v = state.cells[row * 4 + slot];
      const c = columnOf(row, slot, state.shifts[row]);
      const x = pad + c * cell, y = pad + row * cell;
      if (v === EMPTY) continue;
      g.fillStyle = hex(COLOURS[palette][v] ?? 0x999999);
      g.beginPath();
      g.arc(x + cell / 2, y + cell / 2, cell * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = '#4f5570';
  g.lineWidth = 2;
  for (let i = 0; i <= 9; i++) { g.beginPath(); g.moveTo(pad + i * cell, pad); g.lineTo(pad + i * cell, pad + 8 * cell); g.stroke(); }
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(pad, pad + i * cell); g.lineTo(pad + 9 * cell, pad + i * cell); g.stroke(); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function labelTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8b9296'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#6f777b'; g.lineWidth = 8;
  g.beginPath(); g.roundRect(24, 24, 464, 112, 56); g.stroke();
  g.fillStyle = '#737b80';
  g.font = 'italic 700 64px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SWITCHBACK', 256, 72);
  g.font = '600 20px system-ui, sans-serif';
  g.fillText('PATENT PENDING', 256, 116);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildScene(THREE) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d858a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(7, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(-9, 6, -5);
  scene.add(fill);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.18 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -3.4;
  table.receiveShadow = true;
  scene.add(table);

  const mat = (color, roughness = 0.55, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const frameMat = mat(0xa5abaf, 0.5);
  const pillarMat = mat(0x939a9e, 0.55);
  const backMat = mat(0x8c9397, 0.45);
  const nubMat = mat(0xcfcfc9, 0.5);

  // Tray local space: x = column - 4, y = 3.5 - row, the face looks along +z.
  const tray = new THREE.Group();
  scene.add(tray);
  const add = (mesh, parent = tray) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

  const W = 12.4, INNER = 4.08, OUTER = 5.9, BOW = 0.5, R = 0.45;
  const extrude = (shape, depth, bevel = 0.06) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24,
  });

  // Back cover, full outline.
  const back = add(new THREE.Mesh(extrude(outline(THREE, W - 0.1, 0, OUTER - 0.05, BOW, R), 0.4), backMat));
  back.position.z = -1.05;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.125), new THREE.MeshStandardMaterial({ map: labelTexture(THREE), roughness: 0.6 }));
  label.position.set(0, 0, -1.12);
  label.rotation.y = Math.PI;
  tray.add(label);

  // Bezels, full depth, top and bottom. The sides between them are open: that
  // is where the bars run out of the tray.
  for (const sign of [1, -1]) {
    const b = add(new THREE.Mesh(extrude(bezel(THREE, W, INNER, OUTER, BOW, R, sign), 1.2), frameMat));
    b.position.z = -0.84;               // face just above the bars, so it hides no row
  }
  // Side pillars over the bar ends.
  for (const sign of [1, -1]) {
    const p = add(new THREE.Mesh(extrude(roundedRect(THREE, 1.5, 2 * INNER, 0.12), 0.26, 0.04), pillarMat));
    p.position.set(sign * (4.55 + 0.8), 0, 0.2);
  }
  // Smoked clear backing behind the holes.
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 2 * INNER),
    new THREE.MeshStandardMaterial({ color: 0x222a2e, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.93 }));
  smoke.position.z = -0.6;
  smoke.receiveShadow = true;
  tray.add(smoke);

  // Frame prints: the target, if there is one, then booklet patterns.
  const printGeo = new THREE.PlaneGeometry(1.95, 1.75);
  const prints = [[-1.2, 5.0], [1.2, 5.0], [-1.2, -5.0], [1.2, -5.0]].map(([x, y]) => {
    const m = new THREE.Mesh(printGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }));
    m.position.set(x, y, 0.425);
    tray.add(m);
    return m;
  });

  // Bars: blocks between the holes, a peg on each block, ribbed ends.
  const blockGeo = extrude(roundedRect(THREE, 0.8, 0.8, 0.1), 0.56, 0.05);
  blockGeo.center();
  const nubGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12);
  nubGeo.rotateX(Math.PI / 2);
  const finGeo = new THREE.BoxGeometry(0.07, 0.86, 0.62);
  const bars = [];
  for (let row = 0; row < ROWS; row++) {
    const group = new THREE.Group();
    group.position.y = 3.5 - row;
    const barMat = mat(0xe3e3de, 0.42, { emissive: 0x000000 });
    const holes = new Set([0, 1, 2, 3].map((j) => 2 * j + (row % 2)));
    // Long enough to cover the window at either slider position, and to stick
    // out of the open sides a little, as the real bars do.
    for (let k = -2; k <= 10; k++) {
      if (holes.has(k)) continue;
      const block = add(new THREE.Mesh(blockGeo, barMat), group);
      block.position.set(k - 4, 0, -0.18);
      if (k >= 0 && k <= 8) {
        const nub = add(new THREE.Mesh(nubGeo, nubMat), group);
        nub.position.set(k - 4, 0.12, 0.13);
      }
    }
    for (const end of [-1, 1]) {
      for (let f = 0; f < 3; f++) {
        const fin = add(new THREE.Mesh(finGeo, barMat), group);
        fin.position.set(end * (6.55 + f * 0.16), 0, -0.18);
      }
    }
    // An invisible hit box for tapping the bar.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.96, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0, -0.18);
    hit.userData.row = row;
    group.add(hit);
    tray.add(group);
    bars.push({ group, material: barMat, hit });
  }

  // Marbles: a pool, coloured as they are assigned.
  const marbleGeo = new THREE.SphereGeometry(0.41, 40, 28);
  const marbleMats = {};
  const marbleMat = (value) => {
    const key = `${app.palette}:${value}`;
    if (!marbleMats[key]) {
      marbleMats[key] = new THREE.MeshPhysicalMaterial({
        color: COLOURS[app.palette][value] ?? 0x9aa0a4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12,
      });
    }
    return marbleMats[key];
  };
  const marbles = Array.from({ length: 32 }, () => {
    const m = add(new THREE.Mesh(marbleGeo, marbleMat(1)));
    m.visible = false;
    return m;
  });

  const scene3 = {
    THREE, renderer, scene, camera, tray, bars, marbles, marbleMat, prints,
    printKey: null,
    view: { theta: 0, phi: 0.5, radius: 27 },
  };
  attachControls(scene3);
  return scene3;
}

function updatePrints() {
  const target = app.target?.state ?? patternByNumber(1).state;
  const key = `${app.palette}:${stateKey(target)}`;
  if (ctx.printKey === key) return;
  ctx.printKey = key;
  const boards = [target, patternByNumber(2).state, patternByNumber(3).state, patternByNumber(4).state];
  ctx.prints.forEach((mesh, i) => {
    if (mesh.material.map) mesh.material.map.dispose();
    mesh.material.map = printTexture(ctx.THREE, boards[i], app.palette);
    mesh.material.needsUpdate = true;
  });
}

function draw() {
  const { THREE, renderer, scene, camera, tray, bars, marbles, marbleMat, view } = ctx;
  updatePrints();
  const { theta, phi, radius } = view;
  camera.position.set(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi) - 1,
    radius * Math.sin(phi) * Math.cos(theta),
  );
  camera.lookAt(0, -1, 0);
  camera.updateMatrixWorld();

  // Where the rows run on screen, with the tray lying flat: row 1's end of the
  // tray is at -z in world space, row 8's at +z.
  const a = new THREE.Vector3(0, 0, -3.5).project(camera);
  const b = new THREE.Vector3(0, 0, 3.5).project(camera);
  disp.rowAxis = { x: (b.x - a.x) * camera.aspect, y: b.y - a.y };

  // Lying on the table, top row away from you. A tilt lifts one edge.
  tray.rotation.x = -Math.PI / 2 + disp.angle;
  for (let r = 0; r < ROWS; r++) {
    bars[r].group.position.x = disp.bars[r];
    bars[r].material.emissive.setRGB(disp.flash[r] > 0 ? 0.55 * (disp.flash[r] / 0.45) : 0, 0, 0);
  }
  marbles.forEach((mesh, i) => {
    const m = disp.marbles[i];
    mesh.visible = !!m;
    if (!m) return;
    const material = marbleMat(m.value);
    if (mesh.material !== material) mesh.material = material;
    mesh.position.set(m.x - 4, 3.5 - m.y, -0.16);
  });
  renderer.render(scene, camera);
}

function resize() {
  if (!ctx || !stage) return;
  const width = stage.clientWidth || 480;
  const height = Math.round(width * 1.02);
  ctx.renderer.setSize(width, height, false);
  ctx.renderer.domElement.style.width = '100%';
  ctx.renderer.domElement.style.height = `${height}px`;
  ctx.camera.aspect = width / height;
  // Keep the whole tray in frame on a narrow screen.
  ctx.camera.fov = width < 380 ? 38 : 32;
  ctx.camera.updateProjectionMatrix();
}

/**
 * Pointer input on the canvas. On a bar: tap to slide it, or drag it — in free
 * mode the bar follows the finger and can be held part-way. Anywhere else:
 * drag to turn the tray, pinch or scroll to zoom.
 */
function attachControls(c) {
  const canvas = c.renderer.domElement;
  canvas.style.touchAction = 'none';
  const pointers = new Map();
  let travel = 0, pinch = 0, grab = null;
  const ray = new c.THREE.Raycaster();

  const toPixels = (v) => {
    const rect = canvas.getBoundingClientRect();
    const p = v.clone().project(c.camera);
    return { x: (p.x + 1) / 2 * rect.width, y: (1 - p.y) / 2 * rect.height };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    travel = 0;
    grab = null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new c.THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    ), c.camera);
    const hit = ray.intersectObjects(c.bars.map((b) => b.hit), false)[0];
    if (!hit) return;
    // One column along this bar, in screen pixels, to turn a drag into a slide.
    const row = hit.object.userData.row;
    const p0 = toPixels(c.tray.localToWorld(new c.THREE.Vector3(0, 3.5 - row, 0)));
    const p1 = toPixels(c.tray.localToWorld(new c.THREE.Vector3(1, 3.5 - row, 0)));
    grab = {
      row, x: e.clientX, y: e.clientY, u: { x: p1.x - p0.x, y: p1.y - p0.y },
      start: ui.mode === 'free' && world ? world.bar[row] : board().shifts[row],
      moved: false, fired: false,
    };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    travel += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoom(pinch / d);
      pinch = d;
      return;
    }
    if (grab) {
      const len2 = grab.u.x ** 2 + grab.u.y ** 2 || 1;
      const columns = ((e.clientX - grab.x) * grab.u.x + (e.clientY - grab.y) * grab.u.y) / len2;
      if (Math.abs(columns) > 0.06) grab.moved = true;
      if (!grab.moved) return;
      if (ui.mode === 'free' && world) {
        if (!holdBar(world, grab.row, grab.start + columns)) disp.flash[grab.row] = 0.45;
      } else if (!grab.fired && (grab.start === 0 ? columns > 0.45 : columns < -0.45)) {
        grab.fired = true;
        doSlide(grab.row);
      }
      return;
    }
    c.view.theta -= dx * 0.007;
    c.view.phi = Math.max(0.12, Math.min(1.5, c.view.phi - dy * 0.007));
  });

  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = grab;
    grab = null;
    if (!g || pointers.size) return;
    if (g.moved) {
      if (ui.mode === 'free' && world) releaseBar(world, g.row);
    } else if (travel <= 8) {
      slideRow(g.row);   // a tap
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
  canvas.addEventListener('dblclick', resetView);
  const zoom = (factor) => { c.view.radius = Math.max(13, Math.min(55, c.view.radius * factor)); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(stage);
}

function resetView() {
  if (ctx) Object.assign(ctx.view, { theta: 0, phi: 0.5, radius: 27 });
}

function slideRow(row) {
  if (ui.mode === 'free' && world) freeSlide(row); else doSlide(row);
}

// =============================================================================
// Panel
// =============================================================================

function setMode(mode, rerender) {
  if (mode === ui.mode) return;
  ui.mode = mode;
  ui.keys.clear();
  if (mode === 'free') {
    startFree(board());
  } else {
    world = null;
    strict.shown = null;
    syncStrict();
  }
  rerender();
}

function rowButtons() {
  const rows = el('div', 'rows3d');
  live.rows = [];
  for (let r = 0; r < ROWS; r++) {
    const b = button(String(r + 1), () => slideRow(r));
    b.title = `Slide bar ${r + 1}`;
    rows.appendChild(b);
    live.rows.push(b);
  }
  return rows;
}

function strictPanel(rerender) {
  const nodes = [];
  const tilts = el('div', 'tilts');
  tilts.append(button('Tilt up', () => doTilt('up')), button('Tilt down', () => doTilt('down')));
  nodes.push(tilts, rowButtons());

  const minor = el('div', 'minor');
  const undoBtn = button('Undo', undo);
  undoBtn.disabled = !canUndo();
  minor.append(undoBtn,
    button('Capture as pattern', () => update((s) => {
      s.captured.push({ name: `Captured ${s.captured.length + 1}`, note: `After ${moveCount()} moves.`, state: board() });
      note('captured as a pattern — see the Patterns tab');
    })),
    button('Reset view', resetView));
  nodes.push(minor);

  const readout = el('div', 'readout');
  const list = el('dl');
  const pairs = [['Moves', String(moveCount())], ['Last move', lastMove()]];
  if (app.target) {
    const match = compare(board(), app.target.state);
    pairs.push(['Target', app.target.name],
      ['Progress', match.solved ? 'Solved' : `${match.missing} marble${match.missing === 1 ? '' : 's'} still out of place`]);
  }
  for (const [dt, dd] of pairs) list.append(el('dt', '', dt), el('dd', '', dd));
  readout.appendChild(list);

  // The replay code: the whole game, to copy out or paste back in.
  const code = el('div', 'code');
  const input = el('input');
  input.value = replayCode();
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Replay code');
  const error = el('div', 'err');
  code.append(input,
    button('Copy', () => { input.select(); copyText(input.value, 'Replay code'); }),
    button('Load', () => {
      try { load(input.value, board().board); } catch (e) { error.textContent = e.message; }
    }));
  readout.append(code, error, (live.copied = el('p', 'note copied', ui.copied)));
  nodes.push(readout);
  nodes.push(el('p', 'note',
    'The same game as the Play tab: moves go through the engine onto the same history, so undo and '
    + 'replay codes carry over. Tap or drag a bar to slide it. Keyboard: 1–8 slide, arrows tilt '
    + 'toward that edge of the screen, U undoes. The first print on the frame is your target.'));
  return nodes;
}

function freePanel(rerender) {
  const nodes = [];
  const tilt = el('div', 'tilt3d');
  const range = el('input');
  Object.assign(range, { type: 'range', min: '-70', max: '70', step: '1', value: String(ui.angleSetting) });
  range.setAttribute('aria-label', 'Tray tilt');
  range.disabled = !!ui.phone;
  range.addEventListener('input', () => { ui.angleSetting = Number(range.value); });
  const head = el('div', 'tilt3d-head');
  head.append(el('span', '', ui.phone ? 'Tilt — from the phone' : 'Tilt'),
    (live.angle = el('span', 'tilt3d-angle', angleLabel(physicsAngle))));
  tilt.append(head, range);
  nodes.push(tilt);

  const minor = el('div', 'minor');
  minor.append(button('Level', () => {
    ui.angleSetting = 0; range.value = '0';
    if (ui.phone) ui.phone = { beta: null, gamma: null };   // re-zero the phone where it is now
  }));
  if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
    minor.append(button(ui.phone ? 'Phone tilt: on' : 'Use phone tilt', () => togglePhone(rerender), ui.phone ? 'on' : ''));
  }
  live.undo = button('Undo', () => freeUndo(rerender));
  live.undo.disabled = !freeHistory.length;
  minor.append(live.undo, button('Reset view', resetView));
  nodes.push(minor, rowButtons());

  nodes.push((live.status = el('p', 'note free-status', freeStatus())));
  const act = el('div', 'minor');
  live.adopt = button('Play this position in strict mode', () => {
    const s = toState(world);
    if (!s) return;
    resetTo(s, 'from free play');
    setMode('strict', rerender);
  }, 'strong');
  live.copy = button('Copy board code', () => {
    const s = toState(world);
    if (s) copyText(stateKey(s), 'Board code');
  });
  const position = world && atRest(world) ? toState(world) : null;
  live.adopt.disabled = !position || stateKey(position) === stateKey(board());
  live.copy.disabled = !position;
  act.append(live.adopt, live.copy, button('Start again from the strict board', () => { startFree(board()); rerender(); }));
  nodes.push(act, (live.copied = el('p', 'note copied', ui.copied)));
  nodes.push(el('p', 'note',
    'Nothing here is decided by the engine: the marbles simply fall. Hold the tray at any angle. '
    + 'Drag a bar to hold it part-way, and shut it while marbles stream through to keep the rest back — '
    + 'a bar with a marble half in it will not move. Arrow keys and phone tilt pull toward that edge '
    + 'of the screen, however the tray is turned. Undo goes back to the last still position.'));
  return nodes;
}

function drawPanel(rerender) {
  live = {};
  const seg = el('div', 'seg');
  for (const [mode, label] of [['strict', 'Strict — engine rules'], ['free', 'Free — real gravity']]) {
    const b = button(label, () => setMode(mode, rerender), ui.mode === mode ? 'on' : '');
    b.setAttribute('aria-pressed', String(ui.mode === mode));
    seg.appendChild(b);
  }
  panel.replaceChildren(seg, ...(ui.mode === 'strict' ? strictPanel(rerender) : freePanel(rerender)));
}

// =============================================================================
// View entry points
// =============================================================================

let rerenderView = () => {};

export function render(rerender) {
  rerenderView = rerender;
  if (!root) {
    root = el('div', 'view view3d');
    stage = el('div', 'stage');
    panel = el('div', 'panel3d');
    stage.appendChild(el('p', 'note', hasWebGL()
      ? 'Loading the 3D tray…'
      : 'This browser has no WebGL, so the 3D tray cannot be drawn. The controls below still play the game.'));
    root.append(stage, panel);
    if (typeof window !== 'undefined') window.addEventListener('blur', () => ui.keys.clear());
  }
  if (ui.mode === 'strict') syncStrict();
  else if (!world) startFree(board());
  drawPanel(rerender);
  loadScene();
  startLoop();
  return root;
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function keydown(event) {
  if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return;
  if (event.key >= '1' && event.key <= '8') {
    slideRow(Number(event.key) - 1);
  } else if (ARROWS.includes(event.key)) {
    event.preventDefault();
    if (ui.mode === 'free') { ui.keys.add(event.key); return; }
    if (event.repeat) return;
    // Strict: tilt toward the edge of the screen the arrow points at.
    const pull = { ArrowUp: { x: 0, y: 1 }, ArrowDown: { x: 0, y: -1 },
                   ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }[event.key];
    const along = tiltAlong(pull, disp.rowAxis);
    if (Math.abs(along) > 0.3) doTilt(along > 0 ? 'down' : 'up');
  } else if (event.key.toLowerCase() === 'u') {
    if (ui.mode === 'free') freeUndo(rerenderView); else undo();
  }
}

export function keyup(event) {
  ui.keys.delete(event.key);
}
