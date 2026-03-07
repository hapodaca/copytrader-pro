import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateWebhookPayload, validateWebhookSecret } from '../src/services/signalValidator';

describe('signalValidator', () => {
  beforeEach(() => {
    vi.stubEnv('WEBHOOK_SECRET', 'test-secret-123');
  });

  describe('validateWebhookPayload', () => {
    it('should pass with valid payload', () => {
      const payload = {
        secret: 'test-secret-123',
        symbol: 'MNQZ24',
        action: 'BUY',
        price: 15000.5,
        contracts: 2,
        strategy: 'breakout',
        timeframe: '5m',
      };

      const result = validateWebhookPayload(payload);
      expect(result.symbol).toBe('MNQZ24');
      expect(result.action).toBe('BUY');
      expect(result.price).toBe(15000.5);
      expect(result.contracts).toBe(2);
    });

    it('should pass with minimal valid payload', () => {
      const payload = {
        secret: 'test-secret-123',
        symbol: 'ESH25',
        action: 'SELL',
        price: 5000,
      };

      const result = validateWebhookPayload(payload);
      expect(result.symbol).toBe('ESH25');
      expect(result.action).toBe('SELL');
      expect(result.contracts).toBeUndefined();
    });

    it('should throw on invalid action', () => {
      const payload = {
        secret: 'test-secret-123',
        symbol: 'MNQZ24',
        action: 'INVALID',
        price: 15000,
      };

      expect(() => validateWebhookPayload(payload)).toThrow();
    });

    it('should throw on missing required fields', () => {
      expect(() => validateWebhookPayload({})).toThrow();
      expect(() => validateWebhookPayload({ secret: 'x' })).toThrow();
      expect(() =>
        validateWebhookPayload({ secret: 'x', symbol: 'ES', action: 'BUY' })
      ).toThrow(); // missing price
    });

    it('should throw on negative price', () => {
      const payload = {
        secret: 'test',
        symbol: 'ES',
        action: 'BUY',
        price: -100,
      };

      expect(() => validateWebhookPayload(payload)).toThrow();
    });

    it('should throw on empty symbol', () => {
      const payload = {
        secret: 'test',
        symbol: '',
        action: 'BUY',
        price: 100,
      };

      expect(() => validateWebhookPayload(payload)).toThrow();
    });

    it('should accept all valid actions', () => {
      const actions = ['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT'];
      for (const action of actions) {
        const result = validateWebhookPayload({
          secret: 'test',
          symbol: 'ES',
          action,
          price: 100,
        });
        expect(result.action).toBe(action);
      }
    });
  });

  describe('validateWebhookSecret', () => {
    it('should return true for correct secret', () => {
      const payload = validateWebhookPayload({
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'BUY',
        price: 100,
      });

      expect(validateWebhookSecret(payload)).toBe(true);
    });

    it('should return false for incorrect secret', () => {
      const payload = validateWebhookPayload({
        secret: 'wrong-secret',
        symbol: 'ES',
        action: 'BUY',
        price: 100,
      });

      expect(validateWebhookSecret(payload)).toBe(false);
    });
  });
});
