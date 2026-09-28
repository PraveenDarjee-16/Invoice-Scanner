export const MAX_INVOICES_PER_SUBMISSION = 50;
export const MAX_PAGES_PER_INVOICE = 100;
export const MAX_PAGES_PER_SUBMISSION = 500;
/** Vercel functions reject request bodies above ~4.5 MB, so each page image stays below 4 MB. */
export const MAX_PAGE_BYTES = 4_000_000;
export const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_NAME_LEN = 120;

/** Indian mobile numbers: exactly 10 digits, first digit 6-9. */
export const isValidIndianPhone = (phone: string) => /^[6-9]\d{9}$/.test(phone);

/** Strips +91 / 0 prefixes, spaces and dashes. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export const isValidUsername = (name: string) => /^[\p{L}\p{N} ._-]{2,60}$/u.test(name);
export const isValidEmail = (email: string) =>
  email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

const RESERVED = new Set(["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"]);

/** Turns any typed text into a safe file name (without extension). */
export function sanitizeFileName(input: string, fallback = "Invoice"): string {
  let name = input.normalize("NFC").replace(/\p{Cc}/gu, " ");
  name = name.replace(/[^\p{L}\p{N} _\-()]+/gu, "");
  name = name.replace(/\s+/g, " ").trim().replace(/^[ ._-]+|[ ._-]+$/g, "");
  if (!name) name = fallback;
  if (name.length > MAX_NAME_LEN) name = name.slice(0, MAX_NAME_LEN).trim();
  if (RESERVED.has(name.toUpperCase())) name = fallback;
  return name;
}

export const toFileSlug = (name: string, fallback = "Invoice") =>
  sanitizeFileName(name, fallback).replace(/ /g, "_");

export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "item";
}

/** JPEG files start with FF D8 FF. */
export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export type ImageKind = "jpeg" | "png" | "webp" | "gif";
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (isJpeg(b)) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45)
    return "webp";
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  return null;
}
