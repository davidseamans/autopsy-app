import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "./_lib/supabase-server.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "A valid session is required." });
  } catch {
    return res.status(503).json({ error: "Assessment authentication is not configured." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Hudson's voice is not configured." });

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 1800) {
    return res.status(400).json({ error: "A short passage is required." });
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "cedar",
      input: text,
      instructions: "Use a clear, mature male voice with steady projection. Speak in a calm, direct Australian conversational manner. Keep the volume and energy consistent from beginning to end. Be attentive and natural, never breathy, whispering, theatrical, synthetic, instructional or like an assessor reading a report.",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    console.error("Assessment speech failed", response.status);
    return res.status(502).json({ error: "Hudson could not speak just now." });
  }

  const audio = Buffer.from(await response.arrayBuffer());
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(audio);
}
