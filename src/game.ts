// Dune Hop, the scene: a race (./race.ts) or the Freestyle park (./freestyle.ts) drawn as a tabletop
// diorama. A slab of ridged dunes on a plinth: at night the crests glow in neon contour lines over
// violet sand under a striped sun; by day it is a hot sunset; Neon Edge is always night, at the city's
// edge, its towers lit. The buggies, the gates, boost pads with chevrons, the jump lips, light trails
// and dust. The camera chases your buggy (V: the whole table). Board UI stickers for the HUD and the
// cards (the menu, pause, results, the online room), mounted in a shadow root so the page and the
// game never touch each other's styles.
// Two people on one screen get a split screen (side by side on a wide stage, stacked on a tall one):
// a view each, its own diorama, camera and HUD; each half its own touch pad. Two screens play online
// (./net.ts): the sim runs in lockstep on both, only inputs travel.
// Bricks: the kernel (fixed step, settle, the ledger: every page write goes back on Recall),
// @fzlt/core/diorama, terrain, drive (and its `chase` camera), input, pad, sound, ui, presence.
// Keys: ↑/W gas, ↓/S brake (reverse when stopped), ←→/AD steer, Shift drift, Space nitro, P pause, V view,
// M mute, R restart, T menu; Escape pauses (or, dropped onto a page, gives the page back). Two on one
// screen: P1 W A S D, left Shift drift, Space (or Q) nitro; P2 the arrows, right Shift drift, Enter
// (or /) nitro. Gamepads: the first is P1, the second P2. Pointer: hold the course for gas, drag to steer.
import { createEngine, seeded } from "@fzlt/core/kernel";
import { diorama, type Diorama, type DioramaObject, type DioramaPoints } from "@fzlt/core/diorama";
import { terrainView, type TerrainView } from "@fzlt/core/terrain";
import { chase } from "@fzlt/core/drive";
import { controls, type Controls } from "@fzlt/core/input";
import { pad, type Pad } from "@fzlt/core/pad";
import { sound } from "@fzlt/core/sound";
import { mount as buiMount } from "@fzlt/core/ui";
import { presence, type Presence, type Transport } from "@fzlt/core/presence";
import { createRace, MAX_CARS, IK, K, COUNT, RUN, DONE, CRASH, FIN, PH, NEXT, PI_, IDX, LAP, PLACE, BEST, LAPT, BOOST, DPTS, DTIME, E_GO, E_GATE, E_LAP, E_LAND, E_CRASH, E_RESPAWN, E_DONE, E_BOOST, E_COUNT, E_WRONG, E_BUMP, E_DRIFT, E_DRIFT_LOST, E_SPIN, type Race } from "./race.ts";
import { createFreestyle, E_XFER, E_COMBO, TABLE as FTABLE, XFERS, XPTS, type Freestyle } from "./freestyle.ts";
import { TX, TZ, TOP as PARK_TOP } from "./park.ts";
import { TRACKS, trackById, TRACK_W, KIND_TRACK, type Path } from "./tracks.ts";
import { CLEAN, SC, CB, BEST as SBEST, CLEANS, PTS, AIR, TOP } from "./stunt.ts";
import { encode, decode, packMode, unpackMode, hashOf, joinRoom, B_AUTO, B_READY } from "./net.ts";

const TAU = 6.283185307179586;
type Sim = Race | Freestyle;

// ---- palettes by role: night (dark), a hot sunset (light), and the city at night ----
const DARK = {
  night: true, city: false, light: [-0.35, 1, 0.55], amb: 0.46,
  sky0: "#07061a", sky1: "#2a0f4a", sky2: "#6a1d6e", sun0: "#ffcf5a", sun1: "#ff2e88", star: "#cfd8ff",
  sand: ["#221c46", "#2c245a", "#382d6c"], crest: "#463680", steep: "#1a1536", track: "#16122c", pad: "#ff2e88", edge: "#22e6ff", lines: ["#5a3fb0", "#b83fd0", "#ff4fa8"], lineA: [0.55, 0.7, 0.95],
  plinth: "#16122b", rim: "#22e6ff", table: "#0d0b1c", rock: "#2c2550", pylon: "#2a2445", tip: "#22e6ff", tip2: "#ff4fa8", lip: "#ffd166", chev: "#fff1fb",
  chassis: "#1d1c28", cage: "#b9bdd8", tyre: "#111118", hub: "#8d92b4", helmet: "#ff4fa8", visor: "#0a0c16", lamp: "#fff7d6", tail: "#ff2e88",
  gNext: "#ff4fa8", gDone: "#22e6ff", gIdle: "#5a4a9c", gPost: "#2b2546", check: "#f4f1ff", ink: "#0b0a14",
  dust: "#8a78c8", spark: "#ffd166", shadow: "#000000", tower: "#120f26", win: "#22e6ff", win2: "#ff4fa8", win3: "#ffd166",
  // The park's tables: salt, concrete, the yard's plates, the gap, the ledge tops.
  salt: "#4a4486", conc: "#2f3658", yard: "#151230", gap: "#06050d", ledge: "#d6ff3e", tables: ["#22e6ff", "#ff4fa8", "#ffd166", "#d6ff3e"],
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
  salt: "#fbeedd", conc: "#b8aca4", yard: "#6a4a44", gap: "#5e2f25", ledge: "#ffd25a", tables: ["#fff1dc", "#ff3d7f", "#ffd25a", "#14d8e8"],
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
  /** The fizlet-rooms server for online play (wss://…); `?rooms=` on the page overrides it. */
  rooms?: string;
  /** Laps per race (default: the track's). */
  laps?: number;
  /** Called when a race ends. */
  onEnd?: (r: DuneHopResult) => void;
  /** Offer "2 · SPLIT" on a touch-only device too (default false: two on one phone is held back for
   *  now; keyboards, gamepads and mice keep it). */
  splitOnTouch?: boolean;
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
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const HEAD = `<b class="dh-chip dh-pos"><span>4</span><small>/4</small></b><b class="dh-chip dh-lap"><small>LAP</small><span>1/3</span></b><b class="dh-chip dh-time"><span>0:00.0</span><small></small></b><b class="dh-chip dh-score"><span>0</span><i>×1</i></b><b class="dh-chip dh-nitro"><small>NITRO</small><b><i></i></b></b><b class="dh-chip dh-drift" hidden><small>DRIFT</small><span>0</span></b>`;

/** One view of the table: a canvas and its diorama, its camera, the car it follows, its HUD. */
interface View {
  i: number;
  el: HTMLDivElement;
  canvas: HTMLCanvasElement;
  d: Diorama;
  tv: TerrainView | null;
  cars: DioramaObject[];
  hubs: DioramaObject[][];
  tails: DioramaObject[][];
  gates: DioramaObject[][];
  dust: DioramaPoints | null;
  spark: DioramaPoints | null;
  sky: CanvasGradient | null;
  /** Minimap box: x0, z0, scale, w, h, placed. */
  MB: Float64Array;
  MAP: Float64Array[];
  TABLE: { yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number; ox: number; oy: number; fov: number };
  chaseO: { dist: number; pitch: number; lift: number; ahead: number; rate: number; turn: number; side: number; snap: boolean };
  CTP: Float64Array;
  VEL: Float64Array;
  target: { pos: Float64Array; yaw: number; vel: Float64Array };
  car: number;
  head: HTMLElement;
  els: HTMLElement[];
  toastEl: HTMLElement;
  countEl: HTMLElement;
  toastT: number;
  countT: number;
  shake: number;
  /** [safe top, safe bottom]. */
  safe: Float64Array;
  was: Float64Array;
}

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
  const qs = new URLSearchParams(typeof location === "object" ? location.search : "");
  const ROOMS_URL = qs.get("rooms") ?? o.rooms ?? "", ROOM_N = 16;

  // ---- the stage: the play surface, the views (canvas + HUD each), the shared HUD, the cards ----
  const play = document.createElement("button");
  play.type = "button";
  play.className = "dh-play";
  play.setAttribute("aria-label", "Dune Hop: up or W for gas, down or S to brake, left and right to steer, Shift to drift, Space for nitro; in the air gas lifts the nose and brake dips it. P pauses, V changes the view, M mutes, R restarts, T opens the menu");
  const viewsEl = document.createElement("div");
  viewsEl.className = "dh-views";
  const hud = document.createElement("div");
  hud.className = "dh-hud";
  const segRow = (name: string, label: string, opts: [string, string][]) =>
    `<p class="dh-row dh-seg" role="group" aria-label="${label}" data-seg="${name}">${opts.map(([v, t]) => `<button type="button" class="bui-key" data-v="${v}" aria-pressed="false">${t}</button>`).join("")}</p>`;
  hud.innerHTML =
    `<ol class="dh-board" aria-label="Standings"></ol>` +
    `<p class="dh-keys"><button type="button" class="dh-key dh-k-tracks" aria-label="Menu (T)">MENU</button><button type="button" class="dh-key dh-k-view" aria-label="Camera view (V)">VIEW</button><button type="button" class="dh-key dh-k-mute" aria-label="Sound (M)" aria-pressed="true">♪</button><button type="button" class="dh-key dh-k-pause" aria-label="Pause (P)">❚❚</button></p>` +
    `<p class="dh-hint"></p><p class="dh-demo" hidden>DEMO LAP · TAP TO DRIVE</p><p class="dh-netchip" role="status" hidden><i></i><span></span></p><p class="dh-live" aria-live="polite"></p>` +
    `<div class="dh-card dh-menu" role="dialog" aria-label="Dune Hop menu" hidden><b>DUNE HOP</b>` +
    segRow("mode", "Mode", [["race", "RACE"], ["free", "FREESTYLE"]]) +
    segRow("players", "Players", [["1", "1 PLAYER"], ["2", "2 · SPLIT"], ["net", "ONLINE"]]) +
    `<p class="dh-sub dh-m-sub"></p><ul class="dh-tracks"></ul><ul class="dh-park" hidden></ul>` +
    `<p class="dh-row dh-m-rivals" hidden><small class="dh-sub">RIVALS</small><button type="button" class="bui-key dh-rivk" aria-pressed="true">3 RIVALS</button></p>` +
    `<p class="dh-row"><button type="button" class="bui-key dh-again dh-start">START</button></p><p class="dh-sub dh-menu-keys"></p></div>` +
    `<div class="dh-card dh-roomc" role="dialog" aria-label="Online" data-step="join" hidden><b>ONLINE</b><p class="dh-sub dh-room-sub">TWO SCREENS, ONE TABLE</p>` +
    `<form class="dh-room-join" data-for="join" novalidate><label class="dh-field">INVITE CODE<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="64" placeholder="DUNE-XXXX-XXXX" /></label>` +
    `<p class="dh-row dh-rooms"><small class="dh-sub">ROOM</small><button type="button" class="bui-key" data-room="-1" aria-label="Previous room">−</button><output name="roomShow" aria-live="polite">0</output><button type="button" class="bui-key" data-room="1" aria-label="Next room">+</button></p>` +
    `<p class="dh-row"><button type="submit" class="bui-key dh-again dh-join">JOIN</button><button type="button" class="bui-key dh-room-back">BACK</button></p><p class="dh-say" role="alert"></p>` +
    `<p class="dh-sub">Both of you: the same code, the same room. Whoever joins first picks the mode and the track. Only inputs travel: both screens run the same race.</p></form>` +
    `<div data-for="wait" hidden><ol class="dh-seats" aria-label="Seats"><li class="dh-me">P1 · YOU</li><li>OPEN SEAT</li></ol><p class="dh-big dh-wait-say">Waiting for player 2.</p><p class="dh-sub">Send the link: it has the code and the room, so they just press JOIN.</p><p class="dh-row"><button type="button" class="bui-key dh-share">SEND LINK</button><button type="button" class="bui-key dh-room-cancel">CANCEL</button></p></div>` +
    `<div data-for="gone" hidden><p class="dh-big dh-gone-say"></p><p class="dh-row"><button type="button" class="bui-key dh-again dh-room-again">TRY AGAIN</button><button type="button" class="bui-key dh-room-menu">MENU</button></p></div></div>` +
    `<div class="dh-card dh-pausec" role="dialog" aria-label="Paused" hidden><b>PAUSED</b><p class="dh-sub dh-p-sub"></p><p class="dh-row"><button type="button" class="bui-key dh-again dh-resume">RESUME</button><button type="button" class="bui-key dh-restart">RESTART</button><button type="button" class="bui-key dh-totracks">MENU</button></p><p class="dh-row dh-touch"><small class="dh-sub">STEERING</small><button type="button" class="bui-key dh-padk"></button></p></div>` +
    `<div class="dh-card dh-result" role="dialog" aria-label="Result" hidden><b class="dh-r-head">RESULT</b><p class="dh-big dh-r-time"></p><p class="dh-sub dh-r-stats"></p><ol class="dh-results"></ol><p class="dh-row"><button type="button" class="bui-key dh-again dh-r-again">RACE AGAIN</button><button type="button" class="bui-key dh-r-next">NEXT TRACK</button><button type="button" class="bui-key dh-r-tracks">MENU</button></p></div>`;
  stage.append(play, viewsEl, hud);
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => hud.querySelector(s) as T;
  const board = $(".dh-board"), hintEl = $(".dh-hint"), demoEl = $(".dh-demo"), live = $(".dh-live"), netChip = $(".dh-netchip");
  const keysEl = $(".dh-keys"), menu = $(".dh-menu"), tracksEl = $(".dh-tracks"), parkEl = $(".dh-park"), pauseC = $(".dh-pausec"), result = $(".dh-result"), roomC = $(".dh-roomc");
  const muteK = $<HTMLButtonElement>(".dh-k-mute"), viewK = $<HTMLButtonElement>(".dh-k-view");
  for (let c = 0; c < MAX_CARS; c++) board.insertAdjacentHTML("beforeend", `<li><b></b><i></i><span></span><em></em></li>`);
  const rows = [...board.children] as HTMLElement[];

  const snd = sound(engine, { cues: { count: "click", go: "ready", gate: "click", lap: "power", clean: "power", sketchy: "click", crash: "boom", respawn: "ready", boost: "power", bump: "hit", win: "win", lose: "end" }, volume: 0.1, on: o.sound !== false });
  const paintMute = () => (muteK.textContent = snd.on ? "♪" : "×", muteK.setAttribute("aria-pressed", "" + snd.on));
  paintMute();
  // Two controllers: P1 (every key alone; W A S D in a split) and P2 (the arrows in a split).
  const KEYS = { left: [], right: [], gas: [], brake: [], nitro: [], drift: [] };
  const c = controls(engine, { keys: KEYS, target: play }), c2 = controls(engine, { keys: KEYS, target: play });
  const GAS = c.id("gas"), BRAKE = c.id("brake"), NITRO = c.id("nitro"), DRIFT = c.id("drift");
  const ctl = (p: number): Controls => (p ? c2 : c);

  // ---- settings: the menu's picks (remembered on the device) ----
  const pick = { mode: "race" as "race" | "free", players: "1" as "1" | "2" | "net", rivals: 3 };
  try {
    const v = JSON.parse(store.get("menu") || "null");
    if (v && typeof v === "object") (pick.mode = v.mode === "free" ? "free" : "race"), (pick.players = v.players === "2" ? "2" : "1"), (pick.rivals = v.rivals === 0 ? 0 : 3);
  } catch {}
  if (qs.get("mode") === "online") pick.players = "net";
  // Split screen on one phone is held back (owner, 2026-11-14): a touch-only device (a coarse pointer
  // and no fine one, so not a laptop with a touch screen) gets 1 PLAYER and ONLINE. The code stays.
  const touchOnly = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  const splitOK = !touchOnly || !!o.splitOnTouch || qs.get("split") === "touch";
  if (!splitOK && pick.players === "2") pick.players = "1";
  if (!splitOK) hud.querySelector('[data-seg="players"] [data-v="2"]')?.remove();

  // ---- the views ----
  let P: Pal = DARK;
  const views: View[] = [];
  function makeView(i: number): View {
    const el = document.createElement("div");
    el.className = "dh-view";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const vh = document.createElement("div");
    vh.className = "dh-vhud";
    vh.innerHTML = `<div class="dh-head" data-hud><b class="dh-chip dh-who">P${i + 1}</b>${HEAD}</div><p class="dh-toast" hidden></p><p class="dh-count" hidden></p>`;
    el.append(canvas, vh);
    viewsEl.append(el);
    const v: View = {
      i, el, canvas, d: null as unknown as Diorama, tv: null, cars: [], hubs: [], tails: [], gates: [], dust: null, spark: null, sky: null,
      MB: new Float64Array(6), MAP: [],
      TABLE: { yaw: 0, pitch: 0.82, dist: 34, tx: 0, ty: 0, tz: 0.4, ox: 0, oy: 0, fov: 0.62 },
      chaseO: { dist: 13, pitch: 0.55, lift: 1.0, ahead: 0.26, rate: 3.4, turn: 2.8, side: 0, snap: false },
      CTP: new Float64Array(3), VEL: new Float64Array(3), target: null as unknown as View["target"], car: i,
      head: vh.querySelector(".dh-head") as HTMLElement, els: [], toastEl: vh.querySelector(".dh-toast") as HTMLElement, countEl: vh.querySelector(".dh-count") as HTMLElement,
      toastT: 0, countT: 0, shake: 0, safe: new Float64Array(2), was: new Float64Array(16).fill(-1),
    };
    v.target = { pos: v.CTP, yaw: 0, vel: v.VEL };
    const q = (s: string) => v.head.querySelector(s) as HTMLElement;
    v.els = [q(".dh-pos span"), q(".dh-lap span"), q(".dh-time span"), q(".dh-time small"), q(".dh-score span"), q(".dh-score i"), q(".dh-drift"), q(".dh-drift span"), q(".dh-nitro"), q(".dh-nitro b i"), q(".dh-pos small"), q(".dh-lap small"), q(".dh-pos"), q(".dh-lap"), q(".dh-time")];
    v.d = diorama(canvas, { light: P.light, ambient: P.amb, background: () => P.table, overlay: (ctx) => drawOverlay(ctx, v), get shadowColor() { return P.shadow; }, maxFaces: 12000 });
    views.push(v);
    return v;
  }
  /** The views in use: one, or two in a split. */
  let NV = 1;
  const active = (v: View) => v.i < NV;

  // Touch: two layouts for the left thumb, cycled on the pause card and remembered on the device.
  // "stick" (the default): the analog stick, left/right steers and up/down is gas/brake too (the most
  // of stick and key wins, as in any driving game); "arrows": a left and a right key. Under the right
  // thumb either way: GAS (the big one, in the corner), BRAKE, DRIFT and BOOST as icon keys in a
  // cluster. In a split each half has its own pad. Every choice saved by 0.2.0 ("pad") moves to the
  // stick: its stick never steered there, so nobody chose the arrows over a working one.
  type Steer = "stick" | "arrows";
  const steerKind = (): Steer => (store.get("steer") === "arrows" ? "arrows" : "stick");
  let steer = steerKind();
  const v0 = makeView(0);
  const ICON = (d: string) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d}"/></svg>`;
  const KEY = {
    gas: { intent: "gas", label: "", name: "Gas (up arrow)", icon: ICON("M5 12l5-5 5 5M5 17l5-5 5 5"), key: "↑", role: "go", hold: true },
    brake: { intent: "brake", label: "", name: "Brake (down arrow)", icon: ICON("M5 5l5 5 5-5M4.5 15h11"), key: "↓", role: "attack", hold: true },
    drift: { intent: "drift", label: "", name: "Drift, the handbrake (shift)", icon: ICON("M4 16c0-6.5 4-10 11-10M12 3l3 3-3 3"), key: "⇧", role: "fallin", hold: true },
    nitro: { intent: "nitro", label: "", name: "Nitro boost (space)", icon: ICON("M11.5 2L5 11h4.5L8 18l7-9.5h-4.5z"), key: "␣", role: "sys", hold: true },
  } as const;
  const padOf = (cc: Controls, host: HTMLElement) => {
    const p = pad(engine, cc, { scheme: steer === "stick" ? "stick" : "buttons", move: ["", "", "left", "right"], actions: [KEY.gas, KEY.brake, KEY.drift, KEY.nitro], host });
    p.el.classList.add("dh-pad");
    for (const b of p.el.querySelectorAll<HTMLElement>(".bui-pad-keys button")) b.title = b.getAttribute("aria-label")!.replace(/ \(.*$/, "");
    return p;
  };
  const thePad = padOf(c, v0.el);
  let pad2: Pad | null = null;
  const padK = () => hud.querySelector(".dh-padk") as HTMLButtonElement;
  function paintPad() {
    stage.dataset.steer = steer;
    const k = padK();
    if (k) (k.textContent = steer === "stick" ? "STICK" : "◀ ▶ ARROWS"), k.setAttribute("aria-label", `Touch steering: ${steer === "stick" ? "the stick (steer, gas and brake)" : "the arrow keys with GAS and BRAKE"} (tap to switch)`);
  }
  /** STICK ⇄ ARROWS (fingers on the old control let go; no listener is added). */
  function swapPad() {
    steer = steer === "stick" ? "arrows" : "stick";
    store.set("steer", steer);
    for (const p of [thePad, pad2]) p?.setScheme(steer === "stick" ? "stick" : "buttons");
    for (const cc of [c, c2]) for (const k of ["gas", "brake", "left", "right", "nitro", "drift"]) cc.press(k, false);
    paintPad();
  }

  // ---- the sim and the scene ----
  let def = trackById(o.track ?? TRACKS[0]!.id);
  /** What the sim was made for: mode, people, rivals, track, laps. */
  const want = { mode: "race" as "race" | "free", humans: 1, rivals: 3, laps: o.laps ?? 0 };
  let sim: Sim = createRace(def, o.seed ?? 1, { laps: want.laps });
  const isRace = () => sim.kind === "race";
  const rc = () => sim as Race;
  const fs = () => sim as Freestyle;
  function pal(): Pal {
    return isRace() && def.city ? CITY : pageTheme() === "light" ? LIGHT : DARK;
  }
  P = pal();
  const DV = new Float64Array(DUST * 5), SV = new Float64Array(SPARK * 5);
  // Trails: per car, the last TRAIL positions of each tail light (a ring), its head and length.
  const TR = new Float64Array(MAX_CARS * TRAIL * 6), TRN = new Int32Array(MAX_CARS * 2);
  let EDGES: Float64Array[] = [], LINES: Float32Array[] = [];
  const rnd = seeded(20261109);
  const STARS = new Float32Array(120);
  for (let i = 0; i < 120; i++) STARS[i] = rnd();
  const tmp = new Float64Array(3), tmp2 = new Float64Array(3);

  function trackEdges(p: Path) {
    const E = new Float64Array(p.n * 6), half = TRACK_W / 2, t = sim.t;
    for (let i = 0; i < p.n; i++)
      for (let k = 0; k < 2; k++) {
        const s = k ? 1 : -1, x = p.P[i * 2]! - p.T[i * 2 + 1]! * half * s, z = p.P[i * 2 + 1]! + p.T[i * 2]! * half * s;
        E[k * p.n * 3 + i * 3] = x; E[k * p.n * 3 + i * 3 + 1] = t.height(x, z) + 0.04; E[k * p.n * 3 + i * 3 + 2] = z;
      }
    return E;
  }
  /** The park's table edges as closed loops (the scene strokes them like a track's edges). */
  function tableEdges() {
    const out: Float64Array[] = [], t = sim.t;
    for (const tb of fs().park.tables) {
      const n = 4 * 40, E = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = i / 40, side = s | 0, f = s - side, hx = TX - 0.15, hz = TZ - 0.15;
        const x = tb.cx + (side === 0 ? -hx + 2 * hx * f : side === 1 ? hx : side === 2 ? hx - 2 * hx * f : -hx);
        const z = tb.cz + (side === 0 ? -hz : side === 1 ? -hz + 2 * hz * f : side === 2 ? hz : hz - 2 * hz * f);
        E[i * 3] = x; E[i * 3 + 1] = t.height(x, z) + 0.06; E[i * 3 + 2] = z;
      }
      out.push(E);
    }
    return out;
  }
  /** Contour lines of the dunes at `levels` (marching squares), off the track: [x0, y, z0, x1, y, z1, …] per level. */
  function contours(levels: ArrayLike<number>) {
    const t = sim.t, out: Float32Array[] = [], W1 = t.cols + 1, cs = t.cell, race = isRace() ? rc() : null;
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
            if (race ? race.tr.near(mx, mz)[0]! < TRACK_W / 2 + 0.6 : fs().park.tableAt(mx, mz, -0.4) < 0) continue;
            seg.push(Pp[k]!, Lv + 0.04, Pp[k + 1]!, Pp[k + 2]!, Lv + 0.04, Pp[k + 3]!);
          }
        }
      out.push(Float32Array.from(seg));
    }
    return out;
  }
  /** The sim changed: its shared geometry, then every view's scene. */
  function buildAll() {
    EDGES = isRace() ? rc().tr.paths.map(trackEdges) : tableEdges();
    LINES = contours(isRace() ? [0.95, 1.5, 2.1] : [0.75, 1.45, 2.15]);
    for (const v of views) buildScene(v);
  }

  function buildScene(v: View) {
    const d = v.d, t = sim.t, HX = sim.HX, HZ = sim.HZ, race = isRace() ? rc() : null;
    d.clear();
    v.cars = []; v.hubs = []; v.tails = []; v.gates = [];
    d.setLight(P.light, P.amb);
    d.cluster("sky", { fixed: -10 });
    d.cluster("table", { fixed: -5 });
    d.decal("sky", 0, (ctx) => paintSky(ctx, v));
    const city = P.city, extra = city ? 9 : 0;
    d.add({ id: "table", size: [HX * 2 + 7 + extra * 2, 0.5, HZ * 2 + 6 + extra * 2], pos: [0, -1.55 - (race ? 0 : 1.4), 0.6 - (city ? extra * 0.6 : 0)], color: P.table, cluster: "table", layer: 0, pick: false });
    if (race) {
      d.add({ id: "plinth", size: [HX * 2 + 0.5, 1.05, HZ * 2 + 0.5], pos: [0, -1.05, 0], color: P.plinth, cluster: "table", layer: 1, pick: false });
      d.add({ id: "rim", size: [HX * 2 + 0.7, 0.12, HZ * 2 + 0.7], pos: [0, -0.2, 0], color: P.rim, cluster: "table", layer: 2, emissive: true, pick: false });
    } else
      // Four tables: a plinth each, its rim lit in the table's own colour.
      fs().park.tables.forEach((tb, k) => {
        d.add({ size: [TX * 2 + 0.3, 2.4, TZ * 2 + 0.3], pos: [tb.cx, -2.4, tb.cz], color: P.plinth, cluster: "table", layer: 1, pick: false });
        d.add({ size: [TX * 2 + 0.5, 0.14, TZ * 2 + 0.5], pos: [tb.cx, -0.25, tb.cz], color: P.tables[k]!, cluster: "table", layer: 2, emissive: true, pick: false });
      });
    v.tv = terrainView(d, t, {
      bands: [[0.55, P.sand[0]!], [1.15, P.sand[1]!], [1.85, P.sand[2]!], [99, P.crest]], steep: 0.42, steepColor: P.steep, kinds: race ? [P.track] : [P.track, P.salt, P.conc, P.yard, P.gap, P.ledge],
      light: P.light, ambient: P.amb, lod: [18, 36], shadows: MAX_CARS, shadowColor: P.shadow,
    });
    d.decal("terrain", 1, (ctx) => paintLines(ctx, v));
    // The city: towers behind the far edge and down the left, their windows lit in neon bands.
    if (city) {
      const r = seeded(def.seed);
      const tower = (x: number, z: number, w: number, dd: number, h: number, k: number) => {
        const id = "tw" + k;
        d.add({ id, size: [w, h, dd], pos: [x, -1.3, z], color: P.tower, pick: false });
        const bands = 2 + ((r() * 3) | 0), col = [P.win, P.win2, P.win3][k % 3]!;
        for (let b = 0; b < bands; b++) d.add({ size: [w + 0.04, 0.12, dd + 0.04], pos: [0, -h + h * (0.25 + (b * 0.6) / bands), 0], on: id, color: col, emissive: true, mask: 60, pick: false });
        if (r() < 0.45) d.add({ size: [w * 0.7, 0.5, 0.12], pos: [0, 0, dd / 2 - 0.1], on: id, color: k % 2 ? P.win2 : P.win, emissive: true, pick: false });
      };
      let k = 0;
      for (let x = -HX - 6; x < HX + 6; x += 2.6 + r() * 2.4) tower(x, -HZ - 4 - r() * 6, 1.6 + r() * 1.6, 1.6 + r() * 1.4, 3 + r() * 9, k++);
      for (let z = -HZ + 2; z < HZ; z += 3 + r() * 2.5) tower(-HX - 4 - r() * 4, z, 1.4 + r() * 1.2, 1.6 + r() * 1.4, 2 + r() * 5, k++);
    }
    const pylon = (id: string, x: number, z: number, h: number, tip: string) => {
      d.add({ id, shape: "group", size: [0.3, 0, 0.3], pos: [x, t.height(x, z), z], pick: false });
      d.add({ shape: "cyl", sides: 6, size: [0.16, h, 0.16], on: id, color: P.pylon, pick: false });
      d.add({ shape: "cyl", sides: 6, size: [0.22, 0.16, 0.22], pos: [0, h, 0], on: id, color: tip, emissive: true, pick: false });
    };
    if (race) {
      const tr = race.tr;
      // Rocks off the track and neon pylons along it.
      const r = seeded(7);
      for (let k = 0, n = 0; k < 400 && n < (def.cols * def.rows) / 280; k++) {
        const x = (r() * 2 - 1) * (HX - 1.2), z = (r() * 2 - 1) * (HZ - 1.2);
        if (tr.near(x, z)[0]! < Infinity) continue;
        const s = 0.35 + r() * 0.5;
        d.add({ shape: "cyl", sides: 5 + (n % 3), top: 0.45, size: [s * 1.6, s, s * 1.3], pos: [x, t.height(x, z) - 0.05, z], rot: [0, r() * TAU, 0], color: P.rock, pick: false });
        n++;
      }
      const main = tr.main;
      for (let i = 3; i < main.n; i += 9) {
        const side = (i / 9) & 1 ? 1 : -1, x = main.P[i * 2]! - main.T[i * 2 + 1]! * (TRACK_W / 2 + 0.75) * side, z = main.P[i * 2 + 1]! + main.T[i * 2]! * (TRACK_W / 2 + 0.75) * side;
        if (tr.near(x, z)[0]! < TRACK_W / 2 + 0.3) continue;
        pylon("py" + i, x, z, city ? 1.5 : 0.9, side > 0 ? P.tip : P.tip2);
      }
      // The gates: two posts and a bar across the track; gate 0 is the chequered start and finish.
      for (let g = 0; g < tr.GATE.length; g++) {
        const i = tr.GATE[g]!, x = main.P[i * 2]!, z = main.P[i * 2 + 1]!, id = "gate" + g, w = TRACK_W + 1.1, yaw = Math.atan2(-main.T[i * 2 + 1]!, main.T[i * 2]!);
        d.add({ id, shape: "group", size: [0.6, 0, w], pos: [x, t.height(x, z), z], rot: [0, yaw, 0], pick: false });
        const a = d.add({ shape: "cyl", sides: 8, size: [0.24, 2.5, 0.24], pos: [0, 0, -w / 2], on: id, color: P.gIdle, emissive: true, pick: false });
        const b = d.add({ shape: "cyl", sides: 8, size: [0.24, 2.5, 0.24], pos: [0, 0, w / 2], on: id, color: P.gIdle, emissive: true, pick: false });
        const bar = d.add({ size: [0.3, 0.32, w + 0.24], pos: [0, 2.5, 0], on: id, color: P.gIdle, emissive: true, pick: false });
        for (const zz of [-w / 2, w / 2]) d.add({ shape: "cyl", sides: 8, size: [0.5, 0.14, 0.5], pos: [0, -0.02, zz], on: id, color: P.gPost, pick: false });
        v.gates.push([a, b, bar]);
        if (!g) for (let k = 0; k < 8; k++) d.add({ size: [0.32, 0.16, w / 8], pos: [0, 2.5 + (k & 1 ? 0 : 0.16), -w / 2 + (k + 0.5) * (w / 8)], on: id, color: k & 1 ? P.ink : P.check, pick: false, layer: 9 });
        d.decal(id, 20, (ctx) => glow(ctx, v, g));
      }
    } else {
      const park = fs().park;
      // Pylons on each table's corners, in its colour; the yard's ledges get lit edges.
      park.tables.forEach((tb, k) => {
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) pylon(`py${k}${sx}${sz}`, tb.cx + sx * (TX - 0.9), tb.cz + sz * (TZ - 0.9), 1.4, P.tables[k]!);
      });
      const B = park.BOXES;
      for (let b = 0; b < B.length; b += 5) {
        if (park.tableAt(B[b]!, B[b + 1]!) !== 3) continue;
        const y = PARK_TOP + B[b + 4]!;
        for (const s of [-1, 1]) d.add({ size: [B[b + 2]! * 2, 0.06, 0.08], pos: [B[b]!, y - 0.02, B[b + 1]! + s * B[b + 3]!], color: P.ledge, emissive: true, pick: false });
      }
    }
    for (let k = 0; k < sim.count; k++) buildCar(v, k);
    v.dust = d.points({ cap: DUST, color: P.dust, layer: 4 });
    v.spark = d.points({ cap: SPARK, color: P.spark, layer: 6 });
    for (let k = 0; k < sim.count; k++) d.decal("car" + k, 4, (ctx) => paintTrail(ctx, v, k));
    v.sky = null;
    v.MB[5] = 0;
    paintGates(v);
    pose(v);
  }

  /** A buggy: a low tub with side pods and a wedge nose, a splitter, a cage with a light bar, a rear
   *  wing; the driver's helmet; four knobbly wheels on dished hubs. Its colours: body and accent. */
  function buildCar(v: View, k: number) {
    const d = v.d, id = "car" + k, [body, acc] = P.cars[k]!;
    v.cars.push(d.add({ id, shape: "group", size: [2.0, 0, 1.6], tag: { car: k } }));
    const part = (size: number[], pos: number[], color: string, op: { shape?: "box" | "wedge" | "cyl"; emissive?: boolean; sides?: number; top?: number; rot?: number[] } = {}) =>
      d.add({ shape: op.shape || "box", size, pos, rot: op.rot, on: id, color, emissive: op.emissive, sides: op.sides, top: op.top, pick: false });
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
    v.tails[k] = [part([0.05, 0.08, 0.16], [-1.09, 0.06, -0.24], P.tail, { emissive: true }), part([0.05, 0.08, 0.16], [-1.09, 0.06, 0.24], P.tail, { emissive: true })];
    const car = sim.cars[k]!, hs: DioramaObject[] = [];
    for (let i = 0; i < 4; i++) {
      const hid = id + "h" + i, side = car.wheels[i * 2 + 1]! > 0 ? 1 : -1;
      const hub = d.add({ id: hid, shape: "group", size: [0.6, 0, 0.6], on: id });
      d.add({ shape: "cyl", sides: 14, size: [0.74, 0.32, 0.74], pos: [0, 0, -0.16], rot: [Math.PI / 2, 0, 0], on: hid, color: P.tyre, pick: false });
      d.add({ shape: "cyl", sides: 8, size: [0.42, 0.05, 0.42], pos: [0, 0, side > 0 ? 0.16 : -0.21], rot: [Math.PI / 2, 0, 0], on: hid, color: k ? acc! : P.hub, pick: false });
      d.add({ size: [0.38, 0.06, 0.06], pos: [0, -0.03, side > 0 ? 0.2 : -0.21], on: hid, color: P.chassis, pick: false });
      hs.push(hub);
    }
    v.hubs[k] = hs;
  }

  // ---- state ----
  const I = new Float64Array(IK);
  // Pointer drive: down, start x, current x, id.
  const PD = new Float64Array(4);
  PD[3] = -1;
  // [0] measure, [1] theme.
  const V = new Float64Array(2);
  V[0] = V[1] = 1;
  let mode: "menu" | "race" | "demo" = "menu", paused = false, auto = !!o.attract, view = 1, dirty = true, hudDirty = true, flash = -1, flashT = 0, cardAt = -1, pulse = 0, boardT = 0, emitK = 0, newBest = false, destroyed = false;
  /** Per car: the drop-in after a respawn. */
  const DROP = new Float64Array(MAX_CARS);
  /** Freestyle: the best score on this device (kept as it grows). */
  let freeBest = Number(store.get("best:freestyle")) || 0;
  const ro = new ResizeObserver(() => ((V[0] = 1), engine.wake()));
  ro.observe(stage);
  const mo = new MutationObserver(() => ((V[1] = 1), engine.wake()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  engine.signal.addEventListener("abort", () => (ro.disconnect(), mo.disconnect(), (destroyed = true), net.end(false)), { once: true });

  function pose(v: View) {
    const t = sim.t, HX = sim.HX, HZ = sim.HZ;
    for (let k = 0; k < sim.count; k++) {
      const car = v.cars[k]!, dv = sim.cars[k]!, p = k * 3, tum = sim.C[k * K + PH] === CRASH;
      car.pos[0] = sim.pos[p]!; car.pos[1] = sim.pos[p + 1]!; car.pos[2] = sim.pos[p + 2]!;
      car.rot[0] = sim.rot[p]!; car.rot[1] = sim.rot[p + 1]!; car.rot[2] = sim.rot[p + 2]!;
      if (DROP[k]! > 0) car.pos[1] = car.pos[1]! + DROP[k]! * DROP[k]! * 3;
      for (let i = 0; i < 4; i++) {
        const h = v.hubs[k]![i]!;
        h.pos[0] = dv.wheels[i * 2]!;
        h.pos[1] = tum ? -0.2 : -(dv.rest - dv.comp[i]!);
        h.pos[2] = dv.wheels[i * 2 + 1]!;
        h.rot[1] = i < 2 && !tum ? -Math.max(-0.45, Math.min(0.45, dv.steerAngle)) : 0;
        h.rot[2] = -dv.spin[i]!;
      }
      const x = car.pos[0]!, z = car.pos[2]!, inside = Math.abs(x) < HX && Math.abs(z) < HZ, lift = inside ? car.pos[1]! - t.height(x, z) : 9;
      v.tv!.shadow(k, x, z, 1.3, inside ? Math.max(0, 0.34 - lift * 0.1) : 0);
    }
  }
  function paintGates(v: View) {
    if (!isRace()) return;
    const next = sim.C[v.car * K + NEXT]! % rc().gates, ph = sim.R[0]!;
    for (let g = 0; g < v.gates.length; g++) {
      const parts = v.gates[g]!, on = mode !== "menu" && ph !== DONE && g === next, col = flash === g ? P.check : on ? P.gNext : P.gIdle;
      for (let k = 0; k < 3; k++) (parts[k]!.color = col), (parts[k]!.emissive = P.night || on || flash === g);
    }
  }

  // ---- FX (simulated in view 0's pools; a second view copies them before it draws) ----
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
  const copyPool = (a: DioramaPoints, b: DioramaPoints) => {
    b.n = a.n;
    b.x.set(a.x); b.y.set(a.y); b.z.set(a.z); b.r.set(a.r); b.a.set(a.a);
  };
  function burst(x: number, y: number, z: number, n: number, sp: number) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, u = 0.4 + rnd();
      puff(v0.spark!, SV, SPARK, x, y, z, Math.cos(a) * sp * u, 2 + rnd() * sp, Math.sin(a) * sp * u, 0.5 + rnd() * 0.5, 0.07, 1);
    }
  }
  function dustBurst(x: number, y: number, z: number, n: number) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU;
      puff(v0.dust!, DV, DUST, x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6, Math.cos(a) * 2.2, 0.6 + rnd(), Math.sin(a) * 2.2, 0.7 + rnd() * 0.5, 0.22, 0.6);
    }
  }
  function stepFx(dt: number) {
    let any = false;
    for (let k = 0; k < sim.count; k++) {
      const dv = sim.cars[k]!, ph = sim.C[k * K + PH]!;
      // Dust from the rear wheels by how hard they dig (fewer for the rivals, and none in reduced motion).
      if (ph !== CRASH && !reduced) {
        emitK += dv.dust * (k < sim.humans ? 60 : 30) * dt;
        while (emitK >= 1) {
          emitK -= 1;
          const w = 2 + (rnd() < 0.5 ? 1 : 0);
          puff(v0.dust!, DV, DUST, dv.wheel[w * 3]! + (rnd() - 0.5) * 0.3, dv.wheel[w * 3 + 1]! - 0.2, dv.wheel[w * 3 + 2]! + (rnd() - 0.5) * 0.3, -dv.vel[0]! * 0.15 + (rnd() - 0.5), 0.5 + rnd() * 0.6, -dv.vel[2]! * 0.15 + (rnd() - 0.5), 0.5 + rnd() * 0.4, 0.08, 0.26);
        }
      }
      // The trail: each step the lights' newest point in; it shortens to nothing when the buggy stops.
      const go = ph !== CRASH && (dv.groundSpeed > 1.2 || dv.air > 0), n = k * 2;
      if (go) {
        const h = (TRN[n] = (TRN[n]! + 1) % TRAIL);
        for (let s = 0; s < 2; s++) {
          const m = v0.tails[k]![s]!.M, q = (k * TRAIL + h) * 6 + s * 3;
          TR[q] = m[9]! - m[0]! * 0.03; TR[q + 1] = m[10]! + 0.03; TR[q + 2] = m[11]! - m[6]! * 0.03;
        }
        TRN[n + 1] = Math.min(TRAIL, TRN[n + 1]! + 1);
      } else if (TRN[n + 1]! > 0) TRN[n + 1] = TRN[n + 1]! - 1;
      if (TRN[n + 1]! > 0) any = true;
    }
    if (stepPool(v0.dust!, DV, dt, -0.4, 0.16, 0.24)) any = true;
    if (stepPool(v0.spark!, SV, dt, 14, -0.05, 1)) any = true;
    return any;
  }

  // ---- events from the sim: stickers, sound, FX ----
  /** The view following car c, or −1. */
  const viewOf = (car: number) => (car === v0.car ? 0 : NV > 1 && views[1]!.car === car ? 1 : -1);
  function events() {
    const C = sim.C, race = isRace() ? rc() : null;
    for (let k = 0; k < sim.n; k++) {
      const type = sim.ev[k * 3]!, car = sim.ev[k * 3 + 1]!, val = sim.ev[k * 3 + 2]!, p = car * 3, vi = viewOf(car), you = vi >= 0, vw = views[vi]!;
      hudDirty = true;
      if (type === E_COUNT) countAll("" + val), engine.events.emit("count");
      else if (type === E_GO) countAll("GO!"), engine.events.emit("go"), say("Go");
      else if (type === E_GATE && you && race) {
        engine.events.emit("gate");
        flash = val;
        flashT = 0.25;
        const m = vw.gates[val]![2]!.M;
        burst(m[9]!, m[10]! + 0.2, m[11]!, 12, 3);
      } else if (type === E_LAP && you && race) {
        const b = C[car * K + BEST]!;
        engine.events.emit("lap");
        flash = 0;
        flashT = 0.3;
        if (auto && mode === "demo") endDemo();
        else toast(vi, `LAP ${Math.min(race.laps, val + 1)} OF ${race.laps} · ${clock(b)}${b ? " BEST LAP" : ""}`, "go"), say(`Lap ${val + 1}`);
      } else if (type === E_LAND && you) {
        const S = sim.scs[car]!.S, clean = val === CLEAN;
        engine.events.emit(clean ? "clean" : "sketchy");
        toast(vi, `${S[AIR]!.toFixed(2)}s AIR · ${clean ? "CLEAN" : "SKETCHY"} +${num(S[PTS]!)}${clean && S[CB]! > 1 ? ` · ×${1 + S[CB]!}` : ""}`, clean ? "clean" : "meh");
        dustBurst(sim.pos[p]!, sim.pos[p + 1]! - 0.5, sim.pos[p + 2]!, clean ? 8 : 14);
      } else if (type === E_XFER && you) {
        const tb = fs().park.tables[val]!;
        engine.events.emit("lap");
        toast(vi, `TRANSFER · ${tb.name} +${num(C[car * K + XPTS]!)}`, "go");
        say(`Transfer to ${tb.name.toLowerCase()}`);
        burst(sim.pos[p]!, sim.pos[p + 1]! + 0.4, sim.pos[p + 2]!, 18, 4);
      } else if (type === E_COMBO && you) {
        if (val > 1) toast(vi, val > 0 ? `COMBO ×${1 + val} BANKED` : `COMBO ×${1 - val} LOST`, val > 0 ? "drift" : "meh");
        else if (val < -1) toast(vi, `COMBO ×${1 - val} LOST`, "meh");
      } else if (type === E_CRASH) {
        burst(sim.pos[p]!, sim.pos[p + 1]!, sim.pos[p + 2]!, you ? 26 : 12, 5);
        dustBurst(sim.pos[p]!, sim.pos[p + 1]! - 0.4, sim.pos[p + 2]!, you ? 20 : 8);
        if (you) {
          engine.events.emit("crash");
          vw.shake = reduced ? 0 : 0.5;
          toast(vi, val ? (race ? "OFF THE TABLE!" : "INTO THE GAP!") : "WIPEOUT", "bad");
          say(val ? (race ? "Off the table" : "Into the gap") : "Wipeout");
        }
      } else if (type === E_RESPAWN && you) {
        engine.events.emit("respawn");
        DROP[car] = 0.45;
        aim(vw, true);
        toast(vi, race ? (val ? `BACK AT GATE ${val}` : "BACK AT THE START") : `BACK ON ${fs().park.tables[val]!.name}`, "go");
      } else if (type === E_BOOST && you) engine.events.emit("boost"), toast(vi, "BOOST", "boost");
      else if (type === E_WRONG && you) toast(vi, "WRONG WAY", "bad"), say("Wrong way");
      else if (type === E_DRIFT && you) engine.events.emit("clean"), toast(vi, `DRIFT +${num(val)}`, "drift"), say(`Drift, ${val} points`);
      else if (type === E_DRIFT_LOST && you) toast(vi, `DRIFT LOST −${val}`, "meh");
      else if (type === E_SPIN) {
        engine.events.emit("bump");
        burst(sim.pos[p]!, sim.pos[p + 1]! + 0.3, sim.pos[p + 2]!, you ? 14 : 8, 3);
        if (you) (vw.shake = reduced ? 0 : 0.3), toast(vi, "SPUN OUT", "bad"), say("Spun out");
      } else if (type === E_BUMP && you) engine.events.emit("bump"), (vw.shake = reduced ? 0 : Math.max(vw.shake, 0.18));
      else if (type === E_DONE) {
        if (mode === "demo") continue;
        const won = race ? C[v0.car * K + PLACE] === 1 : fs().winner() === v0.car;
        engine.events.emit(won ? "win" : "lose");
        burst(sim.pos[v0.car * 3]!, sim.pos[v0.car * 3 + 1]! + 1, sim.pos[v0.car * 3 + 2]!, 30, 4);
        cardAt = engine.time + 1.2;
        engine.busy(1.4);
        say(race ? `Finished ${ordinal(C[v0.car * K + PLACE]!)}` : "Time");
      }
    }
    sim.clear();
  }
  const ordinal = (n: number) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
  function toast(vi: number, text: string, kind: string) {
    if (mode === "demo" || vi < 0) return;
    const v = views[vi]!;
    v.toastEl.textContent = text;
    v.toastEl.className = "dh-toast dh-" + kind;
    v.toastEl.hidden = false;
    v.toastT = 1.6;
  }
  function countAll(text: string) {
    if (mode === "demo") return;
    for (let i = 0; i < NV; i++) {
      const v = views[i]!;
      v.countEl.textContent = text;
      v.countEl.className = text === "GO!" ? "dh-count dh-go" : "dh-count";
      v.countEl.hidden = false;
      v.countT = text === "GO!" ? 0.8 : 1.1;
    }
  }
  let said = "";
  function say(s: string) {
    if (s === said) s += " ";
    live.textContent = said = s;
  }

  // ---- the HUD ----
  function hudWrite(v: View) {
    const C = sim.C, R = sim.R, car = v.car, o = car * K, w = v.was, E = v.els, race = isRace() ? rc() : null, S = sim.scs[car]!.S;
    const set = (i: number, val: number, fn: () => void) => w[i] !== val && ((w[i] = val), fn());
    if (race) {
      const place = C[o + PLACE]!;
      set(0, place * 10 + sim.count, () => ((E[0]!.textContent = "" + place), (E[10]!.textContent = "/" + sim.count)));
      const lap = Math.min(race.laps, C[o + LAP]! + 1);
      set(1, lap * 100 + race.laps, () => ((E[1]!.textContent = `${lap}/${race.laps}`), (E[11]!.textContent = "LAP")));
      const tenths = Math.floor((R[0] === DONE && mode !== "demo" ? R[3]! : R[1]!) * 10);
      set(2, tenths, () => (E[2]!.textContent = clock(tenths / 10)));
      const b = C[o + BEST]!;
      set(3, b, () => (E[3]!.textContent = b ? "BEST " + clock(b) : ""));
    } else {
      const f = fs(), ti = C[o + FTABLE]!;
      set(1, 1000 + ti, () => ((E[1]!.textContent = f.park.tables[ti]!.name), (E[11]!.textContent = "TABLE")));
      // The jam's clock counts down; alone, the time chip holds this device's best.
      const left = f.jam ? Math.max(0, f.jam - (R[0] === COUNT ? 0 : R[1]!)) : -1, tenths = left >= 0 ? Math.ceil(left * 10) : -1;
      if (f.jam) set(2, tenths, () => (E[2]!.textContent = clock(tenths / 10)));
      else set(2, -2 - freeBest, () => (E[2]!.textContent = "BEST " + num(freeBest)));
      set(3, f.jam ? -5 : -6, () => (E[3]!.textContent = f.jam ? "LEFT" : ""));
    }
    const hidePos = !race;
    if (E[12]!.hidden !== hidePos) E[12]!.hidden = hidePos;
    const sc = S[SC]!;
    if (!race && sim.humans === 1 && sc > freeBest) (freeBest = sc), store.set("best:freestyle", "" + sc);
    set(4, sc, () => (E[4]!.textContent = num(sc)));
    const cb = S[CB]!;
    set(5, cb, () => ((E[5]!.textContent = "×" + (1 + cb)), E[5]!.classList.toggle("dh-hot", cb > 0)));
    const n = Math.round(sim.N[car * 2]! * 40) / 40;
    set(6, n, () => E[9]!.style.setProperty("--n", "" + n));
    const on = sim.N[car * 2 + 1]! > 0 || C[o + BOOST]! > 0 ? 1 : 0;
    set(7, on, () => E[8]!.classList.toggle("dh-on", !!on));
    const dp = Math.round(C[o + DPTS]!), dOn = C[o + DTIME]! > 0.15 && dp > 0;
    set(8, dOn ? dp : -1, () => ((E[6]!.hidden = !dOn), (E[7]!.textContent = "" + dp)));
  }
  function sharedHud() {
    const R = sim.R, solo = NV === 1 && !net.on;
    const hint = mode === "race" && solo && (R[0] === COUNT || (!isRace() && R[1]! < 6 && !moved)) ? (thePad.el.offsetParent ? "Stick: steer, push up for gas · or hold GAS · DRIFT into the bends · BOOST when the bar is full" : isRace() ? "↑ gas · ← → steer · ↓ brake · SHIFT drift · SPACE nitro · in the air ↑ lifts the nose, ↓ dips it" : "↑ gas straight off the ramp to jump to the next table · SHIFT drift · SPACE nitro · land flat for the combo") : "";
    if (hintEl.textContent !== hint) hintEl.textContent = hint;
    // The demo lap shows only the race (the page's copy sits over it); the menu only its card.
    const hideHead = mode === "menu" || mode === "demo";
    for (const v of views) if (v.head.hidden !== hideHead) v.head.hidden = hideHead;
    const hideBoard = hideHead || !isRace() || NV > 1;
    if (board.hidden !== hideBoard) board.hidden = hideBoard;
    if (keysEl.hidden !== (mode === "demo")) keysEl.hidden = mode === "demo";
    demoEl.hidden = mode !== "demo";
    // The demo lap has no pad (and the course takes the whole stage); a takeover brings it back.
    if (stage.hasAttribute("data-demo") !== (mode === "demo")) stage.toggleAttribute("data-demo", mode === "demo"), (V[0] = 1), engine.wake();
  }
  function boardWrite() {
    if (!isRace()) return;
    const race = rc();
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
      row.classList.toggle("dh-you", car === v0.car);
    }
  }
  function menuWrite() {
    for (const s of hud.querySelectorAll<HTMLElement>("[data-seg]")) {
      const cur = s.dataset.seg === "mode" ? pick.mode : pick.players;
      for (const b of s.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", "" + (b.dataset.v === cur));
    }
    const free = pick.mode === "free", two = pick.players !== "1";
    tracksEl.hidden = free;
    parkEl.hidden = !free;
    $(".dh-m-rivals").hidden = free || !two;
    const rk = $(".dh-rivk");
    rk.textContent = pick.rivals ? "3 RIVALS" : "NO RIVALS";
    rk.setAttribute("aria-pressed", "" + !!pick.rivals);
    $(".dh-m-sub").textContent = free
      ? pick.players === "1" ? `Four tables, no clock. Jump the ramps from table to table; air, transfers and drifts score, the combo multiplies. Best here: ${num(freeBest)}.` : "A three-minute jam on the four tables: the higher score wins."
      : pick.players === "1" ? "Pick a track, then START. Three rivals, the clock, every jump and drift scored." : pick.players === "2" ? "Two on this screen: a view each. Pick a track, then START." : "Two screens over the internet: you need an invite code.";
    $(".dh-start").textContent = pick.players === "net" ? "NEXT" : "START";
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
    if (!parkEl.childElementCount)
      parkEl.innerHTML = ["SALT FLATS", "THE BOWL", "DUNE SEA", "NEON YARD"].map((n, i) => `<li style="--c:var(--dh-t${i})"><b>${n}</b><small>${["Kicker line, tabletop, whoops, a drift ring", "A deep bowl, a spine, a hip", "Ridged dunes and a banked U-turn", "A rail, stair ledges, a funbox"][i]}</small></li>`).join("");
    $(".dh-menu-keys").textContent = thePad.el.offsetParent ? "Left thumb: the stick steers (push up for gas, pull down to brake). Right thumb: GAS, BRAKE, DRIFT, BOOST." : pick.players === "2" ? "P1: W A S D · left SHIFT drift · SPACE nitro. P2: arrows · right SHIFT drift · ENTER nitro. Gamepads work too." : "↑ gas · ↓ brake · ← → steer · SHIFT drift · SPACE nitro · P pause · V view";
  }
  function showCard(which: HTMLElement | null) {
    for (const el of [menu, pauseC, result, roomC]) el.hidden = el !== which;
    hudDirty = dirty = true;
  }
  function showEnd() {
    const C = sim.C, R = sim.R, me = v0.car, list = $(".dh-results");
    list.innerHTML = "";
    const again = $(".dh-r-again"), next = $(".dh-r-next");
    again.textContent = net.on ? "REMATCH" : isRace() ? "RACE AGAIN" : "PLAY AGAIN";
    next.hidden = net.on || !isRace();
    if (isRace()) {
      const race = rc(), place = C[me * K + PLACE]!, time = R[3]!, id = def.id, prev = bestOf(id), solo = race.humans === 1;
      newBest = solo && place <= race.count && (!prev || time < prev) && race.fin[me]! > 0 && C[me * K + NEXT]! > race.gates * race.laps;
      if (newBest) store.set("best:" + id, time.toFixed(2));
      let head = place === 1 ? "YOU WIN" : `FINISH · ${ordinal(place).toUpperCase()}`;
      if (race.humans > 1) {
        const p1 = C[PLACE]!, p2 = C[K + PLACE]!, w = p1 < p2 ? 0 : 1;
        const wp = C[w * K + PLACE]!;
        head = (net.on && w === me ? "YOU WIN" : `P${w + 1} WINS`) + (wp > 1 ? ` · ${ordinal(wp).toUpperCase()}` : "");
      }
      $(".dh-r-head").textContent = head;
      $(".dh-r-time").textContent = clock(time) + (newBest ? " · TRACK BEST" : solo && prev ? ` · best ${clock(prev)}` : "");
      const S = race.scs[me]!.S;
      $(".dh-r-stats").textContent = `best lap ${C[me * K + BEST]! ? clock(C[me * K + BEST]!) : "—"} · ${num(S[SC]!)} stunt pts · best air ${S[SBEST]!.toFixed(2)}s · ${S[CLEANS]} clean · top combo ×${1 + S[TOP]!}`;
      for (let k = 0; k < race.count; k++) {
        const car = race.order[k]! >= 0 ? race.order[k]! : race.rank[k]!, li = document.createElement("li"), ft = race.fin[car]!;
        li.innerHTML = `<b>${ordinal(k + 1)}</b><i style="background:${P.cars[car]![0]}"></i><span>${race.name(car)}</span><span>${ft ? clock(ft) : "RACING"}</span>`;
        if (car < race.humans) li.className = "dh-you";
        list.append(li);
      }
      say(`Finished ${ordinal(place)} in ${clock(time)}`);
      if (solo && !net.on) o.onEnd?.({ track: id, place, time, bestLap: C[me * K + BEST]!, score: S[SC]!, best: newBest });
    } else {
      const f = fs(), w = f.winner();
      $(".dh-r-head").textContent = w < 0 ? "A DRAW" : net.on ? (w === me ? "YOU WIN" : `P${w + 1} WINS`) : `P${w + 1} WINS`;
      $(".dh-r-time").textContent = `${num(f.scs[0]!.S[SC]!)} · ${num(f.scs[1]?.S[SC] ?? 0)}`;
      $(".dh-r-stats").textContent = "Freestyle jam · three minutes on the four tables";
      for (let k = 0; k < f.count; k++) {
        const S = f.scs[k]!.S, li = document.createElement("li");
        li.innerHTML = `<b>P${k + 1}</b><i style="background:${P.cars[k]![0]}"></i><span>${num(S[SC]!)} · ${f.C[k * K + XFERS]} transfers · best air ${S[SBEST]!.toFixed(2)}s · ×${1 + S[TOP]!}</span><span>${k === w ? "WIN" : ""}</span>`;
        li.className = k === me ? "dh-you" : "";
        list.append(li);
      }
      say(w < 0 ? "A draw" : `Player ${w + 1} wins`);
    }
    showCard(result);
    for (const v of views) setView(v, 0);
    (again as HTMLButtonElement).focus({ preventScroll: true });
  }

  // ---- flow ----
  /** Make the sim for these settings (a new one only when something changed). */
  function setup(m: "race" | "free", humans: number, rivals: number, id: string) {
    const d = trackById(id);
    if (want.mode === m && want.humans === humans && want.rivals === rivals && (m === "free" || d === def)) return;
    def = d;
    (want.mode = m), (want.humans = humans), (want.rivals = rivals);
    sim = m === "free" ? createFreestyle(o.seed ?? 1, { humans }) : createRace(def, o.seed ?? 1, { humans, rivals: humans > 1 ? rivals : 3, laps: want.laps });
    P = pal();
    stage.toggleAttribute("data-day", !P.night);
    stage.toggleAttribute("data-free", m === "free");
    stage.toggleAttribute("data-solo", humans === 1);
    TRN.fill(0);
    buildAll();
    V[0] = 1;
  }
  /** One view, or two side by side (stacked on a tall stage). */
  function setSplit(on: boolean) {
    const n = on ? 2 : 1;
    if (n === NV && (!on || views[1])) return;
    if (on && !views[1]) {
      makeView(1);
      buildScene(views[1]!);
    }
    if (on && !pad2) pad2 = padOf(c2, views[1]!.el);
    NV = n;
    if (views[1]) views[1].el.hidden = !on;
    stage.toggleAttribute("data-split", on);
    for (const cc of [c, c2]) for (const k of ["gas", "brake", "left", "right", "nitro", "drift"]) cc.press(k, false);
    V[0] = 1;
  }
  let moved = false;
  function startRace(id = def.id, seed = o.seed ?? ((Math.random() * 2147483647) | 0), fresh = true) {
    if (fresh) {
      const humans = net.on ? 2 : pick.players === "2" ? 2 : 1;
      setup(net.on ? net.pick.mode : pick.mode, humans, net.on ? net.pick.rivals : pick.rivals, id);
      setSplit(!net.on && humans > 1);
      sim.reset(seed);
    }
    v0.car = net.on ? net.seat : 0;
    if (views[1]) views[1].car = 1;
    V[0] = 1;
    mode = auto && o.attract ? "demo" : "race";
    paused = false;
    moved = false;
    if (mode === "demo") sim.R[2] = 0.05;
    cardAt = -1;
    for (const v of views) if (v.dust) (v.dust.n = 0), (v.spark!.n = 0);
    TRN.fill(0);
    DROP.fill(0);
    for (const v of views) (v.shake = 0), v.was.fill(-1), (v.countEl.hidden = true), (v.toastEl.hidden = true);
    flash = -1;
    showCard(null);
    for (const r of rows) r.dataset.k = "";
    for (const v of views) setView(v, 1), paintGates(v), pose(v);
    for (const v of views) aim(v, mode === "demo" || reduced);
    hudDirty = dirty = true;
    engine.busy(2);
    engine.wake();
    if (!dropIn || mode === "race") play.focus({ preventScroll: true });
  }
  /** The menu's pick: the preview on the table changes; START races it. */
  function selectTrack(id: string) {
    setup("race", 1, 3, id);
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
    if (net.on) net.end(false);
    mode = "menu";
    V[0] = 1;
    paused = false;
    setSplit(false);
    setup(pick.mode, 1, 3, def.id);
    v0.car = 0;
    menuWrite();
    showCard(menu);
    setView(v0, 0);
    engine.wake();
    (tracksEl.querySelector("[aria-current]") as HTMLElement | null)?.focus({ preventScroll: true });
  }
  function endDemo() {
    // The demo lap is over: everyone eases off and stops; tap to race.
    sim.finish();
    demoEl.textContent = "TAP TO RACE";
  }
  function takeOver() {
    if (mode === "menu") return;
    if (mode === "demo") {
      auto = false;
      if (sim.R[0] === DONE) return startRace(def.id);
      mode = "race";
      toast(0, "YOU HAVE IT", "go");
      hudDirty = true;
    }
  }
  function setPaused(on: boolean) {
    if (mode === "menu" || (on && sim.R[0] === DONE) || paused === on) return;
    paused = on;
    if (on) {
      const race = isRace() ? rc() : null;
      $(".dh-p-sub").textContent = race ? `${def.name} · lap ${Math.min(race.laps, sim.C[v0.car * K + LAP]! + 1)} of ${race.laps} · ${clock(sim.R[1]!)}` : `Freestyle · ${num(sim.scs[v0.car]!.S[SC]!)} points`;
      $(".dh-p-sub").textContent += net.on ? " · online: the race runs on" : "";
      $(".dh-restart").hidden = net.on;
      $(".dh-totracks").textContent = net.on ? "LEAVE" : "MENU";
    }
    showCard(on ? pauseC : null);
    PD[0] = 0;
    for (const cc of [c, c2]) for (const k of ["gas", "brake", "left", "right", "nitro", "drift"]) cc.press(k, false);
    if (on) ($(".dh-resume") as HTMLButtonElement).focus({ preventScroll: true });
    else play.focus({ preventScroll: true });
    engine.wake();
  }

  // ---- the camera: chase (behind your buggy) or the whole table ----
  function frameTable(v: View) {
    const HX = sim.HX, HZ = sim.HZ, top = P.city ? 8 : 2.6, d = v.d, TABLE = v.TABLE;
    const pts = [-HX - 0.4, -1.1, -HZ - 0.4, HX + 0.4, -1.1, -HZ - 0.4, -HX - 0.4, -1.1, HZ + 0.4, HX + 0.4, -1.1, HZ + 0.4, -HX, top, -HZ, HX, top, -HZ];
    const W = d.width, H = d.height, tall = H / W > 0.75;
    TABLE.yaw = tall ? -0.5 : 0;
    TABLE.pitch = tall ? 0.95 : 0.82;
    TABLE.dist = 30;
    TABLE.tx = TABLE.ty = TABLE.ox = TABLE.oy = 0;
    TABLE.tz = 0.4;
    // On a wide stage the menu sits on the left: the preview takes the right.
    const left = mode === "menu" && W > 900 ? Math.min(W * 0.46, 600) : 8;
    d.fit(TABLE, pts, { x0: left, y0: v.safe[0]!, x1: W - 8, y1: H - v.safe[1]! });
    v.chaseO.dist = tall ? 17.5 : 14;
    v.chaseO.pitch = tall ? 0.7 : 0.55;
  }
  /** The chase target: the view's buggy (clamped to the table's edge when it goes over). */
  function aim(v: View, snap: boolean) {
    const c0 = v.car, dv = sim.cars[c0]!, p = c0 * 3, HX = sim.HX, HZ = sim.HZ;
    v.target.yaw = sim.C[c0 * K + PH] === CRASH ? v.target.yaw : dv.yaw;
    v.CTP[0] = Math.max(-HX - 1, Math.min(HX + 1, sim.pos[p]!));
    v.CTP[1] = Math.max(-1, sim.pos[p + 1]!);
    v.CTP[2] = Math.max(-HZ - 1, Math.min(HZ + 1, sim.pos[p + 2]!));
    v.VEL[0] = dv.vel[0]!; v.VEL[2] = dv.vel[2]!;
    if (snap) (v.chaseO.snap = true), chase(v.d.cam, v.target, v.chaseO, 1 / 60), (v.chaseO.snap = false);
  }
  function stepCam(v: View, dt: number) {
    const cam = v.d.cam;
    if (view) {
      aim(v, false);
      // The demo drifts the camera round a little (the attract lap's showreel).
      v.chaseO.side = mode === "demo" && !reduced ? 0.42 * Math.sin(engine.time * 0.21) : 0;
      v.chaseO.snap = reduced;
      // On a wide hero the demo sits right of centre, clear of the page's copy on the left.
      const m = chase(cam, v.target, v.chaseO, dt), k = 1 - Math.exp(-4 * dt), ox = mode === "demo" && v.d.width > 760 ? v.d.width * 0.2 : 0;
      cam.ox += (ox - cam.ox) * k;
      cam.oy -= cam.oy * k;
      return m || Math.abs(cam.ox - ox) + Math.abs(cam.oy) > 0.2;
    }
    const k = reduced ? 1 : 1 - Math.exp(-2.6 * dt);
    let moving = false;
    for (const key of CAMK) {
      let d = v.TABLE[key] - cam[key];
      if (key === "yaw") d -= TAU * Math.floor(d / TAU + 0.5);
      if (Math.abs(d) > 1e-3) (cam[key] += d * k), (moving = true);
      else cam[key] = v.TABLE[key];
    }
    return moving;
  }
  const CAMK = ["yaw", "pitch", "dist", "tx", "ty", "tz", "ox", "oy", "fov"] as const;
  function setView(_v: View, n: number) {
    view = n;
    viewK.textContent = n ? "CHASE" : "TABLE";
    dirty = true;
    engine.busy(2.5);
    engine.wake();
  }

  // ---- drawing extras: the sky, contour lines and track edges, trails, gate glows, the overlay ----
  function paintSky(ctx: CanvasRenderingContext2D, v: View) {
    const W = v.d.width, H = v.d.height;
    if (!v.sky) {
      v.sky = ctx.createLinearGradient(0, 0, 0, H);
      v.sky.addColorStop(0, P.sky0);
      v.sky.addColorStop(0.55, P.sky1);
      v.sky.addColorStop(1, P.sky2);
    }
    ctx.fillStyle = v.sky;
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
  function seg(d: Diorama, ctx: CanvasRenderingContext2D, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    if (!d.project(ax, ay, az, tmp) || tmp[2]! < 0.5 || !d.project(bx, by, bz, tmp2) || tmp2[2]! < 0.5) return false;
    ctx.moveTo(tmp[0]!, tmp[1]!);
    ctx.lineTo(tmp2[0]!, tmp2[1]!);
    return true;
  }
  /** Contour lines (one path per level), the jump lips, the pads' chevrons, then the track's (or the
   *  tables') edges (each run of segments one stroke, wider near the camera). */
  function paintLines(ctx: CanvasRenderingContext2D, v: View) {
    const d = v.d;
    ctx.lineCap = "round";
    ctx.lineWidth = P.night ? 1.3 : 1;
    for (let l = 0; l < LINES.length; l++) {
      const S = LINES[l]!;
      ctx.beginPath();
      for (let k = 0; k < S.length; k += 6) seg(d, ctx, S[k]!, S[k + 1]!, S[k + 2]!, S[k + 3]!, S[k + 4]!, S[k + 5]!);
      ctx.strokeStyle = P.lines[l]!;
      ctx.globalAlpha = P.lineA[l]!;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const t = sim.t, f = d.focal(), race = isRace() ? rc() : null;
    // Jump lips: a bright bar across the top of each kicker.
    ctx.strokeStyle = P.lip;
    const LP = sim.LIPS;
    for (let k = 0; k < LP.length; k += 4) {
      const ax = LP[k]!, az = LP[k + 1]!, bx = LP[k + 2]!, bz = LP[k + 3]!;
      ctx.beginPath();
      if (!seg(d, ctx, ax, t.height(ax, az) + 0.06, az, bx, t.height(bx, bz) + 0.06, bz)) continue;
      ctx.lineWidth = Math.max(2, (f * 0.16) / tmp[2]!);
      ctx.stroke();
    }
    // Boost pads: a lit plate on the ground, three chevrons pointing the way it pushes.
    ctx.lineJoin = "round";
    const PV = sim.PADV;
    for (let k = 0; k < PV.length; k += 4) {
      const x = PV[k]!, z = PV[k + 1]!, tx = PV[k + 2]!, tz = PV[k + 3]!, y = t.height(x, z) + 0.05;
      if (!d.project(x, y, z, tmp) || tmp[2]! < 0.5) continue;
      const Lh = sim.PAD_LEN / 2, Wd = sim.PAD_W;
      ctx.fillStyle = P.pad;
      ctx.strokeStyle = P.chev;
      ctx.lineWidth = Math.max(1.5, (f * 0.06) / tmp[2]!);
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const a = q === 0 || q === 3 ? -Lh : Lh, w = q < 2 ? -Wd : Wd, px = x + tx * a - tz * w, pz = z + tz * a + tx * w;
        d.project(px, t.height(px, pz) + 0.05, pz, tmp2);
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
        d.project(cx - tx * 0.5 - tz * cw, y, cz - tz * 0.5 + tx * cw, tmp);
        ctx.moveTo(tmp[0]!, tmp[1]!);
        d.project(cx + tx * 0.5, y, cz + tz * 0.5, tmp);
        ctx.lineTo(tmp[0]!, tmp[1]!);
        d.project(cx - tx * 0.5 + tz * cw, y, cz - tz * 0.5 - tx * cw, tmp);
        ctx.lineTo(tmp[0]!, tmp[1]!);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // The Salt Flats' drift ring: a neon circle to slide round.
    if (!race) {
      const [rx, rz, rr] = fs().park.ring as [number, number, number];
      ctx.strokeStyle = P.ledge;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      let on = false;
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU, x = rx + Math.cos(a) * rr, z = rz + Math.sin(a) * rr;
        if (!d.project(x, t.height(x, z) + 0.05, z, tmp) || tmp[2]! < 0.5) {
          on = false;
          continue;
        }
        on ? ctx.lineTo(tmp[0]!, tmp[1]!) : ctx.moveTo(tmp[0]!, tmp[1]!);
        on = true;
      }
      ctx.lineWidth = Math.max(2, (f * 0.22) / Math.max(1, tmp[2]!));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Two passes: a shoulder in the track's colour over the painted faces' saw-toothed edge (the road is
    // painted per triangle), then the neon line on it. The park strokes each table's edge in its colour.
    for (let pass = race ? 0 : 1; pass < 2; pass++) {
      const wk = pass ? 0.2 : 0.62;
      for (let pi = 0; pi < EDGES.length; pi++) {
        ctx.strokeStyle = pass ? (race ? P.edge : P.tables[pi]!) : P.track;
        const E = EDGES[pi]!, n = race ? E.length / 6 : E.length / 3, closed = !race || pi === 0, sides = race ? 2 : 1;
        for (let side = 0; side < sides; side++) {
          let w = -1;
          for (let i = 0; i < (closed ? n : n - 1); i++) {
            const a = side * n * 3 + i * 3, b = side * n * 3 + ((i + 1) % n) * 3;
            if (!d.project(E[a]!, E[a + 1]!, E[a + 2]!, tmp) || tmp[2]! < 0.5 || !d.project(E[b]!, E[b + 1]!, E[b + 2]!, tmp2) || tmp2[2]! < 0.5) {
              if (w > 0) ctx.stroke(), (w = -1);
              continue;
            }
            // Skip the stretch of a branch's edge inside the loop's track (at the joins).
            if (race && pi && t.kindAt((E[a]! + E[b]!) / 2, (E[a + 2]! + E[b + 2]!) / 2) === KIND_TRACK && race.tr.near((E[a]! + E[b]!) / 2, (E[a + 2]! + E[b + 2]!) / 2)[1] === 0 && race.tr.NR[0]! < TRACK_W / 2 - 0.2) continue;
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
  function paintTrail(ctx: CanvasRenderingContext2D, v: View, k: number) {
    const n = TRN[k * 2 + 1]!;
    if (n < 2) return;
    const d = v.d;
    ctx.strokeStyle = k ? P.cars[k]![0]! : P.tail;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    if (P.night) ctx.globalCompositeOperation = "lighter";
    const f = d.focal(), Cn = 4, mine = k === v.car;
    for (let s = 0; s < 2; s++)
      for (let cI = 0; cI < Cn; cI++) {
        const s0 = Math.floor(((n - 1) * cI) / Cn), s1 = Math.floor(((n - 1) * (cI + 1)) / Cn);
        let started = false, w = 0;
        ctx.beginPath();
        for (let q = s0; q <= s1; q++) {
          const a = (k * TRAIL + ((TRN[k * 2]! - q + TRAIL) % TRAIL)) * 6 + s * 3;
          if (!d.project(TR[a]!, TR[a + 1]!, TR[a + 2]!, tmp) || tmp[2]! < 0.5) continue;
          if (!started) (w = Math.max(1, (f * 0.09) / tmp[2]!)), ctx.moveTo(tmp[0]!, tmp[1]!), (started = true);
          else ctx.lineTo(tmp[0]!, tmp[1]!);
        }
        ctx.globalAlpha = (mine ? 0.95 : 0.6) * (1 - cI / Cn);
        ctx.lineWidth = w * (1 - (cI / Cn) * 0.6);
        ctx.stroke();
      }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  function glow(ctx: CanvasRenderingContext2D, v: View, g: number) {
    if (!P.night || !isRace()) return;
    const race = rc(), on = mode !== "menu" && race.R[0] !== DONE && g === race.C[v.car * K + NEXT]! % race.gates;
    if (!on && flash !== g) return;
    const d = v.d, m = v.gates[g]![2]!.M, w = (TRACK_W + 1.1) / 2;
    const ax = m[9]! - m[2]! * w, az = m[11]! - m[8]! * w, bx = m[9]! + m[2]! * w, bz = m[11]! + m[8]! * w, y0 = m[10]! - 2.5, y1 = m[10]! + 0.16;
    if (!d.project(ax, y0, az, tmp) || !d.project(bx, y0, bz, tmp2)) return;
    ctx.beginPath();
    ctx.moveTo(tmp[0]!, tmp[1]!);
    d.project(ax, y1, az, tmp);
    ctx.lineTo(tmp[0]!, tmp[1]!);
    d.project(bx, y1, bz, tmp);
    ctx.lineTo(tmp[0]!, tmp[1]!);
    ctx.lineTo(tmp2[0]!, tmp2[1]!);
    const k = d.focal() / Math.max(1, tmp2[2]!), a = on ? 0.5 + 0.25 * Math.sin(pulse * 6) : 0.8;
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
  function drawOverlay(ctx: CanvasRenderingContext2D, v: View) {
    if (!active(v)) return;
    const R = sim.R, d = v.d, f = d.focal(), t = sim.t, race = isRace() ? rc() : null;
    // Freestyle: each table's name over its far edge.
    if (!race)
      fs().park.tables.forEach((tb, k) => {
        if (!d.project(tb.cx, PARK_TOP + 2.2, tb.cz - TZ * 0.6, tmp) || tmp[2]! < 2 || tmp[2]! > (view ? 60 : 400)) return;
        sticker(ctx, tmp[0]!, tmp[1]!, tb.name, P.tables[k]!, P.ink, Math.max(0.7, Math.min(1.15, f / tmp[2]! / 30)));
      });
    if (mode === "menu") return;
    // Tags over the other buggies (chase view, near enough to read).
    if (view)
      for (let k = 0; k < sim.count; k++) {
        if (k === v.car) continue;
        const p = k * 3;
        if (!d.project(sim.pos[p]!, sim.pos[p + 1]! + 1.3, sim.pos[p + 2]!, tmp) || tmp[2]! < 2 || tmp[2]! > 34) continue;
        sticker(ctx, tmp[0]!, tmp[1]!, sim.name(k), P.cars[k]![0]!, P.ink, Math.max(0.6, Math.min(1, f / tmp[2]! / 26)));
      }
    if (race) {
      const tr = race.tr;
      // The shortcut's sign where a branch leaves the loop.
      for (let b = 1; b < tr.paths.length; b++) {
        const p = tr.paths[b]!, i = Math.min(p.n - 1, 4), x = p.P[i * 2]!, z = p.P[i * 2 + 1]!;
        if (!d.project(x, t.height(x, z) + 1.6, z, tmp) || tmp[2]! < 1 || tmp[2]! > 40) continue;
        sticker(ctx, tmp[0]!, tmp[1]!, p.label, P.lip, P.ink, Math.max(0.7, Math.min(1.1, f / tmp[2]! / 26)));
      }
      if (R[0] !== DONE) {
        const g = race.C[v.car * K + NEXT]! % race.gates, m = v.gates[g]![2]!.M;
        if (d.project(m[9]!, m[10]! + 1.05, m[11]!, tmp) && tmp[1]! > v.safe[0]! - 4) {
          const last = race.C[v.car * K + NEXT]! >= race.gates * race.laps;
          sticker(ctx, tmp[0]!, tmp[1]!, g ? "" + g : last ? "FINISH" : "LAP", P.gNext, P.night ? P.ink : "#ffffff", Math.max(0.7, Math.min(1.25, f / Math.max(1, tmp[2]!) / 30)));
        }
      }
    }
    if (mode !== "demo") minimap(ctx, v);
  }
  /** The minimap: the loop and its branches, the gates to come (or the park's tables), every buggy (yours ringed). */
  function minimap(ctx: CanvasRenderingContext2D, v: View) {
    const HX = sim.HX, HZ = sim.HZ, d = v.d, W = d.width, H = d.height, narrow = W < 560, MB = v.MB, race = isRace() ? rc() : null;
    if (!MB[5]) {
      const bw = narrow ? 104 : 172, s = bw / (HX * 2), bh = HZ * 2 * s;
      MB[0] = W - bw - (narrow ? 10 : 14); MB[1] = H - bh - (narrow ? 10 : 14); MB[2] = s; MB[3] = bw; MB[4] = bh; MB[5] = 1;
      v.MAP = race
        ? race.tr.paths.map((p) => {
            const out = new Float64Array(p.n * 2);
            for (let i = 0; i < p.n; i++) (out[i * 2] = MB[0]! + (p.P[i * 2]! + HX) * s), (out[i * 2 + 1] = MB[1]! + (p.P[i * 2 + 1]! + HZ) * s);
            return out;
          })
        : [];
    }
    const x0 = MB[0]!, y0 = MB[1]!, s = MB[2]!, bw = MB[3]!, bh = MB[4]!;
    ctx.fillStyle = P.ink;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.roundRect(x0 - 6, y0 - 6, bw + 12, bh + 12, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineJoin = ctx.lineCap = "round";
    if (race) {
      for (let pi = 0; pi < v.MAP.length; pi++) {
        const M = v.MAP[pi]!, n = M.length / 2;
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
      const g = race.C[v.car * K + NEXT]! % race.gates, gi = race.tr.GATE[g]!, M0 = v.MAP[0]!;
      ctx.fillStyle = P.gNext;
      ctx.beginPath();
      ctx.arc(M0[gi * 2]!, M0[gi * 2 + 1]!, 4, 0, TAU);
      ctx.fill();
    } else
      fs().park.tables.forEach((tb, k) => {
        ctx.strokeStyle = P.tables[k]!;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x0 + (tb.cx - TX + HX) * s, y0 + (tb.cz - TZ + HZ) * s, TX * 2 * s, TZ * 2 * s);
      });
    for (let k = sim.count - 1; k >= 0; k--) {
      const x = x0 + (sim.pos[k * 3]! + HX) * s, y = y0 + (sim.pos[k * 3 + 2]! + HZ) * s;
      ctx.fillStyle = P.cars[k]![0]!;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, k === v.car ? 5.5 : 4, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ---- input: keys (one or two people), the pointer, gamepads ----
  /** Gamepads seen (polled only once one has connected). */
  let pads = false;
  const GP = new Float64Array(2 * 5);
  addEventListener("gamepadconnected", () => ((pads = true), engine.wake()), sig);
  function pollPads() {
    GP.fill(0);
    if (!pads || typeof navigator.getGamepads !== "function") return;
    const list = navigator.getGamepads();
    let p = 0;
    for (let i = 0; i < list.length && p < 2; i++) {
      const g = list[i];
      if (!g || !g.connected) continue;
      const b = (n: number) => (g.buttons[n] ? g.buttons[n]!.value || (g.buttons[n]!.pressed ? 1 : 0) : 0), ax = g.axes[0] ?? 0, q = p * 5;
      GP[q] = Math.max(b(7), b(12));
      GP[q + 1] = Math.max(b(6), b(13));
      GP[q + 2] = Math.abs(ax) > 0.15 ? ax : b(15) - b(14);
      GP[q + 3] = b(0) || b(3) ? 1 : 0;
      GP[q + 4] = Math.max(b(1), b(2), b(5));
      if (GP[q]! + GP[q + 1]! + Math.abs(GP[q + 2]!) + GP[q + 3]! + GP[q + 4]! > 0.05) (moved = true), mode === "demo" && takeOver();
      p++;
    }
  }
  /** Person p's inputs into I (keys or pad, the pointer for P1 alone, a gamepad). */
  function readInput(p: number) {
    const cc = ctl(p), q = p * 5, alone = NV === 1;
    // The touch stick (pad): x steers (through axis), up is gas and down the brake, both analog.
    const sy = cc.stick.active ? cc.stick.y : 0;
    I[0] = Math.max(cc.down(GAS) || (alone && PD[0]) ? 1 : 0, GP[q]!, -sy);
    I[1] = Math.max(cc.down(BRAKE) ? 1 : 0, GP[q + 1]!, sy);
    const st = alone && PD[0] ? Math.max(-1, Math.min(1, (PD[2]! - PD[1]!) / Math.max(40, v0.d.width * 0.1))) : cc.axis("left", "right", 0);
    I[2] = Math.max(-1, Math.min(1, st + GP[q + 2]!));
    I[3] = cc.down(NITRO) || GP[q + 3] ? 1 : 0;
    I[4] = Math.max(cc.down(DRIFT) ? 1 : 0, GP[q + 4]!);
    if (I[0] || I[1] || I[2] || I[3] || I[4]) moved = true;
  }

  // ---- online: the room, the lockstep link, rematch, leaving ----
  const net = {
    on: false,
    seat: 0,
    seed: 0,
    round: 0,
    ready: false,
    peerReady: false,
    pick: { mode: "race" as "race" | "free", track: 0, rivals: 0, laps: 0 },
    link: null as Presence | null,
    abort: null as AbortController | null,
    room: Math.min(ROOM_N - 1, Math.max(0, Number(qs.get("room")) | 0)),
    code: "",
    /** Start the match on this seat: the same sim on both screens, stepped by presence. */
    begin(s: { transport: Transport; slot: number; seed: number; mode: number }) {
      const m = unpackMode(s.mode);
      net.on = true;
      net.seat = s.slot;
      net.seed = s.seed >>> 0;
      net.round = 0;
      net.ready = net.peerReady = false;
      net.pick = { mode: m.free ? "free" : "race", track: m.track, rivals: m.rivals, laps: m.laps };
      want.laps = m.laps;
      want.humans = -1;
      auto = false;
      startRace(TRACKS[m.track]!.id, net.seed);
      net.link = presence(engine, {
        transport: s.transport, slot: s.slot, players: 2,
        input: () => {
          if (paused || !result.hidden || mode !== "race") readNone();
          else pollPads(), readInput(0);
          return encode(I[0]!, I[1]!, I[2]!, I[3]!, I[4]!, (auto ? B_AUTO : 0) | (net.ready ? B_READY : 0));
        },
        step: (_e, inputs) => {
          for (let p = 0; p < 2; p++) decode(inputs[p]!, p, sim.IN, sim.AUTO);
          net.peerReady = !!(inputs[1 - net.seat]! & B_READY);
          // A rematch: both READY in the same frame (so on the same frame on both screens).
          if (sim.R[0] === DONE && inputs[0]! & B_READY && inputs[1]! & B_READY) return net.rematch();
          sim.step(1 / 60);
          if (sim.n) events();
        },
        hash: () => hashOf(sim.bytes),
      });
      showNet(`ONLINE · ROOM ${net.room} · P${s.slot + 1}`, "live");
    },
    rematch() {
      net.round++;
      net.ready = net.peerReady = false;
      sim.reset((Math.imul(net.seed, 2654435761) + net.round * 40503) >>> 0);
      startRace(def.id, 0, false);
    },
    /** Leave (or lose) the match; `menu` goes back to the menu. */
    end(menuToo: boolean) {
      net.abort?.abort();
      net.abort = null;
      const was = net.on;
      net.on = false;
      try {
        net.link?.destroy();
      } catch {}
      net.link = null;
      netChip.hidden = true;
      want.laps = o.laps ?? 0;
      if (was && menuToo && !destroyed) showMenu();
    },
  };
  const readNone = () => I.fill(0);
  function showNet(text: string, conn: string) {
    netChip.hidden = false;
    netChip.dataset.conn = conn;
    netChip.lastElementChild!.textContent = text;
  }
  /** The other screen left (or the link broke, or the two sims disagree): the match ends here. */
  function netGone(text: string) {
    net.end(false);
    mode = "menu";
    showCard(roomC);
    roomStep("gone");
    $(".dh-gone-say").textContent = text;
    say(text);
  }
  const roomForm = roomC.querySelector("form") as HTMLFormElement, field = (n: string) => roomForm.elements.namedItem(n) as HTMLInputElement;
  const roomStep = (s: "join" | "wait" | "gone") => {
    roomC.dataset.step = s;
    for (const el of roomC.querySelectorAll<HTMLElement>("[data-for]")) el.hidden = el.dataset.for !== s;
    roomC.querySelector<HTMLElement>(`[data-for="${s}"] :is(input, button)`)?.focus({ preventScroll: true });
  };
  const roomSay = (t: string) => ($(".dh-say").textContent = t);
  const showRoom = () => ((roomForm.elements.namedItem("roomShow") as HTMLOutputElement).value = String(net.room));
  showRoom();
  {
    const w = window as unknown as { __duneInvite?: string };
    field("code").value = qs.get("code") || w.__duneInvite || (() => { try { return sessionStorage.getItem("dune-hop:code") || ""; } catch { return ""; } })();
    delete w.__duneInvite;
  }
  function openRoom() {
    mode = "menu";
    showCard(roomC);
    roomStep("join");
    roomSay(ROOMS_URL ? "" : "Online play needs a room server: this build has none set.");
  }
  async function checkCode(code: string) {
    const r = await fetch(`${ROOMS_URL.replace(/^ws/, "http")}/invite`, { method: "POST", body: code, referrerPolicy: "no-referrer" }).catch(() => null);
    if (!r) return null;
    if (r.status === 429) return "slow";
    return r.ok;
  }
  roomForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ROOMS_URL) return roomSay("Online play needs a room server: this build has none set.");
    const code = field("code").value.trim().toUpperCase();
    if (code.length < 6) return roomSay("Enter the invite code you were sent.");
    roomSay("Checking the code…");
    const ok = await checkCode(code);
    if (ok === null) return roomSay("Can't reach the game server. Check your connection and try again.");
    if (ok === "slow") return roomSay("Too many tries. Wait a minute, then try again.");
    if (!ok) return roomSay("That invite code isn't on the list.");
    roomSay("");
    net.code = code;
    try {
      sessionStorage.setItem("dune-hop:code", code);
    } catch {}
    enterRoom();
  }, sig);
  const seatsEl = $(".dh-seats");
  async function enterRoom() {
    roomStep("wait");
    $(".dh-room-sub").textContent = `ROOM ${net.room} · WAITING`;
    seatsEl.innerHTML = `<li class="dh-me">P1 · YOU</li><li>OPEN SEAT</li>`;
    $(".dh-wait-say").textContent = "Waiting for player 2.";
    net.abort = new AbortController();
    const signal = net.abort.signal, mine = packMode(pick.mode === "free", Math.max(0, TRACKS.indexOf(def)), pick.rivals, Math.min(7, o.laps ?? 0));
    for (let tries = 0; ; tries++) {
      try {
        const s = await joinRoom(ROOMS_URL, net.room, net.code, mine, signal, (seat, seated) => {
          seatsEl.innerHTML = [0, 1].map((i) => `<li class="${i === seat ? "dh-me" : i < seated ? "dh-in" : ""}">${i === seat ? `P${i + 1} · YOU` : i < seated ? `P${i + 1}` : "OPEN SEAT"}</li>`).join("");
          $(".dh-wait-say").textContent = seated < 2 ? "Waiting for player 2." : "Starting…";
          $(".dh-room-sub").textContent = `ROOM ${net.room} · P${seat + 1} · ${seated} OF 2`;
        });
        if (signal.aborted || destroyed) return s.transport.close();
        net.abort = null;
        return net.begin(s);
      } catch {
        if (signal.aborted || destroyed) return;
        if (tries >= 2) return roomStep("gone"), ($(".dh-gone-say").textContent = `Room ${net.room} is full or mid-match. Try another room.`);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  for (const b of roomC.querySelectorAll<HTMLButtonElement>("[data-room]")) b.addEventListener("click", () => ((net.room = (net.room + Number(b.dataset.room) + ROOM_N) % ROOM_N), showRoom()), sig);
  $(".dh-room-back").addEventListener("click", showMenu, sig);
  $(".dh-room-menu").addEventListener("click", showMenu, sig);
  $(".dh-room-again").addEventListener("click", () => roomStep("join"), sig);
  $(".dh-room-cancel").addEventListener("click", () => (net.abort?.abort(), roomStep("join")), sig);
  $(".dh-share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?mode=online&room=${net.room}${qs.get("rooms") ? `&rooms=${encodeURIComponent(ROOMS_URL)}` : ""}${net.code ? `&code=${encodeURIComponent(net.code)}` : ""}`, k = $(".dh-share");
    try {
      if (navigator.share) await navigator.share({ title: "Dune Hop · online", text: `Race me in Dune Hop, room ${net.room}.`, url });
      else await navigator.clipboard.writeText(url), (k.textContent = "LINK COPIED");
    } catch {
      k.textContent = "COPY FAILED";
    }
  }, sig);

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
        if (next !== P) (P = next), stage.toggleAttribute("data-day", !P.night), buildAll(), (dirty = true);
      }
      if (V[0]) {
        V[0] = 0;
        for (const v of views) {
          if (!active(v)) continue;
          const vr = v.el.getBoundingClientRect(), hr = v.head.getBoundingClientRect(), cr = v.canvas.getBoundingClientRect();
          v.d.resize(cr.width || 1, cr.height || 1, Math.min(2, devicePixelRatio || 1) * FT[2]! * (NV > 1 ? 0.85 : 1));
          v.safe[0] = Math.max(8, (hr.height ? hr.bottom : vr.top) - vr.top + 8);
          v.safe[1] = 10;
          v.sky = null;
          v.MB[5] = 0;
          frameTable(v);
          if (!view) Object.assign(v.d.cam, v.TABLE);
          else aim(v, true);
        }
        hudDirty = dirty = true;
      }
    },
    step(e, dt) {
      if (cardAt >= 0 && e.time >= cardAt) (cardAt = -1), showEnd();
      let moving = false;
      if (net.on) {
        // Online: presence steps the sim (after this system); the match keeps the engine awake.
        moving = true;
        const nl = net.link;
        if (nl && nl.lost) netGone(`P${2 - net.seat} left the match.`);
        else if (nl && nl.desync >= 0) netGone("The two screens fell out of sync. Start a new match.");
        else if (nl) showNet(`ONLINE · ROOM ${net.room} · P${net.seat + 1}${nl.away ? " · RECONNECTING" : ""}${!result.hidden && net.peerReady ? " · P" + (2 - net.seat) + " WANTS A REMATCH" : ""}`, nl.away ? "wait" : "live");
      } else if (!paused && mode !== "menu") {
        pollPads();
        // Inputs per person: keys and pad (controls), the pointer (P1 alone), a gamepad, or the autopilot.
        for (let p = 0; p < sim.humans; p++) {
          readInput(p);
          for (let k = 0; k < IK; k++) sim.IN[p * IK + k] = I[k]!;
          sim.AUTO[p] = auto ? 1 : 0;
        }
        moving = sim.step(dt);
        if (sim.n) events(), (moving = true);
      }
      if (!paused || net.on) if (stepFx(dt)) moving = true;
      for (let i = 0; i < NV; i++) {
        const v = views[i]!;
        if (stepCam(v, dt)) moving = true;
        if (v.shake > 0) (v.shake = Math.max(0, v.shake - dt)), (moving = true);
        if (v.toastT > 0) (v.toastT = Math.max(0, v.toastT - dt)), (moving = true), v.toastT === 0 && (v.toastEl.hidden = true);
        if (v.countT > 0) (v.countT = Math.max(0, v.countT - dt)), (moving = true), v.countT === 0 && (v.countEl.hidden = true);
      }
      for (let k = 0; k < sim.count; k++) if (DROP[k]! > 0) (DROP[k] = Math.max(0, DROP[k]! - dt)), (moving = true);
      if (flashT > 0 && (flashT -= dt) <= 0) (flash = -1), views.forEach(paintGates), (moving = true);
      if (moving) (pulse += dt), e.busy(), (dirty = hudDirty = true);
      if ((boardT += dt) > 0.25) (boardT = 0), mode !== "menu" && boardWrite();
    },
    render() {
      if (hudDirty) {
        hudDirty = false;
        sharedHud();
        for (let i = 0; i < NV; i++) hudWrite(views[i]!), paintGates(views[i]!);
      }
      if (!dirty) return;
      dirty = false;
      for (let i = 0; i < NV; i++) {
        const v = views[i]!, cam = v.d.cam, k = v.shake * v.shake * 10, sx = Math.sin(engine.time * 71) * k, sy = Math.cos(engine.time * 53) * k * 0.7;
        if (i) copyPool(v0.dust!, v.dust!), copyPool(v0.spark!, v.spark!);
        pose(v);
        (cam.ox += sx), (cam.oy += sy);
        v.d.draw();
        (cam.ox -= sx), (cam.oy -= sy);
      }
    },
    pause() {
      PD[0] = 0;
    },
  });

  // ---- keys ----
  const MAP_K: Record<string, string> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", Space: "nitro", KeyQ: "nitro", Enter: "nitro", ShiftLeft: "drift", ShiftRight: "drift" };
  /** Two on one screen: which person a key is for (1: P2; the rest P1). */
  const P2_KEYS: Record<string, number> = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ShiftRight: 1, Enter: 1, NumpadEnter: 1, Slash: 1 };
  const MAP_P2: Record<string, string> = { NumpadEnter: "nitro", Slash: "nitro" };
  const keyMode = o.keyboard ?? (dropIn ? "page" : "focus");
  const keyHost: EventTarget = keyMode === "page" ? window : stage;
  /** The element a key came from, inside the shadow root too (a window listener sees only the host). */
  const src = (e: Event) => ((e.composedPath?.()[0] ?? e.target) as Element | null);
  const mine = (e: Event) => !src(e)?.closest?.("input,textarea,select,[contenteditable]");
  const keyOf = (code: string) => MAP_K[code] ?? (NV > 1 ? MAP_P2[code] : undefined);
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
    if (code === "KeyV" && mode !== "menu") return void (e.preventDefault(), setView(v0, view ? 0 : 1));
    if (code === "KeyR" && mode !== "menu" && !net.on) return void (e.preventDefault(), startRace(def.id));
    if (code === "KeyT" && !net.on) return void (e.preventDefault(), showMenu());
    const k = keyOf(code);
    if (!k || src(e)?.closest?.(".bui-pad")) return;
    if (mode === "menu" || paused || !result.hidden) return;
    if (code === "Enter" && src(e)?.closest?.("button") && src(e) !== play) return;
    e.preventDefault();
    if (mode === "demo") takeOver();
    if (!e.repeat) ctl(NV > 1 && P2_KEYS[code] ? 1 : 0).press(k);
    engine.wake();
  }, sig);
  keyHost.addEventListener("keyup", (ev) => {
    const code = (ev as KeyboardEvent).code, k = keyOf(code);
    if (k) ctl(NV > 1 && P2_KEYS[code] ? 1 : 0).press(k, false), c.press(k, false);
  }, sig);
  play.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    play.focus({ preventScroll: true });
    if (mode === "menu" || paused || !result.hidden || NV > 1) return;
    if (mode === "demo") takeOver();
    play.setPointerCapture(e.pointerId);
    (PD[0] = 1), (PD[1] = PD[2] = e.offsetX), (PD[3] = e.pointerId);
    engine.wake();
  }, sig);
  play.addEventListener("pointermove", (e) => void (e.pointerId === PD[3] && (PD[2] = e.offsetX)), sig);
  const up = (e: PointerEvent) => void (e.pointerId === PD[3] && ((PD[0] = 0), (PD[3] = -1)));
  play.addEventListener("pointerup", up, sig);
  play.addEventListener("pointercancel", up, sig);
  function toggleMute() {
    snd.on = !snd.on;
    paintMute();
  }
  muteK.addEventListener("click", toggleMute, sig);
  viewK.addEventListener("click", () => mode !== "menu" && setView(v0, view ? 0 : 1), sig);
  $(".dh-k-tracks").addEventListener("click", () => (net.on ? setPaused(true) : showMenu()), sig);
  $(".dh-k-pause").addEventListener("click", () => setPaused(!paused), sig);
  $(".dh-resume").addEventListener("click", () => setPaused(false), sig);
  thePad.el.addEventListener("pointerdown", () => (mode === "demo" && takeOver(), engine.wake()), sig);
  $(".dh-padk").addEventListener("click", swapPad, sig);
  for (const s of hud.querySelectorAll<HTMLElement>("[data-seg]"))
    for (const b of s.querySelectorAll<HTMLButtonElement>("button"))
      b.addEventListener("click", () => {
        if (s.dataset.seg === "mode") pick.mode = b.dataset.v === "free" ? "free" : "race";
        else pick.players = b.dataset.v === "2" ? "2" : b.dataset.v === "net" ? "net" : "1";
        store.set("menu", JSON.stringify({ mode: pick.mode, players: pick.players === "net" ? "1" : pick.players, rivals: pick.rivals }));
        setup(pick.mode, 1, 3, def.id);
        menuWrite();
        dirty = true;
        engine.wake();
      }, sig);
  $(".dh-rivk").addEventListener("click", () => ((pick.rivals = pick.rivals ? 0 : 3), store.set("menu", JSON.stringify({ mode: pick.mode, players: pick.players === "net" ? "1" : pick.players, rivals: pick.rivals })), menuWrite()), sig);
  $(".dh-start").addEventListener("click", () => (pick.players === "net" ? openRoom() : startRace(def.id)), sig);
  paintPad();
  $(".dh-restart").addEventListener("click", () => startRace(def.id), sig);
  $(".dh-totracks").addEventListener("click", showMenu, sig);
  $(".dh-r-again").addEventListener("click", () => {
    if (!net.on) return startRace(def.id);
    net.ready = true;
    $(".dh-r-again").textContent = "WAITING FOR P" + (2 - net.seat);
  }, sig);
  $(".dh-r-next").addEventListener("click", () => startRace(TRACKS[(TRACKS.indexOf(def) + 1) % TRACKS.length]!.id), sig);
  $(".dh-r-tracks").addEventListener("click", showMenu, sig);
  if (dropIn) L.style(document.documentElement, "overflow", "hidden");

  stage.toggleAttribute("data-day", !P.night);
  buildAll();
  setView(v0, 0);
  if (o.attract) (pick.mode = "race"), (pick.players = "1"), startRace(def.id, o.seed ?? 1);
  else if (pick.players === "net" && qs.get("mode") === "online") showMenu(), openRoom();
  else showMenu();
  engine.start();

  const api = {
    engine,
    get race() {
      return sim;
    },
    get track() {
      return sim.kind === "free" ? "freestyle" : def.id;
    },
    /** Race now (a track id, else the current one); `opts` sets the mode and the people first. */
    start(id?: string, opts: { mode?: "race" | "free"; players?: 1 | 2; rivals?: number } = {}) {
      if (opts.mode) pick.mode = opts.mode;
      else if (id) pick.mode = "race";
      if (opts.players) pick.players = opts.players === 2 ? "2" : "1";
      if (opts.rivals !== undefined) pick.rivals = opts.rivals ? 3 : 0;
      startRace(id ?? def.id);
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /** Take the wheel from the demo lap. */
    takeOver,
    /** The menu. */
    menu: showMenu,
    /** End the race now (the result card follows). */
    finish(_won?: boolean) {
      if (mode === "menu" || net.on) return;
      sim.finish();
      if (sim.n) events();
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
    /** The online link (frame, stalls, desync, lost), or null. */
    get net() {
      return net.link;
    },
    /** The state for tests and harnesses. */
    getSnapshot() {
      const R = sim.R, C = sim.C, me = v0.car, v = sim.cars[me]!, o2 = me * K;
      const status = destroyed ? "destroyed" : mode === "menu" ? "idle" : paused ? "paused" : !result.hidden ? (isRace() ? (C[o2 + PLACE] === 1 ? "won" : "gameover") : fs().winner() === me ? "won" : "gameover") : "running";
      const car = (c0: number) => ({ x: sim.pos[c0 * 3]! * 20, y: sim.pos[c0 * 3 + 2]! * 20, angle: sim.cars[c0]!.yaw, speed: sim.cars[c0]!.speed, score: sim.scs[c0]!.S[SC]!, table: isRace() ? -1 : C[c0 * K + FTABLE]!, transfers: isRace() ? 0 : C[c0 * K + XFERS]!, place: isRace() ? C[c0 * K + PLACE]! : 0, gas: sim.IN[c0 * IK]!, brake: sim.IN[c0 * IK + 1]!, steer: sim.IN[c0 * IK + 2]! });
      // A point on the racing line about 4 m ahead of your car (race only): what a driver looks at.
      const aim = () => {
        const tr = rc().tr, pi = C[o2 + PI_]!, p = tr.paths[pi]!, i = pi ? Math.min(p.n - 1, C[o2 + IDX]! + 8) : (C[o2 + IDX]! + 8) % p.n;
        return { x: p.P[i * 2]! * 20, y: p.P[i * 2 + 1]! * 20 };
      };
      return {
        status, mode, kind: sim.kind, track: api.track, phase: R[0] === COUNT ? "count" : R[0] === RUN ? "race" : "done", elapsed: R[1]!, place: isRace() ? C[o2 + PLACE]! : 0, lap: isRace() ? C[o2 + LAP]! : 0, laps: isRace() ? rc().laps : 0, gate: isRace() ? C[o2 + NEXT]! : 0,
        score: sim.scs[me]!.S[SC]!, combo: sim.scs[me]!.S[CB]!, nitro: sim.N[me * 2]!, crashed: C[o2 + PH] === CRASH, view: view ? "chase" : "table", speed: v.speed, air: v.air, lapStart: isRace() ? C[o2 + LAPT]! : 0,
        players: sim.humans, split: NV > 1, online: net.on, seat: net.seat, table: isRace() ? -1 : C[o2 + FTABLE]!, transfers: isRace() ? 0 : C[o2 + XFERS]!, best: freeBest,
        cars: Array.from({ length: sim.humans }, (_, i) => car(i)),
        net: net.link ? { frame: net.link.frame, desync: net.link.desync, stalls: net.link.stalls, lost: net.link.lost } : null,
        player: { x: sim.pos[me * 3]! * 20, y: sim.pos[me * 3 + 2]! * 20, angle: v.yaw },
        aim: isRace() ? aim() : null,
      };
    },
    /** Your buggy's screen point (CSS px from the canvas's top left), as of the last draw. */
    carScreen() {
      v0.d.project(sim.pos[v0.car * 3]!, sim.pos[v0.car * 3 + 1]!, sim.pos[v0.car * 3 + 2]!, tmp);
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
