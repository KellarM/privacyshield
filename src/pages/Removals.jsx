import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import StatusPill from '@/components/StatusPill';
import ListingDetail from '@/components/ListingDetail';
import { formatDay, daysUntil, NEEDS_ACTION } from '@/lib/privacy';

const FILTERS = [
  { key: 'action', label: 'Action needed' },
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Awaiting reply' },
  { key: 'removed', label: 'Removed' },
];

export default function Removals() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('action');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    base44.entities.Listing.filter({}, { sort: '-updated_date', limit: 200 }).then((page) => {
      setListings((page.items || []).filter((l) => l.status !== 'dismissed'));
      setLoading(false);
    });
  }, []);

  const visible = listings.filter((l) => {
    if (filter === 'all') return true;
    if (filter === 'action') return NEEDS_ACTION.includes(l.status);
    if (filter === 'requested') return ['requested', 'follow_up'].includes(l.status);
    return l.status === 'removed';
  });

  const onChanged = (updated) =>
    setListings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 md:px-8 md:py-16">
      <span className="label-mono">Removals</span>
      <div className="mt-3 flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em]">
            Every listing, tracked
          </h1>
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
            Open a listing to date the request, draft the statutory letter, and record the outcome.
          </p>
        </div>
        <Link
          to="/scan"
          className="font-mono text-[10px] uppercase tracking-[0.16em] underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
        >
          Run a new scan
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-300 ${
              filter === item.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-sm bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-8 border-t border-border pt-8">
          <p className="text-[15px] text-muted-foreground">
            {listings.length === 0
              ? 'Nothing tracked yet. Run a scan to find your listings.'
              : 'Nothing in this view.'}
          </p>
        </div>
      ) : (
        <ul className="mt-8 border-t border-border">
          {visible.map((item) => {
            const due = daysUntil(item.follow_up_date);
            return (
              <li key={item.id}>
                <button
                  onClick={() => setSelected(item)}
                  className="grid w-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 border-b border-border py-4 text-left transition-colors duration-300 hover:bg-card md:grid-cols-[1.1fr_1.5fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-[15px] tracking-tight">{item.broker_name}</p>
                    <p className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                      {item.broker_domain}
                    </p>
                  </div>
                  <p className="col-span-2 order-3 text-[13px] leading-snug text-muted-foreground md:order-none md:col-span-1">
                    {item.exposed_data}
                  </p>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusPill status={item.status} />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {due === null
                        ? 'No request sent'
                        : due < 0
                          ? `Overdue ${Math.abs(due)}d`
                          : `Follow up ${formatDay(item.follow_up_date)}`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <ListingDetail
          listing={selected}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            onChanged(updated);
            setSelected(updated);
          }}
        />
      )}
    </div>
  );
}