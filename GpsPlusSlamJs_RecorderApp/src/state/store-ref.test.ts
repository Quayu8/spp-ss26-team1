import { describe, it, expect, vi } from 'vitest';
import { createStoreRef } from './store-ref';

describe('createStoreRef', () => {
  // Why: minimal contract — the F1 fix relies on get() returning whatever
  // was last set, including across multiple swaps.
  it('returns the initial value, then the most recently set value', () => {
    const ref = createStoreRef({ id: 1 });
    expect(ref.get()).toEqual({ id: 1 });
    ref.set({ id: 2 });
    expect(ref.get()).toEqual({ id: 2 });
    ref.set({ id: 3 });
    expect(ref.get()).toEqual({ id: 3 });
  });

  // Why: this is the F1 fix's core invariant — listeners must be told about
  // every swap so the HUD subscriber can re-attach to the new store.
  it('notifies every subscriber synchronously on each set', () => {
    const ref = createStoreRef({ id: 1 });
    const a = vi.fn();
    const b = vi.fn();
    ref.subscribe(a);
    ref.subscribe(b);

    ref.set({ id: 2 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ id: 2 });
    expect(b).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith({ id: 2 });

    ref.set({ id: 3 });
    expect(a).toHaveBeenCalledTimes(2);
    expect(a).toHaveBeenLastCalledWith({ id: 3 });
  });

  // Why: get() inside a listener must observe the new value, because
  // the HUD subscriber reads the slice immediately on swap.
  it('the new value is already visible from within listeners', () => {
    const ref = createStoreRef({ id: 1 });
    let observedFromInside: { id: number } | undefined;
    ref.subscribe(() => {
      observedFromInside = ref.get();
    });
    ref.set({ id: 42 });
    expect(observedFromInside).toEqual({ id: 42 });
  });

  // Why: unsubscribe must work, otherwise replay-mode teardown leaks
  // listeners and a stale HUD update would fire after dispose.
  it('unsubscribe removes the listener', () => {
    const ref = createStoreRef({ id: 1 });
    const listener = vi.fn();
    const off = ref.subscribe(listener);
    ref.set({ id: 2 });
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    ref.set({ id: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // Why: a listener may dispose itself (or another subscriber) during
  // notification; snapshot iteration must keep the current pass intact.
  it('tolerates unsubscribe-during-notify without skipping listeners', () => {
    const ref = createStoreRef({ id: 1 });
    const order: string[] = [];
    const offA = ref.subscribe(() => {
      order.push('a');
      offA();
    });
    ref.subscribe(() => {
      order.push('b');
    });

    ref.set({ id: 2 });
    expect(order).toEqual(['a', 'b']);

    // Next swap should only fire 'b' — 'a' unsubscribed itself.
    ref.set({ id: 3 });
    expect(order).toEqual(['a', 'b', 'b']);
  });
});
