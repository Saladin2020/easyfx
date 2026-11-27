/**
 * Easy FX loader for PixiJS v8 (no build step, no dependencies besides the PIXI global you pass in).
 *
 *   import { loadFx } from "./easyfx-pixi.js";
 *   const fx = await loadFx(PIXI, "./easyfx.json");          // every sheet in the manifest
 *   fx.play(app.stage, "coin_burst", 120, 200);               // one-shot: removes itself when done
 *   const fire = fx.play(app.stage, "campfire", 64, 180);     // looping: keep the sprite, destroy it yourself
 *   const s = fx.create("rain", { loop: true });              // AnimatedSprite you place yourself
 *   const w = fx.weather(app.stage, "storm", { width: 640, height: 360, scale: 2 }); w.set("fog");  // Easy NPC weather
 *   const l = fx.lighting(app.stage, { width: 480, height: 270 }); l.set(npcs.light()); l.setLamps([{ x, y, r }]);  // Easy NPC light phases
 *   const f = fx.flood(app.stage, { width: 480, height: 270, ground: 224 }); f.setLevel(npcs.flood());   // Easy NPC flood
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

/** Easy NPC flood level → water depth (px) above the ground line; same table as src/shared/flood.ts and easyfx.gd. */
export const FLOOD_DEPTH = [[0, 0], [0.15, 1], [0.35, 4], [0.6, 14], [0.85, 24], [1, 30]];
export function floodDepth(level, rise = 30) {
  const l = Math.min(1, Math.max(0, level));
  for (let i = 1; i < FLOOD_DEPTH.length; i++) {
    const [a, da] = FLOOD_DEPTH[i - 1];
    const [b, db] = FLOOD_DEPTH[i];
    if (l <= b) return Math.round((da + ((l - a) / (b - a)) * (db - da)) * (rise / 30));
  }
  return Math.round(rise);
}
const lightHex = (l) => l.tintHex ?? (Array.isArray(l.tint) ? (l.tint[0] << 16) | (l.tint[1] << 8) | l.tint[2] : 0xffffff);

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
    /**
     * Time-of-day lighting: a multiply tint + a darkness veil + additive lamp glows (pixel-stepped rings).
     * l.set({ tintHex | tint: [r,g,b], dark, lamps }) — pass Easy NPC view.light() every frame (redraws only on change).
     * l.setLamps([{ x, y, r = 22, color = 0xffc870 }]) — window / street-lamp positions in screen px.
     */
    lighting(parent, o = {}) {
      const c = new PIXI.Container();
      c.label = "easyfx-lighting";
      c.eventMode = "none";
      const tint = new PIXI.Graphics();
      tint.blendMode = "multiply";
      const veil = new PIXI.Graphics();
      const glow = new PIXI.Graphics();
      glow.blendMode = "add";
      c.addChild(tint, veil, glow);
      let w = o.width ?? 640, h = o.height ?? 360;
      let cur = { hex: 0xffffff, dark: 0, lamps: 0 };
      let lamps = [];
      let key = "";
      const draw = () => {
        const k = `${cur.hex}|${cur.dark.toFixed(3)}|${cur.lamps.toFixed(2)}|${w}|${h}|${lamps.length}`;
        if (k === key) return;
        key = k;
        tint.clear().rect(0, 0, w, h).fill({ color: cur.hex, alpha: 1 });
        tint.visible = cur.hex !== 0xffffff;
        veil.clear().rect(0, 0, w, h).fill({ color: o.darkColor ?? 0x0b0d26, alpha: cur.dark });
        glow.clear();
        if (cur.lamps > 0.01) for (const p of lamps) {
          const r = p.r ?? 22;
          for (let ring = 4; ring >= 1; ring--) glow.circle(Math.round(p.x), Math.round(p.y), Math.round((r * ring) / 4)).fill({ color: p.color ?? 0xffc870, alpha: 0.09 * cur.lamps });
        }
      };
      c.set = (l = {}) => { cur = { hex: lightHex(l), dark: Math.min(1, Math.max(0, l.dark ?? 0)), lamps: Math.min(1, Math.max(0, l.lamps ?? 0)) }; draw(); return c; };
      c.setLamps = (pts = []) => { lamps = pts; key = ""; draw(); return c; };
      c.resize = (nw, nh) => { w = nw; h = nh; draw(); return c; };
      c.state = () => ({ ...cur, lampCount: lamps.length });
      draw();
      parent.addChild(c);
      return c;
    },
    /**
     * Flood water for side-view scenes: murky water from the surface down, a lit surface line and tiled
     * flood_ripple sprites. f.setLevel(level 0..1) (Easy NPC flood), f.setGround(y). Below 0.15 only puddles show.
     */
    flood(parent, o = {}) {
      const c = new PIXI.Container();
      c.label = "easyfx-flood";
      c.eventMode = "none";
      const body = new PIXI.Graphics();
      const ripples = new PIXI.Container();
      c.addChild(body, ripples);
      let w = o.width ?? 640, h = o.height ?? 360, ground = o.ground ?? Math.round(h * 0.83), level = -1;
      const rise = o.rise ?? 30;
      const color = o.color ?? 0x4e6e5e;
      const draw = (lv) => {
        level = lv;
        body.clear();
        for (const t of ripples.removeChildren()) t.destroy();
        if (lv < 0.02) return;
        const y = ground - floodDepth(lv, rise);
        if (lv < 0.15) {
          // puddles on the ground line
          for (let x = 6, k = 0; x < w; x += 38 + ((k * 17) % 23), k++) body.ellipse(x, ground + 1, 7 + (k % 3) * 3, 1.5).fill({ color: 0x9fc2c8, alpha: 0.55 });
          return;
        }
        body.rect(0, y, w, h - y).fill({ color, alpha: 0.6 });
        for (let b = 1; b <= 3; b++) body.rect(0, y + b * 6, w, h - y - b * 6).fill({ color: 0x24382e, alpha: 0.1 });
        body.rect(0, y, w, 1).fill({ color: 0xd8efe6, alpha: 0.8 });
        body.rect(0, y + 1, w, 1).fill({ color: 0x8fb8a8, alpha: 0.5 });
        if (byId.flood_ripple) {
          const e = byId.flood_ripple;
          const tw = e.frameWidth ?? e.width ?? 48;
          let k = 0;
          for (let x = 0; x < w; x += tw) {
            const s = create("flood_ripple", { loop: true });
            s.anchor?.set(0, 0.5);
            s.position.set(x, y + 2);
            s.gotoAndPlay((k++ * 5) % s.totalFrames);
            ripples.addChild(s);
          }
        }
      };
      c.setLevel = (lv) => { const v = Math.round(Math.min(1, Math.max(0, lv)) * 100) / 100; if (v !== level) draw(v); return c; };
      c.setGround = (g) => { ground = g; draw(Math.max(0, level)); return c; };
      c.resize = (nw, nh) => { w = nw; h = nh; draw(Math.max(0, level)); return c; };
      c.level = () => Math.max(0, level);
      c.surface = () => ground - floodDepth(Math.max(0, level), rise);
      c.setLevel(o.level ?? 0);
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
