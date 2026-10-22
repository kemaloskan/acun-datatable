/** Receives an error thrown by a listener. */
export type ListenerErrorHandler = (error: unknown) => void;

/**
 * Default handler: report the error the way the platform reports uncaught
 * errors (`reportError` in browsers, an unhandled rejection elsewhere), without
 * affecting the action that triggered the event.
 */
export function reportListenerError(error: unknown): void {
  const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof report === 'function') report(error);
  else void Promise.reject(error);
}

/**
 * Ordered, re-entrancy-safe event delivery shared by every subscribable object,
 * with the same error semantics as the DOM's `EventTarget`.
 *
 * - Events are delivered in the order they happened: an event raised by a
 *   listener is queued and delivered after the current one has reached every
 *   listener, so no listener ever sees events out of order.
 * - A listener that throws does not stop the others and never turns a
 *   successful action into a failure: `emit` does not throw. The error goes to
 *   `onListenerError` (default `reportListenerError`).
 * - Each delivery uses the listeners subscribed at that moment.
 */
export interface Emitter<Args extends unknown[]> {
  subscribe(listener: (...args: Args) => void): () => void;
  emit(...args: Args): void;
  clear(): void;
}

export function createEmitter<Args extends unknown[]>(
  onListenerError: ListenerErrorHandler = reportListenerError,
): Emitter<Args> {
  if (typeof onListenerError !== 'function') throw new TypeError('onListenerError must be a function');
  const listeners = new Set<(...args: Args) => void>();
  const queue: Args[] = [];
  let dispatching = false;
  const fail = (error: unknown): void => {
    try {
      onListenerError(error);
    } catch (handlerError) {
      reportListenerError(handlerError);
    }
  };

  return {
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emit(...args) {
      queue.push(args);
      if (dispatching) return;
      dispatching = true;
      try {
        while (queue.length > 0) {
          const event = queue.shift()!;
          for (const listener of [...listeners]) {
            try {
              listener(...event);
            } catch (error) {
              fail(error);
            }
          }
        }
      } finally {
        dispatching = false;
      }
    },
    clear() {
      listeners.clear();
      queue.length = 0;
    },
  };
}
