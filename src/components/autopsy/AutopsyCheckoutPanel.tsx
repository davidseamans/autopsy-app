import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type PaymentState = "idle" | "starting" | "verifying" | "paid" | "cancelled" | "error";

export function AutopsyCheckoutPanel({ conversationId }: { conversationId: string | null }) {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PaymentState>(searchParams.get("checkout") === "cancelled" ? "cancelled" : "idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sendingLink, setSendingLink] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (searchParams.get("checkout") !== "success" || !sessionId || !session?.access_token) return;
    let cancelled = false;
    let attempts = 0;
    setState("verifying");
    setMessage("Stripe has returned you safely. We are waiting for the signed payment confirmation.");

    const verify = async () => {
      attempts += 1;
      const response = await fetch(`/api/stripe/checkout-status?session_id=${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json();
      if (cancelled) return;
      if (response.ok && payload.status === "paid" && payload.entitlementStatus === "active") {
        setState("paid");
        setMessage("Payment is verified. Your Autopsy assessment is ready when you are.");
        return;
      }
      if (attempts < 8) window.setTimeout(verify, 1250);
      else {
        setState("error");
        setMessage("Payment confirmation is taking longer than expected. Nothing has been charged twice; refresh this page shortly.");
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [searchParams, session?.access_token]);

  const beginCheckout = async () => {
    if (!conversationId || !session?.access_token) return;
    setState("starting");
    setMessage("");
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ conversationId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "Checkout could not start.");
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Checkout could not start.");
    }
  };

  const identifyCandidate = async () => {
    const address = email.trim().toLowerCase();
    if (!address) return;
    setSendingLink(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${window.location.origin}/first-conversation?resume=checkout`,
        shouldCreateUser: true,
      },
    });
    setSendingLink(false);
    setMessage(error ? error.message : "Check your email for the secure link that returns you here. No password is required.");
  };

  return (
    <aside className="mt-6 rounded-3xl border border-[#9fc5b0] bg-[#eef8f1] p-5 text-[#17392a] shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#28734c]">When your questions are answered</p>
      <h2 className="mt-2 text-xl font-semibold">You can choose the $69 Autopsy.</h2>
      <p className="mt-2 text-sm leading-6 text-[#365d49]">
        This conversation is free and is not the assessment. Autopsy is the separate twelve-subject assessment of your readiness to carry the responsibility of a business.
      </p>
      <p className="mt-2 text-sm leading-6 text-[#365d49]">
        The verdict may support moving forward, recommend preparation first, or say not to proceed at present. Each is a useful result; payment does not guarantee entry to First 5 Jobs.
      </p>
      {message ? <p className={`mt-4 text-sm font-medium ${state === "error" ? "text-[#9a3428]" : "text-[#245f40]"}`}>{message}</p> : null}
      {!session ? (
        <div className="mt-5 rounded-2xl border border-[#b8d7c4] bg-white p-4">
          <label htmlFor="candidate-email" className="text-sm font-bold">Where should we preserve your Autopsy?</label>
          <p className="mt-1 text-xs leading-5 text-[#52705f]">Your email creates a private Candidate identity for payment, resuming and results. It does not create a BuildOS Tenant.</p>
          <input id="candidate-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-3 w-full rounded-xl border border-[#b8d7c4] px-4 py-3 text-sm" />
          <button type="button" onClick={() => void identifyCandidate()} disabled={sendingLink || !email.trim()} className="mt-3 rounded-full bg-[#28734c] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">
            {sendingLink ? "Sending secure link…" : "Email my secure link"}
          </button>
        </div>
      ) : !conversationId ? (
        <p className="mt-5 rounded-2xl border border-[#b8d7c4] bg-white px-4 py-3 text-sm font-medium">Your secure identity is active. Preserving this conversation before Checkout…</p>
      ) : state === "paid" ? (
        <Link to="/autopsy/paid" className="mt-5 inline-flex rounded-full bg-[#17392a] px-6 py-3 text-sm font-bold text-white">
          Begin my Autopsy assessment
        </Link>
      ) : (
        <button
          type="button"
          onClick={beginCheckout}
          disabled={!conversationId || state === "starting" || state === "verifying"}
          className="mt-5 rounded-full bg-[#28734c] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "starting" ? "Opening secure Checkout…" : state === "verifying" ? "Verifying payment…" : "Choose Autopsy — $69 AUD"}
        </button>
      )}
      <p className="mt-3 text-xs text-[#52705f]">One-time payment. No subscription. Secure Checkout by Stripe. Candidate identity only—no Tenant is created.</p>
    </aside>
  );
}
