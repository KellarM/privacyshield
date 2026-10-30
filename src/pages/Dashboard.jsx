import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ScanLine, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StatCard from '@/components/StatCard';
import StatusPill from '@/components/StatusPill';
import { completeness, profileChecklist, formatDay, daysUntil, NEEDS_ACTION } from '@/lib/privacy';

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [profilePage, listingPage] = await Promise.all([
        base44.entities.ExposureProfile.filter({}, { limit: 1 }),
        base44.entities.Listing.filter({}, { sort: '-updated_date', limit: 100 }),
      ]);
      setProfile((profilePage.items && profilePage.items[0]) || null);
      setListings(listingPage.items || []);
      setLoading(false);
    };
    load();
  }, []);

  const active = listings.filter((l) => l.status !== 'dismissed');
  const action = active.filter((l) => NEEDS_ACTION.includes(l.status));
  const removed = active.filter((l) => l.status === 'removed');
  const requested = active.filter((l) => l.requested_date);
  const pct = completeness(profile);
  const queue = [...action, ...active.filter((l) => !NEEDS_ACTION.includes(l.status))].slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
      <section className="grid gap-8 py-12 md:grid-cols-[1.6fr_1fr] md:gap-16 md:py-16">
        <div>
          <span className="label-mono">Identity exposure — {formatDay(new Date())}</span>
          <h1 className="mt-5 font-display text-[40px] leading-[1.02] tracking-[-0.03em] md:text-[56px]">
            {active.length === 0 ? 'Your name is for sale.' : `You are listed ${active.length} ${active.length === 1 ? 'time' : 'times'}.`}
            <br />
            <span className="text-muted-foreground">Let's take it back.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {active.length === 0
              ? 'Data brokers publish your address, phone and family ties so anyone can find them. Start with your profile, then scan the brokers that matter.'
              : `${removed.length} of those listings are confirmed gone. Every cleared listing is scheduled for re-check, because brokers re-publish from public records.`}
          </p>
        </div>

        <div className="flex flex-col justify-end">
          <div className="rounded-sm border border-border bg-card p-6">
            <span className="label-mono">Next step</span>
            <p className="mt-3 text-[15px] leading-snug">
              {!profile
                ? 'Add the details brokers search for, so a scan knows what to look for.'
                : action.length > 0
                  ? `${action.length} ${action.length === 1 ? 'listing needs' : 'listings need'} work before they can be removed.`
                  : 'Your profile is set. Run a scan to find new listings.'}
            </p>
            <Link
              to={!profile ? '/profile' : action.length > 0 ? '/removals' : '/scan'}
              className="mt-5 inline-flex w-full items-center justify-between gap-2 rounded-sm bg-primary px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity duration-300 hover:opacity-90"
            >
              {!profile ? 'Build your profile' : action.length > 0 ? 'Review queue' : 'Run a scan'}
              <ScanLine className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 divide-border border-y border-border md:grid-cols-4 md:divide-x">
        <StatCard label="Exposures found" value={loading ? '—' : active.length} note="Confirmed by you" />
        <StatCard label="Requests sent" value={loading ? '—' : requested.length} note="Awaiting or answered" />
        <StatCard label="Confirmed removed" value={loading ? '—' : removed.length} tone="signal" note="Verified by re-check" />
        <StatCard label="Action needed" value={loading ? '—' : action.length} tone="alert" note="Waiting on you" />
      </section>

      <section className="grid gap-10 py-12 md:grid-cols-[1.6fr_1fr] md:gap-16">
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[22px] tracking-tight">Priority queue</h2>
            <Link
              to="/removals"
              className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              All removals
              <ArrowUpRight className="h-3 w-3 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {loading ? (
            <div className="mt-5 space-y-4 border-t border-border pt-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-sm bg-muted" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="mt-5 border-t border-border pt-8">
              <p className="text-[15px] text-muted-foreground">
                No listings tracked yet. Run a scan to find where you appear.
              </p>
              <Link
                to="/scan"
                className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Run a scan
              </Link>
            </div>
          ) : (
            <ul className="mt-5 border-t border-border">
              {queue.map((item) => {
                const due = daysUntil(item.follow_up_date);
                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 border-b border-border py-4 md:grid-cols-[1.1fr_1.3fr_auto] md:items-center"
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
                          ? 'Not yet requested'
                          : due < 0
                            ? `Overdue ${Math.abs(due)}d`
                            : `Due ${formatDay(item.follow_up_date)}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="space-y-10">
          <div>
            <h2 className="font-display text-[22px] tracking-tight">Exposure profile</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              What brokers are searched for. The more you add, the fewer listings slip past.
            </p>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-display text-[28px] leading-none tracking-tight">{pct}%</span>
              <span className="label-mono">complete</span>
            </div>
            <div className="mt-3 h-px w-full bg-border">
              <div className="h-px bg-foreground transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <ul className="mt-5 space-y-2">
              {profileChecklist(profile).map((item) => (
                <li key={item.label} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.done ? 'bg-signal' : 'border border-muted-foreground/50'
                    }`}
                  />
                  <span className={item.done ? '' : 'text-muted-foreground'}>{item.label}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/profile"
              className="mt-5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Edit profile
            </Link>
          </div>

          <div className="border-t border-border pt-8">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
              <p className="text-[13px] leading-relaxed">
                Removals are not permanent. Brokers re-list from public records every 60 to 90 days,
                which is why every cleared listing is scheduled for a re-check.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}