/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSaveFlag } from './use-save-flag';

describe('useSaveFlag', () => {
  it('starts clean', () => {
    const { result } = renderHook(() => useSaveFlag());
    expect(result.current.dirty).toBe(false);
  });

  it('goes dirty on an edit', () => {
    const { result } = renderHook(() => useSaveFlag());
    act(() => result.current.markDirty());
    expect(result.current.dirty).toBe(true);
  });

  it('goes clean when a save covered everything on screen', () => {
    const { result } = renderHook(() => useSaveFlag());

    act(() => result.current.markDirty());
    let at = 0;
    act(() => {
      at = result.current.snapshot();
    });
    act(() => result.current.settle(at));

    expect(result.current.dirty).toBe(false);
  });

  it('STAYS dirty when something was typed while the save was in flight', () => {
    // The whole reason this hook exists. The naive version clears here, the
    // badge goes out, the leave guard disarms, and those characters are lost.
    const { result } = renderHook(() => useSaveFlag());

    act(() => result.current.markDirty());

    let at = 0;
    act(() => {
      at = result.current.snapshot();
    });

    // The round trip is in progress and Ahmad keeps typing.
    act(() => result.current.markDirty());

    act(() => result.current.settle(at));

    expect(result.current.dirty).toBe(true);
  });

  it('settling an old snapshot twice still does not clear a later edit', () => {
    const { result } = renderHook(() => useSaveFlag());

    act(() => result.current.markDirty());
    let first = 0;
    act(() => {
      first = result.current.snapshot();
    });
    act(() => result.current.markDirty());

    act(() => result.current.settle(first));
    act(() => result.current.settle(first));

    expect(result.current.dirty).toBe(true);
  });

  it('handles two saves overlapping, clearing only for the later one', () => {
    const { result } = renderHook(() => useSaveFlag());

    act(() => result.current.markDirty());
    let first = 0;
    act(() => {
      first = result.current.snapshot();
    });

    act(() => result.current.markDirty());
    let second = 0;
    act(() => {
      second = result.current.snapshot();
    });

    // The first save answers late. It does not cover the second edit.
    act(() => result.current.settle(first));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.settle(second));
    expect(result.current.dirty).toBe(false);
  });

  it('reset forces the flag and invalidates any save in flight', () => {
    const { result } = renderHook(() => useSaveFlag());

    let at = 0;
    act(() => {
      at = result.current.snapshot();
    });
    act(() => result.current.reset(true));
    expect(result.current.dirty).toBe(true);

    // A save that was already running must not clean a freshly loaded form.
    act(() => result.current.settle(at));
    expect(result.current.dirty).toBe(true);
  });
});
