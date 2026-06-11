export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function formatDate(date: Date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function parseDate(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return formatDate(date) === value ? date : null;
}

export function parseDateTime(value: string) {
  const match = value.match(/^(\d{2}-\d{2}-\d{4}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = parseDate(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!date || hour > 23 || minute > 59) return null;
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function monthKey(date: Date) {
  return pad(date.getMonth() + 1);
}

export function pad(value: number) {
  return String(value).padStart(2, "0");
}
