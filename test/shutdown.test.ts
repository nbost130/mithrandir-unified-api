import { describe, expect, it, vi } from 'vitest';
import { shutdownWithDeadline } from '../src/lib/shutdown.js';

describe('shutdownWithDeadline', () => {
  it('returns 0 when cleanup finishes before the deadline', async () => {
    const onError = vi.fn();
    const code = await shutdownWithDeadline(async () => {}, 1000, onError);
    expect(code).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('returns 1 and reports when cleanup throws', async () => {
    const onError = vi.fn();
    const code = await shutdownWithDeadline(
      async () => {
        throw new Error('close failed');
      },
      1000,
      onError
    );
    expect(code).toBe(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'close failed' }));
  });

  it('returns 1 when cleanup hangs past the deadline (the 2026-09-08 SIGTERM hang)', async () => {
    const onError = vi.fn();
    const neverResolves = () => new Promise<void>(() => {});
    const started = Date.now();
    const code = await shutdownWithDeadline(neverResolves, 50, onError);
    expect(code).toBe(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/exceeded 50 ms/) }));
  });

  it('does not fire the deadline after a fast cleanup', async () => {
    const onError = vi.fn();
    await shutdownWithDeadline(async () => {}, 20, onError);
    await new Promise((r) => setTimeout(r, 40));
    expect(onError).not.toHaveBeenCalled();
  });
});
