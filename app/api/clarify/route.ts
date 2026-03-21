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

Generate 4-6 clarifying questions that would help you build a better plan. Include TWO categories of questions:

CATEGORY 1 — Project-specific questions (2-3 questions):
- What access, accounts, or tools they already have set up
- Their experience level with key technologies or processes involved
- Any constraints (timeline, budget, team size)
- Decisions that would significantly change the plan structure

CATEGORY 2 — Human calibration questions (2 questions):
These help you understand HOW to structure tasks for this specific person:
- Ask about their preferred task granularity. Example: "When you get a task like 'set up a developer account', do you prefer it broken into small steps (go to this URL, click this button) or just the goal?" with options like "Small detailed steps", "Just the key milestones", "Just tell me the goal"
- Ask about their experience or comfort level with the domain so you know whether to add explanatory context. Example: "How familiar are you with [the key domain in the brief]?" with options like "Never done it", "Done it once or twice", "Very comfortable"

Rules:
- Keep questions concise and conversational
- Use "yes_no" type for simple yes/no questions
- Use "choice" type when there are 2-4 clear options (provide them in "options")
- Use "short" type only when a brief free-text answer is needed
- Prefer yes_no and choice over short — they're faster to answer
- Each question needs a unique id (short slug like "has-account", "task-detail")
- Put the most impactful project questions first, then the calibration questions
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
