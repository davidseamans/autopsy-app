import { useMemo, useState } from "react";

const recognitionStates = [
  "I haven’t really stopped to think about that.",
  "I’ve thought about it, but I haven’t worked it through.",
  "I’ve sat down and worked through it roughly.",
  "I’ve worked it through carefully and know roughly where we stand.",
];

type Step = "idea" | "permission" | "time" | "closed";

const FirstConversation = () => {
  const [step, setStep] = useState<Step>("idea");
  const [idea, setIdea] = useState("");
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const ideaSnippet = useMemo(() => {
    const trimmed = idea.trim();
    if (!trimmed) return "this idea";
    return trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed;
  }, [idea]);

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-8 text-[#221f1a] sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#8a5f2e]">Autopsy</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">One Conversation with Reality</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#625744]">
            No forms. No score chasing. Just the first honest conversation about the business you’re thinking of building.
          </p>
        </div>

        <div className="rounded-[2rem] border border-[#dfd1bb] bg-[#fffaf0] p-5 shadow-xl shadow-[#7b5a2c]/10 sm:p-8">
          <div className="space-y-5">
            {step === "idea" && (
              <>
                <div className="max-w-[82%] rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
                  <p className="text-lg leading-8">So... what’s the idea?</p>
                </div>

                <div className="ml-auto max-w-[88%] rounded-3xl rounded-tr-md bg-[#2f2a21] p-4 text-white shadow-sm">
                  <textarea
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    className="min-h-32 w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-white/45"
                    placeholder="A couple of sentences is enough. Say it the way you would over coffee."
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!idea.trim()}
                    onClick={() => setStep("permission")}
                    className="rounded-full bg-[#8a5f2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6e4b22] disabled:cursor-not-allowed disabled:bg-[#c8b89f]"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {step === "permission" && (
              <>
                <div className="max-w-[82%] rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
                  <p className="text-lg leading-8">Okay.</p>
                  <p className="mt-3 text-lg leading-8">I think I’ve got a feel for what you’re trying to build.</p>
                  <p className="mt-3 text-lg leading-8">Can I ask you something?</p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep("time")}
                    className="rounded-full bg-[#8a5f2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6e4b22]"
                  >
                    Yes
                  </button>
                </div>
              </>
            )}

            {step === "time" && (
              <>
                <div className="max-w-[88%] rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
                  <p className="text-lg leading-8">Suppose things take longer than you hope.</p>
                  <p className="mt-3 text-xl font-semibold leading-8">
                    What happens at home if the business doesn’t bring in money for a while?
                  </p>
                </div>

                <div className="grid gap-3">
                  {recognitionStates.map((state) => {
                    const active = selectedState === state;
                    return (
                      <button
                        type="button"
                        key={state}
                        onClick={() => setSelectedState(state)}
                        className={`rounded-2xl border p-4 text-left text-base leading-7 transition ${
                          active
                            ? "border-[#8a5f2e] bg-[#efe2cb] shadow-sm"
                            : "border-[#dfd1bb] bg-white hover:border-[#b58b57] hover:bg-[#fff7e8]"
                        }`}
                      >
                        {state}
                      </button>
                    );
                  })}
                </div>

                {selectedState && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
                    <div className="max-w-[82%] rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
                      <p className="text-lg leading-8">Okay.</p>
                      <p className="mt-3 text-lg leading-8">Thanks.</p>
                      <p className="mt-3 text-lg leading-8">Right... can I ask you something else?</p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setStep("closed")}
                        className="rounded-full bg-[#8a5f2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6e4b22]"
                      >
                        Keep going
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === "closed" && (
              <div className="space-y-5">
                <div className="max-w-[88%] rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
                  <p className="text-lg leading-8">Prototype stop.</p>
                  <p className="mt-3 text-lg leading-8">
                    This is where Conversation 2 will begin. For now, we’ve proved the new environment: one screen, one conversation, no school-style questionnaire.
                  </p>
                </div>

                <div className="rounded-3xl border border-[#dfd1bb] bg-[#fff6e6] p-5 text-sm leading-7 text-[#625744]">
                  <p className="font-semibold text-[#2f2a21]">Stored conversation draft</p>
                  <p className="mt-2"><span className="font-medium">Idea:</span> {ideaSnippet}</p>
                  <p className="mt-2"><span className="font-medium">Time judgement:</span> {selectedState}</p>
                  <p className="mt-2"><span className="font-medium">Observation:</span> This response will become one piece of evidence for “What Stood Out Today”.</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStep("idea");
                    setIdea("");
                    setSelectedState(null);
                  }}
                  className="rounded-full border border-[#8a5f2e] px-5 py-3 text-sm font-semibold text-[#8a5f2e] transition hover:bg-[#fff7e8]"
                >
                  Start again
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-6 text-[#8c806b]">
          Legacy Autopsy remains available at /autopsy. This route is the new conversation-first prototype.
        </p>
      </section>
    </main>
  );
};

export default FirstConversation;
