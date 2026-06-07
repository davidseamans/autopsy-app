import { useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skull } from "lucide-react";

type Mode = "signin" | "signup";

/**
 * AuthGate enforces a valid Supabase Auth session before its children render.
 * While unauthenticated it shows a sign in / sign up form. Authorization is
 * based solely on the Supabase session — never on tester_email or a
 * client-supplied user_id.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  if (!session) {
    return <AuthForm />;
  }

  return <>{children}</>;
}

function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice(
          "Account created. If email confirmation is enabled, check your inbox to confirm before signing in.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err?.message ?? "Authentication failed.");
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
            {mode === "signin" ? "Sign in to continue" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A signed-in account is required to start an Autopsy run.
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
            <Label htmlFor="auth-email">Email</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={busy || !email.trim() || password.length < 6}
            className="w-full h-11 bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setMode("signup");
                setError(null);
                setNotice(null);
              }}
            >
              Need an account? Sign up
            </button>
          ) : (
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setMode("signin");
                setError(null);
                setNotice(null);
              }}
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
