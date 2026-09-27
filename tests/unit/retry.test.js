import { describe, it, expect } from 'vitest';
import { executeWithRetry } from '../../src/llm/retry.js';

describe('Retry Strategy (executeWithRetry)', () => {
  const instantSleep = () => Promise.resolve();

  it('succeeds on first attempt without retrying', async () => {
    let calls = 0;
    const result = await executeWithRetry(
      async () => {
        calls += 1;
        return 'success';
      },
      { maxRetries: 2, sleepFn: instantSleep },
    );

    expect(result).toBe('success');
    expect(calls).toBe(1);
  });

  it('retries on server_error and succeeds on 3rd attempt', async () => {
    let calls = 0;
    const serverErr = new Error('503 Service Unavailable');
    serverErr.errorType = 'server_error';

    const result = await executeWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw serverErr;
        }
        return 'recovered';
      },
      { maxRetries: 2, sleepFn: instantSleep },
    );

    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('does NOT retry on client_error (401/404) and fails immediately', async () => {
    let calls = 0;
    const clientErr = new Error('401 Unauthorized');
    clientErr.errorType = 'client_error';

    await expect(
      executeWithRetry(
        async () => {
          calls += 1;
          throw clientErr;
        },
        { maxRetries: 2, sleepFn: instantSleep },
      ),
    ).rejects.toThrow('401 Unauthorized');

    expect(calls).toBe(1);
  });
});
