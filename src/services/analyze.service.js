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
