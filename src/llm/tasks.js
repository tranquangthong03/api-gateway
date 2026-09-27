import { z } from 'zod';

export const sentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  confidence: z.number().min(0).max(1),
  aspects: z.array(
    z.object({
      aspect: z.string(),
      sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
    }),
  ),
});

export const summarizeSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()).max(5),
});

export const extractSchema = z.object({
  people: z.array(z.string()),
  organizations: z.array(z.string()),
  dates: z.array(z.string()),
  amounts: z.array(
    z.object({
      value: z.number(),
      currency: z.string().nullable(),
    }),
  ),
});

export const parseCleanJson = (text) => {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned);
};

export const TASKS = {
  sentiment: {
    schema: sentimentSchema,
    promptFn: (text) =>
      `Analyze the sentiment of the following text. Respond strictly with JSON adhering to this structure: {"sentiment": "positive"|"negative"|"neutral"|"mixed", "confidence": number between 0 and 1, "aspects": [{"aspect": string, "sentiment": "positive"|"negative"|"neutral"|"mixed"}]}. Do not include markdown formatting or commentary.\n\nText:\n${text}`,
  },
  summarize: {
    schema: summarizeSchema,
    promptFn: (text) =>
      `Summarize the following text and extract up to 5 key points. Respond in the same language as the input text. Respond strictly with JSON adhering to this structure: {"summary": string, "key_points": [string]}. Do not include markdown formatting or commentary.\n\nText:\n${text}`,
  },
  extract: {
    schema: extractSchema,
    promptFn: (text) =>
      `Extract entities from the following text (people, organizations, dates, amounts). Respond in the same language as the input text. Respond strictly with JSON adhering to this structure: {"people": [string], "organizations": [string], "dates": [string], "amounts": [{"value": number, "currency": string|null}]}. Do not include markdown formatting or commentary.\n\nText:\n${text}`,
  },
};
