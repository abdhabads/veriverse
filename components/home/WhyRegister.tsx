import Link from "next/link";

const SIGNUP_PATH = "/register";

const REASONS = [
  {
    icon: "📝",
    title: "Post claims and get a real answer",
    body: "Share something you saw, heard, or wondered about — and watch it get checked against live evidence in real time, not just guessed at.",
    live: true,
  },
  {
    icon: "🗳️",
    title: "Vote, and build a reputation for being right",
    body: "Endorse or oppose claims. Your voting weight grows as your track record for accuracy does — reliable voices carry more influence over time.",
    live: true,
  },
  {
    icon: "🧭",
    title: "Browse a feed you can actually trust",
    body: "Filter by verdict, sort by evidence strength, and see exactly why a claim was flagged — every source is one click away.",
    live: true,
  },
  {
    icon: "🤝",
    title: "Follow people who consistently get it right",
    body: "Build a network around accuracy, not just opinion. Follow back and forth to become verified friends on the platform.",
    live: false,
  },
  {
    icon: "💬",
    title: "Message your friends directly",
    body: "Once you're friends, take the conversation private — separate from the public, evidence-checked feed.",
    live: false,
  },
  {
    icon: "🎁",
    title: "Invite people, earn reputation",
    body: "When someone you invite becomes a genuinely active, accurate voter, you both get a reputation boost — not just for signing up, for actually contributing.",
    live: false,
  },
];

export default function WhyRegister() {
  return (
    <section id="why-join" className="px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A8272" }}>
          Why create an account
        </p>
        <h2 className="mb-4 text-2xl font-bold leading-snug sm:text-3xl" style={{ color: "#0D1B2A" }}>
          Browsing shows you the evidence. Joining lets you shape it.
        </h2>
        <p className="mx-auto mb-14 max-w-xl text-sm leading-relaxed text-gray-500">
          You don&apos;t need an account to see how a claim was evaluated. You need one
          to post, vote, and become part of the community that keeps the feed honest.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {REASONS.map((r) => (
          <div
            key={r.title}
            className="relative rounded-2xl border p-6"
            style={{ background: "#FAF6EE", borderColor: "#E4E0D4" }}
          >
            {!r.live && (
              <span
                className="absolute right-4 top-4 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
                style={{ background: "#F1E4C7", color: "#8A6D2F" }}
              >
                Coming soon
              </span>
            )}
            <div className="mb-3 text-2xl">{r.icon}</div>
            <h3 className="mb-1.5 pr-16 text-sm font-bold" style={{ color: "#0D1B2A" }}>
              {r.title}
            </h3>
            <p className="text-xs leading-relaxed text-gray-500">{r.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Link
          href={SIGNUP_PATH}
          className="inline-block rounded-full px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
          style={{ background: "#0D1B2A" }}
        >
          Create your account
        </Link>
      </div>
    </section>
  );
}
