import type { Diagnostic, EffectDoc, ResolvedEffect } from "../../src/shared/types";

export interface EffectListItem {
  id: string;
  th: string;
  en: string;
  category: string;
  tags: string[];
  source: "preset" | "workspace";
  width: number;
  height: number;
  frames: number;
  fps: number;
  loop: boolean;
}

export interface WorkspaceInfo {
  root: string;
  effects: EffectListItem[];
  broken: Array<{ id: string; errors: Diagnostic[] }>;
  ramps: Record<string, string[]>;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const fetchWorkspace = () => fetch("/api/workspace").then((r) => json<WorkspaceInfo>(r));
export const fetchEffect = (id: string) => fetch(`/api/effects/${id}`).then((r) => json<{ effect: ResolvedEffect; doc: EffectDoc | null; errors: Diagnostic[]; warnings: Diagnostic[] }>(r));
export const saveEffect = (id: string, doc: EffectDoc) => post(`/api/effects/${id}`, { doc }).then((r) => json<{ ok: boolean; file: string; errors: Diagnostic[]; warnings: Diagnostic[] }>(r));
export const exportEffects = (preset: string, ids?: string[]) => post("/api/export", { preset, ids }).then((r) => json<{ dirs: string[]; files: number; effects: string[]; warnings: string[] }>(r));
