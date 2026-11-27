/**
 * Easy FX loader for PixiJS v8 (no build step, no dependencies besides the PIXI global you pass in).
 *
 *   import { loadFx } from "./easyfx-pixi.js";
 *   const fx = await loadFx(PIXI, "./easyfx.json");          // every sheet in the manifest
 *   fx.play(app.stage, "coin_burst", 120, 200);               // one-shot: removes itself when done
 *   const fire = fx.play(app.stage, "campfire", 64, 180);     // looping: keep the sprite, destroy it yourself
 *   const s = fx.create("rain", { loop: true });              // AnimatedSprite you place yourself
 *   const w = fx.weather(app.stage, "storm", { width: 640, height: 360, scale: 2 }); w.set("fog");  // Easy NPC weather
 *
 * Sprites are anchored at the effect origin (emitter / ground point) and use nearest-neighbour sampling.
 */
/** Easy NPC weather → overlay effect + screen tint (matches easynpc WEATHER_INFO). */
export const WEATHER_FX = {
  clear: { fx: null, tint: 0x000000, alpha: 0 },
  cloudy: { fx: null, tint: 0x3a4250, alpha: 0.12 },
  rain: { fx: "rain", tint: 0x24324a, alpha: 0.22 },
  storm: { fx: "storm_rain", tint: 0x141c2c, alpha: 0.38 },
  wind: { fx: "wind_gust", tint: 0x000000, alpha: 0 },
  fog: { fx: "fog_drift", tint: 0xdde3e8, alpha: 0.28 },
};

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
    /**
     * Full-screen weather layer: a tint rect + the weather's overlay effect tiled over { width, height }.
     * Returns a Container with .set(kind) and .resize(w, h). Unknown / missing effects fall back to tint only.
     */
    weather(parent, kind = "clear", o = {}) {
      const c = new PIXI.Container();
      c.label = "easyfx-weather";
      c.eventMode = "none";
      const tint = new PIXI.Graphics();
      const tiles = new PIXI.Container();
      c.addChild(tint, tiles);
      let w = o.width ?? 640, h = o.height ?? 360, cur = "clear";
      const scale = o.scale ?? 1;
      const build = () => {
        const info = WEATHER_FX[cur] ?? WEATHER_FX.clear;
        tint.clear().rect(0, 0, w, h).fill({ color: info.tint, alpha: info.alpha });
        for (const t of tiles.removeChildren()) t.destroy();
        if (!info.fx || !byId[info.fx]) return;
        const e = byId[info.fx];
        const tw = (e.frameWidth ?? e.width ?? e.size ?? 48) * scale, th = (e.frameHeight ?? e.height ?? e.size ?? 48) * scale;
        let k = 0;
        for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) {
          const s = create(info.fx, { loop: true, scale });
          s.anchor?.set(0, 0);
          s.position.set(x, y);
          s.gotoAndPlay((k++ * 3) % s.totalFrames);
          tiles.addChild(s);
        }
      };
      c.set = (k) => { if (k !== cur) { cur = k; build(); } return c; };
      c.resize = (nw, nh) => { w = nw; h = nh; build(); return c; };
      c.kind = () => cur;
      cur = kind;
      build();
      parent.addChild(c);
      return c;
    },
    /** create + addChild. One-shots remove themselves unless { autoRemove: false } or { replay: true }. */
    play(parent, id, x = 0, y = 0, o = {}) {
      const s = create(id, { ...o, x, y });
      parent.addChild(s);
      return s;
    },
  };
}
