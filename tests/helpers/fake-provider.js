import { LLMProvider } from '../../src/llm/provider.js';

export class FakeProvider extends LLMProvider {
  constructor({ name = 'fake', defaultModel = 'fake-model', responses = [], error = null } = {}) {
    super({ name, defaultModel });
    this.responses = responses;
    this.error = error;
    this.callCount = 0;
    this.receivedParams = [];
  }

  async generate(params) {
    this.callCount += 1;
    this.receivedParams.push(params);

    if (this.error) {
      throw this.error;
    }

    if (this.responses.length > 0) {
      const resp = this.responses.shift();
      if (resp instanceof Error) {
        throw resp;
      }
      return {
        text: resp.text || 'Fake response text',
        usage: resp.usage || { input_tokens: 10, output_tokens: 20 },
        finish_reason: resp.finish_reason !== undefined ? resp.finish_reason : 'stop',
        provider: this.name,
        model: params.model || this.defaultModel,
      };
    }

    return {
      text: 'Default fake response text',
      usage: { input_tokens: 10, output_tokens: 20 },
      finish_reason: 'stop',
      provider: this.name,
      model: params.model || this.defaultModel,
    };
  }
}
