import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const STATUTES = {
  CA: {
    law: 'the Personal Information Protection and Electronic Documents Act (PIPEDA)',
    body: `Under Principle 4.5 of PIPEDA and section 8(8) of the Act, you are required to delete personal information that is no longer required for the purpose for which it was collected. This information was collected without my consent and I withdraw any consent I may be deemed to have given.`,
    deadline: '30 days',
    regulator: 'the Office of the Privacy Commissioner of Canada'
  },
  US: {
    law: 'the California Consumer Privacy Act as amended by the CPRA',
    body: `Under Cal. Civ. Code § 1798.105 I request deletion of my personal information, and under § 1798.120 I request that you cease selling or sharing it. This is a verifiable consumer request made by the data subject.`,
    deadline: '45 days',
    regulator: 'the California Attorney General'
  },
  EU: {
    law: 'the General Data Protection Regulation',
    body: `Under Article 17 GDPR I request erasure of my personal data without undue delay, and under Article 21 I object to any processing for direct marketing or profiling. You have no overriding legitimate ground to publish this data.`,
    deadline: '30 days',
    regulator: 'my national supervisory authority'
  }
};

function statuteFor(country) {
  const key = String(country || '').trim().toUpperCase();
  if (['CA', 'CANADA'].includes(key)) return STATUTES.CA;
  if (['US', 'USA', 'UNITED STATES'].includes(key)) return STATUTES.US;
  if (['GB', 'UK', 'EU', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT'].includes(key)) return STATUTES.EU;
  return STATUTES.CA;
}

function list(values, fallback) {
  return values && values.length ? values.join(', ') : fallback;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const listingId = body.listing_id;
    if (!listingId) return Response.json({ error: 'listing_id is required' }, { status: 400 });

    const listing = await base44.entities.Listing.get(listingId).catch((e) =>
      e.status === 404 ? null : Promise.reject(e)
    );
    if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });

    const profilePage = await base44.entities.ExposureProfile.filter({}, { limit: 1 });
    const profile = profilePage.items && profilePage.items[0];
    if (!profile) return Response.json({ error: 'Exposure profile is required' }, { status: 400 });

    const brokerPage = await base44.entities.Broker.filter(
      { domain: listing.broker_domain },
      { limit: 1 }
    );
    const broker = (brokerPage.items && brokerPage.items[0]) || null;
    const statute = statuteFor(profile.country);
    const today = new Date().toISOString().slice(0, 10);

    const subject = `Formal request for deletion of personal data — ${profile.full_name}`;

    const text = `${today}

${broker ? broker.name : listing.broker_name}
Data Protection / Privacy Officer

RE: Formal request for deletion of my personal information

To whom it concerns,

I am the data subject named below. I have found that your service publishes and distributes my personal information at the following address:

${listing.listing_url || '(listing page on your site)'}

My identifying details, for the purpose of locating the record:
- Full name: ${profile.full_name}
- Other names used: ${list(profile.aliases, 'none')}
- Addresses: ${list(profile.addresses, 'on file with you')}
- Telephone: ${list(profile.phones, 'on file with you')}
- Email: ${list(profile.emails, user.email)}

I do not consent to the collection, publication, sale, or sharing of this information by your company, and I never provided it to you directly.

${statute.body}

I therefore require that you:
1. Delete my personal information from your website, databases, and any product or feed you license to third parties.
2. Suppress the record so that it is not republished from source data at a later date.
3. Confirm in writing that this has been done.

${statute.law.charAt(0).toUpperCase()}${statute.law.slice(1)} requires a response within ${statute.deadline} of this request. If I do not receive confirmation within that period, or if the listing reappears, I will file a complaint with ${statute.regulator} and consider any other remedy available to me.

Please direct your written confirmation to ${list(profile.emails, user.email)}.

Sincerely,

${profile.full_name}
${list(profile.addresses, '')}
${list(profile.emails, user.email)}
`;

    return Response.json({
      subject,
      body: text,
      opt_out_url: broker ? broker.opt_out_url : '',
      removal_email: broker ? broker.removal_email : '',
      requires_id: broker ? Boolean(broker.requires_id) : false
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}