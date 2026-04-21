function decodeTokenPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base.padEnd(Math.ceil(base.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getRoleFromToken(token: string | null): string | null {
  const payload = decodeTokenPayload(token);
  return typeof payload?.role === 'string' ? payload.role : null;
}

export function getUserIdFromToken(token: string | null): number | null {
  const payload = decodeTokenPayload(token);
  const id = Number(payload?.sub || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function getDepositoIdFromToken(token: string | null): number | null {
  const payload = decodeTokenPayload(token);
  const id = Number(payload?.deposito_id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}
