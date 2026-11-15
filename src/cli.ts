#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp, defaultWebRoot } from "./server/app.js";
import { resolveToken } from "./shared/requestGuard.js";
import { effectSummary, parseSet, resolveDoc, validateParams, withOverrides } from "./shared/effects.js";
import { PRESETS, presetById } from "./shared/presets.js";
import { EMITTERS, FORMAT, PROPS, SHAPES } from "./shared/types.js";
import { EXPORT_PRESETS, exportFx, type ExportPreset } from "./lib/export.js";
import { renderEffectPng } from "./lib/render.js";
import { assertSafeId, dirs, docPath, initWorkspace, listEffects, loadConfig, loadEffect, resolveWorkspace, workspaceSummary } from "./lib/workspace.js";

const program = new Command();

function workspaceOf(cli?: string): string {
  const v = cli?.trim() || process.env.EASYFX_HOME?.trim() || process.env.EASYFX_WORKSPACE?.trim() || process.cwd();
  return resolveWorkspace(v);
}

const fail = (e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};

async function writeOut(file: string, body: Buffer) {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, body);
  console.log(`wrote ${file}`);
}

const collect = (v: string, prev: string[]) => [...prev, v];
const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

program.name("easyfx").description("Deterministic pixel particles and effects for 2D games → PNG sheets, Godot SpriteFrames / CPUParticles2D, PixiJS").version("0.1.0");

program
  .command("init")
  .description("Create effects/ exports/ with three sample workspace effects")
  .option("--force", "Overwrite samples and config")
  .option("--workspace <path>", "Workspace directory")
  .action(async (o: { force?: boolean; workspace?: string }) => {
    const root = await initWorkspace(workspaceOf(o.workspace), { force: o.force });
    console.log(`Initialized Easy FX workspace at ${root}`);
    console.log(`  effects/   <id>.easyfx.json (base preset + overrides, or full params) — ${PRESETS.length} built-in presets need no file`);
    console.log("  exports/   Godot / PixiJS / PNG / JSON exports");
  });

program
  .command("info")
  .description("Workspace summary")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { workspace?: string; json?: boolean }) => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    if (o.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`Easy FX workspace ${s.root}`);
    console.log(`  ${s.presets} presets + ${s.workspaceEffects} workspace effects · preview scale ×${s.config.scale}${s.broken.length ? ` · ${s.broken.length} broken: ${s.broken.map((b) => b.id).join(", ")}` : ""}`);
    console.log(`  shapes: ${SHAPES.join(", ")}`);
    console.log(`  emitters: ${EMITTERS.join(", ")} · props: ${PROPS.join(", ")} · export: ${EXPORT_PRESETS.join(", ")}`);
  });

program
  .command("list")
  .description("List presets and workspace effects")
  .option("--tag <tag>", "Only effects with this tag or category")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { tag?: string; workspace?: string; json?: boolean }) => {
    try {
      const { effects, broken } = await listEffects(workspaceOf(o.workspace));
      const sel = effects.filter((e) => !o.tag || e.tags.includes(o.tag) || e.category === o.tag).map(effectSummary);
      if (o.json) return console.log(JSON.stringify({ effects: sel, broken }, null, 2));
      for (const s of sel) console.log(`${s.id.padEnd(22)} ${`${s.width}×${s.height}`.padEnd(6)} ${String(s.frames).padStart(2)}f ${String(s.fps).padStart(2)}fps ${(s.loop ? "loop" : "once").padEnd(4)} ${s.source === "workspace" ? "ws " : "   "} ${s.th} · ${s.en}`);
      for (const b of broken) console.log(`${b.id.padEnd(22)} BROKEN ${b.errors[0]?.path}: ${b.errors[0]?.message}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("show")
  .description("Print an effect's resolved params (JSON)")
  .argument("<id>")
  .option("--workspace <path>")
  .action(async (id: string, o: { workspace?: string }) => {
    try {
      const e = await loadEffect(workspaceOf(o.workspace), id);
      console.log(JSON.stringify({ ...effectSummary(e), params: e.params }, null, 2));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("check")
  .description("Validate a workspace effect (id or .easyfx.json path). Exit code 1 on errors")
  .argument("<effect>")
  .option("--workspace <path>")
  .option("--json")
  .action(async (arg: string, o: { workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      let errors;
      let warnings;
      if (!arg.endsWith(".json") && !existsSync(docPath(root, arg)) && presetById(arg)) ({ errors, warnings } = validateParams(presetById(arg)!.params));
      else {
        const file = arg.endsWith(".json") ? arg : docPath(root, arg);
        const id = path.basename(file).replace(/\.easyfx\.json$|\.json$/, "");
        ({ errors, warnings } = resolveDoc(id, JSON.parse(await readFile(file, "utf8"))));
      }
      if (o.json) console.log(JSON.stringify({ errors, warnings }, null, 2));
      else {
        for (const d of [...errors, ...warnings]) console.error(`${d.severity}: ${d.path}: ${d.message}`);
        if (!errors.length) console.log(`ok  ${warnings.length} warnings`);
      }
      if (errors.length) process.exit(1);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("render")
  .description("Render an effect's frames to a PNG strip (or one frame)")
  .argument("<id>")
  .requiredOption("--out <png>")
  .option("--scale <n>", "Upscale (default 1)")
  .option("--cols <n>", "Frames per row (default: all in one strip)")
  .option("--frame <n>", "Only this frame")
  .option("--seed <n>", "Override the seed")
  .option("--set <key=value>", "Override a param: count=20, 1.ramp=#fff,#f4ae3d, 0.emitter.x=0.4, *.gravity=0 (repeatable)", collect, [])
  .option("--workspace <path>")
  .action(async (id: string, o: { out: string; scale?: string; cols?: string; frame?: string; seed?: string; set: string[]; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const sets = o.set.map(parseSet);
      if (o.seed !== undefined) sets.push(["seed", Number(o.seed)]);
      const e = withOverrides(await loadEffect(root, id), sets);
      const r = renderEffectPng(e, { scale: o.scale ? Number(o.scale) : 1, cols: o.cols ? Number(o.cols) : undefined, frame: o.frame !== undefined ? Number(o.frame) : undefined });
      await writeOut(o.out, r.png);
      console.log(`  ${r.width}×${r.height} · ${r.frames} frames · ${r.fps} fps · ${r.loop ? "loop" : "once"} · anchor ${r.anchor.x},${r.anchor.y}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("new")
  .description("Create effects/<id>.easyfx.json from a preset plus overrides")
  .argument("<id>")
  .requiredOption("--from <preset>", "Built-in preset to start from")
  .option("--set <key=value>", "Override (repeatable)", collect, [])
  .option("--th <text>")
  .option("--en <text>")
  .option("--force", "Overwrite an existing file")
  .option("--workspace <path>")
  .action(async (id: string, o: { from: string; set: string[]; th?: string; en?: string; force?: boolean; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      assertSafeId(id, "effect id");
      if (!presetById(o.from)) throw new Error(`Unknown preset ${o.from} (try: easyfx list)`);
      const file = docPath(root, id);
      if (existsSync(file) && !o.force) throw new Error(`${file} exists (use --force)`);
      const doc = { format: FORMAT, ...(o.th ? { th: o.th } : {}), ...(o.en ? { en: o.en } : {}), base: o.from, set: Object.fromEntries(o.set.map(parseSet)) };
      const r = resolveDoc(id, doc);
      if (r.errors.length) throw new Error(r.errors.map((d) => `${d.path}: ${d.message}`).join("\n"));
      await mkdir(dirs(root).effects, { recursive: true });
      await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
      console.log(`wrote ${file}`);
      r.warnings.forEach((w) => console.log(`  warning: ${w.path}: ${w.message}`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("export")
  .description("Export effects: godot | pixi | png | json | all")
  .argument("[ids...]", "Effect ids (default: all)")
  .option("--preset <preset>", EXPORT_PRESETS.join(" | "), "all")
  .option("--tag <tags>", "Only these tags / categories (comma-separated)")
  .option("--out <dir>", "Output folder (single preset; default exports/easyfx-<preset>)")
  .option("--scale <n>", "Also write upscaled previews in the png export")
  .option("--workspace <path>")
  .option("--json")
  .action(async (ids: string[], o: { preset: string; tag?: string; out?: string; scale?: string; workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      const res = await exportFx(root, { ids, preset: o.preset as ExportPreset, tags: list(o.tag), out: o.out, scale: o.scale ? Number(o.scale) : undefined, trustedPaths: true });
      if (o.json) return console.log(JSON.stringify(res, null, 2));
      for (const d of res.dirs) console.log(`exported ${d}`);
      console.log(`  ${res.effects.length} effects · ${res.files.length} files`);
      res.warnings.forEach((w) => console.log(`  warning: ${w}`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("serve")
  .description("Web editor + API (default http://127.0.0.1:8848)")
  .option("--port <port>", "Port", "8848")
  .option("--host <host>", "Interface (non-loopback requires the printed token)", "127.0.0.1")
  .option("--dev", "API only; use the Vite UI on :5180")
  .option("--open", "Open the browser")
  .option("--workspace <path>")
  .action(async (o: { port: string; host: string; dev?: boolean; open?: boolean; workspace?: string }) => {
    const root = workspaceOf(o.workspace);
    if (!existsSync(dirs(root).effects)) await initWorkspace(root);
    await loadConfig(root);
    const token = resolveToken(o.host);
    const app = createApp({ workspaceRoot: root, webRoot: defaultWebRoot(), dev: o.dev, host: o.host, token });
    const port = Number(o.port);
    serve({ fetch: app.fetch, port, hostname: o.host }, () => {
      const url = `http://${o.host === "0.0.0.0" ? "127.0.0.1" : o.host}:${port}/`;
      console.log(`Easy FX ${o.dev ? "API (dev)" : "editor"} → ${url}`);
      console.log(`Workspace ${root}`);
      if (token) console.log(`Token (needed off-loopback): ${url}?token=${token}`);
      if (o.dev) console.log("Run the UI with: npx vite --config web/vite.config.ts");
      if (o.open) void open(o.dev ? "http://127.0.0.1:5180" : url);
    });
  });

program.parseAsync(process.argv).catch(fail);
