import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { clearPreviewClaimToken, readPreviewClaimToken } from "@/lib/flightDeckBridge";

export default function AutopsyClaim() {
  const { session, loading, signOut } = useAuth();
  const previewAccount = session?.user.app_metadata?.autopsy_preview === true;

  if (loading) return <ClaimStatus text="Checking your account…" />;

  if (previewAccount) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-16">
        <Card>
          <CardHeader>
            <CardTitle>Save your Autopsy before First 5 Jobs</CardTitle>
            <CardDescription>
              Your assessment is complete. Sign in or create your permanent account so the Verdict, explanation and First 5 Jobs access remain available when you return.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => void signOut()}>Sign in or create my account</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-16">
        <AuthGate
          heading="Sign in to save your Autopsy"
          description="Use the account you want to keep for your Verdict and First 5 Jobs records."
        >
          <ClaimWorker />
        </AuthGate>
      </div>
    );
  }

  return <ClaimWorker />;
}

function ClaimWorker() {
  const { runId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get("embedded") === "flight-deck";
  const { session } = useAuth();
  const navigate = useNavigate();
  const attempted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || !runId || attempted.current) return;
    attempted.current = true;
    const claimToken = readPreviewClaimToken();
    if (!claimToken) {
      setError("This browser no longer has the one-time recovery link for this Autopsy.");
      return;
    }

    void fetch("/api/autopsy-claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ runId, claimToken }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.claimed) throw new Error(payload.error || "The Autopsy could not be saved.");
        clearPreviewClaimToken();
        navigate(`/autopsy/run/${runId}${embedded ? "?embedded=flight-deck" : ""}`, { replace: true });
      })
      .catch((claimError) => setError(claimError instanceof Error ? claimError.message : "The Autopsy could not be saved."));
  }, [embedded, navigate, runId, session?.access_token]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-6 pt-16">
        <Card className="border-destructive/50"><CardHeader><CardTitle>Autopsy could not be saved</CardTitle><CardDescription>{error}</CardDescription></CardHeader></Card>
      </div>
    );
  }
  return <ClaimStatus text="Saving your Verdict and opening First 5 Jobs…" />;
}

function ClaimStatus({ text }: { text: string }) {
  return <div className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center gap-3 p-6 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5" /><Loader2 className="h-4 w-4 animate-spin" /> {text}</div>;
}
