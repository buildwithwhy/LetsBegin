import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { selectModel, detectTaskType } from "@/lib/models";
import type { AgentType } from "@/lib/dag";

export const maxDuration = 60;

// Rich agent tools — real capabilities, not just demos

const codingTools = {
  writeCode: tool({
    description: "Write code to a file. Use this for any code generation — components, scripts, configs, etc.",
    inputSchema: z.object({
      language: z.string().describe("Programming language"),
      filename: z.string().describe("Full filename with extension"),
      code: z.string().describe("Complete file contents"),
      explanation: z.string().describe("Brief explanation of what this code does"),
    }),
    execute: async (input) => input,
  }),
  planImplementation: tool({
    description: "Plan an implementation approach before writing code",
    inputSchema: z.object({
      approach: z.string().describe("High-level approach"),
      steps: z.array(z.string()).describe("Ordered implementation steps"),
      files_to_create: z.array(z.string()).optional().describe("Files that will be created"),
      dependencies: z.array(z.string()).optional().describe("Required packages/dependencies"),
    }),
    execute: async (input) => input,
  }),
  generateConfig: tool({
    description: "Generate configuration files (package.json, .env, CI configs, etc.)",
    inputSchema: z.object({
      filename: z.string(),
      format: z.string().describe("json, yaml, toml, env, etc."),
      content: z.string().describe("Complete file contents"),
      explanation: z.string(),
    }),
    execute: async (input) => input,
  }),
};

const writingTools = {
  draftContent: tool({
    description: "Draft written content — blog posts, descriptions, social media posts, etc.",
    inputSchema: z.object({
      content_type: z.string().describe("What kind of content: blog post, social post, email, description, etc."),
      draft: z.string().describe("The full draft"),
      notes: z.string().optional().describe("Notes about tone, audience, or revisions"),
    }),
    execute: async (input) => input,
  }),
  draftEmail: tool({
    description: "Draft an email — outreach, follow-up, announcement, etc.",
    inputSchema: z.object({
      to: z.string().describe("Who this email is for (role/person description, not actual address)"),
      subject: z.string(),
      body: z.string(),
      tone: z.string().optional().describe("Tone: professional, casual, warm, etc."),
      follow_up_notes: z.string().optional().describe("Notes for follow-up timing and approach"),
    }),
    execute: async (input) => input,
  }),
  researchAndCompare: tool({
    description: "Research a topic and present structured findings, comparisons, or analysis",
    inputSchema: z.object({
      topic: z.string(),
      findings: z.string().describe("Detailed research findings"),
      comparison_table: z.array(z.object({
        item: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        verdict: z.string(),
      })).optional().describe("Structured comparison if comparing things"),
      recommendations: z.array(z.string()).optional(),
    }),
    execute: async (input) => input,
  }),
  createOutline: tool({
    description: "Create a structured outline for content, presentations, or plans",
    inputSchema: z.object({
      title: z.string(),
      sections: z.array(z.object({
        heading: z.string(),
        points: z.array(z.string()),
        notes: z.string().optional(),
      })),
      total_estimated_length: z.string().optional(),
    }),
    execute: async (input) => input,
  }),
  generateList: tool({
    description: "Generate a researched list — businesses to contact, tools to evaluate, ideas to explore, etc.",
    inputSchema: z.object({
      list_type: z.string().describe("What kind of list"),
      items: z.array(z.object({
        name: z.string(),
        description: z.string(),
        details: z.string().optional(),
        action_needed: z.string().optional(),
      })),
      total_count: z.number(),
    }),
    execute: async (input) => input,
  }),
  batchDraftEmails: tool({
    description: "Draft multiple personalized emails at once — for outreach campaigns, batch notifications, endorsement requests, etc. Each email is personalized to the recipient.",
    inputSchema: z.object({
      campaign_name: z.string().describe("Name of this email campaign"),
      template_notes: z.string().describe("Common elements and tone across all emails"),
      emails: z.array(z.object({
        to: z.string().describe("Recipient name and role/context"),
        subject: z.string(),
        body: z.string().describe("Fully personalized email body"),
        personalization_notes: z.string().optional().describe("What makes this email unique to this recipient"),
      })),
      follow_up_plan: z.string().optional().describe("When and how to follow up if no response"),
    }),
    execute: async (input) => input,
  }),
  extractAndResearch: tool({
    description: "Extract information from a document/list and research each item — find contact info, details, context. Great for finding authors from references, extracting names from lists, researching companies from a directory, etc.",
    inputSchema: z.object({
      source_description: z.string().describe("What we're extracting from"),
      extracted_items: z.array(z.object({
        name: z.string(),
        role: z.string().optional().describe("Role, title, or relationship"),
        context: z.string().describe("Why this person/item is relevant"),
        contact_info: z.string().optional().describe("Email, website, social, or how to find them"),
        notes: z.string().optional().describe("Any additional useful context"),
      })),
      total_found: z.number(),
      research_notes: z.string().optional().describe("General notes about the research process"),
    }),
    execute: async (input) => input,
  }),
};

export async function POST(req: Request) {
  const { taskId, title, description, projectContext, assignee, agentType } = await req.json();

  const taskType = detectTaskType(description);

  // Route to the right model based on agent type and task type
  const resolvedAgentType: AgentType = agentType || (taskType === "coding" ? "claude-code" : "builtin");
  const purpose = resolvedAgentType === "claude-code" || taskType === "coding"
    ? "execute-code"
    : "execute-write";
  const { model, label } = selectModel(purpose);

  const hybridNote = assignee === "hybrid"
    ? `\n\nIMPORTANT: This is a HYBRID task — you draft, then a human reviews and decides.
- When generating options or ideas, present ALL options clearly (numbered list) so the human can CHOOSE. Do NOT pick one for them.
- When drafting content, present it as a draft for review, not a final decision.
- Label your output clearly: "Here are 3 options for you to choose from:" or "Here's a draft for your review:"`
    : "";

  const agentIdentity = resolvedAgentType === "claude-code"
    ? "You are Claude Code, a powerful coding agent. You can reason deeply about code, plan implementations, and write production-quality code. Use the tools available to produce real, complete outputs — not placeholders."
    : "You are a helpful AI agent working on a project task. Use the tools available to produce thorough, actionable outputs. When drafting emails, create real personalized drafts. When researching, be specific and detailed. When creating lists, make them actionable.";

  const result = streamText({
    model,
    tools: taskType === "coding" ? codingTools : writingTools,
    stopWhen: stepCountIs(8),
    prompt: `${agentIdentity}

Project context: ${projectContext || "No additional context"}

Your current task:
Title: ${title}
Description: ${description}${hybridNote}

Complete this task using the available tools. Think through the approach, then use the appropriate tool(s) to produce your output. Be thorough but concise. Produce REAL, COMPLETE outputs — not summaries or placeholders.`,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          let event: Record<string, unknown> | null = null;

          if (part.type === "text-delta") {
            event = { type: "text", text: part.text };
          } else if (part.type === "tool-call") {
            event = {
              type: "tool_call",
              toolName: part.toolName,
              args: part.input,
            };
          } else if (part.type === "tool-result") {
            event = {
              type: "tool_result",
              toolName: part.toolName,
              result: part.output,
            };
          }

          if (event) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", text: String(err) }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Agent-Model": label,
      "X-Agent-Type": resolvedAgentType,
      "X-Task-Id": taskId,
    },
  });
}
