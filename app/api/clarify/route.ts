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

Generate 3-5 clarifying questions that would help you build a better plan. Focus on:
- What access, accounts, or tools they already have set up
- Their experience level with key technologies or processes involved
- Any constraints (timeline, budget, team size)
- Decisions that would significantly change the plan structure

Rules:
- Keep questions concise and conversational
- Use "yes_no" type for simple yes/no questions
- Use "choice" type when there are 2-4 clear options (provide them in "options")
- Use "short" type only when a brief free-text answer is needed
- Prefer yes_no and choice over short — they're faster to answer
- Each question needs a unique id (short slug like "has-account", "exp-level")
- Order questions from most impactful to least impactful
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
