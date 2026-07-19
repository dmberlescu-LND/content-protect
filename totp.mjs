import { createHmac, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5)
    output +=
      BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}

export function normaliseTotpSecret(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

export function base32Decode(value) {
  const normalised = normaliseTotpSecret(value);
  let bits = "";
  for (const character of normalised) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid authenticator secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function validTotpSecret(value) {
  const normalised = normaliseTotpSecret(value);
  if (!/^[A-Z2-7]{32}$/.test(normalised)) return false;
  try {
    return base32Decode(normalised).length === 20;
  } catch {
    return false;
  }
}

export function totpAt(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000),
    message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret))
      .update(message)
      .digest(),
    offset = digest[digest.length - 1] & 15,
    number =
      (((digest[offset] & 127) << 24) |
        ((digest[offset + 1] & 255) << 16) |
        ((digest[offset + 2] & 255) << 8) |
        (digest[offset + 3] & 255)) %
      1000000;
  return String(number).padStart(6, "0");
}

export function validTotp(secret, value, timestamp = Date.now()) {
  if (!validTotpSecret(secret)) return false;
  const code = String(value || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  return [-30000, 0, 30000].some((offset) => {
    const expected = Buffer.from(totpAt(secret, timestamp + offset));
    return timingSafeEqual(expected, Buffer.from(code));
  });
}
