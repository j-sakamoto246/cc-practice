// Internal application types (distinct from raw API shapes).

export interface Story {
  title: string;
  url: string;
  score: number;
  descendants: number;
}

export interface RankedStory extends Story {
  rank: number;
  ratio: number;
}

export type OutputFormat = "markdown" | "html" | "json";

export interface CliOptions {
  format: OutputFormat;
  minComments: number;
  fetchN: number;
  topN: number;
  help: boolean;
}
