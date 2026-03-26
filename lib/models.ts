import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// ── Model routing ──
// Primary: Anthropic (Claude) + Google (Gemini) for best quality
// Fallback: OpenRouter for redundancy + access to 200+ models
// The right model for each job — Claude for reasoning, Gemini for speed.

export type ModelPurpose =
  | "planning"      // Compiling brief into DAG — needs strong reasoning
  | "thinking"      // Streaming thinking observations — needs good reasoning
  | "subtasks"      // Generating subtask breakdowns — moderate reasoning
  | "clarify"       // Generating clarifying questions — fast/cheap
  | "execute-code"  // Executing coding agent tasks — needs strong coding
  | "execute-write" // Executing writing agent tasks — fast/cheap
  | "chat";         // Task guidance chat — needs good context handling

export type ModelLabel = "claude-sonnet" | "gemini-flash" | "openrouter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any;

interface ModelSelection {
  model: AnyModel;
  label: ModelLabel;
}

const CLAUDE_SONNET = "claude-sonnet-4-20250514";
const GEMINI_FLASH = "gemini-2.5-flash-preview-05-20";

// OpenRouter — used as fallback or for budget models
// Only initialized if OPENROUTER_API_KEY is set
const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        "HTTP-Referer": "https://letsbegin.app",
        "X-Title": "LetsBegin",
      },
    })
  : null;

// Map purposes to OpenRouter model IDs
const OPENROUTER_MODELS: Record<ModelPurpose, string> = {
  planning: "anthropic/claude-sonnet-4-20250514",
  thinking: "anthropic/claude-sonnet-4-20250514",
  "execute-code": "anthropic/claude-sonnet-4-20250514",
  chat: "anthropic/claude-sonnet-4-20250514",
  clarify: "google/gemini-2.5-flash-preview",
  "execute-write": "google/gemini-2.5-flash-preview",
  subtasks: "google/gemini-2.5-flash-preview",
};

function selectPrimary(purpose: ModelPurpose): ModelSelection | null {
  try {
    switch (purpose) {
      case "planning":
      case "thinking":
      case "execute-code":
      case "chat":
        if (!process.env.ANTHROPIC_API_KEY) return null;
        return {
          model: anthropic(CLAUDE_SONNET),
          label: "claude-sonnet",
        };

      case "clarify":
      case "execute-write":
      case "subtasks":
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
        return {
          model: google(GEMINI_FLASH),
          label: "gemini-flash",
        };
    }
  } catch {
    return null;
  }
}

function selectFallback(purpose: ModelPurpose): ModelSelection | null {
  if (!openrouter) return null;
  return {
    model: openrouter.chatModel(OPENROUTER_MODELS[purpose]),
    label: "openrouter",
  };
}

export function selectModel(purpose: ModelPurpose): ModelSelection {
  // Try primary provider first
  const primary = selectPrimary(purpose);
  if (primary) return primary;

  // Fall back to OpenRouter
  const fallback = selectFallback(purpose);
  if (fallback) return fallback;

  // Last resort — try primary without API key check (will fail at call time with a clear error)
  switch (purpose) {
    case "planning":
    case "thinking":
    case "execute-code":
    case "chat":
      return { model: anthropic(CLAUDE_SONNET), label: "claude-sonnet" };
    case "clarify":
    case "execute-write":
    case "subtasks":
      return { model: google(GEMINI_FLASH), label: "gemini-flash" };
  }
}

// Select model using a user-provided API key (BYOK)
export function selectModelWithUserKey(
  purpose: ModelPurpose,
  keys: { anthropic?: string | null; google?: string | null; openai?: string | null },
): ModelSelection {
  // Determine which provider this purpose needs
  const needsClaude = ["planning", "thinking", "execute-code", "chat"].includes(purpose);
  const needsGoogle = ["clarify", "execute-write", "subtasks"].includes(purpose);

  // Try the purpose-appropriate provider first with user key
  if (needsClaude && keys.anthropic) {
    const userAnthropic = createAnthropic({ apiKey: keys.anthropic });
    return { model: userAnthropic(CLAUDE_SONNET), label: "claude-sonnet" };
  }
  if (needsGoogle && keys.google) {
    const userGoogle = createGoogleGenerativeAI({ apiKey: keys.google });
    return { model: userGoogle(GEMINI_FLASH), label: "gemini-flash" };
  }

  // Cross-provider fallback: if user has a key but for the "wrong" provider, use it anyway
  if (keys.anthropic) {
    const userAnthropic = createAnthropic({ apiKey: keys.anthropic });
    return { model: userAnthropic(CLAUDE_SONNET), label: "claude-sonnet" };
  }
  if (keys.google) {
    const userGoogle = createGoogleGenerativeAI({ apiKey: keys.google });
    return { model: userGoogle(GEMINI_FLASH), label: "gemini-flash" };
  }

  // No user keys matched — fall back to default selection
  return selectModel(purpose);
}

// Select model with explicit OpenRouter preference (for budget mode)
export function selectBudgetModel(purpose: ModelPurpose): ModelSelection {
  const fallback = selectFallback(purpose);
  if (fallback) return fallback;
  return selectModel(purpose);
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
