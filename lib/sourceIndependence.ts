// Deterministic, conservative independence model for Sprint 1.
//
// "10 URLs is not 10 independent sources" - if ten sites republish the same
// wire report, they should not count as ten confirmations. This file only
// ever MERGES items into a shared independenceGroup when it has a concrete,
// checkable reason to (same host, or a verbatim-identical evidence span
// republished on a different host). It never asserts that two different-
// looking sources ARE independent - the default ("distinct group per host")
// is a default, not a positive claim of independence. Where real
// independence can't be established, this stays conservative rather than
// inventing certainty either way.
//
// Known limitation: grouping is by full hostname, not a resolved
// registrable domain (eTLD+1). Two subdomains of the same publisher (e.g.
// "news.example.com" and "blog.example.com") will NOT be merged by this
// version. That under-merges rather than over-merges, which is the safer
// direction for a heuristic whose job is to avoid overcounting confirmations.

const TRACKING_PARAM_PREFIXES = ["utm_", "fbclid", "gclid", "mc_", "ref", "igshid"];

export function computeCanonicalUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";

    const keptParams = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (TRACKING_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
        continue;
      }
      keptParams.append(key, value);
    }
    url.search = keptParams.toString();

    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname || "/";

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function normalizeDomainForGrouping(domain: string): string {
  return (domain || "").toLowerCase().trim().replace(/^www\./, "");
}

export type IndependenceGroupingInput = {
  domain: string;
  evidenceHash: string | null;
};

// Union-find over the batch: base groups are per-domain; two items on
// DIFFERENT domains are merged into one group only if they share an exact,
// non-null evidenceHash (verbatim-duplicated content - e.g. a copied wire
// report). Returns one group label per input item, same order.
export function computeIndependenceGroups(
  items: IndependenceGroupingInput[]
): string[] {
  const parent = items.map((_, index) => index);

  function find(index: number): number {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  function union(a: number, b: number) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
    }
  }

  const firstIndexByDomain = new Map<string, number>();
  items.forEach((item, index) => {
    const key = normalizeDomainForGrouping(item.domain);
    if (!key) return;
    const existing = firstIndexByDomain.get(key);
    if (existing !== undefined) union(existing, index);
    else firstIndexByDomain.set(key, index);
  });

  const firstIndexByEvidenceHash = new Map<string, number>();
  items.forEach((item, index) => {
    if (!item.evidenceHash) return;
    const existing = firstIndexByEvidenceHash.get(item.evidenceHash);
    if (existing !== undefined) union(existing, index);
    else firstIndexByEvidenceHash.set(item.evidenceHash, index);
  });

  return items.map((_, index) => `group-${find(index)}`);
}

// Convenience: count of distinct independenceGroups among items matching a
// predicate (e.g. "how many independently-grouped sources support the
// claim") - the correct denominator for "independent confirmations", as
// opposed to items.length.
export function countDistinctGroups(groups: string[]): number {
  return new Set(groups).size;
}
