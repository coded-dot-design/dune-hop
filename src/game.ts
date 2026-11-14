// Dune Hop, the scene: a race (./race.ts) drawn as a tabletop diorama. A slab of ridged dunes on a
// plinth: at night the crests glow in neon contour lines over violet sand under a striped sun; by day
// it is a hot sunset; Neon Edge is always night, at the city's edge, its towers lit. Four buggies, the
// gates, boost pads with chevrons, the jump lips, light trails and dust. The camera chases your buggy
// (V: the whole table). Board UI stickers for the HUD and the cards (track select, pause, results),
// mounted in a shadow root so the page and the game never touch each other's styles.
// Bricks: the kernel (fixed step, settle, the ledger: every page write goes back on Recall),
// @fzlt/core/diorama, terrain, drive (and its `chase` camera), input, pad, sound, ui.
// Keys: ↑/W gas, ↓/S brake (reverse when stopped), ←→/AD steer, Shift drift, Space nitro, P pause, V view,
// M mute, R restart, T tracks; Escape pauses (or, dropped onto a page, gives the page back).
// Pointer: hold the course for gas, drag to steer. Phones: the pad.
import { createEngine, seeded } from "@fzlt/core/kernel";
import { diorama, type DioramaObject, type DioramaPoints } from "@fzlt/core/diorama";
import { terrainView, type TerrainView } from "@fzlt/core/terrain";
import { chase } from "@fzlt/core/drive";
import { controls } from "@fzlt/core/input";
import { pad } from "@fzlt/core/pad";
import { sound } from "@fzlt/core/sound";
import { mount as buiMount } from "@fzlt/core/ui";
import { createRace, MAX_CARS, IK, K, COUNT, RUN, DONE, CRASH, FIN, PH, NEXT, LAP, PLACE, BEST, LAPT, BOOST, DPTS, DTIME, DTOTAL, SPIN, E_GO, E_GATE, E_LAP, E_LAND, E_CRASH, E_RESPAWN, E_DONE, E_BOOST, E_COUNT, E_WRONG, E_BUMP, E_DRIFT, E_DRIFT_LOST, E_SPIN, type Race } from "./race.ts";
import { TRACKS, trackById, TRACK_W, KIND_TRACK, type Path } from "./tracks.ts";
import { CLEAN, SC, CB, BEST as SBEST, CLEANS, PTS, AIR, TOP } from "./stunt.ts";

const TAU = 6.283185307179586;

// ---- palettes by role: night (dark), a hot sunset (light), and the city at night ----
const DARK = {
  night: true, city: false, light: [-0.35, 1, 0.55], amb: 0.46,
  sky0: "#07061a", sky1: "#2a0f4a", sky2: "#6a1d6e", sun0: "#ffcf5a", sun1: "#ff2e88", star: "#cfd8ff",
  sand: ["#221c46", "#2c245a", "#382d6c"], crest: "#463680", steep: "#1a1536", track: "#16122c", pad: "#ff2e88", edge: "#22e6ff", lines: ["#5a3fb0", "#b83fd0", "#ff4fa8"], lineA: [0.55, 0.7, 0.95],
  plinth: "#16122b", rim: "#22e6ff", table: "#0d0b1c", rock: "#2c2550", pylon: "#2a2445", tip: "#22e6ff", tip2: "#ff4fa8", lip: "#ffd166", chev: "#fff1fb",
  chassis: "#1d1c28", cage: "#b9bdd8", tyre: "#111118", hub: "#8d92b4", helmet: "#ff4fa8", visor: "#0a0c16", lamp: "#fff7d6", tail: "#ff2e88",
  gNext: "#ff4fa8", gDone: "#22e6ff", gIdle: "#5a4a9c", gPost: "#2b2546", check: "#f4f1ff", ink: "#0b0a14",
  dust: "#8a78c8", spark: "#ffd166", shadow: "#000000", tower: "#120f26", win: "#22e6ff", win2: "#ff4fa8", win3: "#ffd166",
  cars: [["#eef0ff", "#22e6ff"], ["#d6ff3e", "#1d1c28"], ["#ff4fa8", "#ffd166"], ["#ff8a1f", "#22e6ff"], ["#9b7bff", "#d6ff3e"], ["#22e6ff", "#ff4fa8"]],
};
type Pal = typeof DARK;
const LIGHT: Pal = {
  ...DARK, night: false, light: [0.75, 0.75, 0.35], amb: 0.52,
  sky0: "#ffb36b", sky1: "#ff8a6a", sky2: "#ffd29a", sun0: "#fff4c2", sun1: "#ffb35c", star: "#ffffff",
  sand: ["#f0aa72", "#e99a63", "#df8a57"], crest: "#f6be86", steep: "#c56e4b", track: "#c9794f", pad: "#ff3d7f", edge: "#fff1dc", lines: ["#c8643f", "#c8643f", "#b85434"], lineA: [0.28, 0.32, 0.38],
  plinth: "#7a4634", rim: "#ffe0b0", table: "#9c5f45", rock: "#a65b40", pylon: "#5b3a33", tip: "#ff5a3c", tip2: "#ffd25a", lip: "#fff1a8", chev: "#ffffff",
  chassis: "#2a2a33", cage: "#2f3d50", tyre: "#1a1a20", hub: "#d9dbe6", helmet: "#ff5a3c", visor: "#11131c", tail: "#ff3b30",
  gNext: "#ff3d7f", gDone: "#13a9bb", gIdle: "#c79a82", gPost: "#5e3d36", check: "#fffaf0", ink: "#1b1420",
  dust: "#f7d6ae", spark: "#fff1a8", shadow: "#5a2a24",
  cars: [["#1c2a3c", "#14d8e8"], ["#c6f02a", "#1c2a3c"], ["#ff3d7f", "#fff1a8"], ["#ff7a1a", "#1c2a3c"], ["#7a4cff", "#fff1a8"], ["#14d8e8", "#ff3d7f"]],
};
const CITY: Pal = {
  ...DARK, city: true, amb: 0.44,
  sky0: "#03020c", sky1: "#140a33", sky2: "#3d0f52", sun0: "#e8ecff", sun1: "#9aa6ff",
  sand: ["#1b1838", "#231f4a", "#2c2659"], crest: "#3a3170", steep: "#141127", track: "#100d22", lines: ["#2f6dd0", "#22b8e6", "#ff4fa8"], lineA: [0.5, 0.65, 0.9],
  plinth: "#0f0c22", table: "#07060f",
};
// FX pools: dust, sparks; the tail-light trails, per car.
const DUST = 140, SPARK = 64, TRAIL = 30;

export interface DuneHopOptions {
  /** Mount inside this element (absolutely filled; give it a size). Default: a layer over the whole page. */
  host?: HTMLElement | null;
  /** Start on this track id (default the first; `start()` races it). */
  track?: string;
  /** The landing hero: an autopilot lap in the chase view, tap (or a key) to take over. */
  attract?: boolean;
  /** The race seed (the rivals' pace and lines). */
  seed?: number;
  /** Sound on (default true; silent until a gesture anyway). */
  sound?: boolean;
  /** Force a theme (default: the page's `<html data-theme>`). */
  theme?: "dark" | "light";
  /** "page": the keys work anywhere on the page; "focus": only once the game has focus (default:
   *  "page" when dropped onto a page, else "focus"). */
  keyboard?: "page" | "focus";
  /** Called when a race ends. */
  onEnd?: (r: DuneHopResult) => void;
}
export interface DuneHopResult { track: string; place: number; time: number; bestLap: number; score: number; best: boolean }

const store = {
  get(k: string) {
    try {
      return localStorage.getItem("dune-hop:" + k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem("dune-hop:" + k, v);
    } catch {}
  },
};
/** m:ss.t, the tenths cut (not rounded), so the HUD and the cards agree. */
const clock = (s: number) => {
  const t = Math.floor(s * 10 + 1e-6) / 10;
  return `${(t / 60) | 0}:${(t % 60).toFixed(1).padStart(4, "0")}`;
};
const bestOf = (id: string) => {
  const v = Number(store.get("best:" + id));
  return v > 0 ? v : 0;
};

export function createDuneHop(o: DuneHopOptions = {}) {
  const dropIn = !o.host, reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wrap = document.createElement("div");
  wrap.setAttribute("data-fizlet-host", "dune-hop");
  wrap.style.cssText = dropIn ? "position:fixed;inset:0;z-index:2147483000" : "position:absolute;inset:0";
  const engine = createEngine({ root: wrap, settle: 0.5, seed: o.seed ?? 1 });
  const L = engine.ledger, sig = { signal: engine.signal };
  L.add(wrap);
  (o.host ?? document.body).append(wrap);
  const pageTheme = () => o.theme ?? (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const root = buiMount(wrap, __KIT_CSS__ + __GAME_CSS__, { theme: pageTheme() });
  const stage = document.createElement("div");
  stage.className = "dh";
  root.append(stage);

  // ---- the stage: canvas, the play surface, the HUD, the cards ----
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const play = document.createElement("button");
  play.type = "button";
  play.className = "dh-play";
  play.setAttribute("aria-label", "Dune Hop: up or W for gas, down or S to brake, left and right to steer, Shift to drift, Space for nitro; in the air gas lifts the nose and brake dips it. P pauses, V changes the view, M mutes, R restarts, T picks a track");
  const hud = document.createElement("div");
  hud.className = "dh-hud";
  hud.innerHTML =
    `<div class="dh-head" data-hud><b class="dh-chip dh-pos"><span>4</span><small>/4</small></b><b class="dh-chip dh-lap"><small>LAP</small><span>1/3</span></b><b class="dh-chip dh-time"><span>0:00.0</span><small></small></b><b class="dh-chip dh-score"><span>0</span><i>×1</i></b><b class="dh-chip dh-nitro"><small>NITRO</small><b><i></i></b></b><b class="dh-chip dh-drift" hidden><small>DRIFT</small><span>0</span></b></div>` +
    `<ol class="dh-board" aria-label="Standings"></ol>` +
    `<p class="dh-keys"><button type="button" class="dh-key dh-k-tracks" aria-label="Tracks (T)">TRACKS</button><button type="button" class="dh-key dh-k-view" aria-label="Camera view (V)">VIEW</button><button type="button" class="dh-key dh-k-mute" aria-label="Sound (M)" aria-pressed="true">♪</button><button type="button" class="dh-key dh-k-pause" aria-label="Pause (P)">❚❚</button></p>` +
    `<p class="dh-hint"></p><p class="dh-toast" hidden></p><p class="dh-count" hidden></p><p class="dh-demo" hidden>DEMO LAP · TAP TO DRIVE</p><p class="dh-live" aria-live="polite"></p>` +
    `<div class="dh-card dh-menu" role="dialog" aria-label="Pick a track" hidden><b>DUNE HOP</b><p class="dh-sub">Pick a track, then START. Three rivals, the clock, every jump and drift scored.</p><ul class="dh-tracks"></ul><p class="dh-row"><button type="button" class="bui-key dh-again dh-start">START</button></p><p class="dh-sub dh-menu-keys"></p></div>` +
    `<div class="dh-card dh-pausec" role="dialog" aria-label="Paused" hidden><b>PAUSED</b><p class="dh-sub dh-p-sub"></p><p class="dh-row"><button type="button" class="bui-key dh-again dh-resume">RESUME</button><button type="button" class="bui-key dh-restart">RESTART</button><button type="button" class="bui-key dh-totracks">TRACKS</button></p><p class="dh-row dh-touch"><small class="dh-sub">STEERING</small><button type="button" class="bui-key dh-padk"></button></p></div>` +
    `<div class="dh-card dh-result" role="dialog" aria-label="Race result" hidden><b class="dh-r-head">RESULT</b><p class="dh-big dh-r-time"></p><p class="dh-sub dh-r-stats"></p><ol class="dh-results"></ol><p class="dh-row"><button type="button" class="bui-key dh-again dh-r-again">RACE AGAIN</button><button type="button" class="bui-key dh-r-next">NEXT TRACK</button><button type="button" class="bui-key dh-r-tracks">TRACKS</button></p></div>`;
  stage.append(canvas, play, hud);
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => hud.querySelector(s) as T;
  const posEl = $(".dh-pos span"), lapEl = $(".dh-lap span"), timeEl = $(".dh-time span"), bestEl = $(".dh-time small"), scoreEl = $(".dh-score span"), comboEl = $(".dh-score i");
  const driftEl = $(".dh-drift"), driftN = $(".dh-drift span"), nitroEl = $(".dh-nitro"), nitroBar = $(".dh-nitro b i"), board = $(".dh-board"), hintEl = $(".dh-hint"), toastEl = $(".dh-toast"), countEl = $(".dh-count"), demoEl = $(".dh-demo"), live = $(".dh-live");
  const keysEl = $(".dh-keys"), menu = $(".dh-menu"), tracksEl = $(".dh-tracks"), pauseC = $(".dh-pausec"), result = $(".dh-result"), headEl = $(".dh-head");
  const muteK = $<HTMLButtonElement>(".dh-k-mute"), viewK = $<HTMLButtonElement>(".dh-k-view");
  for (let c = 0; c < MAX_CARS; c++) board.insertAdjacentHTML("beforeend", `<li><b></b><i></i><span></span><em></em></li>`);
  const rows = [...board.children] as HTMLElement[];

  const snd = sound(engine, { cues: { count: "click", go: "ready", gate: "click", lap: "power", clean: "power", sketchy: "click", crash: "boom", respawn: "ready", boost: "power", bump: "hit", win: "win", lose: "end" }, volume: 0.1, on: o.sound !== false });
  const paintMute = () => (muteK.textContent = snd.on ? "♪" : "×", muteK.setAttribute("aria-pressed", "" + snd.on));
  paintMute();
  const c = controls(engine, { keys: { left: [], right: [], gas: [], brake: [], nitro: [], drift: [] }, target: play });
  const GAS = c.id("gas"), BRAKE = c.id("brake"), NITRO = c.id("nitro"), DRIFT = c.id("drift");
  // Touch: two layouts for the left thumb, picked on the pause card and remembered on the device:
  // "steer", a left/right pad (steer only), or "stick", the analog stick. GAS, BRAKE, DRIFT and BOOST
  // sit under the right thumb either way.
  const padKind = () => (store.get("pad") === "stick" ? "stick" : "buttons");
  const thePad = pad(engine, c, {
    scheme: padKind(),
    move: ["", "", "left", "right"],
    actions: [
      { intent: "gas", label: "GAS", name: "Gas (up arrow)", key: "↑", role: "go", hold: true },
      { intent: "brake", label: "BRAKE", name: "Brake (down arrow)", key: "↓", role: "attack", hold: true },
      { intent: "drift", label: "DRIFT", name: "Drift, the handbrake (shift)", key: "⇧", role: "fallin", hold: true },
      { intent: "nitro", label: "BOOST", name: "Nitro boost (space)", key: "␣", role: "sys", hold: true },
    ],
    host: stage,
  });
  thePad.el.classList.add("dh-pad");
  const padK = () => hud.querySelector(".dh-padk") as HTMLButtonElement;
  function paintPad() {
    const stick = thePad.scheme === "stick";
    stage.toggleAttribute("data-stick", stick);
    const k = padK();
    if (k) (k.textContent = stick ? "STICK" : "◀ ▶ PAD"), k.setAttribute("aria-label", `Touch steering: ${stick ? "the stick" : "the left and right pad"} (tap to switch)`);
  }
  function swapPad() {
    thePad.setScheme(thePad.scheme === "stick" ? "buttons" : "stick");
    store.set("pad", thePad.scheme === "stick" ? "stick" : "steer");
    c.press("left", false), c.press("right", false);
    paintPad();
  }

  // ---- the race and the diorama ----
  let def = trackById(o.track ?? TRACKS[0]!.id), race: Race = createRace(def, o.seed ?? 1);
  let P: Pal = pal();
  function pal(): Pal {
    return def.city ? CITY : pageTheme() === "light" ? LIGHT : DARK;
  }
  const dio = diorama(canvas, { light: P.light, ambient: P.amb, background: () => P.table, overlay: drawOverlay, get shadowColor() { return P.shadow; }, maxFaces: 12000 });
  let tv: TerrainView, dust: DioramaPoints, spark: DioramaPoints;
  const cars: DioramaObject[] = [], hubs: DioramaObject[][] = [], tails: DioramaObject[][] = [], gates: DioramaObject[][] = [];
  const DV = new Float64Array(DUST * 5), SV = new Float64Array(SPARK * 5);
  // Trails: per car, the last TRAIL positions of each tail light (a ring), its head and length.
  const TR = new Float64Array(MAX_CARS * TRAIL * 6), TRN = new Int32Array(MAX_CARS * 2);
  let EDGES: Float64Array[] = [], LINES: Float32Array[] = [], MAP: Float64Array[] = [];
  const rnd = seeded(20261109);
  const STARS = new Float32Array(120);
  for (let i = 0; i < 120; i++) STARS[i] = rnd();
  let sky: CanvasGradient | null = null;
  const MB = new Float64Array(6); // minimap: x0, z0, scale, w, h, placed

  function trackEdges(p: Path) {
    const E = new Float64Array(p.n * 6), half = TRACK_W / 2, t = race.t;
    for (let i = 0; i < p.n; i++)
      for (let k = 0; k < 2; k++) {
        const s = k ? 1 : -1, x = p.P[i * 2]! - p.T[i * 2 + 1]! * half * s, z = p.P[i * 2 + 1]! + p.T[i * 2]! * half * s;
        E[k * p.n * 3 + i * 3] = x; E[k * p.n * 3 + i * 3 + 1] = t.height(x, z) + 0.04; E[k * p.n * 3 + i * 3 + 2] = z;
      }
    return E;
  }
  /** Contour lines of the dunes at `levels` (marching squares), off the track: [x0, y, z0, x1, y, z1, …] per level. */
  function contours(levels: ArrayLike<number>) {
    const t = race.t, out: Float32Array[] = [], W1 = t.cols + 1, cs = t.cell, tr = race.tr;
    const cx = [0, 1, 1, 0], cz = [0, 0, 1, 1], h = [0, 0, 0, 0], Pp: number[] = [];
    for (let l = 0; l < levels.length; l++) {
      const Lv = levels[l]!, seg: number[] = [];
      for (let j = 0; j < t.rows; j++)
        for (let i = 0; i < t.cols; i++) {
          h[0] = t.h[j * W1 + i]!; h[1] = t.h[j * W1 + i + 1]!; h[2] = t.h[(j + 1) * W1 + i + 1]!; h[3] = t.h[(j + 1) * W1 + i]!;
          Pp.length = 0;
          for (let e = 0; e < 4; e++) {
            const a = h[e]! - Lv, b = h[(e + 1) & 3]! - Lv;
            if (a < 0 !== b < 0) {
              const u = a / (a - b), n = (e + 1) & 3;
              Pp.push(t.x0 + (i + cx[e]! + (cx[n]! - cx[e]!) * u) * cs, t.z0 + (j + cz[e]! + (cz[n]! - cz[e]!) * u) * cs);
            }
          }
          for (let k = 0; k + 3 < Pp.length; k += 4) {
            const mx = (Pp[k]! + Pp[k + 2]!) / 2, mz = (Pp[k + 1]! + Pp[k + 3]!) / 2;
            if (tr.near(mx, mz)[0]! < TRACK_W / 2 + 0.6) continue;
            seg.push(Pp[k]!, Lv + 0.04, Pp[k + 1]!, Pp[k + 2]!, Lv + 0.04, Pp[k + 3]!);
          }
        }
      out.push(Float32Array.from(seg));
    }
    return out;
  }

  function buildScene() {
    const t = race.t, tr = race.tr, HX = tr.HX, HZ = tr.HZ;
    dio.clear();
    cars.length = hubs.length = tails.length = gates.length = 0;
    dio.setLight(P.light, P.amb);
    dio.cluster("sky", { fixed: -10 });
    dio.cluster("table", { fixed: -5 });
    dio.decal("sky", 0, paintSky);
    const city = P.city, extra = city ? 9 : 0;
    dio.add({ id: "table", size: [HX * 2 + 7 + extra * 2, 0.5, HZ * 2 + 6 + extra * 2], pos: [0, -1.55, 0.6 - (city ? extra * 0.6 : 0)], color: P.table, cluster: "table", layer: 0, pick: false });
    dio.add({ id: "plinth", size: [HX * 2 + 0.5, 1.05, HZ * 2 + 0.5], pos: [0, -1.05, 0], color: P.plinth, cluster: "table", layer: 1, pick: false });
    dio.add({ id: "rim", size: [HX * 2 + 0.7, 0.12, HZ * 2 + 0.7], pos: [0, -0.2, 0], color: P.rim, cluster: "table", layer: 2, emissive: true, pick: false });
    tv = terrainView(dio, t, {
      bands: [[0.55, P.sand[0]!], [1.15, P.sand[1]!], [1.85, P.sand[2]!], [99, P.crest]], steep: 0.42, steepColor: P.steep, kinds: [P.track],
      light: P.light, ambient: P.amb, lod: [18, 36], shadows: MAX_CARS, shadowColor: P.shadow,
    });
    dio.decal("terrain", 1, paintLines);
    // The city: towers behind the far edge and down the left, their windows lit in neon bands.
    if (city) {
      const r = seeded(def.seed);
      const tower = (x: number, z: number, w: number, d: number, h: number, k: number) => {
        const id = "tw" + k;
        dio.add({ id, size: [w, h, d], pos: [x, -1.3, z], color: P.tower, pick: false });
        const bands = 2 + ((r() * 3) | 0), col = [P.win, P.win2, P.win3][k % 3]!;
        // Lit bands round it (side faces only: no lid to paint over the roof).
        for (let b = 0; b < bands; b++) dio.add({ size: [w + 0.04, 0.12, d + 0.04], pos: [0, -h + h * (0.25 + (b * 0.6) / bands), 0], on: id, color: col, emissive: true, mask: 60, pick: false });
        if (r() < 0.45) dio.add({ size: [w * 0.7, 0.5, 0.12], pos: [0, 0, d / 2 - 0.1], on: id, color: k % 2 ? P.win2 : P.win, emissive: true, pick: false });
      };
      let k = 0;
      for (let x = -HX - 6; x < HX + 6; x += 2.6 + r() * 2.4) tower(x, -HZ - 4 - r() * 6, 1.6 + r() * 1.6, 1.6 + r() * 1.4, 3 + r() * 9, k++);
      for (let z = -HZ + 2; z < HZ; z += 3 + r() * 2.5) tower(-HX - 4 - r() * 4, z, 1.4 + r() * 1.2, 1.6 + r() * 1.4, 2 + r() * 5, k++);
    }
    // Rocks off the track and neon pylons along it.
    const r = seeded(7);
    for (let k = 0, n = 0; k < 400 && n < (def.cols * def.rows) / 280; k++) {
      const x = (r() * 2 - 1) * (HX - 1.2), z = (r() * 2 - 1) * (HZ - 1.2);
      if (tr.near(x, z)[0]! < Infinity) continue;
      const s = 0.35 + r() * 0.5;
      dio.add({ shape: "cyl", sides: 5 + (n % 3), top: 0.45, size: [s * 1.6, s, s * 1.3], pos: [x, t.height(x, z) - 0.05, z], rot: [0, r() * TAU, 0], color: P.rock, pick: false });
      n++;
    }
    const main = tr.main;
    for (let i = 3; i < main.n; i += 9) {
      const side = (i / 9) & 1 ? 1 : -1, x = main.P[i * 2]! - main.T[i * 2 + 1]! * (TRACK_W / 2 + 0.75) * side, z = main.P[i * 2 + 1]! + main.T[i * 2]! * (TRACK_W / 2 + 0.75) * side;
      if (tr.near(x, z)[0]! < TRACK_W / 2 + 0.3) continue;
      const id = "py" + i;
      dio.add({ id, shape: "group", size: [0.3, 0, 0.3], pos: [x, t.height(x, z), z], pick: false });
      dio.add({ shape: "cyl", sides: 6, size: [0.16, city ? 1.5 : 0.9, 0.16], on: id, color: P.pylon, pick: false });
      dio.add({ shape: "cyl", sides: 6, size: [0.22, 0.16, 0.22], pos: [0, city ? 1.5 : 0.9, 0], on: id, color: side > 0 ? P.tip : P.tip2, emissive: true, pick: false });
    }
    // The gates: two posts and a bar across the track; gate 0 is the chequered start and finish.
    for (let g = 0; g < tr.GATE.length; g++) {
      const i = tr.GATE[g]!, x = main.P[i * 2]!, z = main.P[i * 2 + 1]!, id = "gate" + g, w = TRACK_W + 1.1, yaw = Math.atan2(-main.T[i * 2 + 1]!, main.T[i * 2]!);
      dio.add({ id, shape: "group", size: [0.6, 0, w], pos: [x, t.height(x, z), z], rot: [0, yaw, 0], pick: false });
      const a = dio.add({ shape: "cyl", sides: 8, size: [0.24, 2.5, 0.24], pos: [0, 0, -w / 2], on: id, color: P.gIdle, emissive: true, pick: false });
      const b = dio.add({ shape: "cyl", sides: 8, size: [0.24, 2.5, 0.24], pos: [0, 0, w / 2], on: id, color: P.gIdle, emissive: true, pick: false });
      const bar = dio.add({ size: [0.3, 0.32, w + 0.24], pos: [0, 2.5, 0], on: id, color: P.gIdle, emissive: true, pick: false });
      for (const zz of [-w / 2, w / 2]) dio.add({ shape: "cyl", sides: 8, size: [0.5, 0.14, 0.5], pos: [0, -0.02, zz], on: id, color: P.gPost, pick: false });
      gates.push([a, b, bar]);
      if (!g) for (let k = 0; k < 8; k++) dio.add({ size: [0.32, 0.16, w / 8], pos: [0, 2.5 + (k & 1 ? 0 : 0.16), -w / 2 + (k + 0.5) * (w / 8)], on: id, color: k & 1 ? P.ink : P.check, pick: false, layer: 9 });
      dio.decal(id, 20, (ctx) => glow(ctx, g));
    }
    for (let k = 0; k < race.count; k++) buildCar(k);
    dust = dio.points({ cap: DUST, color: P.dust, layer: 4 });
    spark = dio.points({ cap: SPARK, color: P.spark, layer: 6 });
    for (let k = 0; k < race.count; k++) dio.decal("car" + k, 4, (ctx) => paintTrail(ctx, k));
    EDGES = race.tr.paths.map(trackEdges);
    LINES = contours([0.95, 1.5, 2.1]);
    sky = null;
    MB[5] = 0;
    paintGates();
    pose();
  }

  /** A buggy: a low tub with side pods and a wedge nose, a splitter, a cage with a light bar, a rear
   *  wing; the driver's helmet; four knobbly wheels on dished hubs. Its colours: body and accent. */
  function buildCar(k: number) {
    const id = "car" + k, [body, acc] = P.cars[k]!;
    cars.push(dio.add({ id, shape: "group", size: [2.0, 0, 1.6], tag: { car: k } }));
    const part = (size: number[], pos: number[], color: string, op: { shape?: "box" | "wedge" | "cyl"; emissive?: boolean; sides?: number; top?: number; rot?: number[] } = {}) =>
      dio.add({ shape: op.shape || "box", size, pos, rot: op.rot, on: id, color, emissive: op.emissive, sides: op.sides, top: op.top, pick: false });
    part([1.92, 0.14, 0.86], [0, -0.26, 0], P.chassis);
    part([1.04, 0.28, 0.66], [-0.16, -0.12, 0], body!);
    // Side pods end ahead of the rear wheels and well behind the front ones; the nose and splitter
    // stay narrower than the front wheels' inner faces at full lock (no tyre ever cuts the body).
    for (const z of [-0.42, 0.42]) part([0.98, 0.22, 0.2], [-0.2, -0.12, z], body!);
    for (const z of [-0.42, 0.42]) part([0.86, 0.06, 0.22], [-0.2, 0.1, z], acc!);
    part([0.7, 0.24, 0.7], [0.76, -0.12, 0], body!, { shape: "wedge" });
    part([0.3, 0.05, 0.78], [1.04, -0.28, 0], acc!);
    // Suspension arms out to each wheel.
    for (const x of [0.8, -0.74]) for (const z of [-0.53, 0.53]) part([0.09, 0.05, x > 0 ? 0.2 : 0.26], [x, -0.27, z], P.cage);
    part([1.6, 0.04, 0.16], [0.02, 0.17, 0], acc!);
    part([0.44, 0.32, 0.6], [-0.86, -0.08, 0], P.chassis);
    for (const z of [-0.17, 0.17]) part([0.1, 0.28, 0.1], [-1.02, -0.02, z], P.hub, { shape: "cyl", sides: 6 });
    for (const z of [-0.27, 0.27]) part([0.06, 0.32, 0.06], [-0.98, 0.18, z], P.chassis);
    part([0.34, 0.05, 0.94], [-1.02, 0.5, 0], acc!);
    part([0.3, 0.3, 0.3], [-0.24, 0.16, 0], P.helmet, { shape: "cyl", sides: 8, top: 0.75 });
    part([0.06, 0.1, 0.24], [-0.09, 0.24, 0], P.visor);
    for (const x of [-0.56, 0.14]) for (const z of [-0.36, 0.36]) part([0.06, 0.6, 0.06], [x, 0.16, z], P.cage);
    for (const z of [-0.36, 0.36]) part([0.76, 0.06, 0.06], [-0.21, 0.76, z], P.cage);
    part([0.06, 0.06, 0.78], [-0.56, 0.76, 0], P.cage);
    part([0.06, 0.06, 0.78], [0.14, 0.76, 0], P.cage);
    part([0.12, 0.09, 0.62], [0.16, 0.8, 0], P.lamp, { emissive: true });
    for (const z of [-0.28, 0.28]) part([0.04, 0.07, 0.16], [1.1, -0.1, z], P.lamp, { emissive: true });
    tails[k] = [part([0.05, 0.08, 0.16], [-1.09, 0.06, -0.24], P.tail, { emissive: true }), part([0.05, 0.08, 0.16], [-1.09, 0.06, 0.24], P.tail, { emissive: true })];
    const v = race.cars[k]!, hs: DioramaObject[] = [];
    for (let i = 0; i < 4; i++) {
      const hid = id + "h" + i, side = v.wheels[i * 2 + 1]! > 0 ? 1 : -1;
      const hub = dio.add({ id: hid, shape: "group", size: [0.6, 0, 0.6], on: id });
      dio.add({ shape: "cyl", sides: 14, size: [0.74, 0.32, 0.74], pos: [0, 0, -0.16], rot: [Math.PI / 2, 0, 0], on: hid, color: P.tyre, pick: false });
      dio.add({ shape: "cyl", sides: 8, size: [0.42, 0.05, 0.42], pos: [0, 0, side > 0 ? 0.16 : -0.21], rot: [Math.PI / 2, 0, 0], on: hid, color: k ? acc! : P.hub, pick: false });
      dio.add({ size: [0.38, 0.06, 0.06], pos: [0, -0.03, side > 0 ? 0.2 : -0.21], on: hid, color: P.chassis, pick: false });
      hs.push(hub);
    }
    hubs[k] = hs;
  }

  // ---- state ----
  const I = new Float64Array(IK), tmp = new Float64Array(3), tmp2 = new Float64Array(3);
  // Pointer drive: down, start x, current x, id.
  const PD = new Float64Array(4);
  PD[3] = -1;
  // [0] measure, [1] theme, [2] safe top, [3] safe bottom, [4] drawn once, [5] narrow.
  const V = new Float64Array(6);
  V[0] = V[1] = 1;
  let mode: "menu" | "race" | "demo" = "menu", paused = false, auto = !!o.attract, view = 1, dirty = true, hudDirty = true, shake = 0, flash = -1, flashT = 0, dropT = 0, toastT = 0, countT = 0, cardAt = -1, pulse = 0, boardT = 0, emitK = 0, lastBest = 0, newBest = false, destroyed = false;
  const was = new Float64Array(12).fill(-1);
  const TABLE = { yaw: 0, pitch: 0.82, dist: 34, tx: 0, ty: 0, tz: 0.4, ox: 0, oy: 0, fov: 0.62 };
  const chaseO = { dist: 13, pitch: 0.55, lift: 1.0, ahead: 0.26, rate: 3.4, turn: 2.8, side: 0, snap: false };
  /** The view: the car its chase camera follows and whose events it calls out (a split screen adds a
   *  second view on car 1, with its own camera, chase options and HUD). */
  const VIEW = { car: 0 };
  const CTP = new Float64Array(3), VEL = new Float64Array(3), target = { pos: CTP, yaw: 0, vel: VEL };
  const ro = new ResizeObserver(() => ((V[0] = 1), engine.wake()));
  ro.observe(stage);
  const mo = new MutationObserver(() => ((V[1] = 1), engine.wake()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  engine.signal.addEventListener("abort", () => (ro.disconnect(), mo.disconnect(), (destroyed = true)), { once: true });

  function pose() {
    const t = race.t, tr = race.tr;
    for (let k = 0; k < race.count; k++) {
      const car = cars[k]!, v = race.cars[k]!, p = k * 3, tum = race.C[k * K + PH] === CRASH;
      car.pos[0] = race.pos[p]!; car.pos[1] = race.pos[p + 1]!; car.pos[2] = race.pos[p + 2]!;
      car.rot[0] = race.rot[p]!; car.rot[1] = race.rot[p + 1]!; car.rot[2] = race.rot[p + 2]!;
      if (!k && dropT > 0) car.pos[1] = car.pos[1]! + dropT * dropT * 3;
      for (let i = 0; i < 4; i++) {
        const h = hubs[k]![i]!;
        h.pos[0] = v.wheels[i * 2]!;
        h.pos[1] = tum ? -0.2 : -(v.rest - v.comp[i]!);
        h.pos[2] = v.wheels[i * 2 + 1]!;
        h.rot[1] = i < 2 && !tum ? -Math.max(-0.45, Math.min(0.45, v.steerAngle)) : 0;
        h.rot[2] = -v.spin[i]!;
      }
      const x = car.pos[0]!, z = car.pos[2]!, inside = Math.abs(x) < tr.HX && Math.abs(z) < tr.HZ, lift = inside ? car.pos[1]! - t.height(x, z) : 9;
      tv.shadow(k, x, z, 1.3, inside ? Math.max(0, 0.34 - lift * 0.1) : 0);
    }
  }
  function paintGates() {
    const next = race.C[NEXT]! % race.gates, ph = race.R[0]!;
    for (let g = 0; g < gates.length; g++) {
      const parts = gates[g]!, on = mode !== "menu" && ph !== DONE && g === next, col = flash === g ? P.check : on ? P.gNext : P.gIdle;
      for (let k = 0; k < 3; k++) (parts[k]!.color = col), (parts[k]!.emissive = P.night || on || flash === g);
    }
  }

  // ---- FX ----
  function puff(pool: DioramaPoints, VV: Float64Array, cap: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, a: number) {
    let j = pool.n < cap ? pool.n++ : -1;
    if (j < 0) {
      let lo = Infinity;
      for (let i = 0; i < cap; i++) if (VV[i * 5 + 3]! < lo) (lo = VV[i * 5 + 3]!), (j = i);
    }
    pool.x[j] = x; pool.y[j] = y; pool.z[j] = z; pool.r[j] = r; pool.a[j] = a;
    VV[j * 5] = vx; VV[j * 5 + 1] = vy; VV[j * 5 + 2] = vz; VV[j * 5 + 3] = life; VV[j * 5 + 4] = life;
  }
  function stepPool(pool: DioramaPoints, VV: Float64Array, dt: number, grav: number, grow: number, a0: number) {
    let any = false;
    for (let i = 0; i < pool.n; i++) {
      const l = VV[i * 5 + 3]!;
      if (l <= 0) continue;
      const nl = l - dt;
      VV[i * 5 + 3] = nl;
      VV[i * 5 + 1] = VV[i * 5 + 1]! - grav * dt;
      pool.x[i] = pool.x[i]! + VV[i * 5]! * dt;
      pool.y[i] = pool.y[i]! + VV[i * 5 + 1]! * dt;
      pool.z[i] = pool.z[i]! + VV[i * 5 + 2]! * dt;
      VV[i * 5] = VV[i * 5]! * (1 - 1.6 * dt);
      VV[i * 5 + 2] = VV[i * 5 + 2]! * (1 - 1.6 * dt);
      pool.r[i] = pool.r[i]! + grow * dt;
      pool.a[i] = nl > 0 ? a0 * (nl / VV[i * 5 + 4]!) : 0;
      if (nl > 0) any = true;
    }
    return any;
  }
  function burst(x: number, y: number, z: number, n: number, sp: number) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, u = 0.4 + rnd();
      puff(spark, SV, SPARK, x, y, z, Math.cos(a) * sp * u, 2 + rnd() * sp, Math.sin(a) * sp * u, 0.5 + rnd() * 0.5, 0.07, 1);
    }
  }
  function dustBurst(x: number, y: number, z: number, n: number) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU;
      puff(dust, DV, DUST, x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6, Math.cos(a) * 2.2, 0.6 + rnd(), Math.sin(a) * 2.2, 0.7 + rnd() * 0.5, 0.22, 0.6);
    }
  }
  function stepFx(dt: number) {
    let any = false;
    for (let k = 0; k < race.count; k++) {
      const v = race.cars[k]!, ph = race.C[k * K + PH]!;
      // Dust from the rear wheels by how hard they dig (fewer for the rivals, and none in reduced motion).
      if (ph !== CRASH && !reduced) {
        emitK += v.dust * (k ? 30 : 60) * dt;
        while (emitK >= 1) {
          emitK -= 1;
          const w = 2 + (rnd() < 0.5 ? 1 : 0);
          puff(dust, DV, DUST, v.wheel[w * 3]! + (rnd() - 0.5) * 0.3, v.wheel[w * 3 + 1]! - 0.2, v.wheel[w * 3 + 2]! + (rnd() - 0.5) * 0.3, -v.vel[0]! * 0.15 + (rnd() - 0.5), 0.5 + rnd() * 0.6, -v.vel[2]! * 0.15 + (rnd() - 0.5), 0.5 + rnd() * 0.4, 0.08, 0.26);
        }
      }
      // The trail: each step the lights' newest point in; it shortens to nothing when the buggy stops.
      const go = ph !== CRASH && (v.groundSpeed > 1.2 || v.air > 0), n = k * 2;
      if (go) {
        const h = (TRN[n] = (TRN[n]! + 1) % TRAIL);
        for (let s = 0; s < 2; s++) {
          const m = tails[k]![s]!.M, q = (k * TRAIL + h) * 6 + s * 3;
          TR[q] = m[9]! - m[0]! * 0.03; TR[q + 1] = m[10]! + 0.03; TR[q + 2] = m[11]! - m[6]! * 0.03;
        }
        TRN[n + 1] = Math.min(TRAIL, TRN[n + 1]! + 1);
      } else if (TRN[n + 1]! > 0) TRN[n + 1] = TRN[n + 1]! - 1;
      if (TRN[n + 1]! > 0) any = true;
    }
    if (stepPool(dust, DV, dt, -0.4, 0.16, 0.24)) any = true;
    if (stepPool(spark, SV, dt, 14, -0.05, 1)) any = true;
    return any;
  }

  // ---- events from the race: stickers, sound, FX ----
  function events() {
    const C = race.C;
    for (let k = 0; k < race.n; k++) {
      const type = race.ev[k * 3]!, car = race.ev[k * 3 + 1]!, val = race.ev[k * 3 + 2]!, p = car * 3, you = car === VIEW.car;
      hudDirty = true;
      if (type === E_COUNT) count("" + val), engine.events.emit("count");
      else if (type === E_GO) count("GO!"), engine.events.emit("go"), say("Go");
      else if (type === E_GATE && you) {
        engine.events.emit("gate");
        flash = val;
        flashT = 0.25;
        const m = gates[val]![2]!.M;
        burst(m[9]!, m[10]! + 0.2, m[11]!, 12, 3);
      } else if (type === E_LAP && you) {
        const lt = race.R[1]! - 0, b = C[BEST]!;
        engine.events.emit("lap");
        flash = 0;
        flashT = 0.3;
        if (auto && mode === "demo") endDemo();
        else toast(`LAP ${Math.min(race.laps, val + 1)} OF ${race.laps} · ${clock(b)}${b && b === lastLap() ? " BEST LAP" : ""}`, "go"), say(`Lap ${val + 1}`);
        void lt;
      } else if (type === E_LAND && you) {
        const S = race.sc.S, clean = val === CLEAN;
        engine.events.emit(clean ? "clean" : "sketchy");
        toast(`${S[AIR]!.toFixed(2)}s AIR · ${clean ? "CLEAN" : "SKETCHY"} +${S[PTS]}${clean && S[CB]! > 1 ? ` · COMBO ×${S[CB]}` : ""}`, clean ? "clean" : "meh");
        dustBurst(race.pos[p]!, race.pos[p + 1]! - 0.5, race.pos[p + 2]!, clean ? 8 : 14);
      } else if (type === E_CRASH) {
        burst(race.pos[p]!, race.pos[p + 1]!, race.pos[p + 2]!, you ? 26 : 12, 5);
        dustBurst(race.pos[p]!, race.pos[p + 1]! - 0.4, race.pos[p + 2]!, you ? 20 : 8);
        if (you) {
          engine.events.emit("crash");
          shake = reduced ? 0 : 0.5;
          toast(val ? "OFF THE TABLE!" : "WIPEOUT", "bad");
          say(val ? "Off the table" : "Wipeout");
        }
      } else if (type === E_RESPAWN && you) {
        engine.events.emit("respawn");
        dropT = 0.45;
        aim(true);
        toast(val ? `BACK AT GATE ${val}` : "BACK AT THE START", "go");
      } else if (type === E_BOOST && you) engine.events.emit("boost"), toast("BOOST", "boost");
      else if (type === E_WRONG && you) toast("WRONG WAY", "bad"), say("Wrong way");
      else if (type === E_DRIFT && you) engine.events.emit("clean"), toast(`DRIFT +${val}`, "drift"), say(`Drift, ${val} points`);
      else if (type === E_DRIFT_LOST && you) toast(`DRIFT LOST −${val}`, "meh");
      else if (type === E_SPIN) {
        engine.events.emit("bump");
        burst(race.pos[p]!, race.pos[p + 1]! + 0.3, race.pos[p + 2]!, you ? 14 : 8, 3);
        if (you) (shake = reduced ? 0 : 0.3), toast("SPUN OUT", "bad"), say("Spun out");
      }
      else if (type === E_BUMP) engine.events.emit("bump"), (shake = reduced ? 0 : Math.max(shake, 0.18));
      else if (type === E_DONE) {
        if (mode === "demo") continue;
        const place = race.C[PLACE]!;
        engine.events.emit(place === 1 ? "win" : "lose");
        burst(race.pos[0]!, race.pos[1]! + 1, race.pos[2]!, 30, 4);
        cardAt = engine.time + 1.2;
        engine.busy(1.4);
        say(`Finished ${ordinal(place)}`);
      }
    }
    race.clear();
  }
  const ordinal = (n: number) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
  const lastLap = () => race.C[BEST]!;
  function toast(text: string, kind: string) {
    if (mode === "demo") return;
    toastEl.textContent = text;
    toastEl.className = "dh-toast dh-" + kind;
    toastEl.hidden = false;
    toastT = 1.6;
  }
  function count(text: string) {
    if (mode === "demo") return;
    countEl.textContent = text;
    countEl.className = text === "GO!" ? "dh-count dh-go" : "dh-count";
    countEl.hidden = false;
    countT = text === "GO!" ? 0.8 : 1.1;
  }
  let said = "";
  function say(s: string) {
    if (s === said) s += " ";
    live.textContent = said = s;
  }

  // ---- the HUD ----
  function hudWrite() {
    const C = race.C, R = race.R, laps = race.laps, place = C[PLACE]!;
    if (was[0] !== place) (was[0] = place), (posEl.textContent = "" + place);
    const lap = Math.min(laps, C[LAP]! + 1);
    if (was[1] !== lap) (was[1] = lap), (lapEl.textContent = `${lap}/${laps}`);
    const tenths = Math.floor((R[0] === DONE && mode !== "demo" ? R[3]! : R[1]!) * 10);
    if (was[2] !== tenths) (was[2] = tenths), (timeEl.textContent = clock(tenths / 10));
    const b = C[BEST]!;
    if (was[3] !== b) (was[3] = b), (bestEl.textContent = b ? "BEST " + clock(b) : "");
    const sc = race.sc.S[SC]!;
    if (was[4] !== sc) (was[4] = sc), (scoreEl.textContent = sc.toLocaleString("en-US"));
    const cb = race.sc.S[CB]!;
    if (was[5] !== cb) (was[5] = cb), (comboEl.textContent = "×" + (1 + cb)), comboEl.classList.toggle("dh-hot", cb > 0);
    const n = Math.round(race.N[0]! * 40) / 40;
    if (was[6] !== n) (was[6] = n), nitroBar.style.setProperty("--n", "" + n);
    const on = race.N[1]! > 0 || C[BOOST]! > 0 ? 1 : 0;
    if (was[7] !== on) (was[7] = on), nitroEl.classList.toggle("dh-on", !!on);
    const dp = Math.round(C[DPTS]!), dOn = C[DTIME]! > 0.15 && dp > 0;
    if (was[8] !== (dOn ? dp : -1)) (was[8] = dOn ? dp : -1), (driftEl.hidden = !dOn), (driftN.textContent = "" + dp);
    const hint = mode === "race" && R[0] === COUNT ? (thePad.el.offsetParent ? "Hold GAS · steer left thumb · DRIFT into the bends · BOOST when the bar is full" : "↑ gas · ← → steer · ↓ brake · SHIFT drift · SPACE nitro · in the air ↑ lifts the nose, ↓ dips it") : "";
    if (hintEl.textContent !== hint) hintEl.textContent = hint;
    // The demo lap shows only the race (the page's copy sits over it); the menu only its card.
    const hideHead = mode === "menu" || mode === "demo";
    if (headEl.hidden !== hideHead) (headEl.hidden = hideHead), (board.hidden = hideHead);
    if (keysEl.hidden !== (mode === "demo")) keysEl.hidden = mode === "demo";
    demoEl.hidden = mode !== "demo";
    // The demo lap has no pad (and the course takes the whole stage); a takeover brings it back.
    if (stage.hasAttribute("data-demo") !== (mode === "demo")) stage.toggleAttribute("data-demo", mode === "demo"), (V[0] = 1), engine.wake();
  }
  function boardWrite() {
    for (let k = race.count; k < rows.length; k++) rows[k]!.hidden = true;
    for (let k = 0; k < race.count; k++) {
      const car = race.rank[k]!, row = rows[k]!, C = race.C, o = car * K;
      row.hidden = false;
      const key = car * 100 + Math.min(race.laps, C[o + LAP]! + 1) + (C[o + PH] === FIN ? 50 : 0);
      if (row.dataset.k === "" + key) continue;
      row.dataset.k = "" + key;
      (row.children[0] as HTMLElement).textContent = "" + (k + 1);
      (row.children[1] as HTMLElement).style.background = P.cars[car]![0]!;
      (row.children[2] as HTMLElement).textContent = race.name(car);
      (row.children[3] as HTMLElement).textContent = C[o + PH] === FIN ? "FIN" : `L${Math.min(race.laps, C[o + LAP]! + 1)}`;
      row.classList.toggle("dh-you", car === 0);
    }
  }
  function menuWrite() {
    tracksEl.innerHTML = "";
    TRACKS.forEach((d, i) => {
      const li = document.createElement("li"), b = document.createElement("button"), best = bestOf(d.id);
      b.type = "button";
      b.dataset.track = d.id;
      b.setAttribute("aria-pressed", "" + (d.id === def.id));
      if (d.id === def.id) b.setAttribute("aria-current", "true");
      b.innerHTML = `<span><b>${i + 1}. ${d.name}</b><em class="dh-tier" aria-label="Level ${d.tier} of 4">${"◆".repeat(d.tier)}${"◇".repeat(4 - d.tier)}</em></span><small>${d.blurb}</small><span><small>${d.laps} LAPS${d.branches ? " · SHORTCUT" : ""}${d.city ? " · NIGHT" : ""}</small><small>${best ? "BEST " + clock(best) : "NO TIME YET"}</small></span>`;
      b.addEventListener("click", () => selectTrack(d.id), sig);
      li.append(b);
      tracksEl.append(li);
    });
    $(".dh-menu-keys").textContent = thePad.el.offsetParent ? "Steer with the left thumb; GAS, BRAKE, DRIFT and BOOST with the right." : "↑ gas · ↓ brake · ← → steer · SHIFT drift · SPACE nitro · P pause · V view";
  }
  function showCard(which: HTMLElement | null) {
    for (const el of [menu, pauseC, result]) el.hidden = el !== which;
    hudDirty = dirty = true;
  }
  function showEnd() {
    const C = race.C, R = race.R, place = C[PLACE]!, time = R[3]!, id = def.id, prev = bestOf(id);
    newBest = place <= race.count && (!prev || time < prev) && race.fin[0]! > 0 && race.C[NEXT]! > race.gates * race.laps;
    if (newBest) store.set("best:" + id, time.toFixed(2));
    $(".dh-r-head").textContent = place === 1 ? "YOU WIN" : `FINISH · ${ordinal(place).toUpperCase()}`;
    $(".dh-r-time").textContent = clock(time) + (newBest ? " · TRACK BEST" : prev ? ` · best ${clock(prev)}` : "");
    const S = race.sc.S;
    $(".dh-r-stats").textContent = `best lap ${C[BEST]! ? clock(C[BEST]!) : "—"} · ${S[SC]!.toLocaleString("en-US")} stunt pts · best air ${S[SBEST]!.toFixed(2)}s · ${S[CLEANS]} clean · top combo ×${1 + S[TOP]!}`;
    const list = $(".dh-results");
    list.innerHTML = "";
    for (let k = 0; k < race.count; k++) {
      const car = race.order[k]! >= 0 ? race.order[k]! : race.rank[k]!, li = document.createElement("li"), ft = race.fin[car]!;
      li.innerHTML = `<b>${ordinal(k + 1)}</b><i style="background:${P.cars[car]![0]}"></i><span>${race.name(car)}</span><span>${ft ? clock(ft) : "RACING"}</span>`;
      if (!car) li.className = "dh-you";
      list.append(li);
    }
    showCard(result);
    setView(0);
    say(`Finished ${ordinal(place)} in ${clock(time)}`);
    ($(".dh-r-again") as HTMLButtonElement).focus({ preventScroll: true });
    o.onEnd?.({ track: id, place, time, bestLap: C[BEST]!, score: S[SC]!, best: newBest });
  }

  // ---- flow ----
  function loadTrack(id: string) {
    const d = trackById(id);
    if (d === def) return;
    def = d;
    race = createRace(def, o.seed ?? 1);
    P = pal();
    stage.toggleAttribute("data-day", !P.night);
    buildScene();
    V[0] = 1;
  }
  function startRace(id = def.id, seed = o.seed ?? ((Math.random() * 2147483647) | 0)) {
    loadTrack(id);
    race.reset(seed);
    V[0] = 1;
    mode = auto && o.attract ? "demo" : "race";
    paused = false;
    if (mode === "demo") race.R[2] = 0.05;
    cardAt = -1;
    dust.n = spark.n = 0;
    TRN.fill(0);
    shake = dropT = 0;
    flash = -1;
    showCard(null);
    countEl.hidden = true;
    was.fill(-1);
    for (const r of rows) r.dataset.k = "";
    setView(1);
    aim(mode === "demo" || reduced);
    hudDirty = dirty = true;
    paintGates();
    pose();
    engine.busy(2);
    engine.wake();
    if (!dropIn || mode === "race") play.focus({ preventScroll: true });
  }
  /** The menu's pick: the preview on the table changes; START races it. */
  function selectTrack(id: string) {
    loadTrack(id);
    for (const b of tracksEl.querySelectorAll<HTMLElement>("button")) {
      const on = b.dataset.track === def.id;
      b.setAttribute("aria-pressed", "" + on);
      on ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current");
    }
    say(`${def.name} selected`);
    dirty = true;
    engine.wake();
  }
  function showMenu() {
    mode = "menu";
    V[0] = 1;
    paused = false;
    menuWrite();
    showCard(menu);
    setView(0);
    engine.wake();
    (tracksEl.querySelector("[aria-current]") as HTMLElement | null)?.focus({ preventScroll: true });
  }
  function endDemo() {
    // The demo lap is over: everyone eases off and stops; tap to race.
    race.finish();
    demoEl.textContent = "TAP TO RACE";
  }
  function takeOver() {
    if (mode === "menu") return;
    if (mode === "demo") {
      auto = false;
      if (race.R[0] === DONE) return startRace(def.id);
      mode = "race";
      toast("YOU HAVE IT", "go");
      hudDirty = true;
    }
  }
  function setPaused(on: boolean) {
    if (mode === "menu" || (on && race.R[0] === DONE) || paused === on) return;
    paused = on;
    if (on) ($(".dh-p-sub") as HTMLElement).textContent = `${def.name} · lap ${Math.min(race.laps, race.C[LAP]! + 1)} of ${race.laps} · ${clock(race.R[1]!)}`;
    showCard(on ? pauseC : null);
    PD[0] = 0;
    c.press("gas", false), c.press("brake", false), c.press("left", false), c.press("right", false), c.press("nitro", false), c.press("drift", false);
    if (on) ($(".dh-resume") as HTMLButtonElement).focus({ preventScroll: true });
    else play.focus({ preventScroll: true });
    engine.wake();
  }

  // ---- the camera: chase (behind your buggy) or the whole table ----
  function frameTable() {
    const tr = race.tr, HX = tr.HX, HZ = tr.HZ, top = P.city ? 8 : 2.6;
    const pts = [-HX - 0.4, -1.1, -HZ - 0.4, HX + 0.4, -1.1, -HZ - 0.4, -HX - 0.4, -1.1, HZ + 0.4, HX + 0.4, -1.1, HZ + 0.4, -HX, top, -HZ, HX, top, -HZ];
    const W = dio.width, H = dio.height, tall = H / W > 0.75;
    TABLE.yaw = tall ? -0.5 : 0;
    TABLE.pitch = tall ? 0.95 : 0.82;
    TABLE.dist = 30;
    TABLE.tx = TABLE.ty = TABLE.ox = TABLE.oy = 0;
    TABLE.tz = 0.4;
    // On a wide stage the track menu sits on the left: the preview takes the right.
    const left = mode === "menu" && W > 900 ? Math.min(W * 0.46, 600) : 8;
    dio.fit(TABLE, pts, { x0: left, y0: V[2]!, x1: W - 8, y1: H - V[3]! });
    chaseO.dist = tall ? 17.5 : 14;
    chaseO.pitch = tall ? 0.7 : 0.55;
  }
  /** The chase target: your buggy (clamped to the table's edge when it goes over). */
  function aim(snap: boolean) {
    const tr = race.tr, c = VIEW.car, v = race.cars[c]!, p = c * 3;
    target.yaw = race.C[c * K + PH] === CRASH ? target.yaw : v.yaw;
    CTP[0] = Math.max(-tr.HX - 1, Math.min(tr.HX + 1, race.pos[p]!));
    CTP[1] = Math.max(-1, race.pos[p + 1]!);
    CTP[2] = Math.max(-tr.HZ - 1, Math.min(tr.HZ + 1, race.pos[p + 2]!));
    VEL[0] = v.vel[0]!; VEL[2] = v.vel[2]!;
    if (snap) chaseO.snap = true, chase(dio.cam, target, chaseO, 1 / 60), (chaseO.snap = false);
  }
  function stepCam(dt: number) {
    const cam = dio.cam;
    if (view) {
      aim(false);
      // The demo drifts the camera round a little (the attract lap's showreel).
      chaseO.side = mode === "demo" && !reduced ? 0.42 * Math.sin(engine.time * 0.21) : 0;
      chaseO.snap = reduced;
      // On a wide hero the demo sits right of centre, clear of the page's copy on the left.
      const m = chase(cam, target, chaseO, dt), k = 1 - Math.exp(-4 * dt), ox = mode === "demo" && dio.width > 760 ? dio.width * 0.2 : 0;
      cam.ox += (ox - cam.ox) * k;
      cam.oy -= cam.oy * k;
      return m || Math.abs(cam.ox - ox) + Math.abs(cam.oy) > 0.2;
    }
    const k = reduced ? 1 : 1 - Math.exp(-2.6 * dt);
    let moving = false;
    for (const key of CAMK) {
      let d = TABLE[key] - cam[key];
      if (key === "yaw") d -= TAU * Math.floor(d / TAU + 0.5);
      if (Math.abs(d) > 1e-3) (cam[key] += d * k), (moving = true);
      else cam[key] = TABLE[key];
    }
    return moving;
  }
  const CAMK = ["yaw", "pitch", "dist", "tx", "ty", "tz", "ox", "oy", "fov"] as const;
  function setView(n: number) {
    view = n;
    viewK.textContent = n ? "CHASE" : "TABLE";
    dirty = true;
    engine.busy(2.5);
    engine.wake();
  }

  // ---- drawing extras: the sky, contour lines and track edges, trails, gate glows, the overlay ----
  function paintSky(ctx: CanvasRenderingContext2D) {
    const W = dio.width, H = dio.height;
    if (!sky) {
      sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, P.sky0);
      sky.addColorStop(0.55, P.sky1);
      sky.addColorStop(1, P.sky2);
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (P.night) {
      ctx.fillStyle = P.star;
      for (let i = 0; i < 120; i += 3) {
        ctx.globalAlpha = 0.25 + STARS[i + 2]! * 0.6;
        ctx.fillRect(STARS[i]! * W, STARS[i + 1]! * H * 0.6, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    }
    const r = Math.min(W, H) * (P.city ? 0.09 : 0.16), x = W * (P.city ? 0.82 : 0.74), y = H * (P.city ? 0.16 : 0.3);
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, P.sun0);
    g.addColorStop(1, P.sun1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (P.city) return;
    ctx.save();
    ctx.clip();
    ctx.fillStyle = P.sky1;
    for (let k = 0; k < 5; k++) ctx.fillRect(x - r, y + r * (0.1 + k * 0.19), r * 2, r * (0.03 + k * 0.025));
    ctx.restore();
  }
  function seg(ctx: CanvasRenderingContext2D, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    if (!dio.project(ax, ay, az, tmp) || tmp[2]! < 0.5 || !dio.project(bx, by, bz, tmp2) || tmp2[2]! < 0.5) return false;
    ctx.moveTo(tmp[0]!, tmp[1]!);
    ctx.lineTo(tmp2[0]!, tmp2[1]!);
    return true;
  }
  /** Contour lines (one path per level), the jump lips, the pads' chevrons, then the track's edges
   *  (each run of segments one stroke, wider near the camera). */
  function paintLines(ctx: CanvasRenderingContext2D) {
    ctx.lineCap = "round";
    ctx.lineWidth = P.night ? 1.3 : 1;
    for (let l = 0; l < LINES.length; l++) {
      const S = LINES[l]!;
      ctx.beginPath();
      for (let k = 0; k < S.length; k += 6) seg(ctx, S[k]!, S[k + 1]!, S[k + 2]!, S[k + 3]!, S[k + 4]!, S[k + 5]!);
      ctx.strokeStyle = P.lines[l]!;
      ctx.globalAlpha = P.lineA[l]!;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tr = race.tr, t = race.t, f = dio.focal(), half = TRACK_W / 2 - 0.15;
    // Jump lips: a bright bar across the top of each kicker.
    ctx.strokeStyle = P.lip;
    for (let k = 0; k < tr.ramps.length; k += 4) {
      const p = tr.paths[tr.ramps[k]!]!, i = ((tr.ramps[k + 2]! % p.n) + p.n) % p.n, x = p.P[i * 2]!, z = p.P[i * 2 + 1]!, nx = -p.T[i * 2 + 1]! * half, nz = p.T[i * 2]! * half;
      ctx.beginPath();
      if (!seg(ctx, x - nx, t.height(x - nx, z - nz) + 0.06, z - nz, x + nx, t.height(x + nx, z + nz) + 0.06, z + nz)) continue;
      ctx.lineWidth = Math.max(2, (f * 0.16) / tmp[2]!);
      ctx.stroke();
    }
    // Boost pads: a lit plate on the track, three chevrons pointing along the line.
    ctx.lineJoin = "round";
    for (let k = 0; k < tr.PADS.length; k += 2) {
      const p = tr.paths[tr.PADS[k]!]!, i = tr.PADS[k + 1]!, x = p.P[i * 2]!, z = p.P[i * 2 + 1]!, tx = p.T[i * 2]!, tz = p.T[i * 2 + 1]!, y = t.height(x, z) + 0.05;
      if (!dio.project(x, y, z, tmp) || tmp[2]! < 0.5) continue;
      const L = tr.PAD_LEN / 2, Wd = tr.PAD_W;
      ctx.fillStyle = P.pad;
      ctx.strokeStyle = P.chev;
      ctx.lineWidth = Math.max(1.5, (f * 0.06) / tmp[2]!);
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const a = q === 0 || q === 3 ? -L : L, w = q < 2 ? -Wd : Wd, px = x + tx * a - tz * w, pz = z + tz * a + tx * w;
        dio.project(px, t.height(px, pz) + 0.05, pz, tmp2);
        q ? ctx.lineTo(tmp2[0]!, tmp2[1]!) : ctx.moveTo(tmp2[0]!, tmp2[1]!);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = Math.max(2, (f * 0.16) / tmp[2]!);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(pulse * 8);
      ctx.beginPath();
      const cw = Wd * 0.62;
      for (let s = -1; s <= 1; s++) {
        const cx = x + tx * s * 0.95, cz = z + tz * s * 0.95;
        dio.project(cx - tx * 0.5 - tz * cw, y, cz - tz * 0.5 + tx * cw, tmp);
        ctx.moveTo(tmp[0]!, tmp[1]!);
        dio.project(cx + tx * 0.5, y, cz + tz * 0.5, tmp);
        ctx.lineTo(tmp[0]!, tmp[1]!);
        dio.project(cx - tx * 0.5 + tz * cw, y, cz - tz * 0.5 - tx * cw, tmp);
        ctx.lineTo(tmp[0]!, tmp[1]!);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Two passes: a shoulder in the track's colour over the painted faces' saw-toothed edge (the road is
    // painted per triangle), then the neon line on it.
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? P.edge : P.track;
      const wk = pass ? 0.2 : 0.62;
      for (let pi = 0; pi < EDGES.length; pi++) {
        const E = EDGES[pi]!, n = E.length / 6, closed = pi === 0;
        for (let side = 0; side < 2; side++) {
          let w = -1;
          for (let i = 0; i < (closed ? n : n - 1); i++) {
            const a = side * n * 3 + i * 3, b = side * n * 3 + ((i + 1) % n) * 3;
            if (!dio.project(E[a]!, E[a + 1]!, E[a + 2]!, tmp) || tmp[2]! < 0.5 || !dio.project(E[b]!, E[b + 1]!, E[b + 2]!, tmp2) || tmp2[2]! < 0.5) {
              if (w > 0) ctx.stroke(), (w = -1);
              continue;
            }
            // Skip the stretch of a branch's edge inside the loop's track (at the joins).
            if (pi && race.t.kindAt((E[a]! + E[b]!) / 2, (E[a + 2]! + E[b + 2]!) / 2) === KIND_TRACK && tr.near((E[a]! + E[b]!) / 2, (E[a + 2]! + E[b + 2]!) / 2)[1] === 0 && tr.NR[0]! < TRACK_W / 2 - 0.2) continue;
            const lw = Math.max(1, Math.round(((f * wk) / tmp[2]!) * 2) / 2);
            if (lw !== w) {
              if (w > 0) ctx.stroke();
              ctx.beginPath();
              ctx.lineWidth = w = lw;
              ctx.moveTo(tmp[0]!, tmp[1]!);
            }
            ctx.lineTo(tmp2[0]!, tmp2[1]!);
          }
          if (w > 0) ctx.stroke();
        }
      }
    }
  }
  /** A car's tail-light trail: two lines, fading toward the tail end. */
  function paintTrail(ctx: CanvasRenderingContext2D, k: number) {
    const n = TRN[k * 2 + 1]!;
    if (n < 2) return;
    ctx.strokeStyle = k ? P.cars[k]![0]! : P.tail;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    if (P.night) ctx.globalCompositeOperation = "lighter";
    const f = dio.focal(), Cn = 4;
    for (let s = 0; s < 2; s++)
      for (let cI = 0; cI < Cn; cI++) {
        const s0 = Math.floor(((n - 1) * cI) / Cn), s1 = Math.floor(((n - 1) * (cI + 1)) / Cn);
        let started = false, w = 0;
        ctx.beginPath();
        for (let q = s0; q <= s1; q++) {
          const a = (k * TRAIL + ((TRN[k * 2]! - q + TRAIL) % TRAIL)) * 6 + s * 3;
          if (!dio.project(TR[a]!, TR[a + 1]!, TR[a + 2]!, tmp) || tmp[2]! < 0.5) continue;
          if (!started) (w = Math.max(1, (f * 0.09) / tmp[2]!)), ctx.moveTo(tmp[0]!, tmp[1]!), (started = true);
          else ctx.lineTo(tmp[0]!, tmp[1]!);
        }
        ctx.globalAlpha = (k ? 0.6 : 0.95) * (1 - cI / Cn);
        ctx.lineWidth = w * (1 - (cI / Cn) * 0.6);
        ctx.stroke();
      }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  function glow(ctx: CanvasRenderingContext2D, g: number) {
    if (!P.night) return;
    const on = mode !== "menu" && race.R[0] !== DONE && g === race.C[NEXT]! % race.gates;
    if (!on && flash !== g) return;
    const m = gates[g]![2]!.M, w = (TRACK_W + 1.1) / 2;
    const ax = m[9]! - m[2]! * w, az = m[11]! - m[8]! * w, bx = m[9]! + m[2]! * w, bz = m[11]! + m[8]! * w, y0 = m[10]! - 2.5, y1 = m[10]! + 0.16;
    if (!dio.project(ax, y0, az, tmp) || !dio.project(bx, y0, bz, tmp2)) return;
    ctx.beginPath();
    ctx.moveTo(tmp[0]!, tmp[1]!);
    dio.project(ax, y1, az, tmp);
    ctx.lineTo(tmp[0]!, tmp[1]!);
    dio.project(bx, y1, bz, tmp);
    ctx.lineTo(tmp[0]!, tmp[1]!);
    ctx.lineTo(tmp2[0]!, tmp2[1]!);
    const k = dio.focal() / Math.max(1, tmp2[2]!), a = on ? 0.5 + 0.25 * Math.sin(pulse * 6) : 0.8;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = flash === g ? P.check : P.gNext;
    ctx.lineJoin = "round";
    ctx.globalAlpha = a * 0.22;
    ctx.lineWidth = k * 0.55;
    ctx.stroke();
    ctx.globalAlpha = a * 0.35;
    ctx.lineWidth = k * 0.26;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  /** A Board UI sticker on the canvas: rounded plate, ink rim, hard shadow, a point under it. */
  function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, fill: string, ink: string, s: number) {
    ctx.font = `900 ${Math.round(12 * s)}px ui-rounded, system-ui, sans-serif`;
    const w = Math.max(24 * s, ctx.measureText(label).width + 14 * s), h = 21 * s;
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 + 3 * s, y - h + 3 * s, w, h, 6 * s);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, 6 * s);
    ctx.moveTo(x - 5 * s, y);
    ctx.lineTo(x, y + 6 * s);
    ctx.lineTo(x + 5 * s, y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y - h / 2 + 0.5);
  }
  function drawOverlay(ctx: CanvasRenderingContext2D) {
    if (mode === "menu") return;
    const R = race.R, tr = race.tr, f = dio.focal();
    // Rival tags over their buggies (chase view, near enough to read).
    if (view)
      for (let k = 1; k < race.count; k++) {
        const p = k * 3;
        if (!dio.project(race.pos[p]!, race.pos[p + 1]! + 1.3, race.pos[p + 2]!, tmp) || tmp[2]! < 2 || tmp[2]! > 34) continue;
        sticker(ctx, tmp[0]!, tmp[1]!, race.name(k), P.cars[k]![0]!, P.ink, Math.max(0.6, Math.min(1, f / tmp[2]! / 26)));
      }
    // The shortcut's sign where a branch leaves the loop.
    for (let b = 1; b < tr.paths.length; b++) {
      const p = tr.paths[b]!, i = Math.min(p.n - 1, 4), x = p.P[i * 2]!, z = p.P[i * 2 + 1]!;
      if (!dio.project(x, race.t.height(x, z) + 1.6, z, tmp) || tmp[2]! < 1 || tmp[2]! > 40) continue;
      sticker(ctx, tmp[0]!, tmp[1]!, p.label, P.lip, P.ink, Math.max(0.7, Math.min(1.1, f / tmp[2]! / 26)));
    }
    if (R[0] !== DONE) {
      const g = race.C[NEXT]! % race.gates, m = gates[g]![2]!.M;
      if (dio.project(m[9]!, m[10]! + 1.05, m[11]!, tmp) && tmp[1]! > V[2]! - 4) {
        const last = race.C[NEXT]! >= race.gates * race.laps;
        sticker(ctx, tmp[0]!, tmp[1]!, g ? "" + g : last ? "FINISH" : "LAP", P.gNext, P.night ? P.ink : "#ffffff", Math.max(0.7, Math.min(1.25, f / Math.max(1, tmp[2]!) / 30)));
      }
    }
    if (mode !== "demo") minimap(ctx);
  }
  /** The minimap: the loop and its branches, the gates to come, every buggy (yours ringed). */
  function minimap(ctx: CanvasRenderingContext2D) {
    const tr = race.tr, W = dio.width, H = dio.height, narrow = W < 560;
    if (!MB[5]) {
      const bw = narrow ? 104 : 172, s = bw / (tr.HX * 2), bh = tr.HZ * 2 * s;
      MB[0] = W - bw - (narrow ? 10 : 14); MB[1] = H - bh - (narrow ? 10 : 14); MB[2] = s; MB[3] = bw; MB[4] = bh; MB[5] = 1;
      MAP = tr.paths.map((p) => {
        const out = new Float64Array(p.n * 2);
        for (let i = 0; i < p.n; i++) (out[i * 2] = MB[0]! + (p.P[i * 2]! + tr.HX) * s), (out[i * 2 + 1] = MB[1]! + (p.P[i * 2 + 1]! + tr.HZ) * s);
        return out;
      });
    }
    const x0 = MB[0]!, y0 = MB[1]!, s = MB[2]!, bw = MB[3]!, bh = MB[4]!;
    ctx.fillStyle = P.ink;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.roundRect(x0 - 6, y0 - 6, bw + 12, bh + 12, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineJoin = ctx.lineCap = "round";
    for (let pi = 0; pi < MAP.length; pi++) {
      const M = MAP[pi]!, n = M.length / 2;
      ctx.beginPath();
      ctx.moveTo(M[0]!, M[1]!);
      for (let i = 1; i < n; i++) ctx.lineTo(M[i * 2]!, M[i * 2 + 1]!);
      if (!pi) ctx.closePath();
      ctx.strokeStyle = pi ? P.lip : P.edge;
      ctx.lineWidth = pi ? 2 : 3;
      ctx.setLineDash(pi ? [4, 3] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const g = race.C[NEXT]! % race.gates, gi = tr.GATE[g]!, M0 = MAP[0]!;
    ctx.fillStyle = P.gNext;
    ctx.beginPath();
    ctx.arc(M0[gi * 2]!, M0[gi * 2 + 1]!, 4, 0, TAU);
    ctx.fill();
    for (let k = race.count - 1; k >= 0; k--) {
      const x = x0 + (race.pos[k * 3]! + tr.HX) * s, y = y0 + (race.pos[k * 3 + 2]! + tr.HZ) * s;
      ctx.fillStyle = P.cars[k]![0]!;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, k ? 4 : 5.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ---- the loop ----
  // Adaptive resolution: a slow device (long frames while racing) draws fewer pixels, down to half;
  // a fast one climbs back. FT = [last frame time, smoothed frame ms, resolution, seconds since a change].
  const FT = new Float64Array(4);
  FT[2] = 1;
  function adapt(now: number) {
    const gap = FT[0] ? now - FT[0] : 0;
    FT[0] = now;
    if (!gap || gap > 400 || mode === "menu" || paused) return;
    FT[1] = FT[1] ? FT[1] * 0.9 + gap * 0.1 : gap;
    FT[3] = FT[3]! + gap / 1000;
    if (FT[3]! < 1.2) return;
    const was = FT[2]!;
    if (FT[1]! > 40 && was > 0.5) FT[2] = Math.max(0.5, was * 0.8);
    else if (FT[1]! < 20 && was < 1 && FT[3]! > 4) FT[2] = Math.min(1, was * 1.12);
    if (FT[2] !== was) (FT[3] = 0), (V[0] = 1);
  }

  engine.add({
    read() {
      adapt(performance.now());
      if (V[1]) {
        V[1] = 0;
        root.dataset.theme = pageTheme();
        const next = pal();
        if (next !== P) (P = next), stage.toggleAttribute("data-day", !P.night), buildScene(), (dirty = true);
      }
      if (V[0]) {
        V[0] = 0;
        const sr = stage.getBoundingClientRect(), hr = headEl.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
        dio.resize(cr.width || 1, cr.height || 1, Math.min(2, devicePixelRatio || 1) * FT[2]!);
        V[2] = Math.max(8, (hr.height ? hr.bottom : sr.top) - sr.top + 8);
        V[3] = 10;
        sky = null;
        MB[5] = 0;
        frameTable();
        if (!view) Object.assign(dio.cam, TABLE);
        else aim(true);
        hudDirty = dirty = true;
      }
    },
    step(e, dt) {
      if (cardAt >= 0 && e.time >= cardAt) (cardAt = -1), showEnd();
      let moving = false;
      if (!paused && mode !== "menu") {
        // Inputs: keys and pad (controls), the pointer (hold for gas, drag to steer), or the autopilot.
        I[0] = c.down(GAS) || PD[0] ? 1 : 0;
        I[1] = c.down(BRAKE) ? 1 : 0;
        I[2] = PD[0] ? Math.max(-1, Math.min(1, (PD[2]! - PD[1]!) / Math.max(40, dio.width * 0.1))) : c.axis("left", "right");
        I[3] = c.down(NITRO) ? 1 : 0;
        I[4] = c.down(DRIFT) ? 1 : 0;
        // Car 0's inputs (one person; a second view would fill car 1's from its own keys).
        for (let k = 0; k < IK; k++) race.IN[k] = I[k]!;
        race.AUTO[0] = auto ? 1 : 0;
        moving = race.step(dt);
        if (race.n) events(), (moving = true);
      }
      if (!paused && stepFx(dt)) moving = true;
      if (stepCam(dt)) moving = true;
      if (dropT > 0) (dropT = Math.max(0, dropT - dt)), (moving = true);
      if (shake > 0) (shake = Math.max(0, shake - dt)), (moving = true);
      if (flashT > 0 && (flashT -= dt) <= 0) (flash = -1), paintGates(), (moving = true);
      if (toastT > 0) (toastT = Math.max(0, toastT - dt)), (moving = true), toastT === 0 && (toastEl.hidden = true);
      if (countT > 0) (countT = Math.max(0, countT - dt)), (moving = true), countT === 0 && (countEl.hidden = true);
      if (moving) (pulse += dt), e.busy(), (dirty = hudDirty = true);
      if ((boardT += dt) > 0.25) (boardT = 0), mode !== "menu" && boardWrite();
    },
    render() {
      if (hudDirty) (hudDirty = false), hudWrite(), paintGates();
      if (!dirty) return;
      dirty = false;
      pose();
      const cam = dio.cam, k = shake * shake * 10, sx = Math.sin(engine.time * 71) * k, sy = Math.cos(engine.time * 53) * k * 0.7;
      (cam.ox += sx), (cam.oy += sy);
      dio.draw();
      (cam.ox -= sx), (cam.oy -= sy), (V[4] = 1);
    },
    pause() {
      PD[0] = 0;
    },
  });

  // ---- input ----
  const MAP_K: Record<string, string> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", Space: "nitro", ShiftLeft: "drift", ShiftRight: "drift" };
  const keyMode = o.keyboard ?? (dropIn ? "page" : "focus");
  const keyHost: EventTarget = keyMode === "page" ? window : stage;
  const mine = (e: Event) => keyMode === "focus" || !(e.target as Element)?.closest?.("input,textarea,select,[contenteditable]");
  keyHost.addEventListener("keydown", (ev) => {
    const e = ev as KeyboardEvent;
    if (e.metaKey || e.ctrlKey || e.altKey || !mine(e) || destroyed) return;
    const code = e.code;
    if (code === "Escape") {
      e.preventDefault();
      if (dropIn) return void api.destroy();
      if (paused) return setPaused(false);
      if (mode !== "menu") return setPaused(true);
      return;
    }
    if (code === "KeyP") return void (e.preventDefault(), setPaused(!paused));
    if (code === "KeyM") return void (e.preventDefault(), toggleMute());
    if (code === "KeyV" && mode !== "menu") return void (e.preventDefault(), setView(view ? 0 : 1));
    if (code === "KeyR" && mode !== "menu") return void (e.preventDefault(), startRace(def.id));
    if (code === "KeyT") return void (e.preventDefault(), showMenu());
    const k = MAP_K[code];
    if (!k || (e.target as Element).closest?.(".bui-pad")) return;
    if (mode === "menu" || paused || !result.hidden) return;
    e.preventDefault();
    if (mode === "demo") takeOver();
    if (!e.repeat) c.press(k);
    engine.wake();
  }, sig);
  keyHost.addEventListener("keyup", (ev) => {
    const k = MAP_K[(ev as KeyboardEvent).code];
    if (k) c.press(k, false);
  }, sig);
  play.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    play.focus({ preventScroll: true });
    if (mode === "menu" || paused || !result.hidden) return;
    if (mode === "demo") takeOver();
    play.setPointerCapture(e.pointerId);
    (PD[0] = 1), (PD[1] = PD[2] = e.offsetX), (PD[3] = e.pointerId);
    engine.wake();
  }, sig);
  play.addEventListener("pointermove", (e) => void (e.pointerId === PD[3] && (PD[2] = e.offsetX)), sig);
  const up = (e: PointerEvent) => void (e.pointerId === PD[3] && ((PD[0] = 0), (PD[3] = -1)));
  play.addEventListener("pointerup", up, sig);
  play.addEventListener("pointercancel", up, sig);
  thePad.el.addEventListener("pointerdown", () => (mode === "demo" && takeOver(), engine.wake()), sig);
  function toggleMute() {
    snd.on = !snd.on;
    paintMute();
  }
  muteK.addEventListener("click", toggleMute, sig);
  viewK.addEventListener("click", () => mode !== "menu" && setView(view ? 0 : 1), sig);
  $(".dh-k-tracks").addEventListener("click", showMenu, sig);
  $(".dh-k-pause").addEventListener("click", () => setPaused(!paused), sig);
  $(".dh-resume").addEventListener("click", () => setPaused(false), sig);
  $(".dh-padk").addEventListener("click", swapPad, sig);
  $(".dh-start").addEventListener("click", () => startRace(def.id), sig);
  paintPad();
  $(".dh-restart").addEventListener("click", () => startRace(def.id), sig);
  $(".dh-totracks").addEventListener("click", showMenu, sig);
  $(".dh-r-again").addEventListener("click", () => startRace(def.id), sig);
  $(".dh-r-next").addEventListener("click", () => startRace(TRACKS[(TRACKS.indexOf(def) + 1) % TRACKS.length]!.id), sig);
  $(".dh-r-tracks").addEventListener("click", showMenu, sig);
  if (dropIn) L.style(document.documentElement, "overflow", "hidden");

  stage.toggleAttribute("data-day", !P.night);
  buildScene();
  setView(0);
  if (o.attract) startRace(def.id, o.seed ?? 1);
  else showMenu();
  engine.start();

  const api = {
    engine,
    get race() {
      return race;
    },
    get track() {
      return def.id;
    },
    /** Race now (a track id, else the current one). */
    start(id?: string) {
      startRace(id ?? def.id);
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /** Take the wheel from the demo lap. */
    takeOver,
    /** The track menu. */
    menu: showMenu,
    /** End the race now (the result card follows). */
    finish(_won?: boolean) {
      if (mode === "menu") return;
      race.finish();
      if (race.n) events();
      cardAt = engine.time;
      engine.busy(0.5);
      engine.wake();
    },
    get auto() {
      return auto;
    },
    set auto(on: boolean) {
      auto = on;
      engine.wake();
    },
    /** The state for tests and harnesses. */
    getSnapshot() {
      const R = race.R, C = race.C, v = race.cars[0]!;
      const status = destroyed ? "destroyed" : mode === "menu" ? "idle" : paused ? "paused" : !result.hidden ? (C[PLACE] === 1 ? "won" : "gameover") : "running";
      return {
        status, mode, track: def.id, phase: R[0] === COUNT ? "count" : R[0] === RUN ? "race" : "done", elapsed: R[1]!, place: C[PLACE]!, lap: C[LAP]!, laps: race.laps, gate: C[NEXT]!,
        score: race.sc.S[SC]!, combo: race.sc.S[CB]!, nitro: race.N[0]!, crashed: C[PH] === CRASH, view: view ? "chase" : "table", speed: v.speed, air: v.air, lapStart: C[LAPT]!,
        player: { x: race.pos[0]! * 20, y: race.pos[2]! * 20, angle: v.yaw },
      };
    },
    /** Your buggy's screen point (CSS px from the canvas's top left), as of the last draw. */
    carScreen() {
      dio.project(race.pos[0]!, race.pos[1]!, race.pos[2]!, tmp);
      return [tmp[0]!, tmp[1]!];
    },
    stop: () => api.destroy(),
    destroy() {
      if (!destroyed) engine.destroy();
    },
  };
  return api;
}
export type DuneHop = ReturnType<typeof createDuneHop>;
