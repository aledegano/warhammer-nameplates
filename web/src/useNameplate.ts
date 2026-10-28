import { useEffect, useRef, useState } from "react";
import type { NameplateRequest } from "../../src/nameplate";
import type { WorkerRequest, WorkerResponse } from "./nameplate.worker";

// How long after the last change to rebuild the plate.
const DEBOUNCE_MS = 150;

export type Generated = Extract<WorkerResponse, { ok: true }>;
export type Refused = Extract<WorkerResponse, { error: unknown }>;

/**
 * Builds the nameplate for the latest request in a worker. Keeps the last good plate while a new one is built,
 * and discards results that arrive after a newer request was sent. `builtFor` is the request the latest result
 * answers, so callers can tell whether the shown plate still matches the current settings. `failure` says why
 * the latest plate couldn't be built when the worker itself went wrong, rather than the core refusing it.
 */
export function useNameplate(request: NameplateRequest | undefined) {
  const worker = useRef<Worker>(undefined);
  const latest = useRef<{ id: number; request?: NameplateRequest }>({ id: 0 });
  const [plate, setPlate] = useState<Generated>();
  const [refusal, setRefusal] = useState<Refused>();
  const [failure, setFailure] = useState<string>();
  const [builtFor, setBuiltFor] = useState<NameplateRequest>();

  useEffect(() => {
    const w = new Worker(new URL("./nameplate.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.id !== latest.current.id) return;
      setBuiltFor(latest.current.request);
      if (data.ok) {
        setPlate(data);
        setRefusal(undefined);
        setFailure(undefined);
      } else if ("failure" in data) {
        setRefusal(undefined);
        setFailure(data.failure);
      } else {
        setRefusal(data);
        setFailure(undefined);
      }
    };
    // The worker couldn't run at all, for example because its script failed to load.
    w.onerror = (event) => {
      event.preventDefault();
      setBuiltFor(latest.current.request);
      setRefusal(undefined);
      setFailure(event.message || "the preview worker didn't start");
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (!request) return;
    const id = latest.current.id + 1;
    latest.current = { id, request };
    const timer = setTimeout(() => worker.current?.postMessage({ id, request } satisfies WorkerRequest), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request]);

  return { plate, refusal, failure, builtFor };
}
