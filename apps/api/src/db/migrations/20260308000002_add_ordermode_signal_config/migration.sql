-- Add orderMode to Account
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "orderMode" TEXT NOT NULL DEFAULT 'auto';

-- Add SL, TP, screenshotUrl to Signal
ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS "sl" DOUBLE PRECISION;
ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS "tp" DOUBLE PRECISION;
ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS "screenshotUrl" TEXT;

-- SystemConfig table for global key-value settings
CREATE TABLE IF NOT EXISTS "SystemConfig" (
  "key"   TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- Default values
INSERT INTO "SystemConfig" ("key", "value")
VALUES ('defaultTimeframe', '1h')
ON CONFLICT ("key") DO NOTHING;
