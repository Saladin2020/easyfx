import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SAFE_ID, allPresetEffects, effectSummary, presetEffect, resolveDoc } from "../shared/effects.js";
import { PRESETS } from "../shared/presets.js";
import type { Diagnostic, ResolvedEffect } from "../shared/types.js";
import { EXPORT_PRESETS } from "../shared/types.js";
import { pkgRoot } from "./assets.js";

export const CONFIG_NAME = "easyfx.config.json";
export const DOC_EXT = ".easyfx.json";

export interface EasyFxConfig {
  name: string;
  /** Preview / render upscale. */
  scale: number;
}

export const DEFAULT_CONFIG: EasyFxConfig = { name: "Easy FX Workspace", scale: 4 };

export function assertSafeId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Invalid ${label} ${JSON.stringify(id)} (use a-z, 0-9, _ or -)`);
  return id;
}

export function resolveWorkspace(dir = process.cwd()): string {
  return path.resolve(dir);
}

export const dirs = (root: string) => ({
  effects: path.join(root, "effects"),
  exports: path.join(root, "exports"),
});

/** Writes outside the workspace must be inside one of these (env, `:`-separated). */
export function allowedRoots(root: string): string[] {
  const extra = (process.env.EASYFX_ALLOWED_DIRS ?? "").split(path.delimiter).map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
  return [path.resolve(root), ...extra];
}

export function resolveInside(root: string, p: string): string {
  const abs = path.resolve(root, p);
  const ok = allowedRoots(root).some((r) => abs === r || abs.startsWith(r + path.sep));
  if (!ok) throw new Error(`Path ${p} is outside the workspace (allow it with EASYFX_ALLOWED_DIRS)`);
  return abs;
}

export async function initWorkspace(dir = process.cwd(), opts: { force?: boolean } = {}): Promise<string> {
  const root = resolveWorkspace(dir);
  const d = dirs(root);
  for (const p of Object.values(d)) await mkdir(p, { recursive: true });
  const cfg = path.join(root, CONFIG_NAME);
  if (!existsSync(cfg) || opts.force) await writeFile(cfg, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  const src = path.join(pkgRoot, "samples", "effects");
  for (const f of await readdir(src)) {
    const dest = path.join(d.effects, f);
    if (!existsSync(dest) || opts.force) await copyFile(path.join(src, f), dest);
  }
  return root;
}

export async function loadConfig(root: string): Promise<EasyFxConfig> {
  const f = path.join(root, CONFIG_NAME);
  if (!existsSync(f)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(JSON.parse(await readFile(f, "utf8")) as Partial<EasyFxConfig>) };
}

export function docPath(root: string, id: string): string {
  return path.join(dirs(root).effects, `${assertSafeId(id, "effect id")}${DOC_EXT}`);
}

export async function readDocRaw(root: string, id: string): Promise<unknown | undefined> {
  const f = docPath(root, id);
  if (!existsSync(f)) return undefined;
  return JSON.parse(await readFile(f, "utf8"));
}

export interface BrokenDoc {
  id: string;
  file: string;
  errors: Diagnostic[];
}

/** Built-in presets + workspace effects (a workspace file with a preset's id replaces it). */
export async function listEffects(root: string): Promise<{ effects: ResolvedEffect[]; broken: BrokenDoc[] }> {
  const byId = new Map(allPresetEffects().map((e) => [e.id, e]));
  const broken: BrokenDoc[] = [];
  const d = dirs(root).effects;
  if (existsSync(d)) {
    for (const f of (await readdir(d)).sort()) {
      if (!f.endsWith(DOC_EXT)) continue;
      const id = f.slice(0, -DOC_EXT.length);
      if (!SAFE_ID.test(id)) continue;
      const file = path.join(d, f);
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        broken.push({ id, file, errors: [{ path: "", message: `invalid JSON: ${(e as Error).message}`, severity: "error" }] });
        continue;
      }
      const r = resolveDoc(id, raw);
      if (r.effect) byId.set(id, r.effect);
      else broken.push({ id, file, errors: r.errors });
    }
  }
  return { effects: [...byId.values()], broken };
}

export async function loadEffect(root: string, id: string): Promise<ResolvedEffect> {
  assertSafeId(id, "effect id");
  const raw = await readDocRaw(root, id);
  if (raw === undefined) {
    const p = presetEffect(id);
    if (!p) throw new Error(`Effect "${id}" not found (presets: ${PRESETS.length}; try: easyfx list)`);
    return p;
  }
  const r = resolveDoc(id, raw);
  if (!r.effect) throw new Error(`Effect "${id}" has ${r.errors.length} error(s):\n${r.errors.slice(0, 6).map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  return r.effect;
}

export async function saveEffectDoc(root: string, id: string, raw: unknown, opts: { dryRun?: boolean } = {}) {
  const file = docPath(root, id);
  const r = resolveDoc(id, raw);
  if (opts.dryRun || r.errors.length) return { file, saved: false, errors: r.errors, warnings: r.warnings };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(raw, null, 2)}\n`);
  return { file, saved: true, errors: r.errors, warnings: r.warnings };
}

export async function workspaceSummary(root: string) {
  const { effects, broken } = await listEffects(root);
  return {
    root,
    config: await loadConfig(root),
    ...dirs(root),
    effects: effects.map(effectSummary),
    broken,
    presets: PRESETS.length,
    workspaceEffects: effects.filter((e) => e.source === "workspace").length,
    exportPresets: EXPORT_PRESETS,
  };
}
