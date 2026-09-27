import { z } from 'zod';

export const usageQuerySchema = z.object({
  from: z.string().datetime({ message: 'Invalid ISO timestamp for from' }).optional(),
  to: z.string().datetime({ message: 'Invalid ISO timestamp for to' }).optional(),
  user_id: z.string().uuid({ message: 'Invalid UUID for user_id' }).optional(),
});
