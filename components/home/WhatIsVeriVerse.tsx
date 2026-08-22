export default function WhatIsVeriVerse() {
  return (
    <section id="what-is-veriverse" className="px-6 py-16" style={{ background: "#FAF6EE" }}>
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A8272" }}>
          What VeriVerse is
        </p>
        <h2 className="mb-6 text-2xl font-bold leading-snug sm:text-3xl" style={{ color: "#0D1B2A" }}>
          A social platform where every claim is checked against real evidence —
          automatically, transparently, and in public.
        </h2>
        <p className="mx-auto max-w-2xl text-[15px] leading-relaxed text-gray-600">
          VeriVerse isn&apos;t a fact-checking tool you visit to look something up.
          It&apos;s a place to post, browse, and discuss claims the way you would on
          any social feed — except every post carries a transparent trust verdict,
          sources are attached directly to the claim, and the people whose posts
          consistently hold up build a visible reputation for it. It&apos;s built to
          catch the kind of misinformation that current platforms miss: claims that
          sound calm and credible but are directly contradicted by the evidence.
          Independent research found that <strong>42.3% of health content</strong> on
          a major platform fell into exactly this category — content that passed
          every automated filter while still being false.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border p-6 text-center" style={{ background: "#F5EEE2", borderColor: "#E4E0D4" }}>
          <div className="mb-2 text-2xl">🔍</div>
          <h3 className="mb-1.5 text-sm font-bold" style={{ color: "#0D1B2A" }}>
            Evaluated automatically
          </h3>
          <p className="text-xs leading-relaxed text-gray-500">
            Every post runs through a live evidence pipeline the moment it&apos;s
            published.
          </p>
        </div>
        <div className="rounded-2xl border p-6 text-center" style={{ background: "#F5EEE2", borderColor: "#E4E0D4" }}>
          <div className="mb-2 text-2xl">🗳️</div>
          <h3 className="mb-1.5 text-sm font-bold" style={{ color: "#0D1B2A" }}>
            Verified by people, too
          </h3>
          <p className="text-xs leading-relaxed text-gray-500">
            Community voting and qualified expert reviewers weigh in on claims that
            need it.
          </p>
        </div>
        <div className="rounded-2xl border p-6 text-center" style={{ background: "#F5EEE2", borderColor: "#E4E0D4" }}>
          <div className="mb-2 text-2xl">📖</div>
          <h3 className="mb-1.5 text-sm font-bold" style={{ color: "#0D1B2A" }}>
            Always transparent
          </h3>
          <p className="text-xs leading-relaxed text-gray-500">
            Every verdict shows its sources. Nothing is a black box you have to
            trust blindly.
          </p>
        </div>
      </div>
    </section>
  );
}
