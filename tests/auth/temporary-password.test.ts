import { describe, expect, it } from "vitest";

import {
  DIGITS,
  generateTemporaryPassword,
  LOWERCASE,
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  UPPERCASE,
} from "@/lib/auth/temporary-password";
import { MIN_PASSWORD_LENGTH } from "@/validations/auth";

const SAMPLES = Array.from({ length: 500 }, () => generateTemporaryPassword());

describe("generateTemporaryPassword()", () => {
  it("is 14 characters long", () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBe(14);
    for (const password of SAMPLES) expect(password).toHaveLength(14);
  });

  it("meets the login minimum length", () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
  });

  it("uses only letters and digits from the allowed alphabet", () => {
    for (const password of SAMPLES) {
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
      for (const char of password) expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char);
    }
  });

  it("never uses confusing characters (0 O o 1 l I)", () => {
    for (const confusing of ["0", "O", "o", "1", "l", "I"]) {
      expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(confusing);
    }
    for (const password of SAMPLES) expect(password).not.toMatch(/[0Oo1lI]/);
  });

  it("always mixes uppercase, lowercase and digits", () => {
    for (const password of SAMPLES) {
      expect([...password].some((c) => UPPERCASE.includes(c))).toBe(true);
      expect([...password].some((c) => LOWERCASE.includes(c))).toBe(true);
      expect([...password].some((c) => DIGITS.includes(c))).toBe(true);
    }
  });

  it("does not repeat (random each time)", () => {
    expect(new Set(SAMPLES).size).toBe(SAMPLES.length);
  });

  it("rejects biased bytes instead of wrapping them", () => {
    // Bytes >= 248 (the largest multiple of 56 below 256) must be skipped.
    let call = 0;
    const source = (bytes: Uint8Array) => {
      call += 1;
      // First call: all out-of-range bytes; later calls: valid bytes.
      bytes.fill(call === 1 ? 255 : 0).forEach((_, i) => {
        if (call > 1) bytes[i] = [0, 30, 50][i % 3];
      });
      return bytes;
    };
    const password = generateTemporaryPassword(14, source);
    expect(password).toHaveLength(14);
    expect(password).not.toContain(TEMPORARY_PASSWORD_ALPHABET[255 % TEMPORARY_PASSWORD_ALPHABET.length]);
  });
});
