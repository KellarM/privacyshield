import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          broker_name: { type: 'string' },
          broker_domain: { type: 'string' },
          listing_url: { type: 'string' },
          exposed_data: { type: 'string' },
          evidence: { type: 'string' },
          confidence: { type: 'string', enum: ['likely', 'possible'] }
        },
        required: ['broker_name', 'broker_domain', 'listing_url', 'exposed_data', 'confidence']
      }
    }
  },
  required: ['summary', 'candidates']
};

function cleanDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const focus = body.broker_domain ? cleanDomain(body.broker_domain) : null;

    const profilePage = await base44.entities.ExposureProfile.filter({}, { limit: 1 });
    const profile = profilePage.items && profilePage.items[0];
    if (!profile) {
      return Response.json(
        { error: 'Add your exposure profile before running a scan.' },
        { status: 400 }
      );
    }

    const brokerPage = await base44.entities.Broker.filter({ active: true }, { limit: 60 });
    const brokers = (brokerPage.items || []).filter((b) => b.domain);
    if (brokers.length === 0) {
      return Response.json({ error: 'The broker registry is empty.' }, { status: 400 });
    }

    const targets = focus
      ? brokers.filter((b) => cleanDomain(b.domain) === focus)
      : brokers.slice(0, 14);
    if (targets.length === 0) {
      return Response.json({ error: 'Unknown broker.' }, { status: 400 });
    }

    const allowed = new Set(targets.map((b) => cleanDomain(b.domain)));
    const who = [
      `Legal name: ${profile.full_name}`,
      profile.aliases && profile.aliases.length
        ? `Other names used: ${profile.aliases.join(', ')}`
        : '',
      profile.birth_year ? `Year of birth: ${profile.birth_year}` : '',
      profile.addresses && profile.addresses.length
        ? `Addresses (current and past): ${profile.addresses.join(' | ')}`
        : '',
      profile.phones && profile.phones.length ? `Phone numbers: ${profile.phones.join(', ')}` : '',
      profile.emails && profile.emails.length ? `Email addresses: ${profile.emails.join(', ')}` : '',
      profile.country ? `Country: ${profile.country}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const brokerLines = targets.map((b) => `- ${b.name} (${cleanDomain(b.domain)})`).join('\n');

    const prompt = `You are auditing public exposure of one private individual's personal information. Search the web for pages on the specific data-broker sites listed below that publish this person's details.

PERSON BEING AUDITED
${who}

SITES TO CHECK (check only these)
${brokerLines}

RULES
- Only report a page if a search result or page content indicates it is a record for THIS person (name plus at least one matching detail such as a phone number, address, or birth year).
- Only return results whose site is one of the listed domains. Never invent a domain.
- Use the real URL you found. Never construct or guess a profile URL.
- Never repeat the person's sensitive details back in the evidence field; describe what kind of detail is published instead (for example "shows a street address and two phone numbers").
- If you find nothing for a site, simply omit it. Returning zero candidates is a valid and expected answer.
- Maximum 25 candidates.

Return a one-sentence summary of what you found, and the candidate listings.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: SCHEMA
    });

    const raw = typeof result === 'string' ? JSON.parse(result) : result;
    const seen = new Set();
    const candidates = (raw.candidates || [])
      .filter((c) => c && c.broker_domain && c.listing_url)
      .filter((c) => allowed.has(cleanDomain(c.broker_domain)))
      .filter((c) => {
        const key = `${cleanDomain(c.broker_domain)}|${c.listing_url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 25)
      .map((c) => ({
        broker_name: String(c.broker_name || cleanDomain(c.broker_domain)).slice(0, 120),
        broker_domain: cleanDomain(c.broker_domain),
        listing_url: String(c.listing_url).slice(0, 500),
        exposed_data: String(c.exposed_data || '').slice(0, 300),
        evidence: String(c.evidence || '').slice(0, 300),
        confidence: c.confidence === 'likely' ? 'likely' : 'possible'
      }));

    return Response.json({
      summary: String(raw.summary || '').slice(0, 500),
      candidates,
      sites_checked: targets.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}