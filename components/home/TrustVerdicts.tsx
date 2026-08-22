const VERDICTS = [
  { label: "Well Supported", icon: "✓", bg: "#DEEEDF", color: "#2C6B3C", border: "#BFE0C4", desc: "Retrieved sources broadly support this claim." },
  { label: "Contradicted", icon: "✕", bg: "#F8DEDB", color: "#B23B30", border: "#F0C2BD", desc: "Retrieved sources directly oppose this claim." },
  { label: "Under Expert Review", icon: "🔍", bg: "#F1E4C7", color: "#8A6D2F", border: "#E5D3A3", desc: "A sensitive claim, awaiting a qualified reviewer's judgment." },
  { label: "Evaluating", icon: "🕐", bg: "#E9E9E9", color: "#666666", border: "#D8D8D8", desc: "Just posted — the pipeline is still gathering sources." },
  { label: "Expert Verified", icon: "✓", bg: "#DEEEDF", color: "#1F5C2E", border: "#BFE0C4", desc: "A qualified reviewer confirmed this claim against the evidence." },
  { label: "Expert Rejected", icon: "✕", bg: "#F8DEDB", color: "#8F241B", border: "#F0C2BD", desc: "A qualified reviewer found this claim false." },
  { label: "Disputed", icon: "~", bg: "#EFE3F5", color: "#6B3D8A", border: "#DCC3EE", desc: "The evidence is genuinely contested or insufficient — and VeriVerse says so, rather than forcing a false verdict." },
];

export default function TrustVerdicts() {
  return (
    <section className="px-6 py-16" style={{ background: "#FAF6EE" }}>
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A8272" }}>
          Reading the feed
        </p>
        <h2 className="mb-4 text-2xl font-bold leading-snug sm:text-3xl" style={{ color: "#0D1B2A" }}>
          Every badge means something specific.
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-sm leading-relaxed text-gray-500">
          No vague labels. Every post on VeriVerse carries one of these verdicts, so
          you always know exactly what kind of confidence you&apos;re looking at.
        </p>
      </div>

      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
        {VERDICTS.map((v) => (
          <div
            key={v.label}
            className="flex items-start gap-3 rounded-xl border p-4"
            style={{ background: "#F5EEE2", borderColor: "#E4E0D4" }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold"
              style={{ background: v.bg, color: v.color, borderColor: v.border }}
            >
              {v.icon}
            </span>
            <div>
              <div className="text-sm font-bold" style={{ color: "#0D1B2A" }}>
                {v.label}
              </div>
              <div className="text-xs leading-relaxed text-gray-500">{v.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
