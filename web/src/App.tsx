import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateParams } from "../../src/shared/effects";
import { RAMPS } from "../../src/shared/presets";
import { renderFx } from "../../src/shared/sim";
import { EMITTERS, FORMAT, PROPS, SHAPES, type Diagnostic, type FxParams, type Layer, type ParticleLayer } from "../../src/shared/types";
import { exportEffects, fetchEffect, fetchWorkspace, saveEffect, type EffectListItem } from "./api";

type Obj = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const BACKDROPS = {
  night: "#140e0a",
  teak: "#3a2819",
  grass: "#3f7d52",
  sky: "#4f8ac8",
  dusk: "#5b3a7a",
  check: "check",
} as const;
type Backdrop = keyof typeof BACKDROPS;

const EXPORTS = [
  { id: "godot", label: "Godot 4.3+", hint: "SpriteFrames · scenes · CPUParticles2D" },
  { id: "pixi", label: "PixiJS v8", hint: "spritesheets · loader · demo" },
  { id: "png", label: "PNG + JSON", hint: "sheets · frame timing" },
  { id: "all", label: "Export all", hint: "godot · pixi · png · json" },
] as const;

/** Numeric fields per layer kind: [key, label, min, max, step]. */
type Field = [string, string, number, number, number];
const PARTICLE_FIELDS: Field[] = [
  ["count", "count", 0, 200, 1],
  ["lifetime", "lifetime (frames)", 1, 64, 1],
  ["lifeJitter", "life jitter", 0, 1, 0.05],
  ["speed", "speed (px/f)", 0, 10, 0.1],
  ["speedJitter", "speed jitter", 0, 1, 0.05],
  ["angle", "angle °", -180, 180, 1],
  ["spread", "spread °", 0, 360, 1],
  ["gravity", "gravity", -0.5, 0.6, 0.01],
  ["wind", "wind", -0.3, 0.3, 0.005],
  ["drag", "drag", 0, 0.5, 0.01],
  ["delay", "delay (f)", 0, 32, 1],
  ["delayJitter", "delay jitter", 0, 32, 1],
  ["sizeStart", "size start", 0, 24, 1],
  ["sizeEnd", "size end", 0, 32, 1],
  ["fade", "fade from", 0, 1, 0.05],
  ["fadeIn", "fade in until", 0, 1, 0.05],
  ["wobble", "wobble px", 0, 8, 0.1],
  ["wobbleFreq", "wobble cycles", 0, 4, 0.1],
  ["swirl", "swirl °/f", -45, 45, 0.5],
  ["flicker", "flicker", 0, 1, 0.05],
  ["spin", "spin", -1, 1, 0.05],
  ["alpha", "alpha", 0, 1, 0.05],
];
const EMITTER_FIELDS: Field[] = [
  ["x", "x", -0.5, 1.5, 0.01],
  ["y", "y", -0.5, 1.5, 0.01],
  ["w", "w px", 0, 96, 1],
  ["h", "h px", 0, 96, 1],
  ["r", "r px", 0, 48, 1],
];
const GLOW_FIELDS: Field[] = [["x", "x", 0, 1, 0.01], ["y", "y", 0, 1, 0.01], ["radius", "radius", 1, 48, 0.5], ["pulse", "pulse", 0, 1, 0.01], ["cycles", "cycles", 0, 6, 1], ["flicker", "flicker", 0, 1, 0.05], ["alpha", "alpha", 0, 1, 0.05]];
const ARC_FIELDS: Field[] = [["x", "x", 0, 1, 0.01], ["y", "y", 0, 1, 0.01], ["radius", "radius", 2, 48, 1], ["thickness", "thickness", 1, 16, 1], ["from", "from °", -360, 360, 5], ["to", "to °", -360, 360, 5], ["sweep", "sweep (f)", 1, 24, 1], ["lag", "lag (f)", 0, 16, 1], ["delay", "delay (f)", 0, 24, 1], ["alpha", "alpha", 0, 1, 0.05]];
const PROP_FIELDS: Field[] = [["x", "x", 0, 1, 0.01], ["y", "y", 0, 1.2, 0.01], ["bob", "bob px", 0, 4, 1], ["alpha", "alpha", 0, 1, 0.05]];

function Slider({ f, value, onChange }: { f: Field; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [key, label, min, max, step] = f;
  const set = value !== undefined;
  return (
    <label className={`field${set ? "" : " unset"}`} title={key}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value ?? min} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="mono" step={step} value={value ?? ""} placeholder="—" onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
    </label>
  );
}

function RampEditor({ ramp, onChange }: { ramp: string[]; onChange: (r: string[]) => void }) {
  return (
    <div className="ramp">
      <div className="ramp-row">
        {ramp.map((c, i) => (
          <span key={i} className="swatch">
            <input type="color" value={c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join("")}` : c} onChange={(e) => onChange(ramp.map((x, j) => (j === i ? e.target.value : x)))} />
            {ramp.length > 1 && (
              <button type="button" className="x" title="remove" onClick={() => onChange(ramp.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </span>
        ))}
        {ramp.length < 12 && (
          <button type="button" className="add" onClick={() => onChange([...ramp, ramp[ramp.length - 1] ?? "#ffffff"])}>
            +
          </button>
        )}
      </div>
      <select value="" onChange={(e) => e.target.value && onChange([...RAMPS[e.target.value as keyof typeof RAMPS]])}>
        <option value="">ramp preset…</option>
        {Object.keys(RAMPS).map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}

export function App() {
  const [effects, setEffects] = useState<EffectListItem[]>([]);
  const [sel, setSel] = useState("campfire");
  const [params, setParams] = useState<FxParams | null>(null);
  const [base, setBase] = useState<{ id: string; source: string; th: string; en: string } | null>(null);
  const [layerIdx, setLayerIdx] = useState(0);
  const [zoom, setZoom] = useState(6);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [backdrop, setBackdrop] = useState<Backdrop>("night");
  const [filter, setFilter] = useState("");
  const [saveId, setSaveId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [showJson, setShowJson] = useState(false);
  const stage = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);

  const reload = useCallback(async () => {
    const w = await fetchWorkspace();
    setEffects(w.effects);
  }, []);
  useEffect(() => {
    void reload().catch((e) => setStatus(String(e)));
  }, [reload]);
  useEffect(() => {
    void fetchEffect(sel)
      .then((r) => {
        setParams(clone(r.effect.params));
        setBase({ id: r.effect.id, source: r.effect.source, th: r.effect.th, en: r.effect.en });
        setLayerIdx(Math.max(0, r.effect.params.layers.findIndex((l) => (l.kind ?? "particles") === "particles")));
        setSaveId(r.effect.source === "workspace" ? r.effect.id : `${r.effect.id}_custom`);
        setFrame(0);
      })
      .catch((e) => setStatus(String(e)));
  }, [sel]);

  const diag = useMemo(() => (params ? validateParams(params) : { errors: [] as Diagnostic[], warnings: [] as Diagnostic[] }), [params]);
  const rendered = useMemo(() => (params && !diag.errors.length ? renderFx(params) : null), [params, diag.errors.length]);
  const bitmaps = useMemo(() => {
    if (!rendered) return [];
    return rendered.frames.map((f) => {
      const c = document.createElement("canvas");
      c.width = rendered.width;
      c.height = rendered.height;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(f), rendered.width, rendered.height), 0, 0);
      return c;
    });
  }, [rendered]);

  // playback
  useEffect(() => {
    if (!playing || !rendered) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (t: number) => {
      acc += t - last;
      last = t;
      const step = 1000 / rendered.fps;
      if (acc >= step) {
        const n = Math.floor(acc / step);
        acc -= n * step;
        setFrame((f) => {
          const nf = f + n;
          if (nf < rendered.frames.length) return nf;
          return rendered.loop ? nf % rendered.frames.length : 0;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rendered]);

  const paintBackdrop = (g: CanvasRenderingContext2D, w: number, h: number, cell: number) => {
    const b = BACKDROPS[backdrop];
    if (b === "check") {
      for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
        g.fillStyle = (x / cell + y / cell) % 2 ? "#2a1d13" : "#3a2819";
        g.fillRect(x, y, cell, cell);
      }
    } else {
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
    }
  };

  useEffect(() => {
    const c = stage.current;
    if (!c || !rendered || !bitmaps.length) return;
    const W = rendered.width * zoom;
    const H = rendered.height * zoom;
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    paintBackdrop(g, W, H, zoom * 4);
    g.drawImage(bitmaps[Math.min(frame, bitmaps.length - 1)]!, 0, 0, W, H);
    // anchor cross
    g.fillStyle = "rgba(244,174,61,0.8)";
    g.fillRect(rendered.anchor.x * zoom - zoom, rendered.anchor.y * zoom, zoom * 3, 1);
    g.fillRect(rendered.anchor.x * zoom, rendered.anchor.y * zoom - zoom, 1, zoom * 3);
  }, [frame, bitmaps, rendered, zoom, backdrop]);

  useEffect(() => {
    const c = strip.current;
    if (!c || !rendered || !bitmaps.length) return;
    const k = 2;
    c.width = rendered.width * k * bitmaps.length;
    c.height = rendered.height * k;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    paintBackdrop(g, c.width, c.height, 8);
    bitmaps.forEach((b, i) => {
      g.drawImage(b, i * rendered.width * k, 0, rendered.width * k, rendered.height * k);
      g.fillStyle = i === frame ? "#f4ae3d" : "#0d0906";
      g.fillRect(i * rendered.width * k, 0, 1, c.height);
    });
  }, [bitmaps, rendered, frame, backdrop]);

  const setTop = (k: keyof FxParams, v: unknown) => setParams((p) => (p ? ({ ...p, [k]: v } as FxParams) : p));
  const setLayer = (patch: (l: Obj) => void) =>
    setParams((p) => {
      if (!p) return p;
      const n = clone(p);
      patch(n.layers[layerIdx] as unknown as Obj);
      return n;
    });
  const setField = (k: string, v: unknown) => setLayer((l) => (v === undefined ? delete l[k] : (l[k] = v)));
  const setEmitter = (k: string, v: unknown) => setLayer((l) => {
    const e = l.emitter as Obj;
    if (v === undefined) delete e[k];
    else e[k] = v;
  });

  const layer = params?.layers[layerIdx] as (Layer & Obj) | undefined;
  const kind = (layer?.kind as string | undefined) ?? "particles";

  const onSave = async () => {
    if (!params) return;
    setBusy("save");
    try {
      const res = await saveEffect(saveId, { format: FORMAT, th: base?.th, en: base?.en, params });
      setStatus(res.ok ? `saved ${res.file}` : `not saved: ${res.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
      await reload();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy("");
    }
  };
  const onExport = async (preset: string) => {
    setBusy(`export-${preset}`);
    try {
      const r = await exportEffects(preset);
      setStatus(`exported ${r.effects.length} effects · ${r.files} files → ${r.dirs.join(", ")}`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy("");
    }
  };

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const m = new Map<string, EffectListItem[]>();
    for (const e of effects) {
      if (q && !`${e.id} ${e.th} ${e.en} ${e.tags.join(" ")}`.toLowerCase().includes(q)) continue;
      const k = e.source === "workspace" ? "workspace" : e.category;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [effects, filter]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1 className="brand">
              Easy <span>FX</span>
            </h1>
            <p className="brand-th">พาร์ทิเคิลพิกเซล · ประกายไฟ ฝุ่น ควัน ฝน โคมลอย ตะเกียงรายอ</p>
          </div>
        </div>
        <p className="status mono">{status}</p>
      </header>

      <main className="layout">
        <aside className="panel list">
          <input className="search" placeholder="ค้นหา / search / tag" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {groups.map(([g, items]) => (
            <section key={g}>
              <h3>{g}</h3>
              {items.map((e) => (
                <button key={e.id} type="button" className={`item-btn${e.id === sel ? " on" : ""}`} onClick={() => setSel(e.id)}>
                  <b>{e.id}</b>
                  <small>
                    {e.th} · {e.width}×{e.height} · {e.frames}f {e.loop ? "↻" : "→"}
                  </small>
                </button>
              ))}
            </section>
          ))}
        </aside>

        <section className="panel preview">
          <div className="toolbar">
            <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ pause" : "▶ play"}</button>
            <input type="range" min={0} max={Math.max(0, (rendered?.frames.length ?? 1) - 1)} value={frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} />
            <span className="mono">
              {frame + 1}/{rendered?.frames.length ?? 0}
            </span>
            <label>
              zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[2, 3, 4, 6, 8, 10].map((z) => (
                  <option key={z} value={z}>
                    ×{z}
                  </option>
                ))}
              </select>
            </label>
            <label>
              bg
              <select value={backdrop} onChange={(e) => setBackdrop(e.target.value as Backdrop)}>
                {Object.keys(BACKDROPS).map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="stage-wrap">{rendered ? <canvas ref={stage} className="stage-canvas" /> : <p className="err">Fix the errors to preview.</p>}</div>
          <div className="strip-wrap">
            <canvas ref={strip} className="strip-canvas" onClick={(e) => {
              if (!rendered) return;
              const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
              setPlaying(false);
              setFrame(Math.min(rendered.frames.length - 1, Math.floor(((e.clientX - r.left) / r.width) * rendered.frames.length)));
            }} />
          </div>
          <div className="diag">
            {diag.errors.map((d, i) => (
              <p key={`e${i}`} className="err mono">✖ {d.path}: {d.message}</p>
            ))}
            {diag.warnings.map((d, i) => (
              <p key={`w${i}`} className="warn mono">⚠ {d.path}: {d.message}</p>
            ))}
          </div>
          <div className="export-grid">
            {EXPORTS.map((p) => (
              <button key={p.id} type="button" className={p.id === "all" ? "primary" : ""} disabled={!!busy} onClick={() => void onExport(p.id)}>
                <span>{busy === `export-${p.id}` ? "Exporting…" : p.label}</span>
                <small>{p.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <aside className="panel params">
          {params && (
            <>
              <h2>
                {base?.th} <small>{base?.en}</small>
              </h2>
              <div className="top-fields">
                <Slider f={["size", "width px", 8, 128, 1]} value={params.size} onChange={(v) => setTop("size", v ?? 32)} />
                <Slider f={["height", "height px", 8, 128, 1]} value={params.height} onChange={(v) => setTop("height", v)} />
                <Slider f={["frames", "frames", 1, 64, 1]} value={params.frames} onChange={(v) => setTop("frames", v ?? 8)} />
                <Slider f={["fps", "fps", 1, 60, 1]} value={params.fps} onChange={(v) => setTop("fps", v ?? 12)} />
                <label className="field">
                  <span>seed</span>
                  <input type="number" className="mono" value={params.seed} onChange={(e) => setTop("seed", Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                  <button type="button" title="new seed" onClick={() => setTop("seed", Math.floor(Math.random() * 1e6))}>🎲</button>
                </label>
                <label className="field check">
                  <span>loop</span>
                  <input type="checkbox" checked={params.loop} onChange={(e) => setTop("loop", e.target.checked)} />
                </label>
              </div>
              <div className="layer-tabs">
                {params.layers.map((l, i) => (
                  <button key={i} type="button" className={i === layerIdx ? "on" : ""} onClick={() => setLayerIdx(i)}>
                    {l.name ?? `${l.kind ?? "particles"} ${i}`}
                  </button>
                ))}
              </div>
              {layer && kind === "particles" && (
                <div className="layer">
                  <div className="row">
                    <label>
                      emit
                      <select value={layer.emit as string} onChange={(e) => setField("emit", e.target.value)}>
                        <option>burst</option>
                        <option>stream</option>
                      </select>
                    </label>
                    <label>
                      shape
                      <select value={layer.shape as string} onChange={(e) => setField("shape", e.target.value)}>
                        {SHAPES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      size mode
                      <select value={(layer.sizeMode as string) ?? "linear"} onChange={(e) => setField("sizeMode", e.target.value)}>
                        <option>linear</option>
                        <option>pulse</option>
                      </select>
                    </label>
                  </div>
                  <h4>colour ramp</h4>
                  <RampEditor ramp={layer.ramp as string[]} onChange={(r) => setField("ramp", r)} />
                  <label className="field check">
                    <span>one colour each</span>
                    <input type="checkbox" checked={layer.rampMode === "random"} onChange={(e) => setField("rampMode", e.target.checked ? "random" : undefined)} />
                  </label>
                  <h4>emitter</h4>
                  <div className="row">
                    <select value={(layer.emitter as Obj).shape as string} onChange={(e) => setEmitter("shape", e.target.value)}>
                      {EMITTERS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {EMITTER_FIELDS.map((f) => (
                    <Slider key={f[0]} f={f} value={(layer.emitter as Obj)[f[0]] as number | undefined} onChange={(v) => setEmitter(f[0], v)} />
                  ))}
                  <h4>motion · life</h4>
                  {PARTICLE_FIELDS.map((f) => (
                    <Slider key={f[0]} f={f} value={layer[f[0]] as number | undefined} onChange={(v) => setField(f[0], v)} />
                  ))}
                </div>
              )}
              {layer && kind !== "particles" && (
                <div className="layer">
                  {kind === "prop" && (
                    <label>
                      prop
                      <select value={layer.prop as string} onChange={(e) => setField("prop", e.target.value)}>
                        {PROPS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {kind !== "prop" && <RampEditor ramp={layer.ramp as string[]} onChange={(r) => setField("ramp", r)} />}
                  {(kind === "glow" ? GLOW_FIELDS : kind === "arc" ? ARC_FIELDS : PROP_FIELDS).map((f) => (
                    <Slider key={f[0]} f={f} value={layer[f[0]] as number | undefined} onChange={(v) => setField(f[0], v)} />
                  ))}
                </div>
              )}
              <button type="button" className="link" onClick={() => setShowJson((s) => !s)}>
                {showJson ? "hide" : "show"} params JSON
              </button>
              {showJson && <pre className="mono json">{JSON.stringify(params, null, 1)}</pre>}
              <div className="save">
                <input className="mono" value={saveId} onChange={(e) => setSaveId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"))} />
                <button type="button" className="primary" disabled={!!busy || !!diag.errors.length || !saveId} onClick={() => void onSave()}>
                  Save effects/{saveId}.easyfx.json
                </button>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
