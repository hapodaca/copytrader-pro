import axios from 'axios'
import { prisma } from '../../../db/client'
import { Account } from '@prisma/client'

const BASE_URLS = {
  demo: 'https://demo.tradovateapi.com/v1',
  live: 'https://live.tradovateapi.com/v1',
}

const OAUTH_URLS = {
  authorize: 'https://live-api-d.tradovate.com/auth/oauth/authorize',
  token: 'https://live-api-d.tradovate.com/auth/oauthtoken',
}

export function getBaseUrl(environment: string) {
  return environment === 'live' ? BASE_URLS.live : BASE_URLS.demo
}

export function buildOAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TRADOVATE_CLIENT_ID!,
    redirect_uri: process.env.TRADOVATE_REDIRECT_URI!,
  })
  return `${OAUTH_URLS.authorize}?${params}`
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  userId: string
}> {
  const { data } = await axios.post(OAUTH_URLS.token, {
    grant_type: 'authorization_code',
    client_id: process.env.TRADOVATE_CLIENT_ID,
    client_secret: process.env.TRADOVATE_CLIENT_SECRET,
    redirect_uri: process.env.TRADOVATE_REDIRECT_URI,
    code,
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user_id,
  }
}

export async function refreshAccessToken(account: Account): Promise<string> {
  const baseUrl = getBaseUrl(account.environment)
  const { data } = await axios.post(`${baseUrl}/auth/renewaccesstoken`, null, {
    headers: { Authorization: `Bearer ${account.refreshToken}` },
  })
  const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hora
  await prisma.account.update({
    where: { id: account.id },
    data: { accessToken: data.accessToken, tokenExpiry },
  })
  return data.accessToken
}

export async function ensureValidToken(account: Account): Promise<string> {
  if (!account.accessToken) throw new Error(`Cuenta ${account.id} sin token`)
  const fiveMinutes = 5 * 60 * 1000
  const isExpiringSoon = account.tokenExpiry
    ? account.tokenExpiry.getTime() - Date.now() < fiveMinutes
    : true
  if (isExpiringSoon) {
    return refreshAccessToken(account)
  }
  return account.accessToken
}
