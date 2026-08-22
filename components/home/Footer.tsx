import Link from "next/link";

const LOGIN_PATH = "/login";
const SIGNUP_PATH = "/register";

export default function Footer() {
  return (
    <footer className="px-6 py-10 text-center text-xs" style={{ background: "#0D1B2A", color: "rgba(255,255,255,0.4)" }}>
      <div className="mb-3 flex items-center justify-center gap-4">
        <Link href={LOGIN_PATH} className="hover:text-white">
          Log in
        </Link>
        <Link href={SIGNUP_PATH} className="hover:text-white">
          Sign up
        </Link>
      </div>
      VeriVerse has been built since 2023 by Deekay Universal Alliance Nig Ltd
    </footer>
  );
}
