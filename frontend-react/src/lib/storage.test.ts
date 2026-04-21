import { beforeEach, describe, expect, it } from 'vitest';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './storage';

describe('storage auth tokens', () => {
  beforeEach(() => {
    clearTokens();
  });

  it('replaces stale local tokens when saving a session login', () => {
    localStorage.setItem('auth.accessToken', 'old-local-access');
    localStorage.setItem('auth.refreshToken', 'old-local-refresh');

    saveTokens('new-session-access', 'new-session-refresh', false);

    expect(getAccessToken()).toBe('new-session-access');
    expect(getRefreshToken()).toBe('new-session-refresh');
    expect(localStorage.getItem('auth.accessToken')).toBeNull();
    expect(localStorage.getItem('auth.refreshToken')).toBeNull();
    expect(sessionStorage.getItem('auth.accessToken')).toBe('new-session-access');
    expect(sessionStorage.getItem('auth.refreshToken')).toBe('new-session-refresh');
  });

  it('replaces stale session tokens when saving a remembered login', () => {
    sessionStorage.setItem('auth.accessToken', 'old-session-access');
    sessionStorage.setItem('auth.refreshToken', 'old-session-refresh');

    saveTokens('new-local-access', 'new-local-refresh', true);

    expect(getAccessToken()).toBe('new-local-access');
    expect(getRefreshToken()).toBe('new-local-refresh');
    expect(sessionStorage.getItem('auth.accessToken')).toBeNull();
    expect(sessionStorage.getItem('auth.refreshToken')).toBeNull();
    expect(localStorage.getItem('auth.accessToken')).toBe('new-local-access');
    expect(localStorage.getItem('auth.refreshToken')).toBe('new-local-refresh');
  });
});
