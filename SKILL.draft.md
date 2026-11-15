---
name: easyfx-effects
description: >-
  Use when a game needs pixel particle effects or VFX (hit sparks, slashes, explosions, dust, smoke, fire,
  rain, leaves, fireflies, coin / heal / level-up, steam, Loy Krathong lanterns, Songkran splash, incense,
  Hari Raya pelita and fireworks) as PNG sprite sheets, Godot 4.3+ SpriteFrames / CPUParticles2D or a PixiJS
  v8 spritesheet; built from 28 seeded presets, not for drawing new art.
---
# Easy FX effects

Easy FX **simulates, renders and exports** `easyfx/1` effects from seeded presets. It does not draw new artwork.
Read `/workspace/indie-studio/tools/EASYFX.md` for paths, commands, MCP args and import details. Full format:
`/workspace/indie-studio/tools/easyfx/docs/FORMAT.md`.

## When to use

- A game needs combat, ambient, nature, reward, food or festival effects sized for 48px characters.
- You need sprite sheets with frame timing, Godot `AnimatedSprite2D` scenes / `CPUParticles2D` presets, or a Pixi
  spritesheet with `easyfx-pixi.js`.

## Setup

Install: `/workspace/indie-studio/tools/easyfx`. CLI: `node /workspace/indie-studio/tools/easyfx-cli.mjs`.
Game files go under `/workspace/indie-studio/projects/<Name>/`; init that folder once. Ports: editor 8848,
MCP HTTP 8849, Vite 5180.

## Steps

1. **Pick.** `list` (or `--tag festival`) and `show <id>`. Never invent preset, shape, emitter or prop ids.
2. **Tweak and look.** Render with `--seed` and `--set` until it reads well, and open the PNG:

   ```bash
   CLI="node /workspace/indie-studio/tools/easyfx-cli.mjs"
   OUT=/workspace/indie-studio/projects/<Name>
   $CLI init --workspace "$OUT"
   $CLI render campfire --workspace "$OUT" --scale 4 --seed 7 --set count=30 --out "$OUT/fx-campfire.png"
   ```

3. **Save** the variant: `$CLI new <id> --from <preset> --set k=v --en "…" --workspace "$OUT"`, then `check <id>`.
4. **Export** to a fresh folder (`--out` does not clear old files):
   `$CLI export <ids…> --preset godot --workspace "$OUT" --out "$OUT/exports/fx-godot"` (or `pixi`, `png`, `json`).
5. **Credit** every effect (id, base preset, seed, export path, CC0) in `ASSET_MANIFEST.md`.
6. **Hand off:** Godot `EasyFx.spawn(parent, id, pos)` from `easyfx/easyfx.gd`; Pixi `loadFx(PIXI, "easyfx.json")`.
   Nearest filter, integer scale. Prefer the sheets for exact pixels; the `CPUParticles2D` presets are approximations.

MCP: `workspace_info` → `write_effect` (dryRun) → `write_effect` → `render_effect` → `export_fx`.

## Content rules

- Festival effects are objects and light only: lanterns, krathong, pelita, incense, fireworks, water.
- Never depict the Prophet or sacred figures, and never use Quran verses or Arabic calligraphy as decoration.
- Keep the village multicultural: Raya effects sit beside Loy Krathong, Songkran and shrine/temple incense; don't
  remove or replace another culture's effects.

## Quality checklist

- [ ] Every id came from `list`; `check` exits 0.
- [ ] The render was looked at (loops have no pop at the seam; one-shots end empty).
- [ ] Exports went to dedicated folders; each effect is in `ASSET_MANIFEST.md`.
