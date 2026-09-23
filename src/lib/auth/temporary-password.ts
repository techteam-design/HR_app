// Temporary passwords for new logins and admin resets. Pure apart from the
// crypto-secure random source (Web Crypto: works in Node and Cloudflare).

export const TEMPORARY_PASSWORD_LENGTH = 14;

// Letters and digits without look-alikes: no 0/O/o, 1/l/I.
export const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const LOWERCASE = "abcdefghijkmnpqrstuvwxyz";
export const DIGITS = "23456789";
export const TEMPORARY_PASSWORD_ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

type RandomSource = (bytes: Uint8Array) => Uint8Array;

const cryptoRandom: RandomSource = (bytes) => crypto.getRandomValues(bytes);

// Uniform pick from the alphabet using rejection sampling (no modulo bias).
function randomChars(count: number, alphabet: string, random: RandomSource): string {
  const limit = 256 - (256 % alphabet.length);
  let result = "";
  while (result.length < count) {
    const bytes = random(new Uint8Array(count * 2));
    for (const byte of bytes) {
      if (byte < limit && result.length < count) result += alphabet[byte % alphabet.length];
    }
  }
  return result;
}

// Always contains at least one uppercase letter, one lowercase letter and one digit.
export function generateTemporaryPassword(
  length = TEMPORARY_PASSWORD_LENGTH,
  random: RandomSource = cryptoRandom,
): string {
  for (;;) {
    const candidate = randomChars(length, TEMPORARY_PASSWORD_ALPHABET, random);
    if (
      [...candidate].some((c) => UPPERCASE.includes(c)) &&
      [...candidate].some((c) => LOWERCASE.includes(c)) &&
      [...candidate].some((c) => DIGITS.includes(c))
    ) {
      return candidate;
    }
  }
}
