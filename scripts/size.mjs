// The size of every build, gzip, against the budget. Board games have no fixed cap (the size ledger
// tracks them); this budget is the first measured build plus room, raised only with a measured reason.
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
// 72,000 → 76,000 (online for up to four: the lobby, names, lockstep that survives a leaver): measured
// +2,658 B gzip over 0.2.1's 70,877 (dune-hop.js), leaving ~2.5 KB of room.
// 76,000 → 86,000 (0.3.0: BATTLE items and their AI, the tumble that rights itself, King of the Table,
// and @fzlt/core/fx's blasts for the hits, ~2.8 KB of it): measured in the size ledger note of the PR.
// 86,000 → 88,000 (long-travel suspension on @fzlt/core 0.24.0: the drive brick's suspension options,
// its class model and its `touch` now in the build, the swinging arms): measured +1,973 B gzip over
// main's 84,804 (dune-hop.js, 0.3.0 + wheel parts), leaving ~1.3 KB of room.
const BUDGET = 88_000;
let failed = false;
for (const file of readdirSync("dist").filter((f) => /\.m?js$/.test(f)).sort().map((f) => `dist/${f}`)) {
  const gz = gzipSync(readFileSync(file)).length, ok = gz <= BUDGET;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "OVER"} ${file} ${gz.toLocaleString("en-US")} / ${BUDGET.toLocaleString("en-US")} bytes gzip`);
}
if (failed) process.exit(1);
