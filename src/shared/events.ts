import type { ContactEvent, DemoId, ToolMode } from './types.ts';

/** App-level events both agents can emit/listen via simple callbacks on App. */

export type AppEvent =
  | { type: 'contacts'; contacts: ContactEvent[] }
  | { type: 'demo-changed'; demo: DemoId }
  | { type: 'tool-changed'; tool: ToolMode }
  | { type: 'spawn-request'; kind: 'box' | 'circle'; x: number; y: number }
  | { type: 'fps'; fps: number; bodyCount: number };

export type AppEventListener = (event: AppEvent) => void;

export class EventBus {
  private listeners = new Set<AppEventListener>();

  on(fn: AppEventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: AppEvent): void {
    for (const fn of this.listeners) fn(event);
  }
}
