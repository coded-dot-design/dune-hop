// Site facts: the base path, the version, the links out. One source for every page.
import pkg from "../../package.json";
import build from "../../dist/build.json";
export const VERSION: string = pkg.version;
export const FIZLET: string = build.fizlet;
/** The game's measured size (gzip bytes of dist/dune-hop.mjs, written by scripts/build.mjs). */
export const GZIP: number = build.gzip["dune-hop.mjs"];
export const REPO = "https://github.com/coded-dot-design/dune-hop";
export const FIZLET_URL = "https://fizlet.com/";
export const HUB = "https://domvirus.com/";
export const base = (path = "") => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path}`;
