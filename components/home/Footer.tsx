import Link from "next/link";

const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/register";

export default function Footer() {
  return (
    <footer className="px-6 py-10 text-center text-xs" style={{ background: "#0D1B2A", color: "rgba(255,255,255,0.4)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-4">
        <Link href={LOGIN_PATH} className="hover:text-white">
          Log in
        </Link>
        <Link href={SIGNUP_PATH} className="hover:text-white">
          Sign up
        </Link>
        <Link href="/terms" className="hover:text-white">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-white">
          Privacy Policy
        </Link>
      </div>
      <div className="mb-3">
        Support: <a href="mailto:admin@veriverse.io" className="text-white underline underline-offset-2 hover:text-orange-200">admin@veriverse.io</a>
      </div>
      VeriVerse a product of Deekay Universal Alliance Nig Ltd ©2024
    </footer>
  );
}
