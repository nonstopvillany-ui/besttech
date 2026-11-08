import {
  Bell, Building2, Calculator, CalendarRange, ChartColumn, ClipboardList, FileText, FolderOpen, Hammer, HardHat,
  House, Image, LayoutGrid, Link, Mail, MapPin, Package, Phone, Settings, Truck, Users, Wallet, Warehouse, Wrench,
  type LucideIcon,
} from 'lucide-react';

// A szerveroldali engedélyezett ikonlistával (server/lib/validate.ts – ICONS) egyezik.
export const ICON_MAP: Record<string, LucideIcon> = {
  'calendar-range': CalendarRange, 'building-2': Building2, users: Users, 'folder-open': FolderOpen, mail: Mail,
  house: House, warehouse: Warehouse, settings: Settings, 'layout-grid': LayoutGrid, hammer: Hammer,
  'hard-hat': HardHat, truck: Truck, 'file-text': FileText, 'clipboard-list': ClipboardList,
  'chart-column': ChartColumn, wallet: Wallet, phone: Phone, 'map-pin': MapPin, calculator: Calculator,
  package: Package, wrench: Wrench, link: Link, bell: Bell, image: Image,
};

export function TileIcon({ name, size = 40 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? LayoutGrid;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}
