export function getRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base.padEnd(Math.ceil(base.length / 4) * 4, '=');
    const json = atob(padded);
    const payload = JSON.parse(json);
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}
