import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Copy, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import StatusPill from '@/components/StatusPill';
import { useToast } from '@/components/ui/use-toast';
import { formatDay, nextFollowUp, STATUS_LABELS } from '@/lib/privacy';

export default function ListingDetail({ listing, onClose, onChanged }) {
  const { toast } = useToast();
  const [record, setRecord] = useState(listing);
  const [letter, setLetter] = useState(listing.removal_request || '');
  const [subject, setSubject] = useState(listing.request_subject || '');
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [broker, setBroker] = useState(null);

  useEffect(() => {
    setRecord(listing);
    setLetter(listing.removal_request || '');
    setSubject(listing.request_subject || '');
  }, [listing]);

  useEffect(() => {
    if (!listing.broker_domain) return;
    base44.entities.Broker.filter({ domain: listing.broker_domain }, { limit: 1 }).then((page) => {
      setBroker((page.items && page.items[0]) || null);
    });
  }, [listing.broker_domain]);

  const patch = async (data) => {
    const saved = await base44.entities.Listing.update(listing.id, data);
    const updated = saved && saved.id ? saved : { ...record, ...data };
    setRecord(updated);
    onChanged(updated);
  };

  const draft = async () => {
    setDrafting(true);
    try {
      const response = await base44.functions.invoke('draftRemovalRequest', {
        listing_id: listing.id,
      });
      if (response.data?.error) throw new Error(response.data.error);
      setLetter(response.data.body);
      setSubject(response.data.subject);
      await patch({ removal_request: response.data.body, request_subject: response.data.subject });
    } catch (error) {
      toast({ title: 'Could not draft the request', description: error.message, variant: 'destructive' });
    }
    setDrafting(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailto = broker?.removal_email
    ? `mailto:${broker.removal_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(letter)}`
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-sm sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="font-display text-[22px] tracking-tight">
              {record.broker_name}
            </DialogTitle>
            <StatusPill status={record.status} />
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          <div className="space-y-1.5">
            <p className="label-mono">Exposed</p>
            <p className="text-[14px] leading-snug">{record.exposed_data || 'Not recorded'}</p>
            {record.listing_url && (
              <a
                href={record.listing_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                View listing <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 border-y border-border py-4">
            <div>
              <p className="label-mono">Requested</p>
              <p className="mt-1 text-[13px]">{formatDay(record.requested_date)}</p>
            </div>
            <div>
              <p className="label-mono">Follow up</p>
              <p className="mt-1 text-[13px]">{formatDay(record.follow_up_date)}</p>
            </div>
            <div>
              <p className="label-mono">Confirmed gone</p>
              <p className="mt-1 text-[13px]">{formatDay(record.removed_date)}</p>
            </div>
          </div>

          <div>
            <p className="label-mono">Status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant={record.status === 'requested' ? 'default' : 'outline'}
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]"
                onClick={() =>
                  patch({
                    status: 'requested',
                    requested_date: new Date().toISOString(),
                    follow_up_date: nextFollowUp(14),
                  })
                }
              >
                Request sent
              </Button>
              <Button
                variant={record.status === 'removed' ? 'default' : 'outline'}
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]"
                onClick={() =>
                  patch({
                    status: 'removed',
                    removed_date: new Date().toISOString(),
                    follow_up_date: nextFollowUp(90),
                  })
                }
              >
                Confirmed removed
              </Button>
              <Button
                variant={record.status === 'reappeared' ? 'default' : 'outline'}
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]"
                onClick={() => patch({ status: 'reappeared', follow_up_date: new Date().toISOString() })}
              >
                Re-listed
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                onClick={() => patch({ status: 'dismissed' })}
              >
                Dismiss
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Currently {STATUS_LABELS[record.status] || record.status}. A confirmed removal is
              scheduled for re-check in 90 days.
            </p>
          </div>

          <div className="border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="label-mono">Removal request</p>
              <div className="flex gap-2">
                {broker?.opt_out_url && (
                  <a href={broker.opt_out_url} target="_blank" rel="noreferrer noopener">
                    <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]">
                      Opt-out page
                    </Button>
                  </a>
                )}
                <Button
                  size="sm"
                  onClick={draft}
                  disabled={drafting}
                  className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : letter ? 'Redraft' : 'Draft request'}
                </Button>
              </div>
            </div>

            {letter ? (
              <div className="mt-4">
                <Textarea
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                  rows={12}
                  className="rounded-sm font-mono text-[11px] leading-relaxed"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copy}
                    className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]"
                  >
                    {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy letter'}
                  </Button>
                  {mailto && (
                    <a href={mailto}>
                      <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]">
                        Open in email
                      </Button>
                    </a>
                  )}
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {broker?.requires_id ? 'Broker asks for ID — send from your own inbox' : 'Send from your own inbox'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Draft a deletion request citing your jurisdiction, addressed to this broker's privacy
                officer, ready to paste into their form or your email client.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}