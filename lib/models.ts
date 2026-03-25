import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

// ── Model routing ──
// Use the right model for each job instead of Gemini everywhere.
//
// Claude: reasoning, planning, coding, complex tasks
// Gemini: fast/cheap tasks — clarifying questions, image analysis, simple generation

export type ModelPurpose =
  | "planning"      // Compiling brief into DAG — needs strong reasoning
  | "thinking"      // Streaming thinking observations — needs good reasoning
  | "subtasks"      // Generating subtask breakdowns — moderate reasoning
  | "clarify"       // Generating clarifying questions — fast/cheap
  | "execute-code"  // Executing coding agent tasks — needs strong coding
  | "execute-write" // Executing writing agent tasks — fast/cheap
  | "chat";         // Task guidance chat — needs good context handling

export type ModelLabel = "claude-sonnet" | "gemini-flash";

interface ModelSelection {
  model: ReturnType<typeof anthropic> | ReturnType<typeof google>;
  label: ModelLabel;
}

const CLAUDE_SONNET = "claude-sonnet-4-20250514";
const GEMINI_FLASH = "gemini-2.5-flash-preview-05-20";

export function selectModel(purpose: ModelPurpose): ModelSelection {
  switch (purpose) {
    // Claude for reasoning-heavy work
    case "planning":
    case "thinking":
    case "execute-code":
    case "chat":
      return {
        model: anthropic(CLAUDE_SONNET) as ModelSelection["model"],
        label: "claude-sonnet",
      };

    // Gemini for fast/cheap generation
    case "clarify":
    case "execute-write":
    case "subtasks":
      return {
        model: google(GEMINI_FLASH) as ModelSelection["model"],
        label: "gemini-flash",
      };
  }
}

// Task type detection for execution routing
const CODING_KEYWORDS = [
  "code", "build", "implement", "script", "function", "component", "api",
  "endpoint", "database", "schema", "deploy", "configure", "install",
  "setup", "debug", "fix", "refactor", "test", "ci", "pipeline",
];

export function detectTaskType(description: string): "coding" | "writing" {
  const lower = description.toLowerCase();
  return CODING_KEYWORDS.some((kw) => lower.includes(kw)) ? "coding" : "writing";
}
