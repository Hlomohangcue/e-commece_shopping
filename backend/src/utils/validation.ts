export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= 191;
}

export function isValidSlug(value: unknown): value is string {
  return isNonEmptyString(value, 191) && !/[\s/\\]/.test(value);
}

export function isValidEmail(value: unknown): value is string {
  return isNonEmptyString(value, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidImageFile(value: unknown): value is { filename: string; data: string } {
  if (!isRecord(value) || typeof value.filename !== 'string' || typeof value.data !== 'string') return false;
  const extension = value.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  const mimeByExtension: Record<string, string> = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(value.filename) || !extension || !mimeByExtension[extension]) {
    return false;
  }
  const match = value.data.match(/^data:(image\/(?:gif|jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || mimeByExtension[extension] !== match[1]) return false;
  return Buffer.from(match[2], 'base64').length <= 5 * 1024 * 1024;
}
