import { z } from 'zod';

export const WebhookPayloadSchema = z.object({
  secret: z.string(),
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  price: z.number().positive(),
  contracts: z.number().int().positive().optional(),
  strategy: z.string().optional(),
  timeframe: z.string().optional(),
  timestamp: z.string().optional(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export function validateWebhookPayload(payload: unknown): WebhookPayload {
  return WebhookPayloadSchema.parse(payload);
}

export function validateWebhookSecret(payload: WebhookPayload): boolean {
  return payload.secret === process.env.WEBHOOK_SECRET;
}
