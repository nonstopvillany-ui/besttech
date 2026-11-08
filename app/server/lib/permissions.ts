// Jogosultságok katalógusa. Az Adminisztrátor (roles.is_admin) mindegyikkel rendelkezik;
// a többi szerepkör jogait a role_permissions tábla tárolja (Admin → Szerepkörök).
export const PERMISSIONS = {
  'scheduler.view': 'Ütemező megtekintése',
  'scheduler.edit': 'Ütemező szerkesztése',
  'scheduler.finance': 'Bérek, bértételek és alvállalkozói kifizetések',
  'customers.view': 'Ügyfelek megtekintése',
  'customers.edit': 'Ügyfelek szerkesztése',
  'projects.view': 'Projektek megtekintése',
  'projects.edit': 'Projektek szerkesztése',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const isPermission = (p: string): p is Permission => p in PERMISSIONS;
