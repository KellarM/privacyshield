export default function StatCard({ label, value, note, tone = 'default' }) {
  const toneClass =
    tone === 'signal' ? 'text-signal' : tone === 'alert' ? 'text-alert' : 'text-foreground';

  return (
    <div className="flex flex-col gap-3 px-5 py-6 md:px-6">
      <span className="label-mono">{label}</span>
      <span className={`font-display text-[34px] leading-none tracking-tight ${toneClass}`}>
        {value}
      </span>
      {note && <span className="text-[12px] leading-snug text-muted-foreground">{note}</span>}
    </div>
  );
}