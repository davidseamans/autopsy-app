# Autopsy Conversation Prototype v1

## Status

- Authority: Designated Authority — FULL
- Product surface: `/first-conversation`
- Scope: candidate experience and conversation orchestration only
- Preserved unchanged: twelve production questions, Supabase data model, answer options, score values, run RPCs, finalisation logic and verdict engine
- Governing sources: Operator Maturity Constitution; Autopsy Conversation Constitution v1; BuilderOS AI Reasoning Constitution v1; Draft Constitutional Canons 011–021

## Verified production baseline

The current screen already loads the twelve active questions, answer options and stage-specific conversation variants from Supabase and persists selections through the existing Autopsy run RPCs. The current candidate surface nevertheless exposes internal diagnostics: question IDs, dimension names, numeric scores, section counts, progress, provisional verdicts, canonical prompts and guardrails.

The replacement must preserve the engine and remove those diagnostics from the candidate experience.

## Product decision

`/first-conversation` becomes a single-thread conversational workspace. The candidate experiences one thoughtful exchange at a time with John Galt. The underlying twelve-question assessment remains sequentially orchestrated but invisible.

This is not a chat-shaped questionnaire. The interface must support pauses, clarification, reflection and operator-led redirection without displaying a test structure.

## Candidate screen

### 1. Header

Visible:

- `Autopsy`
- `Conversation with John Galt`
- quiet connection state only when operationally necessary: `Connected`, `Reconnecting`, or `Your response has not been saved`
- `Pause` action
- `Leave conversation` action

Not visible:

- question count
- progress percentage or bar
- section names
- maturity dimensions
- score
- provisional verdict
- run ID
- Supabase status
- canonical terminology

### 2. Conversation canvas

A centred, readable transcript with restrained message density.

John messages are plain natural language. Candidate responses appear as normal conversation bubbles. System notices are visually distinct and limited to consent, save failure, microphone state and final hand-off.

Only the current exchange receives visual emphasis. Prior exchanges remain available by scrolling but are not converted into cards, sections or completed steps.

### 3. Composer

The composer supports:

- multiline typed response
- send button
- microphone button
- live transcription preview before submission
- stop recording
- edit transcript before submission
- `I’m not sure`
- `Could you rephrase that?`
- `I’d rather not answer that now`
- `Pause here`

These controls are participation controls, not scored answer choices.

### 4. Voice-first mode

Voice mode is an input method, not a separate assessment path.

Required behaviour:

1. John’s current message may be read aloud.
2. The candidate records a response.
3. The transcript is shown for confirmation or correction.
4. Only confirmed text is submitted for interpretation.
5. Audio is not treated as canonical evidence merely because it was recorded.
6. A failed transcription returns control to the candidate without penalty.

### 5. Closing surface

The closing surface does not expose numeric results or maturity labels.

It contains:

- a short acknowledgement in the candidate’s own context
- a bounded admission outcome
- uncertainty where evidence is incomplete
- a candidate-controlled next step
- `Review what I said` where appropriate
- `Finish for now`

Permitted admission outcomes:

- Accept
- Accept with safeguards
- Preparation required before admission
- Not suitable at present
- Insufficient evidence

The explanation must remain challenge-specific, time-bound and revisable. No outcome may become a permanent identity label.

## Conversation state model

### State A — Opening and consent

John establishes the relationship and permission:

> I’d like to understand what you are trying to create and whether BuilderOS can responsibly help you at this point. This is a conversation, not a test. You can pause, decline a question or ask me to rephrase anything.

No scoring language is shown.

### State B — Context capture

Existing non-scored context remains required by the current run contract:

- business stage
- industry context
- prior ownership or operating experience

These are collected conversationally rather than through a visible form. John asks one context question at a time and reflects the answer before moving on. The stored values continue to populate the existing run fields.

### State C — Evidence conversation

For each existing production question, the orchestration layer uses four internal elements:

1. Primary conversational wording — sourced from the existing Supabase stage variant.
2. Clarification prompts — used only when the candidate’s meaning is ambiguous or incomplete.
3. Reflection prompts — used only to confirm the candidate’s meaning or surface a contradiction without accusation.
4. Natural transition — moves to the next existing topic without announcing a section or question number.

### State D — Interpretation confirmation

Before binding a response to an existing answer option, John may reflect a concise interpretation:

> It sounds as though you are saying [neutral summary]. Have I understood that correctly?

Confirmation is used when confidence is insufficient for responsible mapping. It is not required after every response and must not create repetitive friction.

### State E — Hidden scoring and persistence

Once interpretation confidence is sufficient:

- map the candidate response to one existing answer option
- call the existing `recordAutopsyAnswer` RPC with the existing question ID and option ID
- do not expose the selected option or score
- retain the candidate’s wording and interpretation confidence as conversation evidence only where the authorised implementation already supports it
- do not alter tables or add schema in this prototype

Where the available evidence cannot support a defensible option mapping, do not guess. Preserve `insufficient evidence` internally and ask a clarification only when it would genuinely improve understanding.

### State F — Finalisation

The existing `finalizeAutopsyRun` path remains the scoring authority. The conversational layer translates the resulting database verdict into one of the authorised admission outcomes without exposing internal score bands or maturity labels.

## Response handling rules

### Clear response

- acknowledge briefly
- map invisibly to the existing option
- persist
- transition naturally

### Unclear response

- ask one focused clarification tied to the same existing question
- do not introduce a new assessment dimension
- do not stack multiple follow-ups

### Misunderstood question

- accept responsibility for the wording
- rephrase the same underlying question in simpler language
- never imply candidate failure

Preferred form:

> I did not put that clearly. Let me ask it another way.

### Contradictory response

- reflect the tension neutrally
- invite inspection
- do not accuse or prosecute inconsistency

Preferred form:

> Earlier you described [A], and now I’m hearing [B]. What changed, or have I misunderstood one of them?

### Declined response

- respect the decline
- offer pause, later return or continuation
- do not manufacture pressure
- treat the absence of evidence as absence of evidence, not moral failure

### Candidate redirects the conversation

- acknowledge the redirection
- determine whether it materially affects the current context or admission duty
- follow it when useful
- return to the assessment spine only when natural and constitutionally justified

## Twelve-question conversation map

The primary prompts below are the existing production stage variants. Clarifications and reflections do not create new scored questions; they only disambiguate the existing item.

### CR_01 — Cash pressure

Primary: use the existing stage-specific prompt concerning how long the candidate can personally carry the business under delayed or reduced income.

Clarification examples:

- `Are you thinking in weeks, months, or longer?`
- `What would have to cover your personal living costs during that time?`

Reflection example:

- `You appear to have a time estimate, but not yet a protected source of support. Is that fair?`

Transition:

- `That gives me a clearer picture of the pressure you could carry. Let’s look at what the operation actually needs to begin safely.`

### CR_02 — Minimum resources

Primary: use the existing stage-specific prompt concerning minimum cash, tools, supplies, labour and time.

Clarification examples:

- `Which of those are essential before the first job or first day of ownership?`
- `Which can wait without creating avoidable risk?`

Reflection example:

- `You are separating what is necessary from what would merely be useful.`

Transition:

- `Now I want to understand how you think about money once it starts moving through the business.`

### EL_01 — Money already spoken for

Primary: use the existing stage-specific prompt concerning money received versus money available to spend.

Clarification examples:

- `What would you set aside before treating any of it as yours?`
- `Which future obligations are already attached to that money?`

Reflection example:

- `You are distinguishing cash in the bank from money genuinely available.`

Transition:

- `The next pressure is not usually one large cost. It is the quieter costs that erode the margin.`

### EL_02 — Cost driver awareness

Primary: use the existing stage-specific prompt concerning costs that can quietly consume margin.

Clarification examples:

- `Which costs change as sales or jobs increase?`
- `Which costs are easy to forget because they arrive later?`

Reflection example:

- `You have identified the obvious costs. I’m less certain whether the delayed ones are visible yet.`

Transition:

- `That covers the internal economics. Let’s turn to what customers have actually shown you.`

### MR_01 — Evidence before commitment

Primary: use the existing stage-specific prompt concerning real customer behaviour rather than encouragement or seller narrative.

Clarification examples:

- `What did someone actually do, pay, sign, repeat or commit to?`
- `What evidence would still exist if the optimistic story were removed?`

Reflection example:

- `You have interest, but I’m not yet hearing behaviour that confirms demand. Have I missed something?`

Transition:

- `Evidence is only useful when we are clear about whose behaviour it represents.`

### MR_02 — Customer clarity

Primary: use the existing stage-specific prompt concerning who the customer is, the problem removed and why the offer matters.

Clarification examples:

- `Which customer is most likely to act first?`
- `What are they trying to stop, avoid or achieve?`

Reflection example:

- `You can describe the service clearly; the customer and buying reason are less specific so far.`

Transition:

- `Suppose that customer says yes. I want to understand whether the work can then be delivered reliably.`

### OP_01 — Consistent delivery capability

Primary: use the existing stage-specific prompt concerning consistent delivery without seller dependence, heroics or deviation from the operating model.

Clarification examples:

- `What part of delivery depends entirely on you or one other person?`
- `What tends to fail when pressure rises?`

Reflection example:

- `You can deliver the result, but consistency appears to depend on personal rescue effort.`

Transition:

- `Reliable delivery becomes more durable when the essential method can be repeated.`

### OP_02 — Repeatable process

Primary: use the existing stage-specific prompt concerning whether key operating steps are clear or written well enough to repeat.

Clarification examples:

- `Could another capable person follow the essential steps without guessing?`
- `Where does the method currently live: in a document, in a system, or only in someone’s head?`

Reflection example:

- `The process exists in practice, but it is not yet transferable.`

Transition:

- `I have a picture of the intended operation. Now I want to separate intention from action already taken.`

### EX_01 — Concrete action

Primary: use the existing stage-specific prompt concerning action that produced evidence.

Clarification examples:

- `What changed in the real world because of that action?`
- `What did you learn that you could not have learned by thinking or reading alone?`

Reflection example:

- `You have done substantial preparation. I’m testing whether any of it has yet met reality.`

Transition:

- `One action matters. A protected rhythm tells me whether action can continue.`

### EX_02 — Execution rhythm

Primary: use the existing stage-specific prompt concerning time or operating rhythm protected for the next 30 days.

Clarification examples:

- `What time is genuinely available after existing obligations?`
- `What would cause that time to disappear?`

Reflection example:

- `The intention is clear; the protected time is not yet concrete.`

Transition:

- `Plans are easiest when progress is visible. I also need to understand what happens when it becomes slower or more uncertain.`

### PR_01 — Persistence under uncertainty

Primary: use the existing stage-specific prompt concerning disciplined persistence versus rushing or repeatedly changing direction.

Clarification examples:

- `Tell me about a recent time you stayed with difficult work long enough to learn from it.`
- `What usually makes you abandon or radically change direction?`

Reflection example:

- `You adapt quickly. The question is whether that adaptability sometimes prevents evidence from accumulating.`

Transition:

- `The final part is less about a single decision and more about what happens when discomfort continues.`

### PR_02 — Consistency under discomfort

Primary: use the existing stage-specific prompt concerning continuing important work while tired, unsure or receiving slow results.

Clarification examples:

- `What important work are you already doing despite slow feedback?`
- `What evidence shows that this is sustainable rather than a short burst?`

Reflection example:

- `You can push hard for a period. I’m trying to understand whether the rhythm survives after the initial energy fades.`

Natural close:

- `Thank you. I understand more about how you are approaching this. I’m going to be careful not to claim more certainty than the conversation supports.`

## Opening sequence prototype

John:

> Before we begin, this is not a test and there is no performance to put on. I’m trying to understand what you are attempting and whether BuilderOS can responsibly help you now. You can pause, decline or ask me to put anything differently.

John:

> What are you trying to build, buy or improve at the moment?

After the candidate answers, John captures the existing stage and industry context conversationally.

John:

> And what experience have you had carrying responsibility for a business or team before now?

After context is established:

> Good. I have enough context to begin. I’m not assessing whether the idea or industry is attractive. I’m trying to understand how you are approaching the responsibility.

Then begin CR_01 using the existing stage-specific production wording.

## Closing sequence prototypes

### Accept

> I have enough evidence to believe BuilderOS can responsibly work with you now. That is not a permanent judgement about who you are; it is a decision about the present challenge and the evidence available today.

### Accept with safeguards

> I believe BuilderOS can work with you now, provided we protect the areas where the current evidence is still thin. I’ll make those safeguards explicit rather than pretending the uncertainty is not there.

### Preparation required before admission

> I do not think immediate admission would serve you well yet. The issue is not your worth or permanent capability. There are specific pieces of preparation or evidence that should exist before BuilderOS takes responsibility for guiding this challenge.

### Not suitable at present

> I do not believe BuilderOS can responsibly take this on at present. That finding is limited to the current challenge, circumstances and evidence. It is not a permanent label, and it can be reconsidered if the situation changes.

### Insufficient evidence

> I understand a little about where you are trying to go. I do not yet understand enough to draw a responsible conclusion. The honest outcome today is insufficient evidence.

## Internal orchestration contract

For every turn, the controller evaluates:

- current canonical question ID
- stage-specific production prompt
- candidate response text
- interpretation confidence
- whether clarification is required
- whether candidate confirmation is required
- existing answer option mapping
- save status
- whether a natural transition is justified

The controller must never:

- generate a thirteenth scored question
- change a score value
- alter the meaning of an existing question
- reveal internal dimensions or scores
- infer certainty where evidence is insufficient
- treat refusal, uncertainty or misunderstanding as moral failure
- convert the conversation into a visible sequence or course

## Candidate-visible failure handling

### Save failure

> Your response has not been saved yet. Nothing has been scored or lost from the conversation on screen. Please try again, or pause here.

### Reconnection

> I’ve temporarily lost the connection. I won’t move forward until the current response is safely saved.

### Microphone failure

> I could not capture that clearly. You can try again, edit the transcript, or type the response instead.

Technical identifiers and stack details remain hidden.

## Acceptance criteria

The prototype is acceptable only when all are true:

1. The candidate sees one exchange at a time.
2. No question numbers, dimensions, answer options, scores, progress indicators or provisional verdicts are visible.
3. Voice and typed responses enter the same interpretation path.
4. Every scored mapping binds to one of the existing twelve questions and existing answer options.
5. Unclear responses trigger conditional clarification, not forced selection.
6. Misunderstanding triggers blame-free rephrasing.
7. Candidate pause, decline and return controls are visible.
8. The existing run creation, answer persistence and finalisation RPCs remain unchanged.
9. The final outcome uses the authorised admission vocabulary and preserves uncertainty.
10. No new assessment question, maturity framework or Supabase model is introduced.
11. The screen remains usable without voice permission.
12. A save failure prevents silent progression.
13. The candidate can review or correct voice transcription before submission.
14. The candidate experience contains no internal infrastructure language.
15. The design passes the constitutional tests for sovereignty, discovery, non-harm, protective admission and evidence before conclusion.

## Explicitly deferred

- changes to Supabase schema
- changes to question wording stored in production
- changes to answer options or scoring
- changes to verdict thresholds
- long-term conversation memory implementation
- transcript-to-canonical-evidence storage architecture
- operator trajectory model
- additional maturity frameworks
- redesign of routes outside `/first-conversation`
