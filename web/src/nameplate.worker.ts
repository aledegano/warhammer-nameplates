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
  // Anything else that went wrong, such as the geometry engine failing to load.
  | { ok: false; failure: string }
);

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    await build(data);
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    self.postMessage({ id: data.id, ok: false, failure } satisfies WorkerResponse);
  }
};

async function build(data: WorkerRequest) {
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
}
