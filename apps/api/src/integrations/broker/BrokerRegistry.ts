import { BrokerAdapter } from './BrokerAdapter'

const registry = new Map<string, BrokerAdapter>()

export const BrokerRegistry = {
  register(adapter: BrokerAdapter) {
    registry.set(adapter.brokerName, adapter)
  },
  get(brokerName: string): BrokerAdapter {
    const adapter = registry.get(brokerName)
    if (!adapter) throw new Error(`Broker no registrado: ${brokerName}`)
    return adapter
  },
  has(brokerName: string): boolean {
    return registry.has(brokerName)
  },
}
