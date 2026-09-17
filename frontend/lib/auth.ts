const TOKEN_KEY = 'token';

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export async function fetchJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
      ? data.message
      : 'Request failed.';
    throw new Error(message);
  }
  return data as T;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event('auth-changed'));
}

export function clearToken(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('auth-changed'));
  }
}

export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payloadSegment = token.split('.')[1];
    const payload = JSON.parse(atob(payloadSegment));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
