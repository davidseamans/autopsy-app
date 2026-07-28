import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServiceClient } from "./_lib/supabase-server.js";

const PREVIEW_HOST =
  "autopsy-app-git-codex-voice-autopsy-integration-david-seamans.vercel.app";

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const host = String(req.headers.host ?? "").split(":")[0];
  const body = req.body ?? {};
  if (
    host !== PREVIEW_HOST ||
    body.embedded !== "flight-deck" ||
    body.test_payment !== "accepted"
  ) {
    return res.status(403).json({ error: "Preview admission is not available." });
  }

  try {
    const id = randomUUID();
    const email = `flight-deck-${id}@preview.autopsy.invalid`;
    const password = `${randomUUID()}-${randomUUID()}`;
    const service = createServiceClient();
    const { error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { autopsy_preview: true },
    });
    if (createError) throw createError;

    const auth = createClient(
      process.env.SUPABASE_URL ?? requireEnv("VITE_SUPABASE_URL"),
      process.env.SUPABASE_ANON_KEY ?? requireEnv("VITE_SUPABASE_ANON_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new Error("No preview session");

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (error) {
    console.error("Autopsy preview session failed", error);
    return res.status(503).json({ error: "The test Autopsy could not open." });
  }
}
