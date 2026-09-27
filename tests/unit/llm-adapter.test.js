import { describe, it, expect, vi } from 'vitest';
import { GeminiAdapter } from '../../src/llm/gemini.adapter.js';
import { GroqAdapter } from '../../src/llm/groq.adapter.js';

describe('LLM Adapter Contract Tests', () => {
  const adapters = [
    { name: 'GeminiAdapter', create: (client) => new GeminiAdapter({ client }) },
    { name: 'GroqAdapter', create: (client) => new GroqAdapter({ client }) },
  ];

  adapters.forEach(({ name, create }) => {
    describe(name, () => {
      it('returns normalized LLMResult on SDK success', async () => {
        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'Hello from LLM' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 15, completion_tokens: 25 },
              }),
            },
          },
        };

        const adapter = create(mockClient);
        const res = await adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] });

        expect(res.text).toBe('Hello from LLM');
        expect(res.usage).toEqual({ input_tokens: 15, output_tokens: 25 });
        expect(res.finish_reason).toBe('stop');
        expect(res.provider).toBeDefined();
        expect(res.model).toBeDefined();
      });

      it('defaults finish_reason to null if not provided in choice', async () => {
        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'Test text' } }],
                usage: { prompt_tokens: 5, completion_tokens: 10 },
              }),
            },
          },
        };

        const adapter = create(mockClient);
        const res = await adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] });

        expect(res.finish_reason).toBeNull();
      });

      it('records 0 tokens when response has no usage object', async () => {
        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'No usage text' } }],
              }),
            },
          },
        };

        const adapter = create(mockClient);
        const res = await adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] });

        expect(res.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
      });
    });
  });
});
