/**
 * Flood water geometry shared by the Pixi and Godot overlays (easyfx-pixi.js `flood()`, easyfx.gd `flood()`):
 * Easy NPC flood level 0..1 → water depth in px above the ground line of a side-view scene.
 * Stages follow Easy NPC: puddles 0.15 · ankle 0.35 · knee 0.6 · waist 0.85 (for 48 px Easy Sprite characters).
 */
export const FLOOD_DEPTH: Array<[number, number]> = [[0, 0], [0.15, 1], [0.35, 4], [0.6, 14], [0.85, 24], [1, 30]];

/** Depth in px for a level; `rise` scales the 30 px reference (characters 48 px tall). */
export function floodDepth(level: number, rise = 30): number {
  const l = Math.min(1, Math.max(0, level));
  for (let i = 1; i < FLOOD_DEPTH.length; i++) {
    const [a, da] = FLOOD_DEPTH[i - 1]!;
    const [b, db] = FLOOD_DEPTH[i]!;
    if (l <= b) return Math.round((da + ((l - a) / (b - a)) * (db - da)) * (rise / 30));
  }
  return Math.round(rise);
}

/** Screen y of the water surface for a scene whose walkable ground is at `ground`. */
export const floodLine = (level: number, ground: number, rise = 30) => ground - floodDepth(level, rise);
