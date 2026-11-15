# `easyfx/1` format

One JSON file per effect: `effects/<id>.easyfx.json` in the workspace (ids use `a-z 0-9 _ -`). A workspace file
with the same id as a preset replaces it. `easyfx check <id>` validates and prints errors and warnings with JSON paths.

```json
{
  "format": "easyfx/1",
  "th": "พลุรายอสีทอง", "en": "Hari Raya fireworks (gold)",
  "category": "festival", "tags": ["raya", "fireworks"],
  "base": "raya_fireworks",
  "set": { "seed": 2026, "1.ramp": ["#fff6c8", "#ffd86a", "#f4ae3d", "#c46a28"] }
}
```

| Field | |
| --- | --- |
| `format` | always `"easyfx/1"` |
| `th`, `en` | display names (default: the base preset's) |
| `category` | `combat` · `ambient` · `nature` · `reward` · `festival` · `food` |
| `tags` | free tags used by `list --tag` and `export --tag` |
| `base` | built-in preset to start from |
| `params` | full params (replace the base params); one of `base` / `params` is required |
| `set` | overrides applied last (below) |

## `set` keys

| Key | Applies to |
| --- | --- |
| `size`, `height`, `frames`, `fps`, `loop`, `seed`, `anchor` | top level |
| `count`, `ramp`, `emitter.x` … | the **first particle layer** |
| `2.ramp`, `0.emitter.r` | layer by index |
| `*.gravity` | every layer that has the key |

On the CLI (`--set`), values are JSON (`true`, `0.4`, `[1,2]`) or a comma-separated hex list (`#fff,#f4ae3d`).

## Params

| Field | Range | |
| --- | --- | --- |
| `size` | 8–128 | frame width in px (and height unless `height`) |
| `height` | 8–128 | optional frame height |
| `frames` | 1–64 | |
| `fps` | 1–60 | |
| `loop` | bool | stream layers wrap seamlessly; one-shots (`false`) free themselves in Godot / Pixi |
| `seed` | uint32 | same seed → same pixels everywhere |
| `anchor` | `{x, y}` fractions | engine origin; default: first particle emitter |
| `layers` | 1–8 | drawn in order (later on top) |

Positions are fractions of the frame (0..1, a little outside is allowed). Speeds are px/frame, gravity and wind
px/frame² (positive = down / right), angles in degrees (0 right, -90 up), `spread` is the full cone.

### `particles` layer (default kind)

| Field | |
| --- | --- |
| `emit` | `burst` (all start at `delay` + `delayJitter`) or `stream` (spread over the loop; wraps seamlessly) |
| `count` 0–400, `lifetime` 1–240 frames, `lifeJitter` 0–1 | |
| `speed` 0–32, `speedJitter` 0–1, `angle`, `spread` 0–360 | |
| `gravity`, `wind` −4–4, `drag` 0–0.95 | constant acceleration with exponential drag (closed form, no step drift) |
| `emitter` | `{shape: point\|line\|circle\|ring\|rect, x, y, w?, h?, r?, radial?}` (`radial` aims away from the centre) |
| `shape` | `pixel square disc plus star glint spark ring leaf petal confetti coin drop lantern` |
| `sizeStart`, `sizeEnd` 0–32, `sizeMode` | `linear` or `pulse` (start → end → start) |
| `ramp` 1–12 hex, `rampMode` | colours over life, or `random` = one ramp colour per particle. `coin`, `lantern`, `drop` read the ramp as highlight / body / rim |
| `outline` | 1px hex outline around the layer |
| `fade`, `fadeIn` 0–1 | ordered-dither fade out from / fade in until that life fraction |
| `swirl` deg/frame, `wobble` px, `wobbleFreq`, `wobbleShared` | orbit the emitter; sideways sine; one shared curve for smoke threads |
| `flicker` 0–1, `spin`, `floor`, `alpha` | blink, leaf/coin spin, landing line (y fraction), opacity |

### `glow` layer

`{kind: "glow", x, y, radius 0.5–64, ramp (inner → outer), pulse? 0–1, cycles?, flicker? 0–1, alpha?}`: a
dithered halo whose density falls off with distance, so it stays pixel-crisp.

### `arc` layer

`{kind: "arc", x, y, radius, thickness, from, to (degrees), sweep (frames), lag?, delay?, ramp, outline?, alpha?}`:
a slash: the head sweeps `from → to`, the tail follows `lag` frames later, tapered at both ends.

### `prop` layer

`{kind: "prop", prop, x, y (bottom centre), bob? px, alpha?}` with `torch logs krathong pelita incense lantern ripples
stall_pot`. Props are generic objects: no figures, no script. Put a particle emitter at the prop's flame or rim (see the `torch_fire`, `pelita_flicker` and `incense_smoke` presets).

## Warnings

* `delay` after the last frame, `stream` layer in a non-looping effect.
* More than 800 particles alive at once (slow to render, still valid).
* No particle layer (no `CPUParticles2D` preset will be exported).
