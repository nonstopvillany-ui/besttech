import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Jelszó-hash: a Node beépített scrypt függvénye (memóriaigényes, lassú – brute force ellen).
// Tárolt formátum: scrypt$N$r$p$só(base64)$hash(base64)
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;
export const MIN_PASSWORD_LENGTH = 10;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const key = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: 128 * n * r * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Nem létező felhasználónál is lefut egy ellenőrzés, hogy a válaszidőből
// ne derüljön ki, létezik-e az e-mail-cím.
let dummyHash: Promise<string> | undefined;
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('besttech-dummy-password');
  await verifyPassword(password, await dummyHash);
}

/** Jelszószabály: legalább 10 karakter, betű és szám is legyen benne. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A jelszó legalább ${MIN_PASSWORD_LENGTH} karakter legyen.`;
  if (password.length > 200) return 'A jelszó legfeljebb 200 karakter lehet.';
  if (!/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]/.test(password) || !/[0-9]/.test(password))
    return 'A jelszóban legyen betű és szám is.';
  return null;
}
