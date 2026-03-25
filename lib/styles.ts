import type { Energy } from "./dag";

// ─── Design tokens ───
// Single source of truth for all visual constants

export const PRIMARY = "#6366A0";
export const BG = "#F7F6F3";
export const BORDER = "#E5E4E0";
export const TEXT = "#37352F";
export const TEXT_LIGHT = "#9B9A97";
export const SURFACE = "#FFFFFF";
export const FONT = "'DM Sans', sans-serif";
export const MONO = "'DM Mono', 'Fira Code', monospace";

export const ENERGY_COLORS: Record<Energy, string> = {
  high: "#CF522E",
  medium: "#D4A72C",
  low: "#2DA44E",
};

// ─── Shared types ───

export type ExecutionMode = "api" | "byo";

export type Step = "dashboard" | "input" | "clarify" | "compiling" | "reveal";

export type ClarifyQuestion = {
  id: string;
  question: string;
  type: "yes_no" | "choice" | "short";
  options?: string[];
};

export interface SavedPlan {
  id: string;
  brief: string;
  project_title: string;
  summary: string;
  nodes: import("./dag").DagNode[];
  done_ids: string[];
  done_subtask_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PriorResult {
  title: string;
  assignee: string;
  output: string;
}
