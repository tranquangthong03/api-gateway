import { env } from '../config/env.js';
import { GeminiAdapter } from './gemini.adapter.js';
import { GroqAdapter } from './groq.adapter.js';
import { executeWithRetry } from './retry.js';
import { calculateCost } from './cost.js';
import * as aiRequestRepo from '../repositories/ai-request.repo.js';
import {
  createValidationError,
  createProviderError,
  createProviderTimeoutError,
  createInternalError,
} from '../core/errors.js';
import { logger } from '../core/logger.js';

export class LLMOrchestrator {
  constructor({
    geminiAdapter = new GeminiAdapter(),
    groqAdapter = new GroqAdapter(),
    sleepFn,
  } = {}) {
    this.adapters = {
      gemini: geminiAdapter,
      groq: groqAdapter,
    };
    this.sleepFn = sleepFn;
  }

  getModelMap() {
    const map = {};
    if (this.adapters.gemini) {
      map[this.adapters.gemini.defaultModel] = 'gemini';
    }
    if (this.adapters.groq) {
      map[this.adapters.groq.defaultModel] = 'groq';
    }
    return map;
  }

  resolveTarget(requestedModel) {
    const modelMap = this.getModelMap();

    if (!requestedModel) {
      const defaultProvider = env.DEFAULT_PROVIDER || 'gemini';
      const primaryAdapter = this.adapters[defaultProvider];
      if (!primaryAdapter) {
        throw createInternalError(`Default provider '${defaultProvider}' not configured`);
      }
      const model = primaryAdapter.defaultModel;
      return { primaryProvider: defaultProvider, primaryModel: model };
    }

    const primaryProvider = modelMap[requestedModel];
    if (!primaryProvider) {
      throw createValidationError(`Unknown requested model '${requestedModel}'`);
    }

    return { primaryProvider, primaryModel: requestedModel };
  }

  getFallbackProvider(primaryProvider) {
    const configuredFallback =
      env.FALLBACK_PROVIDER || (primaryProvider === 'gemini' ? 'groq' : 'gemini');
    if (configuredFallback === primaryProvider) {
      return null;
    }
    return configuredFallback;
  }

  mapErrorToCodeAndStatus(err) {
    const errType = err?.errorType || 'server_error';
    if (errType === 'timeout') {
      return { dbErrorCode: 'timeout', httpStatus: 504 };
    }
    if (errType === 'rate_limited') {
      return { dbErrorCode: 'provider_rate_limited', httpStatus: 502 };
    }
    return { dbErrorCode: 'provider_error', httpStatus: 502 };
  }

  async executeAIRequest({
    userId,
    apiKeyId = null,
    conversationId = null,
    requestId,
    endpoint,
    requestedModel = null,
    messages = [],
    temperature,
    saveAssistantMessageFn = null,
    validateOutputFn = null,
    cachedResult = null,
  }) {
    const startTime = performance.now();

    const { primaryProvider, primaryModel } = this.resolveTarget(requestedModel);

    if (cachedResult) {
      const latencyMs = Math.round(performance.now() - startTime);

      await aiRequestRepo.createAiRequest({
        userId,
        apiKeyId,
        conversationId,
        messageId: null,
        requestId,
        endpoint,
        provider: primaryProvider,
        model: primaryModel,
        isFallback: false,
        isCached: true,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0.0,
        latencyMs,
        retryCount: 0,
        status: 'success',
        errorCode: null,
        errorMessage: null,
      });

      return {
        text: cachedResult.text,
        parsedResult: cachedResult.parsedResult,
        message_id: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
        finish_reason: 'stop',
        provider: primaryProvider,
        model: primaryModel,
        is_fallback: false,
        cost_usd: 0.0,
        latency_ms: latencyMs,
        is_cached: true,
      };
    }

    const fallbackProvider = this.getFallbackProvider(primaryProvider);

    let currentProviderName = primaryProvider;
    let currentModel = primaryModel;
    let isFallback = false;
    let cumulativeRetryCount = 0;
    let lastError = null;

    const generateWithAdapter = async (providerName, modelName) => {
      const adapter = this.adapters[providerName];
      if (!adapter) {
        throw new Error(`Adapter for '${providerName}' not found`);
      }
      return executeWithRetry(() => adapter.generate({ messages, model: modelName, temperature }), {
        maxRetries: env.PROVIDER_MAX_RETRIES,
        sleepFn: this.sleepFn,
      });
    };

    let result = null;

    // 1. Try Primary Provider
    try {
      result = await generateWithAdapter(primaryProvider, primaryModel);
    } catch (err) {
      cumulativeRetryCount += err.retryCount || 0;
      lastError = err;

      // Check for Fallback
      if (fallbackProvider && this.adapters[fallbackProvider]) {
        isFallback = true;
        currentProviderName = fallbackProvider;
        currentModel = this.adapters[fallbackProvider].defaultModel;

        try {
          result = await generateWithAdapter(currentProviderName, currentModel);
        } catch (fallbackErr) {
          cumulativeRetryCount += fallbackErr.retryCount || 0;
          lastError = fallbackErr;
        }
      }
    }

    // 2. Both Primary and Fallback Failed
    if (!result) {
      const latencyMs = Math.round(performance.now() - startTime);
      const { dbErrorCode, httpStatus } = this.mapErrorToCodeAndStatus(lastError);

      await aiRequestRepo.createAiRequest({
        userId,
        apiKeyId,
        conversationId,
        messageId: null,
        requestId,
        endpoint,
        provider: currentProviderName,
        model: currentModel,
        isFallback,
        isCached: false,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0.0,
        latencyMs,
        retryCount: cumulativeRetryCount,
        status: 'error',
        errorCode: dbErrorCode,
        errorMessage: lastError?.message || 'Provider failed',
      });

      if (httpStatus === 504) {
        throw createProviderTimeoutError(lastError?.message || 'Provider timed out');
      }
      throw createProviderError(lastError?.message || 'Provider error');
    }

    // 3. Optional Structured Output Validation & 1 Repair Attempt
    let inputTokens = result.usage.input_tokens;
    let outputTokens = result.usage.output_tokens;
    let parsedResult = null;

    if (validateOutputFn) {
      try {
        parsedResult = validateOutputFn(result.text);
      } catch (valErr) {
        logger.warn(
          { valErr: valErr.message },
          'Output validation failed, attempting 1 repair call',
        );

        const repairMessages = [
          ...messages,
          { role: 'assistant', content: result.text },
          {
            role: 'user',
            content: `Your previous response failed validation: ${valErr.message}. Please fix it and respond strictly according to schema format.`,
          },
        ];

        let repairResult = null;
        try {
          const adapter = this.adapters[currentProviderName];
          repairResult = await executeWithRetry(
            () => adapter.generate({ messages: repairMessages, model: currentModel, temperature }),
            { maxRetries: env.PROVIDER_MAX_RETRIES, sleepFn: this.sleepFn },
          );
        } catch (repairErr) {
          cumulativeRetryCount += repairErr.retryCount || 0;
        }

        if (repairResult) {
          inputTokens += repairResult.usage.input_tokens;
          outputTokens += repairResult.usage.output_tokens;

          try {
            parsedResult = validateOutputFn(repairResult.text);
            result = repairResult;
          } catch (secondValErr) {
            const latencyMs = Math.round(performance.now() - startTime);
            const costUsd = await calculateCost({
              provider: currentProviderName,
              model: currentModel,
              inputTokens,
              outputTokens,
            });

            await aiRequestRepo.createAiRequest({
              userId,
              apiKeyId,
              conversationId,
              messageId: null,
              requestId,
              endpoint,
              provider: currentProviderName,
              model: currentModel,
              isFallback,
              isCached: false,
              inputTokens,
              outputTokens,
              costUsd,
              latencyMs,
              retryCount: cumulativeRetryCount,
              status: 'error',
              errorCode: 'invalid_output',
              errorMessage: secondValErr.message,
            });

            throw createProviderError('Output failed schema validation after repair attempt');
          }
        } else {
          const latencyMs = Math.round(performance.now() - startTime);
          const costUsd = await calculateCost({
            provider: currentProviderName,
            model: currentModel,
            inputTokens,
            outputTokens,
          });

          await aiRequestRepo.createAiRequest({
            userId,
            apiKeyId,
            conversationId,
            messageId: null,
            requestId,
            endpoint,
            provider: currentProviderName,
            model: currentModel,
            isFallback,
            isCached: false,
            inputTokens,
            outputTokens,
            costUsd,
            latencyMs,
            retryCount: cumulativeRetryCount,
            status: 'error',
            errorCode: 'invalid_output',
            errorMessage: valErr.message,
          });

          throw createProviderError('Repair call failed after invalid output');
        }
      }
    }

    // 4. Save Assistant Message callback if provided (Chat endpoint)
    let messageId = null;
    const costUsd = await calculateCost({
      provider: currentProviderName,
      model: currentModel,
      inputTokens,
      outputTokens,
    });

    if (saveAssistantMessageFn) {
      try {
        messageId = await saveAssistantMessageFn({
          text: result.text,
          finish_reason: result.finish_reason,
        });
      } catch (saveErr) {
        const latencyMs = Math.round(performance.now() - startTime);

        await aiRequestRepo.createAiRequest({
          userId,
          apiKeyId,
          conversationId,
          messageId: null,
          requestId,
          endpoint,
          provider: currentProviderName,
          model: currentModel,
          isFallback,
          isCached: false,
          inputTokens,
          outputTokens,
          costUsd,
          latencyMs,
          retryCount: cumulativeRetryCount,
          status: 'error',
          errorCode: 'internal_error',
          errorMessage: saveErr.message,
        });

        throw createInternalError('Failed to save assistant message');
      }
    }

    // 5. Success Path: write 1 ai_requests row
    const latencyMs = Math.round(performance.now() - startTime);

    await aiRequestRepo.createAiRequest({
      userId,
      apiKeyId,
      conversationId,
      messageId,
      requestId,
      endpoint,
      provider: currentProviderName,
      model: currentModel,
      isFallback,
      isCached: false,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      retryCount: cumulativeRetryCount,
      status: 'success',
      errorCode: null,
      errorMessage: null,
    });

    return {
      text: result.text,
      parsedResult,
      message_id: messageId,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
      finish_reason: result.finish_reason,
      provider: currentProviderName,
      model: currentModel,
      is_fallback: isFallback,
      cost_usd: costUsd,
      latency_ms: latencyMs,
    };
  }
}
