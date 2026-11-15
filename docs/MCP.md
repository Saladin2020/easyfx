# Easy FX MCP server

```bash
npm run mcp            # stdio
npm run mcp:http       # Streamable HTTP → http://127.0.0.1:8849/mcp
EASYFX_WORKSPACE=/path/to/workspace npx tsx src/mcp/server.ts
```

Cursor / Claude config:

```json
{ "mcpServers": { "easyfx": { "command": "npx", "args": ["tsx", "/path/to/easyfx/src/mcp/server.ts", "--workspace", "/path/to/workspace"] } } }
```

| Tool | What it does |
| --- | --- |
| `workspace_info` | every effect (presets + workspace files, broken files), shapes, emitters, props, colour ramps and a params cheat sheet (with the content rules); call first |
| `list_effects` | effects with size, frames, fps, loop and layers; filter by tag or category |
| `get_effect` | full resolved params of one effect, plus its workspace file |
| `write_effect` | create/replace `effects/<id>.easyfx.json` from `base` + `set` or full `params`; refuses to save with errors (JSON path + message), returns warnings; `dryRun` validates only |
| `render_effect` | PNG strip to `exports/renders/<id>.png`, returned as an image; optional `seed` / `set` apply to this render only |
| `export_fx` | `godot`, `pixi`, `png`, `json` or `all`, by ids or tags |

A typical loop: `workspace_info` → `write_effect` (dryRun) → fix errors → `write_effect` → `render_effect` to look
at it → tweak `seed` / ramp → `export_fx`.

All paths stay inside the workspace (plus `EASYFX_ALLOWED_DIRS`). Off-loopback HTTP needs the bearer token
printed at startup (or `EASYFX_TOKEN`). Nothing calls a network or paid API.
