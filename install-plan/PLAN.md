# Easy FX studio install plan (prepared, NOT applied)

Nothing below has been run against `/workspace/indie-studio`. Apply only after the user approves.

1. `git clone /workspace/easyfx /workspace/indie-studio/tools/easyfx && cd $_ && git checkout --detach <SHA>`
2. `npm ci && npm run build && npm test` (expect 72 passed, 1 skipped).
3. Copy `install-plan/easyfx-cli.mjs` → `/workspace/indie-studio/tools/easyfx-cli.mjs` (same shape as the other
   `easy*-cli.mjs` wrappers: sets `EASYFX_HOME`, `EASYFX_WORKSPACE`, adds `/workspace/indie-studio/projects` to
   `EASYFX_ALLOWED_DIRS`).
4. Copy `install-plan/EASYFX.md` → `/workspace/indie-studio/tools/EASYFX.md` and replace `<SHA>`.
5. Smoke: `node /workspace/indie-studio/tools/easyfx-cli.mjs init --workspace /workspace/indie-studio/projects/_smoke2`
   then `render campfire --scale 3 --out .../_smoke2/fx-campfire.png` and `export --workspace .../_smoke2`.
6. Shared skill: install `SKILL.draft.md` as `easyfx-effects` (the parent agent does this).
7. Once a GitHub repo exists (user's call): `git remote add github https://github.com/Saladin2020/easyfx.git` in the install.

Wrapper tested from this folder with `EASYFX_HOME=/workspace/easyfx`: init, render and a single-preset godot export
into a temp project all worked.
