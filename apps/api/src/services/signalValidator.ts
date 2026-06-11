import { z } from 'zod'

export const WebhookPayloadSchema = z.object({
  secret: z.string().optional(),        // opcional — webhookToken en URL ya autentica al usuario
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  price: z.number().positive(),
  contracts: z.number().int().positive().optional(),
  strategy: z.string().optional(),
  timeframe: z.string().optional(),
  sl: z.number().optional(),
  SL: z.number().optional(),            // alias for uppercase TV variables
  tp: z.number().optional(),
  TP: z.number().optional(),            // alias for uppercase TV variables
  url: z.string().optional(),           // screenshot URL — acepta vacío o URL válida
  timestamp: z.string().optional(),
  token: z.string().optional(),         // ignorado (se usa el de la URL), pero no rompe el schema
})

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>

export function validateWebhookPayload(payload: unknown): WebhookPayload {
  return WebhookPayloadSchema.parse(payload)
}

export function validateWebhookSecret(payload: unknown): boolean {
  const body = payload as Record<string, unknown>
  return body?.secret === process.env.WEBHOOK_SECRET
}
