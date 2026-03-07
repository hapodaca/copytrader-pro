import prisma from '../../../db/client';

export function getBaseUrl(environment: string): string {
  return environment === 'live'
    ? 'https://live.tradovateapi.com/v1'
    : 'https://demo.tradovateapi.com/v1';
}

export function getOAuthAuthorizeUrl(): string {
  const clientId = process.env.TRADOVATE_CLIENT_ID;
  const redirectUri = process.env.TRADOVATE_REDIRECT_URI;
  return `https://live-api-d.tradovate.com/auth/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri!)}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: number;
}> {
  const response = await fetch('https://live-api-d.tradovate.com/auth/oauthtoken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.TRADOVATE_CLIENT_ID,
      client_secret: process.env.TRADOVATE_CLIENT_SECRET,
      redirect_uri: process.env.TRADOVATE_REDIRECT_URI,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tradovate OAuth token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, any>;
  return {
    accessToken: data.access_token || data.accessToken,
    refreshToken: data.refresh_token || data.refreshToken,
    expiresIn: data.expires_in || data.expiresIn || 7200,
    userId: data.userId || data.user_id,
  };
}

export class TokenManager {
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  async ensureValidToken(account: {
    id: string;
    environment: string;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiry: Date | null;
  }): Promise<string> {
    if (!account.accessToken || !account.tokenExpiry) {
      throw new Error(`Account ${account.id} has no access token. Please reconnect via OAuth.`);
    }

    const now = new Date();
    const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (account.tokenExpiry > fiveMinFromNow) {
      return account.accessToken;
    }

    return this.refreshAccessToken(account);
  }

  private async refreshAccessToken(account: {
    id: string;
    environment: string;
    refreshToken: string | null;
  }): Promise<string> {
    if (!account.refreshToken) {
      throw new Error(`Account ${account.id} has no refresh token`);
    }

    const baseUrl = getBaseUrl(account.environment);
    const response = await fetch(`${baseUrl}/auth/renewaccesstoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: account.refreshToken }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed for account ${account.id}: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const newAccessToken = data.accessToken || data.access_token;
    const expiresIn = data.expiresIn || data.expires_in || 7200;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    await prisma.account.update({
      where: { id: account.id },
      data: { accessToken: newAccessToken, tokenExpiry },
    });

    return newAccessToken;
  }

  setupAutoRefresh(accountId: string, environment: string): void {
    // Clear existing timer
    this.clearAutoRefresh(accountId);

    // Refresh every 55 minutes
    const timer = setInterval(async () => {
      try {
        const account = await prisma.account.findUnique({ where: { id: accountId } });
        if (account && account.isActive) {
          await this.ensureValidToken(account);
        }
      } catch (err) {
        console.error(`Auto-refresh failed for account ${accountId}:`, (err as Error).message);
      }
    }, 55 * 60 * 1000);

    this.refreshTimers.set(accountId, timer);
  }

  clearAutoRefresh(accountId: string): void {
    const timer = this.refreshTimers.get(accountId);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(accountId);
    }
  }
}

export const tokenManager = new TokenManager();
