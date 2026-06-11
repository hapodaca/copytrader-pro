// Tipos compartidos entre API y Web

export type AccountStage = 'challenge' | 'funded_to_withdrawal' | 'funded_active'
export type RiskMode = 'fixed_usd' | 'pct_balance'
export type DistributionMode = 'all' | 'rotate' | 'batch_rotate'
export type SignalAction = 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT'
export type SignalStatus = 'received' | 'processed' | 'rejected'
export type OrderStatus = 'pending' | 'sent' | 'filled' | 'skipped' | 'rejected' | 'error'
export type Environment = 'demo' | 'live'
export type UserRole = 'admin' | 'user'
export type SubscriptionPlan = 'monthly' | 'performance'
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'past_due'

export interface Profile {
  id: string
  role: UserRole
  webhookToken: string
  isActive: boolean
  createdAt: string
}

export interface Account {
  id: string
  userId: string
  name: string
  tradovateId: string
  tradovateSpec: string
  environment: Environment
  brokerType: string
  isActive: boolean
  balance: number
  accessToken: string | null
  tokenExpiry: string | null
  createdAt: string
  tradingRules?: TradingRules | null
}

export interface CopyGroup {
  id: string
  userId: string
  name: string
  masterAccountId: string
  master?: Account
  isActive: boolean
  distributionMode: DistributionMode
  batchSize: number
  rotateIndex: number
  followers?: GroupFollower[]
  createdAt: string
}

export interface GroupFollower {
  id: string
  groupId: string
  followerAccountId: string
  follower?: Account
  riskPct: number
  isActive: boolean
  rotateOrder: number
  lastOrderAt: string | null
}

export interface TradingRules {
  id: string
  accountId: string
  accountStage: AccountStage
  riskMode: RiskMode
  fixedRiskAmount: number
  maxEntriesPerDay: number
  allowedDays: string[]
  startTime: string
  endTime: string
  maxDrawdownPct: number
  reduceRiskAfterLosses: boolean
  reduceRiskFactor: number
  maxConsecutiveLosses: number
  pauseAfterMaxLosses: boolean
}

export interface Signal {
  id: string
  userId: string
  source: string
  symbol: string
  action: SignalAction
  price: number
  contracts?: number | null
  strategy?: string | null
  timeframe?: string | null
  status: SignalStatus
  rejectReason?: string | null
  createdAt: string
  orders?: Order[]
}

export interface Order {
  id: string
  signalId: string
  accountId: string
  account?: Account
  signal?: Signal
  symbol: string
  side: SignalAction
  qty: number
  orderType: string
  status: OrderStatus
  tradovateOrderId?: string | null
  fillPrice?: number | null
  skipReason?: string | null
  errorMsg?: string | null
  retryCount: number
  createdAt: string
}

export interface DailyStat {
  id: string
  accountId: string
  account?: Account
  date: string
  entriesCount: number
  pnl: number
  winCount: number
  lossCount: number
  drawdownPct: number
  consecutiveLosses: number
  isPaused: boolean
}

export interface Subscription {
  id: string
  userId: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  monthlyFeeUsd: number
  performancePct: number
  startDate: string
  nextBillingAt?: string | null
}
