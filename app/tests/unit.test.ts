import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from '../server/security/password.js';
import { targetProblem } from '../server/lib/validate.js';

describe('jelszókezelés', () => {
  it('a hash nem tartalmazza a jelszót, és helyesen ellenőriz', async () => {
    const h = await hashPassword('TitkosJelszo123');
    expect(h).toMatch(/^scrypt\$/);
    expect(h).not.toContain('TitkosJelszo123');
    expect(await verifyPassword('TitkosJelszo123', h)).toBe(true);
    expect(await verifyPassword('titkosjelszo123', h)).toBe(false);
  });
  it('ugyanarra a jelszóra eltérő hash készül (só)', async () => {
    expect(await hashPassword('Abcdefgh12')).not.toBe(await hashPassword('Abcdefgh12'));
  });
  it('hibás formátumú tárolt hash esetén elutasít', async () => {
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
  });
  it('jelszószabály', () => {
    expect(passwordProblem('rovid1')).toBeTruthy();
    expect(passwordProblem('csakbetukbetuk')).toBeTruthy();
    expect(passwordProblem('1234567890')).toBeTruthy();
    expect(passwordProblem('Besttech2026')).toBeNull();
  });
});

describe('csempe-cél ellenőrzése', () => {
  it('belső útvonal', () => {
    expect(targetProblem('internal', '/admin')).toBeNull();
    expect(targetProblem('internal', '//gonosz.hu')).toBeTruthy();
    expect(targetProblem('internal', 'admin')).toBeTruthy();
  });
  it('külső cím csak https', () => {
    expect(targetProblem('external', 'https://raktar.example.hu/')).toBeNull();
    expect(targetProblem('external', 'http://raktar.example.hu/')).toBeTruthy();
    expect(targetProblem('external', 'javascript:alert(1)')).toBeTruthy();
    expect(targetProblem('external', 'data:text/html,x')).toBeTruthy();
  });
});
