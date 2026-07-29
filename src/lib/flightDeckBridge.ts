export const FLIGHT_DECK_ORIGIN =
  "https://autopsy-flight-deck-v2.david623257.chatgpt.site";

export const isFlightDeckEmbedded = () =>
  new URLSearchParams(window.location.search).get("embedded") === "flight-deck";

export type FlightDeckEvent =
  | {
      type: "BUILDOS_AUTOPSY_EVENT";
      event: "ready" | "speak";
      text: string;
      subjectId?: string;
      subjectToken?: string;
    }
  | { type: "BUILDOS_AUTOPSY_EVENT"; event: "verdict"; text: string; runId: string | null };

export type FlightDeckInput = {
  type: "BUILDOS_AUTOPSY_INPUT";
  text: string;
  inputMode?: "voice" | "text";
  subjectId?: string;
  subjectToken?: string;
};

export function postToFlightDeck(message: FlightDeckEvent) {
  if (!isFlightDeckEmbedded() || window.parent === window) return;
  window.parent.postMessage(message, FLIGHT_DECK_ORIGIN);
}

export function isFlightDeckInput(
  event: MessageEvent<unknown>,
): event is MessageEvent<FlightDeckInput> {
  if (event.origin !== FLIGHT_DECK_ORIGIN) return false;
  if (!event.data || typeof event.data !== "object") return false;
  const message = event.data as Partial<FlightDeckInput>;
  return message.type === "BUILDOS_AUTOPSY_INPUT" && typeof message.text === "string";
}
