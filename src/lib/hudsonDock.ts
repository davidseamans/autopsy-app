export const HUDSON_DOCK_OPEN = "buildos:hudson-dock-open";
export const HUDSON_SCREEN_FOCUS = "buildos:hudson-screen-focus";

export type HudsonScreenFocus = "leads" | "quotes" | "jobs" | "labour-hours" | "margin" | "debtors";

export type HudsonDockDetail = {
  conversationUrl: string;
  runId: string;
  requestId: string;
};

export function openHudsonDock(detail: HudsonDockDetail) {
  window.dispatchEvent(new CustomEvent<HudsonDockDetail>(HUDSON_DOCK_OPEN, { detail }));
}

export function focusHudsonScreen(area: HudsonScreenFocus) {
  window.dispatchEvent(new CustomEvent<HudsonScreenFocus>(HUDSON_SCREEN_FOCUS, { detail: area }));
}
