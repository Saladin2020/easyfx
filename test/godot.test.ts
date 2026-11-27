/**
 * Optional Godot check: GODOT=/path/to/godot npx vitest run test/godot.test.ts
 * Exports every effect, imports the project headless, then test_fx.gd loads every SpriteFrames (frame count,
 * size, fps, loop), instantiates every AnimatedSprite2D scene and counts the CPUParticles2D nodes.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportFx } from "../src/lib/export.js";
import { PRESETS } from "../src/shared/presets.js";
import { tempWorkspace } from "./helpers.js";

const GODOT = process.env.GODOT;
let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  if (GODOT) ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup?.());

describe.skipIf(!GODOT)("Godot export", () => {
  it("SpriteFrames, scenes and particle presets load", async () => {
    const out = path.join(root, "exports", "godot");
    await exportFx(root, { preset: "godot", out });
    // Godot 4.3 has no --import flag; editor passes import the assets (the editor may crash on quit — ignored, so run twice).
    for (let i = 0; i < 2; i++) spawnSync(GODOT!, ["--headless", "--editor", "--quit", "--path", out], { encoding: "utf8", timeout: 180_000 });
    const run = spawnSync(GODOT!, ["--headless", "--path", out, "--script", "res://test_fx.gd"], { encoding: "utf8", timeout: 120_000 });
    expect(run.stdout).toMatch(/^OK$/m);
    expect(run.stdout).toMatch(/^W\| weather storm tiles=8 ok$/m);
    expect(run.stdout).toMatch(/^L\| lighting lamps=8 ok$/m);
    expect(run.stdout).toMatch(/^D\| flood depths=\[1, 4, 10, 18, 30\] ok$/m);
    expect(run.stdout.match(/^F\| .* ok$/gm)?.length).toBe(PRESETS.length + 3);
    expect(run.stdout).toMatch(/^F\| campfire frames=12 loop=true particles=2 ok$/m);
    expect(run.stdout).toMatch(/^F\| explosion_big frames=14 loop=false particles=5 ok$/m);
    // the demo scene (every effect, one-shots replaying) runs without script errors
    const main = spawnSync(GODOT!, ["--headless", "--path", out, "--quit-after", "120"], { encoding: "utf8", timeout: 120_000 });
    expect(main.stderr + main.stdout).not.toMatch(/SCRIPT ERROR|Parse Error/);
  }, 600_000);
});
