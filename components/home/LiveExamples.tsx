function ExampleCard({
  initials,
  avatarBg,
  username,
  time,
  category,
  verdictLabel,
  verdictBg,
  verdictColor,
  verdictBorder,
  claim,
  riskLine,
  riskColor,
  evidenceLine,
  evidenceBg,
  evidenceColor,
}: {
  initials: string;
  avatarBg: string;
  username: string;
  time: string;
  category: string;
  verdictLabel: string;
  verdictBg: string;
  verdictColor: string;
  verdictBorder: string;
  claim: string;
  riskLine: string;
  riskColor: string;
  evidenceLine: string;
  evidenceBg: string;
  evidenceColor: string;
}) {
  return (
    <div
      className="rounded-[20px] p-5 shadow-sm"
      style={{ background: "#F5EEE2", border: "1px solid #E4E0D4" }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: avatarBg }}
          >
            {initials}
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: "#0D1B2A" }}>
              {username}
            </div>
            <div className="text-xs text-gray-400">
              {time} · {category}
            </div>
          </div>
        </div>
        <span
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ background: verdictBg, color: verdictColor, borderColor: verdictBorder }}
        >
          {verdictLabel}
        </span>
      </div>
      <p className="mb-3 text-[15px]" style={{ color: "#2A2A2A" }}>
        {claim}
      </p>
      <div className="mb-3 text-xs" style={{ color: riskColor }}>
        {riskLine}
      </div>
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3 text-[13.5px] font-semibold"
        style={{ background: evidenceBg, color: evidenceColor }}
      >
        <span>{evidenceLine}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export default function LiveExamples() {
  return (
    <section className="px-6 py-16" style={{ background: "#FAF6EE" }}>
      <div className="mx-auto max-w-4xl">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A8272" }}>
          What it looks like
        </p>
        <h2 className="mb-12 text-center text-2xl font-bold leading-snug sm:text-3xl" style={{ color: "#0D1B2A" }}>
          Real posts, evaluated by the real pipeline.
        </h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <ExampleCard
            initials="JO"
            avatarBg="#1E3A5F"
            username="james_orion"
            time="2 hours ago"
            category="Science"
            verdictLabel="✓ Well Supported"
            verdictBg="#DEEEDF"
            verdictColor="#2C6B3C"
            verdictBorder="#BFE0C4"
            claim="Earth completes one orbit around the Sun in about 365.25 days."
            riskLine="☆ Risk 4 / 100 · 92% verification confidence"
            riskColor="#8A8272"
            evidenceLine="4 sources · 4 support · 0 contradict"
            evidenceBg="#E6F3E7"
            evidenceColor="#2C6B3C"
          />
          <ExampleCard
            initials="TS"
            avatarBg="#6B6B6B"
            username="tester"
            time="40 minutes ago"
            category="Space"
            verdictLabel="✕ Contradicted"
            verdictBg="#F8DEDB"
            verdictColor="#B23B30"
            verdictBorder="#F0C2BD"
            claim="The Great Wall of China is visible from the Moon with the naked eye."
            riskLine="⚠ Risk 75 / 100 · Flagged for expert review"
            riskColor="#B23B30"
            evidenceLine="2 sources · 0 support · 2 contradict"
            evidenceBg="#FBE8E6"
            evidenceColor="#B23B30"
          />
        </div>

        <p className="mt-8 text-center text-sm text-gray-400">
          Both posts evaluated automatically the moment they were published — no
          manual lookup required.
        </p>
      </div>
    </section>
  );
}
