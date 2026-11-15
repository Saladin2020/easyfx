/** MCP smoke test: start the server over stdio and over HTTP like a client would and call tools. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyfx-smoke-"));
execFileSync("npx", ["tsx", "src/cli.ts", "init", "--workspace", ws], { stdio: "ignore" });
const fail = (m) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};
const body = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");

async function exercise(client, label) {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log(`[${label}] tools (${tools.length}):`, tools.join(", "));
  if (tools.length !== 6) fail(`${label}: expected 6 tools`);
  const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
  if (!(info.presets >= 25) || !info.effects?.length) fail(`${label}: workspace_info`);
  console.log(`[${label}] presets=${info.presets} workspace=${info.workspaceEffects} shapes=${info.shapes?.length}`);
  const raya = body(await client.callTool({ name: "list_effects", arguments: { tag: "raya" } }));
  console.log(`[${label}] tag raya:`, raya.effects?.map((e) => e.id).join(", "));
  if (!raya.effects?.some((e) => e.id === "pelita_flicker")) fail(`${label}: list_effects tag`);
  const got = body(await client.callTool({ name: "get_effect", arguments: { id: "campfire" } }));
  console.log(`[${label}] campfire layers=${got.params?.layers?.length} frames=${got.frames}`);
  if (!got.params?.layers?.length) fail(`${label}: get_effect`);
  const bad = body(await client.callTool({ name: "write_effect", arguments: { id: "smoke_test", base: "rain", set: { "0.shape": "dragon" }, dryRun: true } }));
  console.log(`[${label}] dry-run error:`, bad.errors?.[0] && `${bad.errors[0].path}: ${bad.errors[0].message}`);
  if (!bad.errors?.length) fail(`${label}: write_effect validation`);
  const good = body(await client.callTool({ name: "write_effect", arguments: { id: `smoke_${label}`, base: "coin_burst", set: { count: 12, seed: 99 } } }));
  if (!good.saved) fail(`${label}: write_effect save`);
  const r = await client.callTool({ name: "render_effect", arguments: { id: `smoke_${label}`, scale: 2 } });
  const img = r.content?.find((c) => c.type === "image");
  console.log(`[${label}] render image bytes:`, img ? Buffer.from(img.data, "base64").length : 0);
  if (!img) fail(`${label}: render_effect`);
}

// stdio
{
  const client = new Client({ name: "smoke", version: "0.0.1" });
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts", "--workspace", ws], cwd: process.cwd(), env: { ...process.env }, stderr: "ignore" }));
  await exercise(client, "stdio");
  const exp = body(await client.callTool({ name: "export_fx", arguments: { preset: "pixi", tags: ["festival"] } }));
  console.log("[stdio] export pixi:", exp.dirs?.map((d) => path.relative(ws, d)).join(", "), "effects", exp.effects?.length, "files", exp.files);
  if (!exp.files) fail("stdio: export_fx");
  await client.close();
}

// HTTP (Streamable HTTP on a spare port)
{
  const port = 18849 + Math.floor(Math.random() * 500);
  const proc = spawn("npx", ["tsx", "src/mcp/server.ts", "--http", "--port", String(port), "--workspace", ws], { stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("MCP HTTP did not start")), 20000);
    proc.stderr.on("data", (d) => {
      if (/listening|http:\/\//i.test(String(d))) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  const client = new Client({ name: "smoke-http", version: "0.0.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  proc.kill();
}

rmSync(ws, { recursive: true, force: true });
console.log(process.exitCode ? "MCP smoke FAILED" : "MCP smoke OK");
process.exit(process.exitCode ?? 0);
