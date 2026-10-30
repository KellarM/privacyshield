import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Discovery, honestly.
//
// History: v1 asked a model with web access to "find pages", which produces
// confident guesses. v2 fetched broker sites directly and discovered that 16
// of 20 refuse a server-side request. v3 adds what actually works: a search
// engine is not blocked by the brokers, so its index is asked first.
//
// Provider order:
//   1. Brave Search API   (BRAVE_API_KEY)      - licensed, fast, made for this
//   2. Google Custom Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX) - licensed
//   3. Bing web results    (no key)            - works from a server today,
//      but it is an unlicensed scrape: fine for a personal run, not something
//      to build a paid product on. Move to Brave before charging anyone.
//
// Queries are name-based, not per-broker, so three requests cover the whole
// registry. Results are attributed to a broker by domain. Whatever the index
// does not surface then gets one direct fetch attempt, and anything that
// refuses is handed back as a link the person can open themselves.
//
// Silence is never treated as evidence in either direction.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BLOCK_MARKERS = [
  'captcha',
  'unusual traffic',
  'are you a robot',
  'challenge-platform',
  'access denied',
  'verify you are human',
  'cf-browser-verification',
  'enable javascript and cookies'
];

// Brokers with no public person-search page. There is nothing to look up, so
// the action is a removal request, not a lookup. Sent back separately rather
// than shown as a dead "no search path" row.
const REMOVAL_ONLY = ['lexisnexis.com', 'pipl.com', 'acxiom.com', 'oracle.com', 'epsilon.com'];

const SEARCH_URLS = {
  'spokeo.com': (p) => `https://www.spokeo.com/search?q=${encodeURIComponent(p.fullName)}`,
  'whitepages.com': (p) => `https://www.whitepages.com/names/${p.first}-${p.last}`,
  'fastpeoplesearch.com': (p) => `https://www.fastpeoplesearch.com/results?name=${encodeURIComponent(p.fullName)}`,
  'truepeoplesearch.com': (p) => `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(p.fullName)}`,
  'radaris.com': (p) => `https://radaris.com/p/${p.first}/${p.last}/`,
  'nuwber.com': (p) => `https://nuwber.com/search?name=${encodeURIComponent(p.fullName)}`,
  'thatsthem.com': (p) => `https://thatsthem.com/name/${p.first}-${p.last}`,
  'cyberbackgroundchecks.com': (p) => `https://www.cyberbackgroundchecks.com/people/${p.first}-${p.last}`,
  'usphonebook.com': (p) => `https://www.usphonebook.com/${p.first}-${p.last}`,
  'searchpeoplefree.com': (p) => `https://www.searchpeoplefree.com/results?name=${encodeURIComponent(p.fullName)}`,
  'peekyou.com': (p) => `https://www.peekyou.com/${p.first}_${p.last}`,
  'canada411.ca': (p) => `https://www.canada411.ca/search/?stype=si&what=${encodeURIComponent(p.last)}`,
  '411.ca': (p) => `https://411.ca/search?what=${encodeURIComponent(p.last)}`,
  'yellowpages.ca': (p) => `https://www.yellowpages.ca/search/si/1/${encodeURIComponent(p.last)}`,
  'beenverified.com': (p) => `https://www.beenverified.com/app/search/name/${p.first}-${p.last}`,
  'truthfinder.com': (p) => `https://www.truthfinder.com/results/?name=${encodeURIComponent(p.fullName)}`,
  'intelius.com': (p) => `https://www.intelius.com/people-search/${p.first}-${p.last}/`,
  'mylife.com': (p) => `https://www.mylife.com/search?q=${encodeURIComponent(p.fullName)}`,
  'anywho.com': (p) => `https://www.anywho.com/people/${p.first}-${p.last}`,
  'zabasearch.com': (p) => `https://www.zabasearch.com/people/${p.first}-${p.last}/`,
  'peoplefinders.com': (p) => `https://www.peoplefinders.com/people/${p.first}-${p.last}`,
  'instantcheckmate.com': (p) => `https://www.instantcheckmate.com/people-search/?name=${encodeURIComponent(p.fullName)}`,
  'clustrmaps.com': (p) => `https://clustrmaps.com/person/${p.first}-${p.last}`,
  'infotracer.com': (p) => `https://infotracer.com/search/?name=${encodeURIComponent(p.fullName)}`,
  'peoplelooker.com': (p) => `https://www.peoplelooker.com/people/${p.first}-${p.last}`,
  'ownerly.com': (p) => `https://www.ownerly.com/people/${p.first}-${p.last}`
};

function cleanDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildParts(profile) {
  const full = String(profile.full_name || '').trim();
  const bits = full.split(/\s+/);
  return {
    fullName: full,
    first: bits[0] || '',
    last: bits.length > 1 ? bits[bits.length - 1] : '',
    city: (Array.isArray(profile.addresses) && profile.addresses[0]) || '',
    country: profile.country || ''
  };
}

// Does this search result plausibly describe the person we are looking for?
function matchesPerson(row, profile, parts) {
  const hay = `${row.title} ${row.snippet} ${row.url}`.toLowerCase();
  const hasFirst = parts.first ? hay.includes(parts.first.toLowerCase()) : false;
  const hasLast = parts.last ? hay.includes(parts.last.toLowerCase()) : false;
  const locators = [
    ...(Array.isArray(profile.addresses) ? profile.addresses : []),
    profile.birth_year ? String(profile.birth_year) : ''
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  const placeHit = locators.some((loc) => hay.includes(loc));
  const digits = (Array.isArray(profile.phones) ? profile.phones : [])
    .map((p) => String(p).replace(/\D/g, '').slice(-7))
    .filter((d) => d.length === 7);
  const phoneHit = digits.some((d) => hay.replace(/\D/g, '').includes(d));
  const emailHit = (Array.isArray(profile.emails) ? profile.emails : []).some((e) =>
    e ? hay.includes(String(e).toLowerCase()) : false
  );
  return {
    ok: hasLast && (hasFirst || emailHit),
    strong: placeHit || phoneHit || emailHit
  };
}

function decodeBing(href) {
  const m = String(href || '').match(/[?&]u=a1([^&]+)/);
  if (!m) return href;
  try {
    let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    b += '='.repeat((4 - (b.length % 4)) % 4);
    return atob(b);
  } catch {
    return href;
  }
}

async function fromBrave(query) {
  const key = Deno.env.get('BRAVE_API_KEY');
  if (!key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Brave returned ${res.status}`);
  const data = await res.json();
  const rows = (data.web && data.web.results) || [];
  return rows.map((r) => ({ url: r.url, title: r.title || '', snippet: r.description || '' }));
}

async function fromGoogleCse(query) {
  const key = Deno.env.get('GOOGLE_CSE_KEY');
  const cx = Deno.env.get('GOOGLE_CSE_CX');
  if (!key || !cx) return null;
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&num=10&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Google CSE returned ${res.status}`);
  const data = await res.json();
  const rows = data.items || [];
  return rows.map((r) => ({ url: r.link, title: r.title || '', snippet: r.snippet || '' }));
}

async function fromBing(query, first = 1) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-CA,en;q=0.9' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Bing returned ${res.status}`);
  const body = await res.text();
  const blocks = body.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];
  return blocks
    .map((blk) => {
      const link = blk.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/);
      const title = blk.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
      const snip = blk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      if (!link) return null;
      return {
        url: decodeBing(link[1].replace(/&amp;/g, '&')),
        title: stripTags(title ? title[1] : ''),
        snippet: stripTags(snip ? snip[1] : '')
      };
    })
    .filter(Boolean);
}

async function search(query, pages = 1) {
  const providers = [
    ['brave', fromBrave],
    ['google_cse', fromGoogleCse],
    ['bing', fromBing]
  ];
  for (const [name, fn] of providers) {
    try {
      const collected = [];
      for (let page = 0; page < pages; page++) {
        // Brave and Google return their batch in one call; only Bing pages.
        const rows = await (name === 'bing' ? fn(query, page * 10 + 1) : fn(query));
        if (!rows) break;
        collected.push(...rows);
        if (name !== 'bing' || rows.length === 0) break;
      }
      if (collected.length || name === 'bing') return { provider: name, results: collected };
    } catch (err) {
      if (name === 'bing') return { provider: 'bing', results: [], error: err.message };
    }
  }
  return { provider: 'none', results: [] };
}

export default async function (req) {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const focus = body.broker_domain ? cleanDomain(body.broker_domain) : null;

    const profilePage = await base44.entities.ExposureProfile.filter({}, { limit: 1 });
    const profile = profilePage.items && profilePage.items[0];
    if (!profile) {
      return Response.json(
        { error: 'Add your name, an address and a phone number to your exposure profile first.' },
        { status: 400 }
      );
    }

    const brokerPage = await base44.entities.Broker.filter({ active: true }, { limit: 200 });
    let brokers = brokerPage.items || [];
    if (focus) brokers = brokers.filter((b) => cleanDomain(b.domain) === focus);
    if (brokers.length === 0) {
      return Response.json(
        { error: 'The broker registry is empty. Reload the app once so the registry syncs.' },
        { status: 400 }
      );
    }

    const parts = buildParts(profile);
    const removalOnly = brokers.filter((b) => REMOVAL_ONLY.includes(cleanDomain(b.domain)));
    const searchable = brokers.filter((b) => !REMOVAL_ONLY.includes(cleanDomain(b.domain)));
    const capped = searchable.slice(0, 20);

    // ---- Path 1: ask a search engine. Three queries cover the whole registry.
    const plan = [{ query: `"${parts.fullName}"`, pages: 3 }];
    if (profile.phones && profile.phones[0]) {
      plan.push({ query: `"${parts.fullName}" "${profile.phones[0]}"`, pages: 1 });
    }
    if (profile.emails && profile.emails[0]) {
      plan.push({ query: `"${profile.emails[0]}"`, pages: 1 });
    }
    const queries = plan.map((p) => p.query);

    const byDomain = new Map(capped.map((b) => [cleanDomain(b.domain), b]));
    const candidates = [];
    const seen = new Set();
    let provider = 'none';
    let searchError = '';
    let searchCount = 0;

    const perBroker = new Map();
    const PER_BROKER_CAP = 8;

    for (const step of plan) {
      const out = await search(step.query, step.pages);
      if (out.provider !== 'none') provider = out.provider;
      if (out.error) searchError = out.error;
      searchCount += out.results.length;
      for (const row of out.results) {
        const domain = cleanDomain(row.url);
        const broker = byDomain.get(domain);
        if (!broker) continue;
        if (seen.has(row.url)) continue;
        if ((perBroker.get(domain) || 0) >= PER_BROKER_CAP) continue;
        const verdict = matchesPerson(row, profile, parts);
        if (!verdict.ok) continue;
        seen.add(row.url);
        perBroker.set(domain, (perBroker.get(domain) || 0) + 1);
        candidates.push({
          broker_name: broker.name,
          broker_domain: domain,
          listing_url: row.url,
          exposed_data: row.title || 'Listing found on this broker',
          evidence: `${row.title} :: ${row.snippet}`.slice(0, 600),
          confidence: verdict.strong ? 'likely' : 'possible'
        });
      }
    }

    // ---- Path 2: anything the index did not surface gets one direct attempt.
    // Those that refuse come back as a link, never as "not listed".
    const surfaced = new Set(candidates.map((c) => c.broker_domain));
    const unverified = [];
    const toFetch = capped.filter((b) => !surfaced.has(cleanDomain(b.domain)));

    const fetched = await Promise.allSettled(
      toFetch.map(async (broker) => {
        const domain = cleanDomain(broker.domain);
        const build = SEARCH_URLS[domain];
        if (!build) {
          return { kind: 'unverified', broker, domain, searchUrl: null, reason: 'No search path configured' };
        }
        const searchUrl = build(parts);
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
            kind: 'unverified',
            broker,
            domain,
            searchUrl,
            reason: status === -1 ? 'No response' : status !== 200 ? `HTTP ${status}` : 'Bot challenge'
          };
        }
        const verdict = matchesPerson(
          { url: searchUrl, title: '', snippet: body.slice(0, 4000) },
          profile,
          parts
        );
        if (verdict.ok) {
          return {
            kind: 'found',
            candidate: {
              broker_name: broker.name,
              broker_domain: domain,
              listing_url: searchUrl,
              exposed_data: 'Record appears on this broker',
              evidence: 'Name and a locator matched on the page the broker served.',
              confidence: verdict.strong ? 'likely' : 'possible'
            }
          };
        }
        return {
          kind: 'unverified',
          broker,
          domain,
          searchUrl,
          reason: 'Answered, no match found by machine'
        };
      })
    );

    for (const settled of fetched) {
      if (settled.status === 'rejected') continue;
      const value = settled.value;
      if (value.kind === 'found') {
        if (!surfaced.has(value.candidate.broker_domain)) {
          candidates.push(value.candidate);
          surfaced.add(value.candidate.broker_domain);
        }
        continue;
      }
      unverified.push({
        broker_name: value.broker.name,
        broker_domain: value.domain,
        search_url: value.searchUrl,
        reason: value.reason
      });
    }

    const confirmed = candidates.length;
    const viaSearch = provider !== 'none';
    const summary = [
      `${searchCount} search results read via ${
        viaSearch ? provider : 'no provider'
      }${plan.length > 1 ? ` across ${plan.length} queries` : ''}.`,
      `${confirmed} listing(s) confirmed against your profile.`,
      unverified.length
        ? `${unverified.length} site(s) could not be checked automatically and are listed below.`
        : 'Every site in this pass was checked automatically.',
      removalOnly.length ? `${removalOnly.length} broker(s) publish no public search, so they are removal-only.` : '',
      searchError ? `Search provider note: ${searchError}.` : '',
      viaSearch
        ? 'Bing is unlicensed: fine for your own use now, move to a Brave key before charging anyone.'
        : 'No search provider answered, so this pass could only test whether brokers allow a direct fetch.'
    ]
      .filter(Boolean)
      .join(' ');

    return Response.json({
      summary,
      provider,
      keyed: provider === 'brave' || provider === 'google_cse',
      mode: viaSearch ? `search:${provider}` : 'direct:brokers-block-automation',
      elapsed_ms: Date.now() - startedAt,
      sites_checked: capped.length,
      candidates,
      unverified,
      removal_only: removalOnly.map((b) => ({
        broker_name: b.name,
        broker_domain: cleanDomain(b.domain),
        opt_out_url: b.opt_out_url || null
      }))
    });
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    return Response.json(
      {
        error: `The scan stopped early: ${detail}. Nothing was recorded, so nothing was lost.`,
        elapsed_ms: Date.now() - startedAt
      },
      { status: 500 }
    );
  }
}
