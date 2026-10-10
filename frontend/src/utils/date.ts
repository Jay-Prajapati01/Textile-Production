const pad = (n: number) => n.toString().padStart(2, '0');

export const toLocalDateString = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const getTodayString = (): string => toLocalDateString(new Date());

export const isValidDateString = (s: string | null | undefined): boolean =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "Thu, 02 Oct 2026" */
export const formatDisplayDate = (iso: string): string => {
  if (!isValidDateString(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  const mo = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][m - 1];
  return `${wd}, ${pad(d)} ${mo} ${y}`;
};
