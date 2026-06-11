import { Response } from 'express'

interface SSEClient {
  userId: string
  res: Response
}

const clients: SSEClient[] = []

export function addSSEClient(userId: string, res: Response): void {
  clients.push({ userId, res })
}

export function removeSSEClient(res: Response): void {
  const idx = clients.findIndex(c => c.res === res)
  if (idx !== -1) clients.splice(idx, 1)
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clients) {
    if (client.userId === userId) {
      try {
        client.res.write(payload)
      } catch { /* client disconnected */ }
    }
  }
}
