/**
 * Ordered, re-entrancy-safe event delivery shared by every subscribable object.
 *
 * - Events are delivered in the order they happened: an event raised by a
 *   listener is queued and delivered after the current one has reached every
 *   listener, so no listener ever sees events out of order.
 * - A listener that throws does not stop the others. After the queue is drained
 *   the error is rethrown (an `AggregateError` if several listeners threw), so
 *   failures stay visible to the caller.
 * - Each delivery uses the listeners subscribed at that moment.
 */
export interface Emitter<Args extends unknown[]> {
  subscribe(listener: (...args: Args) => void): () => void;
  emit(...args: Args): void;
  clear(): void;
}

export function createEmitter<Args extends unknown[]>(): Emitter<Args> {
  const listeners = new Set<(...args: Args) => void>();
  const queue: Args[] = [];
  let dispatching = false;

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
      const errors: unknown[] = [];
      try {
        while (queue.length > 0) {
          const event = queue.shift()!;
          for (const listener of [...listeners]) {
            try {
              listener(...event);
            } catch (error) {
              errors.push(error);
            }
          }
        }
      } finally {
        dispatching = false;
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, `${errors.length} listeners threw`);
    },
    clear() {
      listeners.clear();
      queue.length = 0;
    },
  };
}
