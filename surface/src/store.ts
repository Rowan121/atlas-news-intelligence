import type {
  PipelineHealth,
  PipelineRunInput,
  StoryDetail,
  StoryQuery,
  StorySummary,
} from "./contracts";

export interface TruthStore {
  listStories(query: StoryQuery, now: Date, staleAfterSeconds: number): Promise<StorySummary[]>;
  getStory(clusterId: string): Promise<StoryDetail | null>;
  getHealth(now: Date, staleAfterSeconds: number): Promise<PipelineHealth>;
  upsertPipelineRun(run: PipelineRunInput, now: Date): Promise<"inserted" | "updated" | "replayed">;
}
