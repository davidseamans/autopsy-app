import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IdCard, FileText, Briefcase, LayoutDashboard, ArrowRight, CheckCircle2 } from "lucide-react";

const steps = [
  {
    icon: IdCard,
    title: "1. Complete Business Setup",
    body: "Confirm your business identity, ABN, GST status, and bank details. Nothing downstream works without this gate cleared.",
    href: "/business-setup",
    cta: "Open Business Setup",
  },
  {
    icon: FileText,
    title: "2. Create written quotes",
    body: "Every job starts as a written quote. Use a consistent quote reference so the record can be traced through to invoicing.",
    href: "/quotes",
    cta: "Go to Quotes",
  },
  {
    icon: Briefcase,
    title: "3. Convert accepted quotes into jobs",
    body: "Once a quote is accepted, convert it into a job. The quote reference carries through so the lineage stays intact.",
    href: "/jobs",
    cta: "Go to Jobs",
  },
  {
    icon: LayoutDashboard,
    title: "4. Feed the First 5 Jobs Dashboard",
    body: "Quotes and jobs created above populate the First 5 Jobs Dashboard. That dashboard is the operational view of your earliest work.",
    href: "/stage-1",
    cta: "View First 5 Jobs Dashboard",
  },
];

export default function Launchpad() {
  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Launchpad Intake</p>
        <h1 className="text-3xl font-semibold tracking-tight">Get set up before your first job</h1>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Launchpad Intake is the upstream sequence that feeds the First 5 Jobs Dashboard.
          Work through these steps in order. Skipping a step will create gaps that show up later as missing references,
          unbilled work, or unreconciled records.
        </p>
      </header>

      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={s.title}>
            <Card>
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="rounded-md border p-2 bg-muted/40">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription className="mt-1 leading-relaxed">{s.body}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link to={s.href}>
                    {s.cta} <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <Card className="bg-muted/30">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <CheckCircle2 className="h-5 w-5 mt-0.5 text-muted-foreground" />
          <div>
            <CardTitle className="text-sm">Why this order matters</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Business Setup establishes who you are on paper. Quotes establish what was agreed.
              Jobs establish what was delivered. The First 5 Jobs Dashboard reads from those records — if they don't exist, it stays empty.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}