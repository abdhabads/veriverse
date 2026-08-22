import Link from "next/link";
import ClaimDemo from "@/components/home/ClaimDemo";

const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/register";

export default function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pt-24">
      <p className="mb-8 text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A8272" }}>
        A claim, evaluated two ways
      </p>

      <ClaimDemo />

      <h1
        className="mx-auto mt-12 max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl"
        style={{ color: "#0D1B2A" }}
      >
        Content can look safe
        <br />
        and still be <span style={{ color: "#E8623F" }}>false.</span>
      </h1>

      <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-gray-500">
        VeriVerse is a social platform that checks what the evidence actually says
        about a claim — not just whether the words sound dangerous. Post, vote, and
        follow the people getting it right.
      </p>

      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={SIGNUP_PATH}
          className="w-full rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-90 sm:w-auto"
          style={{ background: "#0D1B2A" }}
        >
          Create your account
        </Link>
        <Link
          href={LOGIN_PATH}
          className="w-full rounded-full border-2 px-7 py-3.5 text-sm font-bold transition hover:bg-white sm:w-auto"
          style={{ borderColor: "#0D1B2A", color: "#0D1B2A" }}
        >
          Already have an account? Log in
        </Link>
      </div>
    </section>
  );
}
