import { BrokerAdapter } from './BrokerAdapter';
import { TradovateAdapter } from './tradovate/TradovateAdapter';

class BrokerRegistryClass {
  private adapters: Map<string, BrokerAdapter> = new Map();

  register(adapter: BrokerAdapter): void {
    this.adapters.set(adapter.brokerName, adapter);
  }

  get(brokerName: string): BrokerAdapter {
    const adapter = this.adapters.get(brokerName);
    if (!adapter) {
      throw new Error(`Broker adapter not found: ${brokerName}`);
    }
    return adapter;
  }

  has(brokerName: string): boolean {
    return this.adapters.has(brokerName);
  }
}

export const BrokerRegistry = new BrokerRegistryClass();

// Register MVP adapters
BrokerRegistry.register(new TradovateAdapter());
