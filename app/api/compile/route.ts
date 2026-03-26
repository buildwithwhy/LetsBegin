import { streamThinking } from "@/lib/compiler";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { brief, attachments } = await req.json();

  // Check for user-provided API keys
  const userKeys = {
    anthropic: req.headers.get("x-user-anthropic-key"),
    google: req.headers.get("x-user-google-key"),
    openai: req.headers.get("x-user-openai-key"),
  };
  const hasUserKeys = !!(userKeys.anthropic || userKeys.google || userKeys.openai);

  const images: { mediaType: string; data: string }[] = (attachments || [])
    .filter((a: { dataUrl: string }) => a.dataUrl?.startsWith("data:image"))
    .map((a: { dataUrl: string }) => {
      const [header, data] = a.dataUrl.split(",");
      const mediaType = header.match(/data:(.*?);/)?.[1] || "image/png";
      return { mediaType, data };
    });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamThinking(brief, images, hasUserKeys ? userKeys : undefined)) {
          const data = JSON.stringify(event) + "\n";
          controller.enqueue(encoder.encode(data));
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
      "Transfer-Encoding": "chunked",
    },
  });
}
