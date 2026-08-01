import { createHash, randomBytes, randomUUID } from "node:crypto";
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
    const email = `flight-deck+${id}@davidseamans.com.au`;
    const password = randomUUID();
    const claimToken = randomBytes(32).toString("base64url");
    const claimTokenHash = createHash("sha256").update(claimToken).digest("hex");
    const service = createServiceClient();
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { autopsy_preview: true },
    });
    if (createError || !created.user) throw createError ?? new Error("No preview user");

    const { error: claimError } = await service
      .from("autopsy_preview_claims")
      .insert({
        preview_user_id: created.user.id,
        claim_token_hash: claimTokenHash,
      });
    if (claimError) {
      await service.auth.admin.deleteUser(created.user.id);
      throw claimError;
    }

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
      claim_token: claimToken,
    });
  } catch (error) {
    console.error("Autopsy preview session failed", error);
    return res.status(503).json({ error: "The test Autopsy could not open." });
  }
}
