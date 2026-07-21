import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Autopsy } from "@/components/autopsy/Autopsy";
import { supabase } from "@/lib/supabase";

export default function PaidAutopsyEntry() {
  const [state, setState] = useState<"loading" | "authorised" | "blocked">("loading");

  useEffect(() => {
    void supabase
      .from("autopsy_entitlements")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setState(data ? "authorised" : "blocked"));
  }, []);

  if (state === "authorised") return <Autopsy />;
  if (state === "loading") return <main className="p-8 text-center">Confirming your Autopsy entitlement…</main>;
  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-semibold">No paid Autopsy is ready yet.</h1>
      <p className="mt-3 text-muted-foreground">Return to your conversation to ask any remaining questions or choose the assessment.</p>
      <Link className="mt-6 inline-block rounded-full bg-primary px-5 py-3 text-primary-foreground" to="/first-conversation">Return to the conversation</Link>
    </main>
  );
}

