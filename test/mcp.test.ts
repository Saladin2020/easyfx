import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { access } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasyFxMcp } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const server = createEasyFxMcp(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});

const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);

describe("MCP server", () => {
  it("lists the six tools", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it("writes an effect, renders and exports end to end", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.presets).toBeGreaterThanOrEqual(25);
    expect(info.paramsFormat).toMatch(/Content rules/);
    expect(info.effects.map((e: { id: string }) => e.id)).toContain("torch_spirit");

    const bad = body(await client.callTool({ name: "write_effect", arguments: { id: "bad", base: "smoke", set: { "0.emit": "sometimes" } } }));
    expect(bad.saved).toBe(false);
    expect(bad.errors[0].path).toBe("params.layers[0].emit");

    const good = body(await client.callTool({ name: "write_effect", arguments: { id: "green_heal", base: "heal_plus", th: "ฟื้นพลังสีเขียว", set: { seed: 3, count: 7 } } }));
    expect(good.saved).toBe(true);
    const got = body(await client.callTool({ name: "get_effect", arguments: { id: "green_heal" } }));
    expect(got.source).toBe("workspace");
    expect(got.params.seed).toBe(3);

    const r = await client.callTool({ name: "render_effect", arguments: { id: "green_heal", scale: 1 } });
    const content = r.content as Array<{ type: string; mimeType?: string; text?: string }>;
    expect(content.some((c) => c.type === "image" && c.mimeType === "image/png")).toBe(true);
    const meta = JSON.parse(content[0]!.text!);
    expect([meta.width, meta.height]).toEqual([32 * 16, 48]);
    await access(meta.file);

    const tagged = body(await client.callTool({ name: "list_effects", arguments: { tag: "loy_krathong" } }));
    expect(tagged.effects.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining(["khom_loi", "krathong_glow"]));

    const exported = body(await client.callTool({ name: "export_fx", arguments: { preset: "godot", ids: ["green_heal", "campfire"] } }));
    for (const d of exported.dirs) await access(d);
    const escape = await client.callTool({ name: "export_fx", arguments: { preset: "json", out: "../../outside" } });
    expect((escape as { isError?: boolean }).isError).toBe(true);
  }, 60_000);
});

describe("HTTP API", () => {
  it("serves effects and PNG renders; blocks cross-origin writes and rebinding", async () => {
    const app = createApp({ workspaceRoot: root, webRoot: "/nonexistent" });
    const h = { host: "127.0.0.1:8848" };
    expect((await app.request("/api/health", { headers: h })).status).toBe(200);
    const list = (await (await app.request("/api/effects", { headers: h })).json()) as { effects: unknown[] };
    expect(list.effects.length).toBeGreaterThanOrEqual(28);
    const one = (await (await app.request("/api/effects/campfire", { headers: h })).json()) as { effect: { params: { frames: number } }; errors: unknown[] };
    expect(one.effect.params.frames).toBe(12);
    expect(one.errors).toEqual([]);
    const png = await app.request("/api/render", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ id: "rain", scale: 2 }) });
    expect(png.headers.get("content-type")).toBe("image/png");
    const unsaved = await app.request("/api/render", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ params: one.effect.params, frame: 0 }) });
    expect(unsaved.status).toBe(200);
    const save = await app.request("/api/effects/my_fire", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ doc: { format: "easyfx/1", base: "campfire", set: { seed: 4 } } }) });
    expect(((await save.json()) as { ok: boolean }).ok).toBe(true);
    expect((await app.request("/api/effects/..%2F..%2Fetc", { headers: h })).status).toBe(404);
    const cross = await app.request("/api/effects/x", { method: "POST", headers: { ...h, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(cross.status).toBe(403);
    const rebinding = await app.request("/api/effects", { headers: { host: "evil.example:8848" } });
    expect(rebinding.status).toBe(403);
  });
});
