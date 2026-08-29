import type {
  PipelineHealth,
  PipelineRunInput,
  StoryDetail,
  StoryQuery,
  StorySummary,
} from "./contracts";

/**
 * The read-only truth-store contract that the public Worker, REST, MCP, and
 * A2A surfaces depend on. Deliberately contains no mutation method so that a
 * future route addition cannot accidentally expose a write path: the type
 * system rejects calling `upsertPipelineRun` through this interface.
 */
export interface ReadTruthStore {
  listStories(query: StoryQuery, now: Date, staleAfterSeconds: number): Promise<StorySummary[]>;
  getStory(clusterId: string): Promise<StoryDetail | null>;
  getHealth(now: Date, staleAfterSeconds: number): Promise<PipelineHealth>;
}

/**
 * The full read/write contract used only by offline ingestion tooling and
 * integration tests. The deployed Worker depends on {@link ReadTruthStore}
 * rather than this interface, so `upsertPipelineRun` is unreachable from any
 * HTTP request.
 */
export interface TruthStore extends ReadTruthStore {
  upsertPipelineRun(run: PipelineRunInput, now: Date): Promise<"inserted" | "updated" | "replayed">;
}
