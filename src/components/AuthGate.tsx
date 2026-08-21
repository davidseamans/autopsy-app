import { useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skull } from "lucide-react";

/**
 * AuthGate enforces a valid Supabase Auth session before its children render.
 * While unauthenticated it sends a passwordless secure return link. Authorization is
 * based solely on the Supabase session — never on tester_email or a
 * client-supplied user_id.
 */
export function AuthGate({
  children,
  heading,
  description,
  allowDemo = false,
}: {
  children: ReactNode;
  heading?: string;
  description?: string;
  allowDemo?: boolean;
}) {
  const { session, loading } = useAuth();
  const demonstrationOnly = allowDemo
    && new URLSearchParams(window.location.search).get("demo") === "1";

  if (demonstrationOnly) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  if (!session) {
    return <AuthForm heading={heading} description={description} />;
  }

  return <>{children}</>;
}

function AuthForm({ heading, description }: { heading?: string; description?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`,
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setNotice("Check your email for your secure return link. No password is required.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-[hsl(var(--autopsy-surface))] shadow-sm">
      <div className="p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-[hsl(var(--autopsy-accent-soft))] flex items-center justify-center mb-4">
            <Skull className="h-7 w-7 text-[hsl(var(--autopsy-accent))]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {heading ?? "Return securely"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {description ?? "Use the email connected to your Autopsy or BuildOS access."}
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Authentication error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="mb-4">
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email address</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@example.com"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full h-11 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            {busy
              ? "Please wait…"
              : "Email my secure link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
