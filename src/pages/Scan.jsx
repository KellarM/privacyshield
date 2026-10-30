import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ScanLine, ExternalLink, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function Scan() {
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [tracked, setTracked] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [savedKeys, setSavedKeys] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [profilePage, listingPage] = await Promise.all([
        base44.entities.ExposureProfile.filter({}, { limit: 1 }),
        base44.entities.Listing.filter({}, { limit: 200 }),
      ]);
      setProfile((profilePage.items && profilePage.items[0]) || null);
      setTracked(listingPage.items || []);
    };
    load();
  }, []);

  const runScan = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const response = await base44.functions.invoke('scanExposures', {});
      if (response.data?.error) setError(response.data.error);
      else setResult(response.data);
    } catch (err) {
      setError(err.message || 'The scan could not complete.');
    }
    setRunning(false);
  };

  const track = async (candidate) => {
    const created = await base44.entities.Listing.create({
      broker_name: candidate.broker_name,
      broker_domain: candidate.broker_domain,
      listing_url: candidate.listing_url,
      exposed_data: candidate.exposed_data,
      confidence: candidate.confidence,
      status: 'found',
    });
    setTracked((prev) => [...prev, created]);
    setSavedKeys((prev) => [...prev, candidate.listing_url]);
    toast({ title: `${candidate.broker_name} added to your removals` });
  };

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8">
        <span className="label-mono">Scan</span>
        <h1 className="mt-3 font-display text-[34px] leading-none tracking-[-0.02em]">
          A scan needs something to look for
        </h1>
        <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
          Add your name, addresses, phone numbers and email addresses first. Without them a scan
          has no way to tell your records from someone else's.
        </p>
        <Link to="/profile">
          <Button className="mt-6 rounded-sm font-mono text-[10px] uppercase tracking-[0.16em]">
            Build your profile
          </Button>
        </Link>
      </div>
    );
  }

  const knownUrls = new Set([
    ...tracked.map((l) => l.listing_url).filter(Boolean),
    ...savedKeys,
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 md:px-8 md:py-16">
      <span className="label-mono">Scan</span>
      <div className="mt-3 flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-[38px] leading-[1.05] tracking-[-0.02em]">
            Look for yourself
          </h1>
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
            Each scan checks the highest-risk brokers in the registry against your profile. Results
            are candidates until you confirm the record is yours.
          </p>
        </div>
        <Button
          onClick={runScan}
          disabled={running}
          className="shrink-0 rounded-sm font-mono text-[10px] uppercase tracking-[0.16em]"
        >
          {running ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Scanning
            </>
          ) : (
            <>
              <ScanLine className="mr-2 h-3.5 w-3.5" /> Run scan
            </>
          )}
        </Button>
      </div>

      {error && (
        <p className="mt-6 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          {error}
        </p>
      )}

      {running && (
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Searching public records across the broker list — this takes up to a minute
        </p>
      )}

      {result && (
        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[22px] tracking-tight">
              {result.candidates.length === 0
                ? 'No public listings found this pass'
                : `${result.candidates.length} possible ${result.candidates.length === 1 ? 'listing' : 'listings'}`}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {result.sites_checked} sites checked
            </span>
          </div>

          {result.summary && (
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {result.summary}
            </p>
          )}

          {result.candidates.length === 0 ? (
            <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Absence of results is not proof of absence: many brokers block search engines and
              only reveal records when searched directly. Work through the registry to check those
              by hand.
            </p>
          ) : (
            <ul className="mt-6 border-t border-border">
              {result.candidates.map((candidate) => {
                const saved = knownUrls.has(candidate.listing_url);
                return (
                  <li
                    key={`${candidate.broker_domain}-${candidate.listing_url}`}
                    className="grid gap-3 border-b border-border py-5 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-[15px] tracking-tight">{candidate.broker_name}</p>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {candidate.confidence}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {candidate.broker_domain}
                      </p>
                      <p className="mt-2 text-[13px] leading-snug">{candidate.exposed_data}</p>
                      {candidate.evidence && (
                        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                          {candidate.evidence}
                        </p>
                      )}
                      <a
                        href={candidate.listing_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Check the page <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {saved ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
                        <Check className="h-3.5 w-3.5" /> Tracked
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => track(candidate)}
                        className="rounded-sm font-mono text-[10px] uppercase tracking-[0.16em]"
                      >
                        This is me
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {Array.isArray(result.unverified) && result.unverified.length > 0 && (
            <div className="mt-10 border-t border-border pt-6">
              <h3 className="font-display text-[17px] tracking-tight">
                {result.unverified.length} {result.unverified.length === 1 ? 'site' : 'sites'} block automated checks
              </h3>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                These refuse a server-side request, so a machine cannot honestly claim you are not
                listed there. Open each one, look for your name and city, and add anything you find
                to your removals. It takes a few seconds per site.
              </p>
              <ul className="mt-5 border-t border-border">
                {result.unverified.map((site) => (
                  <li
                    key={site.broker_domain}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-[14px] tracking-tight">{site.broker_name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {site.reason}
                      </p>
                    </div>
                    {site.search_url ? (
                      <a
                        href={site.search_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary underline underline-offset-4"
                      >
                        Check by hand
                      </a>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        No link
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result && !running && (
        <div className="mt-10 rounded-sm border border-border bg-card p-6">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Confirming a candidate adds it to your removals, where a statutory deletion request is
            drafted from your profile and every follow-up is dated.
          </p>
        </div>
      )}
    </div>
  );
}