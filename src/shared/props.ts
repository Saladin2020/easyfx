import type { PropName } from "./types.js";

/** Shared pixel palette: teak ink + the Easy Sprite / Easy Scene village colours. */
export const PROP_PAL: Record<string, string> = {
  o: "#1a120b", k: "#2a221c",
  b: "#8a5a3c", B: "#5a3a22", l: "#c9956c",
  g: "#3f7d52", G: "#6fae5a", d: "#2a5a3a",
  y: "#f4ae3d", Y: "#ffd86a", n: "#e8604a",
  r: "#cc3a34", R: "#741a22",
  m: "#c8a45a", M: "#8a6a44",
  w: "#fbf4ea", W: "#e8c4a0",
  s: "#7d7f8c", S: "#b4aa9a",
  c: "#7cc8e8", u: "#4f8ac8", C: "#2c6aa8",
};

/** Rows of palette chars, '.' = empty. Anchored at the bottom centre. `emit` = flame / smoke point(s) relative to the anchor. */
export interface Stamp {
  rows: string[];
  emit: Array<[number, number]>;
}

export const STAMPS: Record<Exclude<PropName, "ripples">, Stamp> = {
  torch: {
    rows: [
      "oMMMMMo",
      "oMnynMo",
      ".oMMMo.",
      "..obo..",
      "..olo..",
      "..oBo..",
      "..obo..",
      "..olo..",
      "..oBo..",
      "..obo..",
      "..ooo..",
    ],
    emit: [[0, -11]],
  },
  logs: {
    rows: [
      ".oo..........oo.",
      "oblo........olbo",
      ".oblo......olbo.",
      "..obloooooolbo..",
      ".soobBbbbbbBboos",
      "sSsoooooooooosSs",
    ],
    emit: [[0, -3]],
  },
  krathong: {
    rows: [
      "......ow.......",
      "......ow.......",
      "...oyYowoYyo...",
      "..oynYYwYYnyo..",
      ".oGgGgGgGgGgGo.",
      "ogdgdgdgdgdgdgo",
      ".oddddddddddo..",
      "..oooooooooo...",
    ],
    emit: [[-1, -8]],
  },
  pelita: {
    rows: [
      "...o...",
      "..oMo..",
      ".oMmMo.",
      "oMmmmMo",
      ".oMMMo.",
      "..olo..",
      "..obo..",
      "..olo..",
      "..oBo..",
      "..olo..",
      "..obo..",
      "..olo..",
      "..oBo..",
      "..ooo..",
    ],
    emit: [[0, -14]],
  },
  incense: {
    rows: [
      "..n..n..n..",
      "..R..R..R..",
      "..R..R..R..",
      "..R..R..R..",
      "..R..R..R..",
      "ooooooooooo",
      "oMmmMmMmmMo",
      "oMyMMyMMyMo",
      ".oMMMMMMMo.",
      "..ooooooo..",
    ],
    emit: [[-3, -10], [0, -10], [3, -10]],
  },
  lantern: {
    rows: [
      "....k....",
      "....k....",
      "..ommmo..",
      ".orrnrro.",
      "orrnYnrro",
      "orrnYnrro",
      "orrnYnrro",
      ".orrnrro.",
      "..ommmo..",
      "...oyo...",
      "...oyo...",
      "....y....",
    ],
    emit: [[0, -7]],
  },
  stall_pot: {
    rows: [
      "....oooo....",
      ".oooSSSSooo.",
      "oSSSSSSSSSSo",
      "oooooooooooo",
      "osssssssssso",
      "osSsssssSsso",
      "osssssssssso",
      ".oooooooooo.",
      ".ok......ko.",
    ],
    emit: [[0, -9]],
  },
};
