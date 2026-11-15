#!/usr/bin/env node
/**
 * Easy FX MCP server (stdio by default; optional Streamable HTTP).
 *
 *   npx tsx src/mcp/server.ts
 *   npx tsx src/mcp/server.ts --http --port 8849
 *
 * Env: EASYFX_WORKSPACE  absolute path to the workspace (default: cwd)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { z } from "zod";
import { checkRequest, resolveToken } from "../shared/requestGuard.js";
import { effectSummary, withOverrides } from "../shared/effects.js";
import { PRESETS, RAMPS } from "../shared/presets.js";
import { EMITTERS, FORMAT, PROPS, SHAPES } from "../shared/types.js";
import { EXPORT_PRESETS, exportFx } from "../lib/export.js";
import { renderEffectPng } from "../lib/render.js";
import { dirs, listEffects, loadEffect, readDocRaw, resolveWorkspace, saveEffectDoc, workspaceSummary } from "../lib/workspace.js";

export const MCP_TOOL_NAMES = ["workspace_info", "list_effects", "get_effect", "write_effect", "render_effect", "export_fx"] as const;

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a-z, 0-9, _ or -");

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const PARAMS_CHEATSHEET = `Effect params: { size (frame px, 8-128), height?, frames (1-64), fps, loop (stream layers wrap seamlessly), seed (uint32), anchor? {x,y} 0..1, layers: [...] }
Positions are fractions of the frame (0..1); speed px/frame, gravity/wind px/frame² (+ = down), angle degrees (0 right, -90 up), spread = full cone degrees.
  particles: { emit burst|stream, count, lifetime (frames), lifeJitter?, speed, speedJitter?, angle, spread, gravity, wind?, drag? 0..0.95, delay?, delayJitter?,
               emitter {shape ${EMITTERS.join("|")}, x, y, w?, h?, r?, radial?}, shape ${SHAPES.join("|")}, sizeStart, sizeEnd?, sizeMode? linear|pulse,
               ramp [hex…] over life (rampMode random = one colour each; coin/lantern/drop use ramp as highlight/body/rim), outline? hex, fade? 0..1, fadeIn?, swirl? deg/frame, wobble? px, wobbleFreq?, flicker? 0..1, spin?, floor? y 0..1, alpha? }
  glow:  { kind "glow", x, y, radius, ramp inner→outer, pulse?, cycles?, flicker?, alpha? }
  arc:   { kind "arc", x, y, radius, thickness, from, to (deg), sweep (frames), lag?, delay?, ramp, outline? }
  prop:  { kind "prop", prop ${PROPS.join("|")}, x, y (bottom centre), bob? }
Workspace file: { format "${FORMAT}", th?, en?, base? preset id, params? full params, set? { "count": 30, "1.ramp": [...], "0.emitter.x": 0.4, "*.gravity": 0 } }
Content rules: generic objects only — no figures of the Prophet or other sacred figures, no Quran text or Arabic calligraphy as decoration.`;

function parseArgs(argv: string[]) {
  const out = { http: false, port: 8849, host: "127.0.0.1", workspace: process.env.EASYFX_WORKSPACE ?? process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--http") out.http = true;
    else if (a === "--port") out.port = Number(argv[++i] ?? out.port);
    else if (a === "--host") out.host = argv[++i] ?? out.host;
    else if (a === "--workspace") out.workspace = argv[++i] ?? out.workspace;
  }
  return out;
}

export function createEasyFxMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easyfx", version: "0.1.0" });

  server.registerTool(
    "workspace_info",
    { title: "Workspace info", description: "Summarize the Easy FX workspace: every effect (built-in presets + workspace files), shapes, emitters, props, colour ramps and the params format. Call this first.", inputSchema: {} },
    async () => {
      const s = await workspaceSummary(root);
      return text({ name: "easyfx", root: s.root, config: s.config, presets: s.presets, workspaceEffects: s.workspaceEffects, effects: s.effects, broken: s.broken, shapes: SHAPES, emitters: EMITTERS, props: PROPS, ramps: RAMPS, exportPresets: EXPORT_PRESETS, paramsFormat: PARAMS_CHEATSHEET });
    },
  );

  server.registerTool(
    "list_effects",
    { title: "List effects", description: "List effects with size, frames, fps, loop and layers; filter by tag or category (combat, ambient, nature, reward, festival, food, raya, loy_krathong, songkran…).", inputSchema: { tag: z.string().optional() } },
    async ({ tag }) => {
      const { effects, broken } = await listEffects(root);
      return text({ effects: effects.filter((e) => !tag || e.tags.includes(tag) || e.category === tag).map(effectSummary), broken });
    },
  );

  server.registerTool(
    "get_effect",
    { title: "Get effect", description: "Full resolved params of one effect, plus the workspace file when it has one.", inputSchema: { id: IdSchema } },
    async ({ id }) => {
      try {
        const e = await loadEffect(root, id);
        return text({ ...effectSummary(e), params: e.params, doc: (await readDocRaw(root, id)) ?? null });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "write_effect",
    {
      title: "Write effect",
      description: `Create or replace effects/<id>.easyfx.json. Give a base preset plus "set" overrides, or full "params". Validates first: refuses on errors (JSON path + message). dryRun only validates.\n${PARAMS_CHEATSHEET}`,
      inputSchema: {
        id: IdSchema,
        base: z.string().optional().describe(`Preset id: ${PRESETS.map((p) => p.id).join(", ")}`),
        params: z.record(z.string(), z.unknown()).optional().describe("Full params (replaces the base params)"),
        set: z.record(z.string(), z.unknown()).optional().describe('Overrides, e.g. {"count": 30, "1.ramp": ["#fff", "#f4ae3d"]}'),
        th: z.string().optional(),
        en: z.string().optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async ({ id, base, params, set, th, en, dryRun }) => {
      try {
        const doc = { format: FORMAT, ...(th ? { th } : {}), ...(en ? { en } : {}), ...(base ? { base } : {}), ...(params ? { params } : {}), ...(set ? { set } : {}) };
        const res = await saveEffectDoc(root, id, doc, { dryRun });
        return text({ saved: res.saved, file: res.file, errors: res.errors, warnings: res.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "render_effect",
    {
      title: "Render effect",
      description: "Render an effect's frames to exports/renders/<id>.png (one strip, upscaled) and return the image, so you can look at it. Optional seed / set overrides are applied only to this render.",
      inputSchema: { id: IdSchema, scale: z.number().int().min(1).max(6).optional(), cols: z.number().int().min(1).max(64).optional(), seed: z.number().int().min(0).optional(), set: z.record(z.string(), z.unknown()).optional() },
    },
    async ({ id, scale, cols, seed, set }) => {
      try {
        const sets: Array<[string, unknown]> = Object.entries(set ?? {});
        if (seed !== undefined) sets.push(["seed", seed]);
        const e = withOverrides(await loadEffect(root, id), sets);
        const r = renderEffectPng(e, { scale: scale ?? 3, cols });
        const out = path.join(dirs(root).exports, "renders", `${id}.png`);
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, r.png);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ file: out, width: r.width, height: r.height, frames: r.frames, fps: r.fps, loop: r.loop, anchor: r.anchor }, null, 2) },
            { type: "image" as const, data: r.png.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "export_fx",
    { title: "Export effects", description: "Export effects: godot (Godot 4.3+ project: SpriteFrames .tres + AnimatedSprite2D scenes + CPUParticles2D presets + demo), pixi (PixiJS v8 spritesheets + easyfx-pixi.js loader + demo), png (sheets + frame JSON), json (resolved params), or all.", inputSchema: { ids: z.array(IdSchema).optional(), tags: z.array(z.string()).optional(), preset: z.enum(EXPORT_PRESETS).optional(), out: z.string().optional().describe("Workspace-relative output folder (single preset)") } },
    async ({ ids, tags, preset, out }) => {
      try {
        const res = await exportFx(root, { ids, tags, preset, out });
        return text({ dirs: res.dirs, effects: res.effects, files: res.files.length, warnings: res.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  return server;
}

async function startMcp(opts: ReturnType<typeof parseArgs>) {
  const workspace = resolveWorkspace(opts.workspace);
  if (opts.http) return startHttp(workspace, opts.host, opts.port);
  await createEasyFxMcp(workspace).connect(new StdioServerTransport());
}

async function startHttp(workspace: string, host: string, port: number) {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
  const token = resolveToken(host);
  if (token) console.error(`Non-loopback host: send "Authorization: Bearer <token>" — token printed once: ${token}`);
  const httpServer = createServer(async (req, res) => {
    const auth = req.headers.authorization;
    const denied = checkRequest(
      { bindHost: host, token },
      { method: req.method ?? "GET", host: req.headers.host, origin: req.headers.origin, token: auth?.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-easyfx-token"] as string | undefined) },
    );
    if (denied) {
      res.writeHead(denied.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: denied.error }));
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "easyfx", transport: "streamable-http", endpoint: `http://${host}:${port}/mcp`, workspace }));
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      if (req.method === "POST") {
        let transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          const mcp = createEasyFxMcp(workspace);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id: string) => {
              sessions.set(id, transport!);
            },
          });
          transport.onclose = () => {
            const id = transport!.sessionId;
            if (id) sessions.delete(id);
          };
          await mcp.connect(transport);
        }
        await transport.handleRequest(req, res);
        return;
      }
      if (req.method === "GET" || req.method === "DELETE") {
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing mcp-session-id" }));
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg(e) }));
      }
    }
  });
  httpServer.listen(port, host, () => {
    console.error(`Easy FX MCP (HTTP) http://${host}:${port}/mcp`);
    console.error(`Workspace ${workspace}`);
  });
}

function entryIndex(): number {
  return process.argv.findIndex((arg) => /(?:^|[/\\])mcp[/\\]server\.(?:ts|js|mjs)$/i.test(arg));
}

if (entryIndex() >= 0) {
  await startMcp(parseArgs(process.argv.slice(entryIndex() + 1)));
}
