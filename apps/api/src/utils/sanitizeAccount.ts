// Quita las credenciales del broker de una cuenta antes de enviarla al cliente.
// Los tokens solo se usan server-side (adapters); el navegador nunca debe verlos.
// Expone hasToken (booleano) para que la UI pueda mostrar el estado de conexión
// sin recibir la credencial.
export function stripAccountTokens<T extends object | null | undefined>(account: T): T {
  if (!account) return account
  const { accessToken, refreshToken, ...safe } = account as Record<string, unknown>
  return { ...safe, hasToken: Boolean(accessToken) } as T
}
