import Link from "next/link";

const SIGNUP_PATH = "/register";

export default function FinalCTA() {
  return (
    <section className="px-6 py-20 text-center">
      <span
        className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ borderColor: "#E4E0D4", color: "#8A8272" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4E85B8" }} />
        Currently in closed development
      </span>

      <h2
        className="mx-auto mb-3 max-w-md text-2xl font-bold leading-snug sm:text-3xl"
        style={{ color: "#0D1B2A" }}
      >
        Ready to see what the evidence says?
      </h2>
      <p className="mx-auto mb-8 max-w-sm text-sm text-gray-500">
        We&apos;re testing with a small group first. Create an account to post, vote,
        and help build a feed you can actually trust.
      </p>

      <Link
        href={SIGNUP_PATH}
        className="inline-block rounded-full px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
        style={{ background: "#0D1B2A" }}
      >
        Create your account
      </Link>
    </section>
  );
}
