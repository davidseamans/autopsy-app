export const HUDSON_DOCK_OPEN = "buildos:hudson-dock-open";

export type HudsonDockDetail = {
  conversationUrl: string;
  runId: string;
  requestId: string;
};

export function openHudsonDock(detail: HudsonDockDetail) {
  window.dispatchEvent(new CustomEvent<HudsonDockDetail>(HUDSON_DOCK_OPEN, { detail }));
}
