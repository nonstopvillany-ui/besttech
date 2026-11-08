import { z } from 'zod';

export const ICONS = [
  'calendar-range', 'building-2', 'users', 'folder-open', 'mail', 'house', 'warehouse', 'settings',
  'layout-grid', 'hammer', 'hard-hat', 'truck', 'file-text', 'clipboard-list', 'chart-column',
  'wallet', 'phone', 'map-pin', 'calculator', 'package', 'wrench', 'link', 'bell', 'image',
] as const;

export const emailSchema = z.string().trim().toLowerCase().max(200).email('Érvénytelen e-mail-cím.');

/**
 * Csempe céljának ellenőrzése.
 * - internal: az alkalmazáson belüli útvonal ("/..."), protokoll-relatív ("//") nem lehet
 * - external: csak https:// cím (javascript:, data: stb. kizárva)
 */
export function targetProblem(type: string, target: string): string | null {
  if (type === 'none') return null;
  if (type === 'internal') {
    if (target === '') return null;
    return /^\/(?!\/)[A-Za-z0-9\-._~/?#=&%]*$/.test(target) ? null : 'A belső cél "/"-rel kezdődő útvonal legyen (pl. /admin).';
  }
  if (type === 'external') {
    if (target === '') return null;
    try {
      const u = new URL(target);
      return u.protocol === 'https:' ? null : 'Külső cél csak https:// kezdetű cím lehet.';
    } catch {
      return 'Érvénytelen webcím.';
    }
  }
  return 'Ismeretlen céltípus.';
}

export const tileSchema = z.object({
  title: z.string().trim().min(1, 'Adj meg nevet.').max(60),
  description: z.string().trim().max(200).default(''),
  icon: z.enum(ICONS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Érvénytelen szín.'),
  targetType: z.enum(['internal', 'external', 'none']),
  target: z.string().trim().max(500).default(''),
  status: z.enum(['active', 'development']),
  isVisible: z.boolean(),
  roles: z.array(z.string()).max(50),
});
