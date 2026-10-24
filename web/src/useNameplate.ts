import { useEffect, useRef, useState } from "react";
import type { NameplateRequest } from "../../src/nameplate";
import type { WorkerRequest, WorkerResponse } from "./nameplate.worker";

// How long after the last change to rebuild the plate.
const DEBOUNCE_MS = 150;

export type Generated = Extract<WorkerResponse, { ok: true }>;
export type Refused = Extract<WorkerResponse, { ok: false }>;

/**
 * Builds the nameplate for the latest request in a worker. Keeps the last good plate while a new one is built,
 * and discards results that arrive after a newer request was sent.
 */
export function useNameplate(request: NameplateRequest | undefined) {
  const worker = useRef<Worker>(undefined);
  const latest = useRef(0);
  const [plate, setPlate] = useState<Generated>();
  const [refusal, setRefusal] = useState<Refused>();
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    const w = new Worker(new URL("./nameplate.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.id !== latest.current) return;
      setBuilding(false);
      if (data.ok) {
        setPlate(data);
        setRefusal(undefined);
      } else {
        setRefusal(data);
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (!request) return;
    const id = ++latest.current;
    setBuilding(true);
    const timer = setTimeout(() => worker.current?.postMessage({ id, request } satisfies WorkerRequest), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request]);

  return { plate, refusal, building };
}
