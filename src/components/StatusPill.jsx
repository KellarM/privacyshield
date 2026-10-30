const STYLES = {
  found: 'border-alert/25 bg-alert/10 text-alert',
  requested: 'border-warn/25 bg-warn/10 text-warn',
  follow_up: 'border-warn/25 bg-warn/10 text-warn',
  removed: 'border-signal/25 bg-signal/10 text-signal',
  reappeared: 'border-alert/25 bg-alert/10 text-alert',
  dismissed: 'border-border bg-muted text-muted-foreground',
};

const LABELS = {
  found: 'Found',
  requested: 'Requested',
  follow_up: 'Follow up',
  removed: 'Removed',
  reappeared: 'Re-listed',
  dismissed: 'Dismissed',
};

export default function StatusPill({ status = 'found', className = '' }) {
  const style = STYLES[status] || STYLES.found;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] ${style} ${className}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {LABELS[status] || status}
    </span>
  );
}