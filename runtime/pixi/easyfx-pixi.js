/**
 * Easy FX loader for PixiJS v8 (no build step, no dependencies besides the PIXI global you pass in).
 *
 *   import { loadFx } from "./easyfx-pixi.js";
 *   const fx = await loadFx(PIXI, "./easyfx.json");          // every sheet in the manifest
 *   fx.play(app.stage, "coin_burst", 120, 200);               // one-shot: removes itself when done
 *   const fire = fx.play(app.stage, "campfire", 64, 180);     // looping: keep the sprite, destroy it yourself
 *   const s = fx.create("rain", { loop: true });              // AnimatedSprite you place yourself
 *
 * Sprites are anchored at the effect origin (emitter / ground point) and use nearest-neighbour sampling.
 */
export async function loadFx(PIXI, manifestUrl, opts = {}) {
  const base = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/");
  const manifest = await (await fetch(base.href)).json();
  const only = opts.only ? new Set(opts.only) : null;
  const effects = manifest.effects.filter((e) => !only || only.has(e.id));
  const sheets = {};
  await Promise.all(
    effects.map(async (e) => {
      const sheet = await PIXI.Assets.load(new URL(e.sheet, base).href);
      if (sheet.textureSource) sheet.textureSource.scaleMode = "nearest";
      sheets[e.id] = sheet;
    }),
  );
  const byId = Object.fromEntries(effects.map((e) => [e.id, e]));

  function create(id, o = {}) {
    const e = byId[id];
    if (!e) throw new Error(`easyfx: unknown effect "${id}" (have ${Object.keys(byId).join(", ")})`);
    const s = new PIXI.AnimatedSprite(sheets[id].animations[id]);
    s.label = `easyfx:${id}`;
    s.anchor.set(e.anchor.x / e.width, e.anchor.y / e.height);
    s.animationSpeed = (o.speed ?? 1) * (e.fps / 60);
    s.loop = o.loop ?? e.loop;
    if (o.x !== undefined) s.position.set(o.x, o.y ?? 0);
    if (o.scale) s.scale.set(o.scale);
    if (!s.loop) {
      s.onComplete = () => {
        if (o.replay) {
          setTimeout(() => !s.destroyed && s.gotoAndPlay(0), o.replayGap ?? 600);
        } else if (o.autoRemove !== false) {
          s.destroy();
        }
      };
    }
    s.play();
    return s;
  }

  return {
    manifest,
    sheets,
    ids: effects.map((e) => e.id),
    info: (id) => byId[id],
    create,
    /** create + addChild. One-shots remove themselves unless { autoRemove: false } or { replay: true }. */
    play(parent, id, x = 0, y = 0, o = {}) {
      const s = create(id, { ...o, x, y });
      parent.addChild(s);
      return s;
    },
  };
}
