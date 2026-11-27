/** CLI smoke test: init a temp workspace, list, check, render every preset, new and export through the real CLI. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyfx-cli-"));
const cli = (...args) => execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args, "--workspace", ws], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let failed = false;
const ok = (cond, label) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed = true;
};
const png = (f) => existsSync(f) && readFileSync(f).toString("ascii", 1, 4) === "PNG";

cli("init");
ok(existsSync(path.join(ws, "effects", "torch_spirit.easyfx.json")), "init copies the sample workspace effects");
const listed = JSON.parse(cli("list", "--json"));
ok(listed.effects.length >= 28 && listed.broken.length === 0, `list: ${listed.effects.length} effects, none broken`);
ok(/pelita_flicker\s+24×40/.test(cli("list", "--tag", "raya")), "list --tag raya shows the pelita");

// render every effect (presets + workspace) through the CLI in one go via export png, and one render per preset
const exp = JSON.parse(cli("export", "--preset", "png", "--json"));
ok(exp.effects.length === listed.effects.length && exp.warnings.length === 0, `export png: ${exp.effects.length} effects`);
const man = JSON.parse(readFileSync(path.join(ws, "exports", "easyfx-png", "easyfx.json"), "utf8"));
ok(man.effects.every((e) => png(path.join(ws, "exports", "easyfx-png", e.sheet))), "every sheet is a PNG");
let rendered = 0;
for (const e of listed.effects.filter((x) => x.source === "preset")) {
  const out = path.join(ws, "r", `${e.id}.png`);
  cli("render", e.id, "--out", out, "--scale", "2");
  const b = readFileSync(out);
  if (png(out) && b.readUInt32BE(16) === e.width * e.frames * 2 && b.readUInt32BE(20) === e.height * 2) rendered++;
}
ok(rendered === listed.effects.filter((x) => x.source === "preset").length, `render: all ${rendered} presets → strip PNG of the right size`);
cli("render", "rain", "--out", path.join(ws, "rain-f3.png"), "--frame", "3", "--seed", "7", "--set", "count=30", "--set", "0.ramp=#ffffff,#7cc8e8");
ok(png(path.join(ws, "rain-f3.png")) && readFileSync(path.join(ws, "rain-f3.png")).readUInt32BE(16) === 48, "render --frame --seed --set");

cli("new", "blue_coins", "--from", "coin_burst", "--set", "seed=5", "--set", "0.ramp=#e4f6fb,#7cc8e8,#2c6aa8", "--th", "เหรียญฟ้า");
ok(/ok/.test(cli("check", "blue_coins")), "new + check");
writeFileSync(path.join(ws, "effects", "broken.easyfx.json"), JSON.stringify({ format: "easyfx/1", base: "smoke", set: { "0.shape": "dragon", "0.count": -3 } }));
let out = "";
try {
  cli("check", "broken");
} catch (e) {
  out = String(e.stdout) + String(e.stderr);
}
ok(/layers\[0\]\.shape/.test(out) && /layers\[0\]\.count/.test(out), "check reports JSON paths and exits 1");
writeFileSync(path.join(ws, "effects", "broken.easyfx.json"), "{}");

cli("export", "--preset", "all");
for (const f of ["exports/easyfx-godot/project.godot", "exports/easyfx-godot/easyfx/frames/campfire.tres", "exports/easyfx-godot/easyfx/scenes/khom_loi.tscn", "exports/easyfx-godot/easyfx/particles/raya_fireworks.tscn", "exports/easyfx-pixi/sheets/pelita_flicker.json", "exports/easyfx-pixi/easyfx-pixi.js", "exports/easyfx-pixi/index.html", "exports/easyfx-png/sheets/songkran_splash.json", "exports/easyfx-json/effects/blue_coins.json"]) {
  ok(existsSync(path.join(ws, f)), `export → ${f}`);
}

rmSync(ws, { recursive: true, force: true });
console.log(failed ? "CLI smoke FAILED" : "CLI smoke OK");
process.exit(failed ? 1 : 0);
