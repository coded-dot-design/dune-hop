// dist/dune-hop.mjs (module) and dist/dune-hop.js (one script for any page, global duneHop): the game,
// the Fizlet bricks it uses (@fzlt/core, bundled: no runtime dependencies) and the Board UI kit's CSS.
import { build, transform } from "esbuild";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const core = JSON.parse(readFileSync(require.resolve("@fzlt/core/package.json"), "utf8")).version;
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
const css = async (file) => (await transform(readFileSync(file, "utf8"), { loader: "css", minify: true })).code.trim();
const kit = await css(require.resolve("@fzlt/core/ui/board-ui.css")), game = await css("src/game.css");
const common = {
  define: { __KIT_CSS__: JSON.stringify(kit), __GAME_CSS__: JSON.stringify(game) },
  bundle: true, minify: true, target: "es2022", legalComments: "none", logLevel: "warning",
  banner: { js: `/* Dune Hop ${version} · MIT © Chris Cooley · built on Fizlet ${core} */` },
};
await build({ ...common, entryPoints: ["src/index.ts"], format: "esm", outfile: "dist/dune-hop.mjs" });
await build({ ...common, entryPoints: ["src/index.ts"], format: "iife", globalName: "duneHop", outfile: "dist/dune-hop.js" });
const size = (f) => gzipSync(readFileSync(f)).length;
writeFileSync("dist/build.json", JSON.stringify({ version, fizlet: core, gzip: { "dune-hop.mjs": size("dist/dune-hop.mjs"), "dune-hop.js": size("dist/dune-hop.js") } }, null, 2) + "\n");
console.log(`Built Dune Hop ${version} on @fzlt/core ${core}: dist/dune-hop.mjs, dist/dune-hop.js`);
