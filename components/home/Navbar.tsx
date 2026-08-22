import Link from "next/link";

const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/register";

export default function Navbar() {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-6 py-4"
      style={{ background: "#0D1B2A" }}
    >
      <Link href="/" className="flex items-center gap-1">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none" aria-hidden="true" style={{ marginRight: "-2px" }}>
          <rect width="100" height="100" rx="22" fill="#E8623F" />
          <path d="M 26 46 L 40 62" stroke="#F5EEE2" strokeWidth="9.5" strokeLinecap="round" fill="none" />
          <path d="M 40 62 L 76 30" stroke="#0D1B2A" strokeWidth="9.5" strokeLinecap="round" fill="none" />
        </svg>
        <span className="text-lg font-bold text-white">eriVerse</span>
      </Link>

      <nav className="hidden items-center gap-6 sm:flex">
        <a href="#what-is-veriverse" className="text-sm font-medium text-white/60 transition hover:text-white">
          What it is
        </a>
        <a href="#how-it-works" className="text-sm font-medium text-white/60 transition hover:text-white">
          How it works
        </a>
        <a href="#why-join" className="text-sm font-medium text-white/60 transition hover:text-white">
          Why join
        </a>
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href={LOGIN_PATH}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
        >
          Log in
        </Link>
        <Link
          href={SIGNUP_PATH}
          className="rounded-full px-5 py-2 text-sm font-bold text-white transition hover:opacity-90"
          style={{ background: "#E8623F" }}
        >
          Sign up
        </Link>
      </div>
    </header>
  );
}
