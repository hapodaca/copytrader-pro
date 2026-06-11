-- ============================================================
-- CopyTrader Pro — Migración inicial
-- Generada: 2026-03-07
-- Cómo aplicar: Supabase Dashboard → SQL Editor → Run
-- Fuente de verdad: apps/api/src/db/prisma/schema.prisma
-- ============================================================

-- CreateTable: Profile (vinculada a Supabase Auth)
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "webhookToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Account (cuenta de broker — Tradovate)
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradovateId" TEXT NOT NULL,
    "tradovateSpec" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'demo',
    "brokerType" TEXT NOT NULL DEFAULT 'tradovate',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CopyGroup (grupo de copia con 1 master → N followers)
CREATE TABLE "CopyGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "masterAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "distributionMode" TEXT NOT NULL DEFAULT 'all',
    "batchSize" INTEGER NOT NULL DEFAULT 4,
    "rotateIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GroupFollower (relación grupo → cuenta follower)
CREATE TABLE "GroupFollower" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "followerAccountId" TEXT NOT NULL,
    "riskPct" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rotateOrder" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    CONSTRAINT "GroupFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TradingRules (reglas de riesgo por cuenta — Apex/TopStep/etc.)
CREATE TABLE "TradingRules" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountStage" TEXT NOT NULL DEFAULT 'challenge',
    "riskMode" TEXT NOT NULL DEFAULT 'fixed_usd',
    "fixedRiskAmount" DOUBLE PRECISION NOT NULL DEFAULT 650,
    "maxEntriesPerDay" INTEGER NOT NULL DEFAULT 3,
    "allowedDays" TEXT[] DEFAULT ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI']::TEXT[],
    "startTime" TEXT NOT NULL DEFAULT '08:00',
    "endTime" TEXT NOT NULL DEFAULT '15:30',
    "maxDrawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "reduceRiskAfterLosses" BOOLEAN NOT NULL DEFAULT true,
    "reduceRiskFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "maxConsecutiveLosses" INTEGER NOT NULL DEFAULT 3,
    "pauseAfterMaxLosses" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TradingRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Signal (señal recibida desde TradingView o manual)
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'tradingview',
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "contracts" INTEGER,
    "strategy" TEXT,
    "timeframe" TEXT,
    "rawPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Order (orden enviada al broker)
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'Market',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tradovateOrderId" TEXT,
    "fillPrice" DOUBLE PRECISION,
    "skipReason" TEXT,
    "errorMsg" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DailyStat (estadísticas diarias por cuenta)
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "entriesCount" INTEGER NOT NULL DEFAULT 0,
    "pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "lossCount" INTEGER NOT NULL DEFAULT 0,
    "drawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consecutiveLosses" INTEGER NOT NULL DEFAULT 0,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Subscription (plan del usuario SaaS)
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'trial',
    "monthlyFeeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "performancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextBillingAt" TIMESTAMP(3),
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "Profile_webhookToken_key" ON "Profile"("webhookToken");
CREATE UNIQUE INDEX "Account_tradovateId_key" ON "Account"("tradovateId");
CREATE UNIQUE INDEX "TradingRules_accountId_key" ON "TradingRules"("accountId");
CREATE UNIQUE INDEX "DailyStat_accountId_date_key" ON "DailyStat"("accountId", "date");
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- Foreign Keys
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyGroup" ADD CONSTRAINT "CopyGroup_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupFollower" ADD CONSTRAINT "GroupFollower_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CopyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupFollower" ADD CONSTRAINT "GroupFollower_followerAccountId_fkey" FOREIGN KEY ("followerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradingRules" ADD CONSTRAINT "TradingRules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tabla de control de migraciones de Prisma
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);
