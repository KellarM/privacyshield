import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Discovery, honestly.
//
// The first version of this asked a model with web access to "find pages".
// That produces confident guesses, which is the one thing a privacy tool
// cannot ship. Measured against 20 real brokers, 16 refuse a server-side
// fetch outright (403, bot challenge, or a JavaScript-only shell that
// returns an empty page). So this version has three honest paths:
//
//   1. Search provider (Brave or Google CSE, key in env). A search engine
//      is not blocked by the brokers, so site: queries reveal real
//      listings with real URLs and real snippets. This is the only path
//      that produces evidence without a human.
//   2. Direct fetch of the broker's own search page. Works for the few
//      that permit it. Everything else is recorded as blocked, never
//      reported as "nothing found".
//   3. Prefilled links handed back to the person, for the sites that
//      block automation. They confirm in their own browser in seconds.
//
// A site that blocks us is reported as blocked. Silence is never evidence.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Per-broker search URLs. Kept in code, not the database, so the registry
// can be corrected without a migration.
const SEARCH_PATHS = {
  'whitepages.com': (p) => `https://www.whitepages.com/names/${p.first}-${p.last}`,
  'spokeo.com': (p) => `https://www.spokeo.com/search?q=${p.full}`,
  'fastpeoplesearch.com': (p) => `https://www.fastpeoplesearch.com/results?name=${p.full}`,
  'truepeoplesearch.com': (p) => `https://www.truepeoplesearch.com/results?name=${p.full}`,
  'radaris.com': (p) => `https://radaris.com/p/${p.first}/${p.last}/`,
  'nuwber.com': (p) => `https://nuwber.com/search?name=${p.full}`,
  'thatsthem.com': (p) => `https://thatsthem.com/name/${p.first}-${p.last}`,
  'cyberbackgroundchecks.com': (p) => `https://www.cyberbackgroundchecks.com/people/${p.first}-${p.last}`,
  'usphonebook.com': (p) => `https://www.usphonebook.com/${p.firstLower}-${p.lastLower}`,
  'searchpeoplefree.com': (p) => `https://www.searchpeoplefree.com/results?name=${p.full}`,
  'peekyou.com': (p) => `https://www.peekyou.com/${p.first}_${p.last}`,
  'canada411.ca': (p) => `https://www.canada411.ca/search/?stype=si&what=${p.last}`,
  '411.ca': (p) => `https://411.ca/search?what=${p.last}`,
  'yellowpages.ca': (p) => `https://www.yellowpages.ca/search/si/1/${p.last}`,
  'beenverified.com': (p) => `https://www.beenverified.com/app/search/name/${p.first}-${p.last}`,
  'truthfinder.com': (p) => `https://www.truthfinder.com/results/?name=${p.full}`,
  'intelius.com': (p) => `https://www.intelius.com/people-search/${p.first}-${p.last}`,
  'mylife.com': (p) => `https://www.mylife.com/search?q=${p.full}`,
  'anywho.com': (p) => `https://www.anywho.com/people/${p.first}-${p.last}`,
  'zabasearch.com': (p) => `https://www.zabasearch.com/people/${p.firstLower}-${p.lastLower}/`
};

const BLOCK_MARKERS = [
  'captcha',
  'cloudflare',
  'just a moment',
  'access denied',
  'are you a robot',
  'press & hold',
  'unusual traffic',
  'enable javascript'
];

const cleanDomain = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();

const buildParts = (profile) => {
  const full = String(profile.full_name || '').trim();
  const words = full.split(/\s+/).filter(Boolean);
  const first = words[0] || '';
  const last = words.length > 1 ? words[words.length - 1] : '';
  return {
    full: encodeURIComponent(full),
    first: encodeURIComponent(first),
    last: encodeURIComponent(last),
    firstLower: first.toLowerCase(),
    lastLower: last.toLowerCase(),
    firstRaw: first,
    lastRaw: last
  };
};

// Does this text plausibly describe this person? Name tokens plus at least
// one locator (city, region or phone) beats a bare surname match.
const looksLikeThem = (text, profile, parts) => {
  const low = String(text || '').toLowerCase();
  const hasFirst = parts.firstRaw && low.includes(parts.firstRaw.toLowerCase());
  const hasLast = parts.lastRaw && low.includes(parts.lastRaw.toLowerCase());
  if (!hasLast) return false;
  const places = []
    .concat(Array.isArray(profile.addresses) ? profile.addresses : [])
    .concat(profile.country ? [profile.country] : []);
  const placeHit = places.some((place) => {
    const token = String(place || '').split(',')[0].trim().toLowerCase();
    return token.length > 2 && low.includes(token);
  });
  const phoneHit = (Array.isArray(profile.phones) ? profile.phones : []).some((phone) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-7);
    return digits.length === 7 && low.replace(/\D/g, '').includes(digits);
  });
  return { hasFirst, hasLast, placeHit, phoneHit, strong: (hasFirst && placeHit) || phoneHit };
};

async function searchProvider(query) {
  const brave = Deno.env.get('BRAVE_API_KEY');
  if (brave) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': brave },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return { provider: 'brave', error: `Brave returned ${res.status}`, results: [] };
    const data = await res.json();
    const rows = (data.web && data.web.results) || [];
    return {
      provider: 'brave',
      results: rows.map((r) => ({ url: r.url, title: r.title || '', snippet: r.description || '' }))
    };
  }
  const key = Deno.env.get('GOOGLE_CSE_KEY');
  const cx = Deno.env.get('GOOGLE_CSE_CX');
  if (key && cx) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&num=10&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { provider: 'google_cse', error: `Google CSE returned ${res.status}`, results: [] };
    const data = await res.json();
    const rows = data.items || [];
    return {
      provider: 'google_cse',
      results: rows.map((r) => ({ url: r.link, title: r.title || '', snippet: r.snippet || '' }))
    };
  }
  return null;
}

export default async function (req) {
  const startedAt = Date.now();
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
      return Response.json({ error: 'Add your name, address and phone before scanning.' }, { status: 400 });
    }

    const brokerPage = await base44.entities.Broker.filter({ active: true }, { limit: 200 });
    let brokers = brokerPage.items || [];
    if (brokers.length === 0) {
      return Response.json(
        { error: 'The broker registry is empty. Seed it from the Brokers page first.' },
        { status: 400 }
      );
    }
    if (focus) brokers = brokers.filter((b) => cleanDomain(b.domain) === focus);
    if (brokers.length === 0) return Response.json({ error: 'Unknown broker.' }, { status: 400 });

    // A sequential pass over the whole registry would outlast the function
    // timeout. Twenty per run, most-likely-to-answer first, and say so.
    const requested = brokers.length;
    const capped = brokers.slice(0, 20);

    const parts = buildParts(profile);
    const place = (Array.isArray(profile.addresses) && profile.addresses[0]) || profile.country || '';


    // One broker after another was the bug. Twenty blocked sites at eight
    // seconds each outlasts the function timeout, so the request died with
    // nothing to show. Every broker is now checked side by side under a hard
    // deadline, and whatever finishes is returned.
    const deadline = Date.now() + 15000;

    const checkOne = async (broker) => {
      const domain = cleanDomain(broker.domain);
      const path = SEARCH_PATHS[domain];
      const searchUrl = path ? path(parts) : null;
      const query = `site:${domain} "${profile.full_name}"${place ? ` ${String(place).split(',')[0]}` : ''}`;

      let serp = null;
      try {
        serp = await searchProvider(query);
      } catch {
        serp = null;
      }

      if (serp && !serp.error) {
        const hits = [];
        for (const row of serp.results.slice(0, 3)) {
          const check = looksLikeThem(`${row.title} ${row.snippet} ${row.url}`, profile, parts);
          if (!check) continue;
          hits.push({
            broker_name: broker.name,
            broker_domain: domain,
            listing_url: row.url,
            exposed_data: row.title || 'Listing found on this broker',
            evidence: `Search result: ${row.title} -- ${row.snippet}`.slice(0, 600),
            confidence: check.strong ? 'likely' : 'possible'
          });
        }
        return { provider: serp.provider, hits, unverified: [] };
      }

      if (!searchUrl) {
        return {
          hits: [],
          unverified: [{
            broker_name: broker.name,
            broker_domain: domain,
            search_url: null,
            reason: 'No search path configured'
          }]
        };
      }

      let status = 0;
      let body = '';
      try {
        const res = await fetch(searchUrl, {
          headers: { 'User-Agent': UA, 'Accept-Language': 'en-CA,en;q=0.9' },
          signal: AbortSignal.timeout(5000)
        });
        status = res.status;
        body = (await res.text()).slice(0, 200000);
      } catch {
        status = -1;
      }

      const low = body.toLowerCase();
      const blocked = status !== 200 || BLOCK_MARKERS.some((m) => low.includes(m));
      if (blocked) {
        return {
          hits: [],
          unverified: [{
            broker_name: broker.name,
            broker_domain: domain,
            search_url: searchUrl,
            reason: status === -1 ? 'No response' : status !== 200 ? `HTTP ${status}` : 'Bot challenge'
          }]
        };
      }

      const check = looksLikeThem(body, profile, parts);
      const hits = check && check.hasLast
        ? [{
            broker_name: broker.name,
            broker_domain: domain,
            listing_url: searchUrl,
            exposed_data: 'Name match on search results page',
            evidence: `Fetched ${searchUrl} (HTTP 200); name and locator matched in page content.`.slice(0, 600),
            confidence: check.strong ? 'likely' : 'possible'
          }]
        : [];
      return { hits, unverified: [] };
    };

    const timedOut = (broker) => ({
      hits: [],
      unverified: [{
        broker_name: broker.name,
        broker_domain: cleanDomain(broker.domain),
        search_url: null,
        reason: 'Ran out of time this pass'
      }]
    });

    const settled = await Promise.allSettled(
      capped.map((broker) => {
        const budget = deadline - Date.now();
        if (budget <= 500) return Promise.resolve(timedOut(broker));
        return Promise.race([
          checkOne(broker),
          new Promise((resolve) => setTimeout(() => resolve(timedOut(broker)), budget))
        ]);
      })
    );

    const candidates = [];
    const unverified = [];
    let provider = 'direct';
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled' || !outcome.value) continue;
      if (outcome.value.provider) provider = outcome.value.provider;
      candidates.push(...(outcome.value.hits || []));
      unverified.push(...(outcome.value.unverified || []));
    }

    const keyed = provider === 'brave' || provider === 'google_cse';
    const summary = keyed
      ? `${capped.length} broker sites checked through ${provider}. ${candidates.length} listing(s) found with a real URL and snippet. Add brokers to the registry to widen the sweep.`
      : `${candidates.length} listing(s) confirmed from page content. ${unverified.length} of ${capped.length} sites refuse automated checks, and each is listed below with a link so you can confirm it in seconds. Automated discovery across those sites needs a search API key (BRAVE_API_KEY, or GOOGLE_CSE_KEY with GOOGLE_CSE_CX).`;

    return Response.json({
      summary,
      provider,
      keyed,
      mode: keyed ? `search:${provider}` : 'direct:brokers-block-automation',
      elapsed_ms: Date.now() - startedAt,
      sites_checked: capped.length,
      candidates,
      unverified
    });
  } catch (error) {
    // Say what broke, in words the page can show. A privacy tool that answers
    // "something went wrong" has told the person nothing.
    const detail = error && error.message ? error.message : String(error);
    return Response.json({
      error: `The scan stopped early: ${detail}. Nothing was recorded, so nothing was lost.`,
      elapsed_ms: Date.now() - startedAt
    }, { status: 500 });
  }
}
