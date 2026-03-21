import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const questionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      type: z.enum(["yes_no", "choice", "short"]),
      options: z.array(z.string()).optional(),
    })
  ),
});

export type ClarifyQuestion = {
  id: string;
  question: string;
  type: "yes_no" | "choice" | "short";
  options?: string[];
};

export async function POST(req: Request) {
  const { brief } = await req.json();

  try {
    const result = await generateObject({
      model: google("gemini-3-flash-preview"),
      schema: questionsSchema,
      prompt: `You are a project planning assistant. A user wants help with this project:

"${brief}"

Generate 4-6 clarifying questions. Include THREE categories:

CATEGORY 1 — Project-specific questions (2-3 questions):
- What access, accounts, or tools they already have set up
- Any constraints (timeline, budget, team size)
- Decisions that would significantly change the plan structure

CATEGORY 2 — Task granularity preference (1 question):
This must be EXAMPLE-BASED using a real task from their brief. Pick a specific task that will likely be in the plan, then show it at two granularity levels and ask which they prefer.
Format it like this:
  Question: "For a task like '[pick a real task from their brief]', which level of detail works best for you?"
  Options should be something like:
    - "Step by step — e.g. 'Go to [specific URL], click [specific button], fill in [specific field]...'" (use real steps for the example task)
    - "Key milestones — e.g. 'Create account, complete enrollment, verify identity'" (use real milestones)
    - "Just the goal — e.g. 'Set up [whatever] account'" (use the real task name)
  The examples in each option MUST be specific to the task you picked, not generic.

CATEGORY 3 — Agent trust (1 question):
Ask how much oversight the user wants over AI-handled tasks.
  Question: something like "When the AI completes a task for you, how much do you want to review?"
  Options: "Review everything before it counts", "Just flag me on important ones", "I trust it — let it run"

Rules:
- Keep questions concise and conversational
- Use "yes_no" type for simple yes/no questions
- Use "choice" type when there are 2-4 clear options (provide them in "options")
- Use "short" type only when a brief free-text answer is needed
- Prefer yes_no and choice over short — they're faster to answer
- Each question needs a unique id (short slug like "has-account", "task-detail", "agent-trust")
- Put project-specific questions first, then granularity, then agent trust
- Don't ask obvious questions or things you can infer from the brief`,
    });

    return Response.json(result.object);
  } catch (err) {
    return Response.json(
      { error: String(err), questions: [] },
      { status: 500 }
    );
  }
}
