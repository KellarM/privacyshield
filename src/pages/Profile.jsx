import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import TagInput from '@/components/TagInput';
import { useToast } from '@/components/ui/use-toast';
import { completeness } from '@/lib/privacy';

const EMPTY = {
  full_name: '',
  aliases: [],
  birth_year: '',
  addresses: [],
  phones: [],
  emails: [],
  country: 'CA',
  notes: '',
};

export default function Profile() {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [page, me] = await Promise.all([
        base44.entities.ExposureProfile.filter({}, { limit: 1 }),
        base44.auth.me(),
      ]);
      const existing = page.items && page.items[0];
      if (existing) {
        setProfileId(existing.id);
        setForm({ ...EMPTY, ...existing });
      } else {
        setForm({ ...EMPTY, full_name: me?.full_name || '' });
      }
      setLoading(false);
    };
    load();
  }, []);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.full_name.trim()) {
      toast({ title: 'A legal name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      aliases: form.aliases,
      birth_year: form.birth_year,
      addresses: form.addresses,
      phones: form.phones,
      emails: form.emails,
      country: form.country,
      notes: form.notes,
    };
    try {
      if (profileId) {
        await base44.entities.ExposureProfile.update(profileId, payload);
      } else {
        const created = await base44.entities.ExposureProfile.create(payload);
        setProfileId(created.id);
      }
      toast({ title: 'Profile saved' });
    } catch (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8">
        <div className="h-6 w-40 animate-pulse rounded-sm bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 md:px-8 md:py-16">
      <div className="flex items-baseline justify-between border-b border-border pb-6">
        <div>
          <span className="label-mono">Exposure profile</span>
          <h1 className="mt-3 font-display text-[34px] leading-none tracking-[-0.02em]">
            What brokers can see
          </h1>
        </div>
        <span className="font-display text-[28px] leading-none tracking-tight">{completeness(form)}%</span>
      </div>

      <p className="mt-6 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        This is the identity a scan searches for and the identity a removal request is filed
        under. It stays private to your account.
      </p>

      <div className="mt-10 space-y-8">
        <div>
          <Label className="label-mono">Legal name</Label>
          <Input
            value={form.full_name}
            onChange={(e) => set('full_name')(e.target.value)}
            placeholder="As it appears on public records"
            className="mt-2 rounded-sm"
          />
        </div>

        <div>
          <Label className="label-mono">Other names used</Label>
          <div className="mt-2">
            <TagInput
              values={form.aliases}
              onChange={set('aliases')}
              placeholder="Maiden name, initials, spelling variants"
            />
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <Label className="label-mono">Year of birth</Label>
            <Input
              value={form.birth_year}
              onChange={(e) => set('birth_year')(e.target.value)}
              placeholder="1984"
              className="mt-2 rounded-sm"
            />
          </div>
          <div>
            <Label className="label-mono">Jurisdiction</Label>
            <select
              value={form.country}
              onChange={(e) => set('country')(e.target.value)}
              className="mt-2 h-9 w-full rounded-sm border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="CA">Canada — PIPEDA</option>
              <option value="US">United States — CCPA / CPRA</option>
              <option value="EU">EU / UK — GDPR</option>
            </select>
          </div>
        </div>

        <div>
          <Label className="label-mono">Addresses</Label>
          <div className="mt-2">
            <TagInput
              values={form.addresses}
              onChange={set('addresses')}
              placeholder="Current and past addresses"
            />
          </div>
        </div>

        <div>
          <Label className="label-mono">Phone numbers</Label>
          <div className="mt-2">
            <TagInput values={form.phones} onChange={set('phones')} placeholder="Include old numbers" />
          </div>
        </div>

        <div>
          <Label className="label-mono">Email addresses</Label>
          <div className="mt-2">
            <TagInput
              values={form.emails}
              onChange={set('emails')}
              type="email"
              placeholder="Every address you have used"
            />
          </div>
        </div>

        <div>
          <Label className="label-mono">Notes</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
            placeholder="Anything that helps tell your records apart, such as a middle initial"
            className="mt-2 rounded-sm"
            rows={3}
          />
        </div>
      </div>

      <div className="mt-10 flex items-center gap-4 border-t border-border pt-6">
        <Button onClick={save} disabled={saving} className="rounded-sm font-mono text-[10px] uppercase tracking-[0.16em]">
          {saving ? 'Saving' : 'Save profile'}
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Used only by your own scans
        </span>
      </div>
    </div>
  );
}