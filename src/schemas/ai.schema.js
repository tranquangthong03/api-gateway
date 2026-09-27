import { z } from 'zod';

export const chatSchema = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(10000, 'Message cannot exceed 10,000 characters'),
  model: z.string().nullable().optional(),
});

export const analyzeSchema = z.object({
  task: z.enum(['sentiment', 'summarize', 'extract']),
  text: z.string().min(1, 'Text is required').max(10000, 'Text cannot exceed 10,000 characters'),
  model: z.string().nullable().optional(),
});
