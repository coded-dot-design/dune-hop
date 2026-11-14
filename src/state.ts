// Every typed array a maker creates, as byte views: the whole state of a brick that keeps some of it
// out of reach (@fzlt/core/drive 0.22 keeps its suspension's last compression, wheel spin rates and
// flags in closure arrays). A rollback (src/rollback.ts) must restore all of a car, or a corrected
// frame runs from a different car than the first time and the screens drift apart. Made once, when
// the sim is built (the constructors are swapped for the call only, synchronously); no cost per frame.
// A brick candidate for @fzlt/core/drive: one `bytes` view of its state, so nobody needs this.
const KINDS = ["Float64Array", "Float32Array", "Int32Array", "Uint32Array", "Int8Array", "Uint8Array", "Int16Array", "Uint16Array"] as const;

/** Run `make`; return what it made and a byte view of each typed array buffer it created. */
export function withState<T>(make: () => T): [T, Uint8Array[]] {
  const g = globalThis as unknown as Record<string, unknown>, got: ArrayBufferView[] = [], keep = KINDS.map((k) => g[k]);
  KINDS.forEach((k, i) => {
    const Real = keep[i] as new (...a: unknown[]) => ArrayBufferView;
    g[k] = new Proxy(Real, { construct: (T, a) => ((got[got.length] = new (T as new (...a: unknown[]) => ArrayBufferView)(...a)), got[got.length - 1]!) });
  });
  let made: T;
  try {
    made = make();
  } finally {
    KINDS.forEach((k, i) => (g[k] = keep[i]));
  }
  const seen = new Set<ArrayBufferLike>(), out: Uint8Array[] = [];
  for (const a of got) if (!seen.has(a.buffer)) seen.add(a.buffer), out.push(new Uint8Array(a.buffer));
  return [made!, out];
}
