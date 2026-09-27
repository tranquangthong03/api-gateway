import crypto from 'node:crypto';
import { redis } from '../infra/redis.js';
import { TASKS, parseCleanJson } from '../llm/tasks.js';
import { createValidationError } from '../core/errors.js';

export const executeAnalyze = async ({
  userId,
  apiKeyId = null,
  requestId,
  task,
  text,
  model = null,
  orchestrator,
}) => {
  const taskDef = TASKS[task];
  if (!taskDef) {
    throw createValidationError(`Unknown analyze task: '${task}'`);
  }

  const { primaryModel } = orchestrator.resolveTarget(model);
  const hashInput = `${task}:${text}:${primaryModel}`;
  const cacheHash = crypto.createHash('sha256').update(hashInput).digest('hex');
  const cacheKey = `cache:analyze:${cacheHash}`;

  // 1. Try Cache Lookup
  let cachedResult = null;
  try {
    const rawCache = await redis.get(cacheKey);
    if (rawCache) {
      cachedResult = JSON.parse(rawCache);
    }
  } catch {
    // Fail-open on cache lookup error
  }

  if (cachedResult) {
    const cachedRes = await orchestrator.executeAIRequest({
      userId,
      apiKeyId,
      conversationId: null,
      requestId,
      endpoint: 'analyze',
      requestedModel: model,
      cachedResult,
    });

    return {
      task,
      result: cachedRes.parsedResult,
      provider: cachedRes.provider,
      model: cachedRes.model,
      is_fallback: false,
      is_cached: true,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0.0,
      },
      latency_ms: cachedRes.latency_ms,
    };
  }

  // 2. Cache Miss: Execute Request with LLM Orchestrator
  const prompt = taskDef.promptFn(text);

  const validateOutputFn = (rawText) => {
    const json = parseCleanJson(rawText);
    return taskDef.schema.parse(json);
  };

  const res = await orchestrator.executeAIRequest({
    userId,
    apiKeyId,
    conversationId: null,
    requestId,
    endpoint: 'analyze',
    requestedModel: model,
    messages: [{ role: 'user', content: prompt }],
    validateOutputFn,
  });

  // Store in cache for 1 hour (3600s) asynchronously
  try {
    await redis.set(
      cacheKey,
      JSON.stringify({ text: res.text, parsedResult: res.parsedResult }),
      'EX',
      3600,
    );
  } catch {
    // Fail-open on cache store error
  }

  return {
    task,
    result: res.parsedResult,
    provider: res.provider,
    model: res.model,
    is_fallback: res.is_fallback,
    is_cached: false,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cost_usd: res.cost_usd,
    },
    latency_ms: res.latency_ms,
  };
};
