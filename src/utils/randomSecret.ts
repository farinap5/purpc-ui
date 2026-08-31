const LOWERCASE_ALPHANUMERIC = "0123456789abcdefghijklmnopqrstuvwxyz";

export const generateRandomOTS = (length = 16) => {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError("One-time secret length must be a positive integer.");
  }

  const unbiasedLimit = Math.floor(256 / LOWERCASE_ALPHANUMERIC.length) * LOWERCASE_ALPHANUMERIC.length;
  let secret = "";

  while (secret.length < length) {
    const remaining = length - secret.length;
    const randomBytes = new Uint8Array(Math.max(remaining, 16));
    globalThis.crypto.getRandomValues(randomBytes);

    for (const byte of randomBytes) {
      if (byte >= unbiasedLimit) continue;
      secret += LOWERCASE_ALPHANUMERIC[byte % LOWERCASE_ALPHANUMERIC.length];
      if (secret.length === length) break;
    }
  }

  return secret;
};
