/// <reference lib="webworker" />
import { generateNameplate, type NameplateRequest, type NameplateResult } from "../../src/nameplate";
import { toStl } from "../../src/stl";

export interface WorkerRequest {
  id: number;
  request: NameplateRequest;
}

export type WorkerResponse = { id: number } & (
  | (Extract<NameplateResult, { ok: true }> & { stl: Uint8Array })
  | Extract<NameplateResult, { ok: false }>
);

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const result = await generateNameplate(data.request);
  if (!result.ok) {
    self.postMessage({ id: data.id, ...result } satisfies WorkerResponse);
    return;
  }
  const stl = toStl(result.mesh);
  self.postMessage({ id: data.id, ...result, stl } satisfies WorkerResponse, [
    result.mesh.positions.buffer,
    result.mesh.triangles.buffer,
    stl.buffer,
  ]);
};
