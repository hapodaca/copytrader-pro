export interface BrokerEvent {
  type: 'order_fill' | 'position_change' | 'account_update';
  data: Record<string, unknown>;
}

export interface BrokerAccount {
  id: string;
  tradovateId: string;
  tradovateSpec: string;
  environment: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
}

export interface BrokerSignal {
  symbol: string;
  action: string;
  price: number;
}

export interface BrokerOrder {
  orderId: string;
  status: string;
  fillPrice?: number;
}

export interface Position {
  symbol: string;
  netPos: number;
  avgPrice: number;
}

export interface BrokerAdapter {
  readonly brokerName: string;
  connect(credentials: { accessToken: string; refreshToken: string; environment: string }): Promise<void>;
  placeOrder(account: BrokerAccount, signal: BrokerSignal, qty: number): Promise<BrokerOrder>;
  cancelOrder(account: BrokerAccount, orderId: string): Promise<void>;
  getBalance(account: BrokerAccount): Promise<number>;
  getPositions(account: BrokerAccount): Promise<Position[]>;
  getInitialMargin(symbol: string): Promise<number>;
  subscribeToUpdates(account: BrokerAccount, cb: (event: BrokerEvent) => void): void;
}
