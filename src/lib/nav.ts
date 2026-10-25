// Navigation: the four bottom tabs, which tab a page belongs to, and where the top bar's back button goes.

/** Bottom tabs, right to left: الرئيسية / التمارين / أغانيّ / التقدّم. */
export const TABS = [
  { id: '', ar: 'الرئيسية', icon: 'home' },
  { id: 'exercises', ar: 'التمارين', icon: 'exercises' },
  { id: 'songs', ar: 'أغانيّ', icon: 'songs' },
  { id: 'progress', ar: 'التقدّم', icon: 'progress' },
] as const;

/** Where each page belongs: its tab (highlighted) and where "back" goes. Pages not listed are exercises. */
const PARENT: Record<string, string> = { path: '', more: '', badges: 'more', guide: 'more', teacher: 'more' };

/** The tab a route belongs to ('more' = none). */
export function tabOf(route: string): string {
  const top = route.split('/')[0];
  if (TABS.some((t) => t.id === top)) return top;
  if (top === 'more' || PARENT[top] === 'more') return 'more';
  return top in PARENT ? PARENT[top] : 'exercises';
}

/** Where the top bar's back button goes: up one level inside a page (songs/<id>/learn → songs/<id>), else the parent. */
export function backOf(route: string): string | null {
  const parts = route.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts.length > 1) return parts[0] === 'songs' && parts.length > 2 ? `songs/${parts[1]}` : parts[0] === 'path' ? 'path' : parts[0];
  if (TABS.some((t) => t.id === parts[0])) return null;
  return parts[0] in PARENT ? PARENT[parts[0]] : 'exercises';
}

