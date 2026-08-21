import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function CandidateResume() {
  const navigate = useNavigate();
  const { loading, session } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (loading || !session) return;
    void supabase.rpc("get_current_paid_autopsy_destination").then(({ data, error }) => {
      const destination = data as { kind?: string; run_id?: string } | null;
      if (!error && destination?.kind === "verdict" && destination.run_id) {
        navigate(`/autopsy/run/${destination.run_id}`, { replace: true });
        return;
      }
      if (!error && destination?.kind === "assessment") {
        navigate("/autopsy/paid", { replace: true });
        return;
      }
      navigate("/autopsy/history", { replace: true });
    });
  }, [loading, navigate, session]);

  async function sendLink() {
    const address = email.trim().toLowerCase();
    if (!address) return;
    setSending(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${window.location.origin}/autopsy/resume`,
        shouldCreateUser: false,
      },
    });
    setSending(false);
    setMessage(error ? error.message : "Check your email for your secure return link.");
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-14">
      <section className="rounded-3xl border bg-card p-7 shadow-sm sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Return to BuildOS</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Resume Autopsy or view your result</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Enter the email used when you chose Autopsy. We will send a secure sign-in link—no password is required.
        </p>
        <div className="mt-7 space-y-2">
          <Label htmlFor="resume-email">Email address</Label>
          <Input id="resume-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </div>
        <Button type="button" onClick={() => void sendLink()} disabled={sending || !email.trim()} className="mt-4 w-full gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? "Sending secure link…" : "Email my secure return link"}
        </Button>
        {message ? <p className="mt-4 text-sm font-medium">{message}</p> : null}
        <p className="mt-6 text-center text-sm text-muted-foreground"><Link className="underline underline-offset-4" to="/first-conversation">Talk with Hudson instead</Link></p>
      </section>
    </main>
  );
}
