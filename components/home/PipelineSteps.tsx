const STAGES = [
  {
    n: "1",
    tag: "AI Screening",
    tagColor: "#5C6577",
    tagBg: "rgba(140,150,165,0.15)",
    title: "Does this look dangerous?",
    body: "An AI classifier scans every post for the linguistic patterns of known misinformation — sensational claims, false certainty, conspiracy framing — and assigns a moderation risk score. It's fast, but it only measures how a claim is phrased, not whether it's true.",
  },
  {
    n: "2",
    tag: "Evidence Grounding",
    tagColor: "#2E5F8A",
    tagBg: "rgba(78,133,184,0.15)",
    title: "What does the evidence actually say?",
    body: "Independently of the risk score, VeriVerse retrieves live sources for the specific claim and classifies each one as supporting, contradicting, or providing context. This runs regardless of how safe or dangerous the claim sounded.",
  },
  {
    n: "3",
    tag: "Contradiction Forcing",
    tagColor: "#B23B30",
    tagBg: "rgba(193,68,60,0.14)",
    title: "Evidence overrides everything.",
    body: "If retrieved sources contradict a claim strongly enough, the post is escalated for review — regardless of how low its risk score was. A claim can't hide behind calm language if the evidence says otherwise.",
  },
  {
    n: "4",
    tag: "Expert Review",
    tagColor: "#8A6D2F",
    tagBg: "rgba(230,190,90,0.18)",
    title: "Sensitive claims reach a real person.",
    body: "Claims touching health, safety, or other sensitive topics are automatically routed to a qualified human reviewer, who can mark them Verified, Rejected, or genuinely Disputed — not every claim has a clean answer, and VeriVerse says so honestly.",
  },
  {
    n: "5",
    tag: "Community Consensus",
    tagColor: "#2C6B3C",
    tagBg: "rgba(76,122,93,0.15)",
    title: "The community weighs in, fairly.",
    body: "Users vote to endorse or oppose claims, weighted by their own track record of accuracy. A verdict only locks in once several independent thresholds are met together — a simple majority is never enough to swing it.",
  },
];

export default function PipelineSteps() {
  return (
    <section id="how-it-works" className="px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A8272" }}>
          How it works
        </p>
        <h2 className="mb-4 text-2xl font-bold leading-snug sm:text-3xl" style={{ color: "#0D1B2A" }}>
          Five steps, every single post.
        </h2>
        <p className="mx-auto mb-14 max-w-xl text-sm leading-relaxed text-gray-500">
          This isn&apos;t a one-shot AI verdict. Every claim moves through a layered
          pipeline where automation, evidence, and real people each get a say — and
          none of them can fully override the others.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-4">
        {STAGES.map((s) => (
          <div
            key={s.n}
            className="flex gap-5 rounded-2xl border p-6"
            style={{ background: "#FAF6EE", borderColor: "#E4E0D4" }}
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: "#0D1B2A" }}
            >
              {s.n}
            </div>
            <div>
              <span
                className="mb-2 inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ background: s.tagBg, color: s.tagColor }}
              >
                {s.tag}
              </span>
              <h3 className="mb-1.5 text-base font-bold" style={{ color: "#0D1B2A" }}>
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed text-gray-500">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
