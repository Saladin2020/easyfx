# Credits

## Effects, shapes and props (CC0 1.0)

* Every particle shape, glow, slash arc and prop (torch, logs, krathong, pelita, incense holder, lantern, ripples,
  stall pot) is **drawn from code** at render time (`src/shared/sim.ts`, `src/shared/props.ts`): no source images,
  no AI generation, no network calls. The 28 presets, the sample effects (`samples/effects/`) and everything you
  render or export from them are dedicated to the public domain (CC0 1.0): use them anywhere, no attribution required.
* Content rules for the festival set: generic objects and light only; no people, no depiction of the Prophet or of
  sacred figures, and no scripture or Arabic calligraphy as decoration.

## Fonts

* **Kanit** and **Press Start 2P** (SIL Open Font License 1.1) appear only in the README art (`docs/`). No font is
  bundled or needed at runtime.

## Runtimes

* PixiJS v8 is **not** bundled: the exported `index.html` loads `./pixi.min.js` if you drop it next to the file,
  otherwise the jsDelivr CDN (MIT).
* Godot exports target Godot 4.3+ (MIT); nothing from the engine is included.
