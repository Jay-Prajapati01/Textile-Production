// Cross-tab live sync between Daily Production and Worker-Wivar.
// BroadcastChannel for modern browsers + localStorage storage-event fallback.

export type ProductionSyncMessage =
  | { type: 'edits'; date: string; rows: { loom_id: string; shift_a: number; shift_b: number }[] }
  | { type: 'saved'; date: string }
  // Master data changed (looms / workers / lines / settings / default roster).
  // Not date-scoped: every view should refresh its master-derived data.
  | { type: 'masters' }
  // Beam / submitted entries changed — daily figures (beam meter, opening,
  // remaining) depend on these.
  | { type: 'entries' };

const LS_KEY = 'loom.productionSync';
const CHANNEL_NAME = 'loom-production-sync';

type Listener = (msg: ProductionSyncMessage) => void;

const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;
let started = false;

function dispatch(msg: ProductionSyncMessage) {
  listeners.forEach((l) => {
    try {
      l(msg);
    } catch (err) {
      console.error('sync listener error', err);
    }
  });
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e) => {
        if (e.data?.tenantId === localStorage.getItem('textile.selectedTenant')) dispatch(e.data.msg as ProductionSyncMessage);
      };
    }
  } catch {
    channel = null;
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const payload = JSON.parse(e.newValue);
      if (payload.tenantId === localStorage.getItem('textile.selectedTenant')) dispatch(payload.msg as ProductionSyncMessage);
    } catch {
      /* ignore malformed */
    }
  });
}

export function postSync(msg: ProductionSyncMessage): void {
  start();
  const tenantId = localStorage.getItem('textile.selectedTenant');
  dispatch(msg);
  try {
    channel?.postMessage({ tenantId, msg });
  } catch {
    /* channel closed */
  }
  try {
    // Fallback + payload wrapper for the storage listener
    localStorage.setItem(LS_KEY, JSON.stringify({ tenantId, msg, t: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

export function onSync(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
