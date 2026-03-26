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

// ─── User's AI tool inventory ───
// What tools/subscriptions the user already has access to

export type UserTool =
  | "claude-code"      // Claude Code CLI — coding, file ops, shell
  | "claude-cowork"    // Claude Cowork — collaborative sessions
  | "claude-max"       // Claude Max subscription (generous usage)
  | "chatgpt-plus"     // ChatGPT Plus — GPT-4o
  | "gemini-pro"       // Gemini Advanced / Pro
  | "api-anthropic"    // Own Anthropic API key
  | "api-google"       // Own Google AI API key
  | "api-openai";      // Own OpenAI API key

export interface UserToolConfig {
  available: UserTool[];
  preferred?: UserTool;  // user's preferred tool for ambiguous routing
}

// How a specific task should be executed given the user's tools
export interface TaskRouting {
  method: "api" | "byo";
  tool: UserTool | "our-api";
  label: string;       // display name e.g. "Claude Code", "Gemini Pro"
  icon: string;        // emoji
  promptStyle?: "claude-code" | "cowork" | "chatgpt" | "gemini" | "generic";
}

// Tool capabilities — what each tool is best at
export const TOOL_CAPABILITIES: Record<UserTool, {
  label: string;
  icon: string;
  strengths: ("coding" | "writing" | "research" | "planning" | "review" | "chat")[];
  promptStyle: "claude-code" | "cowork" | "chatgpt" | "gemini" | "generic";
  isApi: boolean;
}> = {
  "claude-code":   { label: "Claude Code",    icon: "\uD83E\uDDE0", strengths: ["coding", "planning", "review"], promptStyle: "claude-code", isApi: false },
  "claude-cowork": { label: "Claude Cowork",  icon: "\uD83E\uDD1D", strengths: ["planning", "writing", "review", "chat"], promptStyle: "cowork", isApi: false },
  "claude-max":    { label: "Claude Max",     icon: "\u2728",       strengths: ["coding", "writing", "research", "planning", "review", "chat"], promptStyle: "generic", isApi: false },
  "chatgpt-plus":  { label: "ChatGPT Plus",   icon: "\uD83D\uDCAC", strengths: ["writing", "research", "chat"], promptStyle: "chatgpt", isApi: false },
  "gemini-pro":    { label: "Gemini Pro",     icon: "\uD83D\uDC8E", strengths: ["writing", "research", "coding"], promptStyle: "gemini", isApi: false },
  "api-anthropic": { label: "Anthropic API",  icon: "\uD83D\uDD11", strengths: ["coding", "writing", "research", "planning", "review", "chat"], promptStyle: "generic", isApi: true },
  "api-google":    { label: "Google AI API",  icon: "\uD83D\uDD11", strengths: ["writing", "research", "coding"], promptStyle: "generic", isApi: true },
  "api-openai":    { label: "OpenAI API",     icon: "\uD83D\uDD11", strengths: ["coding", "writing", "research", "chat"], promptStyle: "generic", isApi: true },
};

// Route a task to the best available tool
export function routeTask(
  taskType: "coding" | "writing" | "research" | "planning" | "review",
  config: UserToolConfig,
): TaskRouting {
  // If user has no tools, use our API
  if (config.available.length === 0) {
    return { method: "api", tool: "our-api", label: "Auto", icon: "\u26A1", promptStyle: "generic" };
  }

  // If user set a preferred tool and it can handle this task type, use it
  if (config.preferred) {
    const cap = TOOL_CAPABILITIES[config.preferred];
    if (cap.strengths.includes(taskType)) {
      return {
        method: cap.isApi ? "api" : "byo",
        tool: config.preferred,
        label: cap.label,
        icon: cap.icon,
        promptStyle: cap.promptStyle,
      };
    }
  }

  // Smart routing: find the best tool for this task type
  // Priority: BYO subscriptions first (free for user), then API keys, then our API
  const ranked = config.available
    .filter((t) => TOOL_CAPABILITIES[t].strengths.includes(taskType))
    .sort((a, b) => {
      const capA = TOOL_CAPABILITIES[a];
      const capB = TOOL_CAPABILITIES[b];
      // Prefer non-API (subscriptions are "free" for the user) over API keys
      if (!capA.isApi && capB.isApi) return -1;
      if (capA.isApi && !capB.isApi) return 1;
      // For coding: prefer claude-code > claude-max > others
      if (taskType === "coding") {
        if (a === "claude-code") return -1;
        if (b === "claude-code") return 1;
      }
      // For writing: prefer cowork > claude-max > gemini > chatgpt
      if (taskType === "writing" || taskType === "review") {
        if (a === "claude-cowork") return -1;
        if (b === "claude-cowork") return 1;
      }
      return 0;
    });

  if (ranked.length > 0) {
    const best = ranked[0];
    const cap = TOOL_CAPABILITIES[best];
    return {
      method: cap.isApi ? "api" : "byo",
      tool: best,
      label: cap.label,
      icon: cap.icon,
      promptStyle: cap.promptStyle,
    };
  }

  // Fallback: our API
  return { method: "api", tool: "our-api", label: "Auto", icon: "\u26A1", promptStyle: "generic" };
}

export type Step = "dashboard" | "onboarding" | "input" | "clarify" | "compiling" | "reveal";

export type UserProfile = {
  mode: "planner" | "builder" | "full" | null;
  hasAiTools: boolean;
  setupMcp: boolean;
};

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
