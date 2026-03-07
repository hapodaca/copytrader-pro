// Shared types for CopyTrader Pro

export type SignalAction = 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT';

export type SignalStatus = 'received' | 'processing' | 'processed' | 'rejected';

export type OrderStatus = 'pending' | 'sent' | 'filled' | 'skipped' | 'rejected' | 'error' | 'cancelled';

export type DistributionMode = 'all' | 'rotate' | 'batch_rotate';

export type RiskMode = 'fixed_usd' | 'pct_balance';

export type AccountStage = 'challenge' | 'funded_to_withdrawal' | 'funded_active';

export type UserRole = 'admin' | 'user';

export type Environment = 'demo' | 'live';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface WebhookPayload {
  secret: string;
  symbol: string;
  action: SignalAction;
  price: number;
  contracts?: number;
  strategy?: string;
  timeframe?: string;
  timestamp?: string;
}

export interface ManualSignalPayload {
  groupId: string;
  symbol: string;
  action: SignalAction;
  qty?: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface BrokerCredentials {
  accessToken: string;
  refreshToken: string;
  environment: Environment;
}

export interface BrokerEvent {
  type: 'order_fill' | 'position_change' | 'account_update';
  data: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
