import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const DIFFICULTY = {
  easy: 'border-signal/25 bg-signal/10 text-signal',
  medium: 'border-warn/25 bg-warn/10 text-warn',
  hard: 'border-alert/25 bg-alert/10 text-alert',
};

export default function Brokers() {
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Broker.filter({ active: true }, { sort: 'name', limit: 200 }).then((page) => {
      setBrokers(page.items || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 md:px-8 md:py-16">
      <span className="label-mono">Registry</span>
      <div className="mt-3 border-b border-border pb-8">
        <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em]">
          Who holds your data
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Every site here publishes personal records and offers a removal route. Difficulty reflects
          how much they resist: easy sites remove within days through a form, hard ones require ID
          or a mailed statutory request.
        </p>
      </div>

      {loading ? (
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-sm bg-muted" />
          ))}
        </div>
      ) : (
        <ul className="mt-8 border-t border-border">
          {brokers.map((broker) => (
            <li
              key={broker.id}
              className="grid gap-3 border-b border-border py-4 md:grid-cols-[1.1fr_1.6fr_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] tracking-tight">{broker.name}</p>
                <p className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                  {broker.domain}
                </p>
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">
                {broker.notes || (broker.requires_id ? 'Requires government ID before removal.' : 'Standard removal request.')}
              </p>
              <div className="flex items-center gap-3 md:justify-end">
                <span
                  className={`rounded-sm border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] ${
                    DIFFICULTY[broker.difficulty] || DIFFICULTY.medium
                  }`}
                >
                  {broker.difficulty || 'medium'}
                </span>
                {broker.opt_out_url && (
                  <a
                    href={broker.opt_out_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Opt out <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}