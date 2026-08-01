import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConversationalAutopsy } from "@/components/autopsy/ConversationalAutopsy";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { storePreviewClaimToken } from "@/lib/flightDeckBridge";

const INTEGRATION_PREVIEW_HOST =
  "autopsy-app-git-codex-voice-autopsy-integration-david-seamans.vercel.app";

export default function PaidAutopsyEntry() {
  const { loading: authLoading, session } = useAuth();
  const embeddedFlightDeck =
    new URLSearchParams(window.location.search).get("embedded") === "flight-deck";
  const previewTestPayment =
    window.location.hostname === INTEGRATION_PREVIEW_HOST &&
    new URLSearchParams(window.location.search).get("test_payment") === "accepted" &&
    embeddedFlightDeck;
  const [state, setState] = useState<"loading" | "authorised" | "blocked">(
    "loading",
  );

  useEffect(() => {
    if (authLoading) return;
    if (previewTestPayment) {
      if (session) {
        setState("authorised");
        return;
      }
      void fetch("/api/autopsy-preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedded: "flight-deck", test_payment: "accepted" }),
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload.access_token || !payload.refresh_token || !payload.claim_token) {
            throw new Error(payload.error || "Preview session unavailable.");
          }
          const { error } = await supabase.auth.setSession({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
          });
          if (error) throw error;
          storePreviewClaimToken(payload.claim_token);
          setState("authorised");
        })
        .catch(() => setState("blocked"));
      return;
    }
    void supabase
      .from("autopsy_entitlements")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setState(data ? "authorised" : "blocked"));
  }, [authLoading, previewTestPayment, session]);

  if (state === "authorised") return (
    <>
      {previewTestPayment ? (
        <div className="fixed inset-x-0 top-0 z-20 border-b border-[#6f531d] bg-[#071d35] px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#e4bd78]">
          Test mode · payment phrase accepted · no Stripe transaction
        </div>
      ) : null}
      <ConversationalAutopsy />
    </>
  );
  if (state === "loading") return <main className="min-h-screen bg-[#06111c] p-8 pt-24 text-center text-[#dce8ec]">Opening your governed Autopsy…</main>;
  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-semibold">No paid Autopsy is ready yet.</h1>
      <p className="mt-3 text-muted-foreground">Return to your conversation to ask any remaining questions or choose the assessment.</p>
      <Link className="mt-6 inline-block rounded-full bg-primary px-5 py-3 text-primary-foreground" to="/first-conversation">Return to the conversation</Link>
    </main>
  );
}
