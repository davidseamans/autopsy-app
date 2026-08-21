import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public Hudson and Candidate identity boundary", () => {
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const conversation = readFileSync(resolve("src/pages/FirstConversation.tsx"), "utf8");
  const checkout = readFileSync(resolve("src/components/autopsy/AutopsyCheckoutPanel.tsx"), "utf8");
  const resume = readFileSync(resolve("src/pages/CandidateResume.tsx"), "utf8");
  const authGate = readFileSync(resolve("src/components/AuthGate.tsx"), "utf8");

  it("keeps Hudson public and moves identification to the purchase boundary", () => {
    expect(app).toContain("const FirstConversationRoute = () => <FirstConversation />");
    expect(app).toContain('<Navigate to="/first-conversation" replace />');
    expect(checkout).toContain("signInWithOtp");
    expect(checkout).toContain("shouldCreateUser: true");
    expect(checkout).toContain("It does not create a BuildOS Tenant");
  });

  it("claims the locally preserved conversation after passwordless identification", () => {
    expect(conversation).toContain('`${TRANSCRIPT_KEY}:anonymous`');
    expect(conversation).toContain('supabase.from("initial_conversations").insert');
    expect(conversation).toContain('supabase.from("initial_conversation_turns").insert(turns)');
    expect(conversation).not.toContain("if (!user) return;\n    const stageLabel");
  });

  it("provides a permanent passwordless resume route without creating users by mistake", () => {
    expect(app).toContain('<Route path="/autopsy/resume" element={<CandidateResume />} />');
    expect(resume).toContain("Resume Autopsy or view your result");
    expect(resume).toContain("shouldCreateUser: false");
    expect(resume).toContain("get_current_paid_autopsy_destination");
    expect(authGate).toContain("signInWithOtp");
    expect(authGate).not.toContain("signInWithPassword");
    expect(authGate).not.toContain('type="password"');
  });
});
