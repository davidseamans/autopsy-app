export const DISCOVER_HELP_STATE = "buildos:discover-help-state";

export function notifyDiscoverHelpState(open: boolean) {
  window.dispatchEvent(new CustomEvent<boolean>(DISCOVER_HELP_STATE, { detail: open }));
}
