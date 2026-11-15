// Regenerate docs/assets previews: contact sheet + GIFs (needs `npm run build`, python3 + Pillow).
//   node scripts/render-docs.mjs [out=docs/assets]
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const out = process.argv[2] ?? "docs/assets";
const ws = mkdtempSync(path.join(tmpdir(), "easyfx-docs-"));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
try {
  run("node", ["dist/cli.js", "init", "--workspace", ws]);
  run("node", ["dist/cli.js", "export", "--preset", "png", "--workspace", ws]);
  const png = path.join(ws, "exports", "easyfx-png");
  run("python3", ["scripts/contact-sheet.py", png, path.join(out, "contact-sheet.png"), "2"]);
  run("python3", ["scripts/make-gifs.py", png, out, "6", "campfire", "khom_loi", "raya_fireworks", "pelita_flicker"]);
} finally {
  rmSync(ws, { recursive: true, force: true });
}
