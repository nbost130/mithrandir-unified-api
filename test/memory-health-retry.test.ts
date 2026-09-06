import { describe, expect, it, vi } from 'vitest';
import { withOneRetry } from '../src/modules/tirith/tools/memory-health.js';

describe('withOneRetry (semantic-memory search)', () => {
  it('returns the first result without retrying when the first attempt succeeds', async () => {
    const retry = vi.fn(async () => 'second');
    await expect(withOneRetry(async () => 'first', retry, 0)).resolves.toBe('first');
    expect(retry).not.toHaveBeenCalled();
  });

  it('recovers when only the first attempt fails (a stalled query during an index write)', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('The operation was aborted due to timeout');
    });
    await expect(withOneRetry(attempt, async () => ['hit'], 0)).resolves.toEqual(['hit']);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('fails only when both attempts fail, and says so', async () => {
    const boom = async () => {
      throw new Error('The operation was aborted due to timeout');
    };
    await expect(withOneRetry(boom, boom, 0)).rejects.toThrow(/timeout \(twice, 0s apart\)/);
  });
});
