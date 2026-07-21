import { createClient, type User } from "@supabase/supabase-js";
import type { ApiRequest } from "./http.js";

function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function createServiceClient() {
  return createClient(
    requireServerEnv("SUPABASE_URL"),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function authenticateRequest(req: ApiRequest): Promise<User | null> {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data, error } = await createServiceClient().auth.getUser(token);
  return error ? null : data.user;
}
