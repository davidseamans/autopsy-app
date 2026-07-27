import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConversationalAutopsy } from "@/components/autopsy/ConversationalAutopsy";
import { supabase } from "@/lib/supabase";

const INTEGRATION_PREVIEW_HOST =
  "autopsy-app-git-codex-voice-autopsy-integration-david-seamans.vercel.app";

export default function PaidAutopsyEntry() {
  const previewTestPayment =
    window.location.hostname === INTEGRATION_PREVIEW_HOST &&
    new URLSearchParams(window.location.search).get("test_payment") === "accepted";
  const [state, setState] = useState<"loading" | "authorised" | "blocked">(
    previewTestPayment ? "authorised" : "loading",
  );

  useEffect(() => {
    if (previewTestPayment) return;
    void supabase
      .from("autopsy_entitlements")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setState(data ? "authorised" : "blocked"));
  }, [previewTestPayment]);

  if (state === "authorised") return (
    <>
      {previewTestPayment ? (
        <div className="bg-amber-50 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-amber-900">
          Test mode · payment phrase accepted · no Stripe transaction
        </div>
      ) : null}
      <ConversationalAutopsy />
    </>
  );
  if (state === "loading") return <main className="p-8 text-center">Confirming your Autopsy entitlement…</main>;
  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-semibold">No paid Autopsy is ready yet.</h1>
      <p className="mt-3 text-muted-foreground">Return to your conversation to ask any remaining questions or choose the assessment.</p>
      <Link className="mt-6 inline-block rounded-full bg-primary px-5 py-3 text-primary-foreground" to="/first-conversation">Return to the conversation</Link>
    </main>
  );
}
