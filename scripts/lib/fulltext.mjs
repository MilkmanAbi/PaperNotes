// A capped inverted index.
//
// Full text search over an arbitrarily large note tree is not free, and the
// dishonest version of this feature is an index that quietly grows until the
// site takes ten seconds to become searchable. So the index has an explicit
// byte budget, it says in its own metadata what it had to drop, and the UI
// tells the user which tier of search it is currently answering from.

const STOPWORDS = new Set((
  'a about above after again all also am an and any are as at be because been ' +
  'before being below between both but by can did do does doing down during ' +
  'each few for from further had has have having he her here hers him his how ' +
  'i if in into is it its itself just me more most my no nor not now of off on ' +
  'once only or other our out over own same she should so some such than that ' +
  'the their them then there these they this those through to too under until ' +
  'up very was we were what when where which while who whom why will with you ' +
  'your'
).split(' '));

export function tokenize(text) {
  const out = [];
  // Letters, digits and intra-word marks; everything else is a boundary.
  const re = /[\p{L}\p{N}][\p{L}\p{N}_+#-]{0,31}/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].toLowerCase();
    if (t.length < 2 || t.length > 32) continue;
    if (STOPWORDS.has(t)) continue;
    out.push(t);
  }
  return out;
}

/**
 * @param {Array<{ docId: number, text: string }>} docs
 * @returns {{ index: object, stats: object }}
 */
export function buildFulltext(docs, opts = {}) {
  const {
    maxCharsPerDoc = 24000,
    maxBytes = 4 * 1024 * 1024,
    maxPostingsPerTerm = 4000,
    commonTermRatio = 0.4,
  } = opts;

  const postings = new Map(); // term -> Set<docId>
  let truncatedDocs = 0;

  for (const { docId, text } of docs) {
    let body = text;
    if (body.length > maxCharsPerDoc) {
      body = body.slice(0, maxCharsPerDoc);
      truncatedDocs++;
    }
    const seen = new Set(tokenize(body));
    for (const term of seen) {
      let set = postings.get(term);
      if (!set) { set = new Set(); postings.set(term, set); }
      set.add(docId);
    }
  }

  const docCount = docs.length;
  const commonCutoff = Math.max(50, Math.floor(docCount * commonTermRatio));
  let droppedCommon = 0;
  let droppedBudget = 0;

  // Terms matching nearly everything cost the most and discriminate least.
  for (const [term, set] of postings) {
    if (set.size > commonCutoff) { postings.delete(term); droppedCommon++; }
  }

  // Rank by selectivity; keep the most useful terms until the budget runs out.
  const terms = [...postings.keys()].sort((a, b) => {
    const d = postings.get(a).size - postings.get(b).size;
    return d !== 0 ? d : (a < b ? -1 : 1);
  });

  const keptTerms = [];
  const keptPostings = [];
  let bytes = 0;

  for (const term of terms) {
    const ids = [...postings.get(term)].sort((a, b) => a - b);
    const capped = ids.length > maxPostingsPerTerm ? ids.slice(0, maxPostingsPerTerm) : ids;
    // Delta encoding keeps the postings list small and still trivially decoded.
    const deltas = new Array(capped.length);
    let prev = 0;
    for (let i = 0; i < capped.length; i++) { deltas[i] = capped[i] - prev; prev = capped[i]; }

    const cost = term.length + 4 + deltas.length * 4;
    if (bytes + cost > maxBytes) { droppedBudget++; continue; }
    bytes += cost;
    keptTerms.push(term);
    keptPostings.push(deltas);
  }

  return {
    index: { v: 1, terms: keptTerms, postings: keptPostings },
    stats: {
      docCount,
      termsKept: keptTerms.length,
      droppedCommon,
      droppedBudget,
      truncatedDocs,
      approxBytes: bytes,
      complete: droppedBudget === 0 && truncatedDocs === 0,
    },
  };
}
