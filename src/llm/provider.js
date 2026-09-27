import OpenAI from 'openai';

/**
 * @typedef {Object} LLMUsage
 * @property {number} input_tokens
 * @property {number} output_tokens
 */

/**
 * @typedef {Object} LLMResult
 * @property {string} text
 * @property {LLMUsage} usage
 * @property {string|null} finish_reason
 * @property {string} provider
 * @property {string} model
 */

/**
 * Classifies provider errors into normalized error types.
 * Primary classification by HTTP status; SDK classes used for connection & timeout.
 */
export function classifyProviderError(err) {
  const status = err?.status || err?.statusCode;

  if (typeof status === 'number') {
    if (status === 429) {
      return { type: 'rate_limited', status, message: err.message || 'Rate limit exceeded' };
    }
    if (status >= 500) {
      return { type: 'server_error', status, message: err.message || 'Provider server error' };
    }
    if (status >= 400 && status < 500) {
      return { type: 'client_error', status, message: err.message || 'Provider client error' };
    }
  }

  if (
    err instanceof OpenAI.APIConnectionTimeoutError ||
    err?.code === 'ETIMEDOUT' ||
    err?.name === 'AbortError'
  ) {
    return { type: 'timeout', status: 504, message: err.message || 'Provider timeout' };
  }

  if (
    err instanceof OpenAI.APIConnectionError ||
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ENOTFOUND'
  ) {
    return {
      type: 'network_error',
      status: 502,
      message: err.message || 'Provider connection error',
    };
  }

  return { type: 'server_error', status: status || 502, message: err.message || 'Provider error' };
}

/**
 * Abstract base class for LLM provider adapters.
 */
export class LLMProvider {
  /**
   * @param {Object} options
   * @param {string} options.name - Provider identifier (e.g. 'gemini', 'groq')
   * @param {string} options.defaultModel - Default model name for this provider
   */
  constructor({ name, defaultModel }) {
    this.name = name;
    this.defaultModel = defaultModel;
  }

  /**
   * Generates completion text from LLM provider.
   * @param {Object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.model]
   * @param {number} [params.temperature]
   * @returns {Promise<LLMResult>}
   */
  async generate(_params) {
    throw new Error('generate() must be implemented by subclass');
  }
}
