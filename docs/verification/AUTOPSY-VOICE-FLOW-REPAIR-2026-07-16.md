# Autopsy Voice Flow Repair — 16 July 2026

## Scope

Repair the production `/first-conversation` spoken interaction defects reported during live operator testing.

## Implemented

- John now starts with a courteous conversational introduction before the first substantive question.
- Listening begins automatically after John finishes speaking.
- End of speech is detected after a short silence; the response is then submitted automatically.
- The operator retains a visible Finish control and typed-response fallback.
- Interim recognition hypotheses are no longer rendered into the transcript field. Only stable final recognition results are displayed, preventing transcript regression and flicker.
- Available English voices are ranked to prefer natural, neural, premium or enhanced voices and stronger Australian candidates; the former Karen default is deprioritised.
- Speech rate and pitch are returned to a more natural range.
- Opening copy now frames the interaction as a worthwhile conversation rather than preparation for questioning.

## Boundaries

Voice output still uses the browser and operating system Speech Synthesis API. Quality therefore remains device-dependent. A provider-backed neural voice would require a separate secure server-side voice service and is not represented as completed by this repair.

## Verification Required

1. Vercel preview build passes.
2. Chrome desktop microphone permission accepted.
3. John speaks the opening once and listening starts when speech ends.
4. A natural response auto-stops after silence and advances without pressing Send.
5. Stable transcript text never disappears.
6. Manual Finish, typed Send, Pause, Replay, rephrase and decline remain functional.
7. Microphone denial and no-speech states remain recoverable.
