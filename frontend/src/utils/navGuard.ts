// Navigation guard: lets a mounted view block tab/date navigation while it has
// unsaved changes, show its own modal, and later proceed/cancel the pending action.

type Blocker = () => boolean;

let blocker: Blocker | null = null;
let pending: (() => void) | null = null;

// Register a blocker. Returns true when navigation must be intercepted
// (the blocker is responsible for showing UI and calling proceed/cancel later).
export function setNavBlocker(b: Blocker | null): void {
  blocker = b;
  if (!b) pending = null;
}

export function requestNavigation(action: () => void): boolean {
  if (blocker && blocker()) {
    pending = action;
    return false;
  }
  action();
  return true;
}

export function proceedNavigation(): void {
  const p = pending;
  pending = null;
  if (p) p();
}

export function cancelNavigation(): void {
  pending = null;
}
