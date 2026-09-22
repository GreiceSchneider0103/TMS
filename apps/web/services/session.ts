const STORAGE_KEY = 'tms_api_key';

export function setSession(apiKey: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, apiKey);
  } catch {
    // sessionStorage unavailable (private mode, etc.) - session just won't persist across reloads
  }
  document.cookie = 'tms_session=1; path=/; max-age=28800; samesite=lax';
}

export function getApiKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  document.cookie = 'tms_session=; path=/; max-age=0';
}