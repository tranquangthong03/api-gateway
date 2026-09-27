import OpenAI from 'openai';
import { LLMProvider, classifyProviderError } from './provider.js';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

export class GroqAdapter extends LLMProvider {
  constructor({
    apiKey = env.GROQ_API_KEY,
    baseURL = env.GROQ_BASE_URL,
    defaultModel = env.GROQ_MODEL,
    client = null,
  } = {}) {
    super({ name: 'groq', defaultModel: defaultModel || 'openai/gpt-oss-20b' });

    this.client =
      client ||
      new OpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: baseURL || undefined,
        timeout: env.PROVIDER_TIMEOUT_MS,
        maxRetries: 0,
      });
  }

  async generate({ messages, model, temperature }) {
    const targetModel = model || this.defaultModel;

    try {
      const response = await this.client.chat.completions.create({
        messages,
        model: targetModel,
        temperature,
      });

      const choice = response.choices?.[0];
      const text = choice?.message?.content || '';
      const finish_reason = choice?.finish_reason || null;

      let input_tokens = 0;
      let output_tokens = 0;

      if (response.usage) {
        input_tokens = response.usage.prompt_tokens ?? 0;
        output_tokens = response.usage.completion_tokens ?? 0;
      } else {
        logger.warn(
          { provider: this.name, model: targetModel },
          'Provider response missing usage details',
        );
      }

      return {
        text,
        usage: {
          input_tokens,
          output_tokens,
        },
        finish_reason,
        provider: this.name,
        model: targetModel,
      };
    } catch (err) {
      const classified = classifyProviderError(err);
      const errorObj = new Error(classified.message);
      errorObj.errorType = classified.type;
      errorObj.status = classified.status;
      errorObj.originalError = err;
      throw errorObj;
    }
  }
}
