import { useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const optionsClass = "flex flex-wrap gap-2";

export function FollowUpPractice() {
  const [channel, setChannel] = useState("");
  const [customerResponse, setCustomerResponse] = useState("");
  const [nextStep, setNextStep] = useState("");
  const ready = Boolean(channel && customerResponse && nextStep);
  const opening = channel === "Text" ? "Hi Sam, it’s Alex from Harbour Cleaning." : channel === "Email" ? "Hi Sam, I’m following up on quote Q-12 for your office clean." : "Hi Sam, it’s Alex from Harbour Cleaning. I’m calling about quote Q-12 for your office clean.";
  const responseLine = customerResponse === "Ready to decide" ? "Is everything clear, and would you like me to book the work?" : customerResponse === "Has a question" ? "What would you like me to clarify before you decide?" : customerResponse === "Needs more time" ? "That’s fine. When would be a reasonable time for me to follow up?" : "Choose the customer’s position to complete the conversation.";
  const nextLine = nextStep === "Book the work" ? "Great—I’ll confirm the agreed date and access details." : nextStep === "Agree one follow-up" ? "I’ll contact you once on the agreed date." : nextStep === "Close the quote" ? "Thanks for considering the quote. I’ll close it now." : "Choose one clear next step.";

  return <Card className="border-blue-300 bg-blue-50/30">
    <CardHeader><CardTitle>Practice: follow up quote Q-12</CardTitle><CardDescription>Build a short follow-up that asks for a decision without discounting or applying pressure. This practice is not saved and does not update the quote.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      <Decision number="1" title="Choose the appropriate channel" description="Use the channel already agreed with the customer."><Choice options={["Phone", "Text", "Email"]} selected={channel} onSelect={setChannel} /></Decision>
      <Decision number="2" title="Identify the customer’s position" description="Listen before deciding the next move."><Choice options={["Ready to decide", "Has a question", "Needs more time"]} selected={customerResponse} onSelect={setCustomerResponse} /></Decision>
      <Decision number="3" title="Finish with one clear next step" description="Do not leave the follow-up vague."><Choice options={["Book the work", "Agree one follow-up", "Close the quote"]} selected={nextStep} onSelect={setNextStep} /></Decision>
      <div className={`rounded-xl border p-5 ${ready ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}><p className="font-semibold">Your follow-up</p><div className="mt-3 space-y-2 rounded-lg border bg-white p-4 text-sm leading-6"><p>{opening}</p><p>Did the quote reach you?</p><p>{responseLine}</p><p>{nextLine}</p></div><p className="mt-3 text-sm text-muted-foreground">{ready ? "The conversation now has a purpose, a decision question and a recorded next step." : "Complete all three decisions to finish the follow-up."}</p></div>
      <Boundary>This tool prepares the conversation only. It does not contact the customer, change the quote status or create a booking.</Boundary>
    </CardContent>
  </Card>;
}

export function RejectedQuotePractice() {
  const [firstResponse, setFirstResponse] = useState("");
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const [record, setRecord] = useState("");
  const responseSafe = firstResponse === "Thank and accept";
  const feedbackSafe = feedback === "Ask one optional question";
  const recordSafe = record === "Mark rejected";
  const ready = responseSafe && feedbackSafe && Boolean(reason) && recordSafe;

  return <Card className="border-amber-300 bg-amber-50/30">
    <CardHeader><CardTitle>Practice: the customer chose another supplier</CardTitle><CardDescription>Close the quote professionally and capture only useful feedback. No customer or quote record is changed.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      <Decision number="1" title="Respond to the decision" description="The customer has already said no."><Choice options={["Thank and accept", "Argue the value", "Offer an instant discount"]} selected={firstResponse} onSelect={setFirstResponse} />{firstResponse && !responseSafe ? <Warning>That resists the customer’s decision. Accept the outcome before asking for feedback.</Warning> : null}</Decision>
      <Decision number="2" title="Ask for feedback" description="The customer is not required to explain."><Choice options={["Ask one optional question", "Demand detailed reasons", "Send repeated questions"]} selected={feedback} onSelect={setFeedback} />{feedback && !feedbackSafe ? <Warning>That turns learning into pressure. Ask once and make the answer optional.</Warning> : null}</Decision>
      <Decision number="3" title="Record the main reason" description="Use the customer’s words. Do not invent a story."><Choice options={["Price", "Scope", "Timing", "Confidence", "Another supplier", "No reason provided"]} selected={reason} onSelect={setReason} /></Decision>
      <Decision number="4" title="Close the record accurately" description="A rejected quote is not outstanding."><Choice options={["Mark rejected", "Leave outstanding", "Delete the quote"]} selected={record} onSelect={setRecord} />{record && !recordSafe ? <Warning>That damages the conversion record. Preserve the quote and mark its actual outcome.</Warning> : null}</Decision>
      <div className={`rounded-xl border p-5 ${ready ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}><div className="flex items-center justify-between gap-3"><p className="font-semibold">Professional close</p><Status ready={ready} /></div><blockquote className="mt-3 rounded-lg border bg-white p-4 text-sm leading-6">“Thanks for letting me know. So I can improve future quotes, was there one main reason you decided not to proceed? No problem if you would rather not say.”</blockquote>{ready ? <p className="mt-3 text-sm">Outcome: rejected. Feedback: {reason}. The relationship is intact and the record is honest.</p> : <p className="mt-3 text-sm text-muted-foreground">Complete the four decisions without arguing, chasing or distorting the record.</p>}</div>
      <Boundary>This practice does not discount, revise, delete or change a production quote.</Boundary>
    </CardContent>
  </Card>;
}

export function JobCloseoutPractice() {
  const [estimatedHours, setEstimatedHours] = useState(4);
  const [actualHours, setActualHours] = useState(4.5);
  const [budgetCosts, setBudgetCosts] = useState(12);
  const [actualCosts, setActualCosts] = useState(18);
  const [checks, setChecks] = useState({ actuals: false, customer: false, invoice: false, payment: false, referral: false });
  const hoursVariance = actualHours - estimatedHours;
  const costVariance = actualCosts - budgetCosts;
  const deliveryComplete = checks.actuals && checks.customer && checks.invoice;
  const financiallyClosed = deliveryComplete && checks.payment;

  function toggle(key: keyof typeof checks) { setChecks((current) => ({ ...current, [key]: !current[key] })); }

  return <Card className="border-emerald-300 bg-emerald-50/30">
    <CardHeader><CardTitle>Practice: close out the completed job</CardTitle><CardDescription>Compare the estimate with what happened, then complete the operational and money records. This practice does not write to the Job Cost Summary.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Estimated hours" value={estimatedHours} onChange={setEstimatedHours} />
        <NumberField label="Actual hours" value={actualHours} onChange={setActualHours} />
        <NumberField label="Consumables budget" value={budgetCosts} onChange={setBudgetCosts} money />
        <NumberField label="Actual consumables" value={actualCosts} onChange={setActualCosts} money />
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Variance label="Hours variance" value={`${signed(hoursVariance)} hours`} unfavourable={hoursVariance > 0} /><Variance label="Consumables variance" value={currencyVariance(costVariance)} unfavourable={costVariance > 0} /></div>
      <div className="rounded-xl border bg-white p-5"><p className="font-semibold">Job close-out checklist</p><p className="mt-1 text-sm text-muted-foreground">An operationally completed job and a financially closed job are not always the same thing.</p><div className="mt-4 space-y-3">
        <CheckLine checked={checks.actuals} onChange={() => toggle("actuals")} label="Actual hours and costs recorded" />
        <CheckLine checked={checks.customer} onChange={() => toggle("customer")} label="Customer confirmed the agreed work is complete" />
        <CheckLine checked={checks.invoice} onChange={() => toggle("invoice")} label="Final invoice reviewed and issued" />
        <CheckLine checked={checks.payment} onChange={() => toggle("payment")} label="Payment actually received and recorded" />
        <CheckLine checked={checks.referral} onChange={() => toggle("referral")} label="Ongoing work or referral requested when appropriate" />
      </div></div>
      <div className="grid gap-3 sm:grid-cols-2"><CompletionPanel title="Delivery record" ready={deliveryComplete} readyText="Complete" waitingText="Actuals, customer confirmation and invoice are required." /><CompletionPanel title="Money record" ready={financiallyClosed} readyText="Paid and closed" waitingText={deliveryComplete ? "Invoice remains visible as money owing until payment is received." : "Finish the delivery record first."} /></div>
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">A variance is information, not an automatic failure. Ask what caused it and use the answer to improve the next inspection, estimate or scope.</p>
      <Boundary>This exercise does not change a job, generate an invoice, record a payment or contact a customer.</Boundary>
    </CardContent>
  </Card>;
}

function Decision({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className="rounded-xl border bg-white p-5"><div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#082849] text-sm font-semibold text-white">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div><div className="mt-4">{children}</div></section>;
}

function Choice({ options, selected, onSelect }: { options: string[]; selected: string; onSelect: (value: string) => void }) {
  return <div className={optionsClass}>{options.map((option) => <Button key={option} type="button" size="sm" variant={selected === option ? "default" : "outline"} onClick={() => onSelect(option)}>{option}</Button>)}</div>;
}

function Warning({ children }: { children: ReactNode }) { return <p className="mt-3 rounded-md bg-amber-100 p-3 text-sm text-amber-950">{children}</p>; }
function Boundary({ children }: { children: ReactNode }) { return <p className="text-xs text-muted-foreground">{children}</p>; }
function Status({ ready }: { ready: boolean }) { return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ready ? "bg-emerald-700 text-white" : "bg-muted text-muted-foreground"}`}>{ready ? "Closed properly" : "Incomplete"}</span>; }

function NumberField({ label, value, onChange, money = false }: { label: string; value: number; onChange: (value: number) => void; money?: boolean }) {
  return <Label className="space-y-2 text-xs"><span>{label}</span><span className="flex items-center rounded-md border bg-white px-3">{money ? <span className="text-muted-foreground">$</span> : null}<Input type="number" min="0" step="0.5" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="border-0 px-2 shadow-none focus-visible:ring-0" /></span></Label>;
}

function Variance({ label, value, unfavourable }: { label: string; value: string; unfavourable: boolean }) { return <div className={`rounded-xl border p-4 ${unfavourable ? "border-amber-300 bg-amber-50" : "bg-white"}`}><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${unfavourable ? "text-amber-900" : ""}`}>{value}</p></div>; }
function CheckLine({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) { return <Label className="flex cursor-pointer items-center gap-3 text-sm"><Checkbox checked={checked} onCheckedChange={onChange} />{label}</Label>; }
function CompletionPanel({ title, ready, readyText, waitingText }: { title: string; ready: boolean; readyText: string; waitingText: string }) { return <div className={`rounded-xl border p-4 ${ready ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}><div className="flex items-center gap-2">{ready ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <Circle className="h-5 w-5 text-muted-foreground" />}<p className="font-semibold">{title}</p></div><p className="mt-2 text-sm">{ready ? readyText : waitingText}</p></div>; }

const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const currencyVariance = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
