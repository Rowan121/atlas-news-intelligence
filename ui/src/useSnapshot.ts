import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IntelligenceSnapshot,
  NewsIntelligenceClient,
  ProminenceMode,
  TimeWindow,
} from "./types";

export type SnapshotState =
  | { status: "loading"; data: IntelligenceSnapshot | null; error: null }
  | { status: "ready"; data: IntelligenceSnapshot; error: null }
  | { status: "empty"; data: IntelligenceSnapshot; error: null }
  | { status: "error"; data: IntelligenceSnapshot | null; error: Error };

export function useSnapshot(
  client: NewsIntelligenceClient,
  window: TimeWindow,
  prominence: ProminenceMode,
) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<SnapshotState>({
    status: "loading",
    data: null,
    error: null,
  });
  const lastData = useRef<IntelligenceSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: lastData.current, error: null });
    client
      .getSnapshot({ window, prominence, signal: controller.signal })
      .then((data) => {
        lastData.current = data;
        setState({
          status: data.clusters.length === 0 ? "empty" : "ready",
          data,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          data: lastData.current,
          error: error instanceof Error ? error : new Error("Unknown intelligence error"),
        });
      });
    return () => controller.abort();
  }, [client, prominence, revision, window]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { state, retry };
}
