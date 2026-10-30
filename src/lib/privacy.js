import { format, addDays, differenceInDays, parseISO } from 'date-fns';

export const STATUS_LABELS = {
  found: 'Found',
  requested: 'Requested',
  follow_up: 'Follow up',
  removed: 'Removed',
  reappeared: 'Re-listed',
  dismissed: 'Dismissed',
};

export const NEEDS_ACTION = ['found', 'follow_up', 'reappeared'];

export function formatDay(value) {
  if (!value) return '—';
  try {
    return format(typeof value === 'string' ? parseISO(value) : new Date(value), 'd MMM yyyy');
  } catch {
    return '—';
  }
}

export function daysUntil(value) {
  if (!value) return null;
  try {
    return differenceInDays(typeof value === 'string' ? parseISO(value) : new Date(value), new Date());
  } catch {
    return null;
  }
}

export function nextFollowUp(days) {
  return addDays(new Date(), days).toISOString();
}

export function completeness(profile) {
  if (!profile) return 0;
  const fields = ['full_name', 'aliases', 'addresses', 'phones', 'emails'];
  const filled = fields.filter((key) => {
    const value = profile[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  return Math.round((filled.length / fields.length) * 100);
}

export function profileChecklist(profile) {
  return [
    { label: 'Legal name', done: Boolean(profile?.full_name) },
    { label: 'Prior names', done: Boolean(profile?.aliases?.length) },
    { label: 'Addresses', done: Boolean(profile?.addresses?.length) },
    { label: 'Phone numbers', done: Boolean(profile?.phones?.length) },
    { label: 'Email addresses', done: Boolean(profile?.emails?.length) },
  ];
}