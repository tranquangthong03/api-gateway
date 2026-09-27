import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMOrchestrator } from '../../src/llm/orchestrator.js';
import { FakeProvider } from '../helpers/fake-provider.js';
import * as aiRequestRepo from '../../src/repositories/ai-request.repo.js';

describe('LLMOrchestrator', () => {
  const instantSleep = () => Promise.resolve();
  let createAiRequestSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    createAiRequestSpy = vi
      .spyOn(aiRequestRepo, 'createAiRequest')
      .mockResolvedValue({ id: 'ai-req-123' });
  });

  it('routes to primary provider successfully and records ai_request', async () => {
    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      responses: [
        {
          text: 'Hello world',
          usage: { input_tokens: 15, output_tokens: 25 },
          finish_reason: 'stop',
        },
      ],
    });
    const fakeGroq = new FakeProvider({
      name: 'groq',
      defaultModel: 'llama-3.3-70b',
    });

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      groqAdapter: fakeGroq,
      sleepFn: instantSleep,
    });

    const res = await orchestrator.executeAIRequest({
      userId: 'user-1',
      requestId: 'req-1',
      endpoint: '/v1/ai/chat',
      requestedModel: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(res.text).toBe('Hello world');
    expect(res.provider).toBe('gemini');
    expect(res.is_fallback).toBe(false);
    expect(res.usage).toEqual({ input_tokens: 15, output_tokens: 25 });
    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
    expect(createAiRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'gemini',
        status: 'success',
        isFallback: false,
        inputTokens: 15,
        outputTokens: 25,
      }),
    );
  });

  it('throws 400 VALIDATION_ERROR when an unknown model is requested', async () => {
    const orchestrator = new LLMOrchestrator({ sleepFn: instantSleep });

    await expect(
      orchestrator.executeAIRequest({
        userId: 'user-1',
        requestId: 'req-2',
        endpoint: '/v1/ai/chat',
        requestedModel: 'non-existent-model',
      }),
    ).rejects.toThrow(/Unknown requested model/);

    expect(createAiRequestSpy).not.toHaveBeenCalled();
  });

  it('triggers fallback without retry on primary client_error (401)', async () => {
    const clientErr = new Error('401 Invalid API Key');
    clientErr.errorType = 'client_error';

    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      error: clientErr,
    });
    const fakeGroq = new FakeProvider({
      name: 'groq',
      defaultModel: 'llama-3.3-70b',
      responses: [
        {
          text: 'Fallback answer',
          usage: { input_tokens: 12, output_tokens: 18 },
          finish_reason: 'stop',
        },
      ],
    });

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      groqAdapter: fakeGroq,
      sleepFn: instantSleep,
    });

    const res = await orchestrator.executeAIRequest({
      userId: 'user-1',
      requestId: 'req-3',
      endpoint: '/v1/ai/chat',
      requestedModel: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(fakeGemini.callCount).toBe(1); // No retries on primary client_error
    expect(fakeGroq.callCount).toBe(1);
    expect(res.text).toBe('Fallback answer');
    expect(res.provider).toBe('groq');
    expect(res.is_fallback).toBe(true);

    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
    expect(createAiRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'groq',
        isFallback: true,
        status: 'success',
      }),
    );
  });

  it('retries primary adapter on server_error (503) and succeeds', async () => {
    const serverErr = new Error('503 Service Unavailable');
    serverErr.errorType = 'server_error';

    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      responses: [
        serverErr,
        {
          text: 'Recovered answer',
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      ],
    });

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      sleepFn: instantSleep,
    });

    const res = await orchestrator.executeAIRequest({
      userId: 'user-1',
      requestId: 'req-4',
      endpoint: '/v1/ai/chat',
      requestedModel: 'gemini-2.5-flash',
    });

    expect(fakeGemini.callCount).toBe(2);
    expect(res.text).toBe('Recovered answer');
    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
  });

  it('throws 504 timeout when both primary and fallback providers time out', async () => {
    const timeoutErr = new Error('Request timed out');
    timeoutErr.errorType = 'timeout';

    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      error: timeoutErr,
    });
    const fakeGroq = new FakeProvider({
      name: 'groq',
      defaultModel: 'llama-3.3-70b',
      error: timeoutErr,
    });

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      groqAdapter: fakeGroq,
      sleepFn: instantSleep,
    });

    await expect(
      orchestrator.executeAIRequest({
        userId: 'user-1',
        requestId: 'req-5',
        endpoint: '/v1/ai/chat',
        requestedModel: 'gemini-2.5-flash',
      }),
    ).rejects.toThrow(/timed out/);

    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
    expect(createAiRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        errorCode: 'timeout',
      }),
    );
  });

  it('handles output validation failure with 1 repair attempt, summing tokens', async () => {
    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      responses: [
        { text: 'invalid json text', usage: { input_tokens: 10, output_tokens: 10 } },
        { text: '{"summary":"valid json"}', usage: { input_tokens: 25, output_tokens: 15 } },
      ],
    });

    const validateOutputFn = (text) => {
      const parsed = JSON.parse(text);
      if (!parsed.summary) throw new Error('Missing summary key');
      return parsed;
    };

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      sleepFn: instantSleep,
    });

    const res = await orchestrator.executeAIRequest({
      userId: 'user-1',
      requestId: 'req-6',
      endpoint: '/v1/ai/analyze',
      requestedModel: 'gemini-2.5-flash',
      validateOutputFn,
    });

    expect(res.parsedResult).toEqual({ summary: 'valid json' });
    expect(res.usage).toEqual({ input_tokens: 35, output_tokens: 25 }); // 10+25, 10+15
    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
    expect(createAiRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        inputTokens: 35,
        outputTokens: 25,
      }),
    );
  });

  it('records error row with invalid_output when repair call fails validation again', async () => {
    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      responses: [
        { text: 'bad output 1', usage: { input_tokens: 10, output_tokens: 10 } },
        { text: 'bad output 2', usage: { input_tokens: 20, output_tokens: 20 } },
      ],
    });

    const validateOutputFn = () => {
      throw new Error('Schema validation failed');
    };

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      sleepFn: instantSleep,
    });

    await expect(
      orchestrator.executeAIRequest({
        userId: 'user-1',
        requestId: 'req-7',
        endpoint: '/v1/ai/analyze',
        requestedModel: 'gemini-2.5-flash',
        validateOutputFn,
      }),
    ).rejects.toThrow(/Output failed schema validation/);

    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
    expect(createAiRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        errorCode: 'invalid_output',
        inputTokens: 30,
        outputTokens: 30,
      }),
    );
  });

  it('writes error row with internal_error and original tokens/cost if saveAssistantMessageFn throws', async () => {
    const fakeGemini = new FakeProvider({
      name: 'gemini',
      defaultModel: 'gemini-2.5-flash',
      responses: [{ text: 'Chat message', usage: { input_tokens: 14, output_tokens: 28 } }],
    });

    const saveAssistantMessageFn = vi.fn().mockRejectedValue(new Error('DB connection drop'));

    const orchestrator = new LLMOrchestrator({
      geminiAdapter: fakeGemini,
      sleepFn: instantSleep,
    });

    await expect(
      orchestrator.executeAIRequest({
        userId: 'user-1',
        requestId: 'req-8',
        endpoint: '/v1/ai/chat',
        requestedModel: 'gemini-2.5-flash',
        saveAssistantMessageFn,
      }),
    ).rejects.toThrow(/Failed to save assistant message/);

    expect(createAiRequestSpy).toHaveBeenCalledTimes(1);
    expect(createAiRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        errorCode: 'internal_error',
        inputTokens: 14,
        outputTokens: 28,
      }),
    );
  });
});
