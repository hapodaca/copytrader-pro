import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const statements = [
  'CREATE INDEX IF NOT EXISTS "Signal_userId_createdAt_idx" ON "Signal"("userId", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "Order_accountId_status_createdAt_idx" ON "Order"("accountId", "status", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "Order_accountId_symbol_status_idx" ON "Order"("accountId", "symbol", "status")',
  'CREATE INDEX IF NOT EXISTS "Order_signalId_idx" ON "Order"("signalId")',
  'CREATE INDEX IF NOT EXISTS "CopyGroup_userId_idx" ON "CopyGroup"("userId")',
  'CREATE INDEX IF NOT EXISTS "GroupFollower_groupId_idx" ON "GroupFollower"("groupId")',
  // Foreign keys sin índice detectadas por los advisors de Supabase
  'CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId")',
  'CREATE INDEX IF NOT EXISTS "CopyGroup_masterAccountId_idx" ON "CopyGroup"("masterAccountId")',
  'CREATE INDEX IF NOT EXISTS "GroupFollower_followerAccountId_idx" ON "GroupFollower"("followerAccountId")',
  'CREATE INDEX IF NOT EXISTS "Order_groupId_idx" ON "Order"("groupId")',
]

async function main() {
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql)
    console.log('OK →', sql.match(/"(\w+_idx)"/)?.[1])
  }
}

main()
  .catch((err) => { console.error('ERROR:', err.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
