import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function LaunchpadQuoteNew() {
  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/launchpad"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Launchpad</Link>
      </Button>
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Launchpad · Simple Quote</p>
          <CardTitle>Simple quote flow coming next</CardTitle>
          <CardDescription className="leading-relaxed">
            This is where first-time operators will create a written Quote / Tax Invoice without touching the
            Core admin screens. The guided form is not built yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>When ready, this flow will capture: customer, job description, line items, GST, and a quote reference.</p>
          <p>It will write to the same underlying records as Core, but stay novice-friendly.</p>
        </CardContent>
      </Card>
    </div>
  );
}