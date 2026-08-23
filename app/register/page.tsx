"use client";

import Link from "next/link";
import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";
import Logo from "@/components/Logo";
import { getErrorMessage } from "@/lib/apiClient";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");

  const handleRegister = async () => {
    if (!agreedToTerms) {
      setMessageType("error");
      setMessage("You must agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    try {
      await axios.post("/api/register", {
        username: username.trim(),
        email: email.trim(),
        password,
        captchaToken,
        agreedToTerms: true,
      });

      setMessageType("success");
      setMessage("Registration successful");
      router.push("/login");
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Registration failed"));
    }
  };

  return (
    <div className="vv-page">
      <div className="vv-auth-shell">
        <div className="vv-auth-panel hidden lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 flex items-center gap-1.5">
              <Logo size={34} dark />
              <span className="text-lg font-bold tracking-tight">eriVerse</span>
            </div>
            <p className="vv-eyebrow mb-4 bg-white/10 text-white">Create your operator profile</p>
            <h1 className="text-5xl font-bold leading-tight mb-4 max-w-xl">
              Join the network that treats verification like infrastructure.
            </h1>
            <p className="text-base text-orange-50/82 max-w-lg leading-7">
              Build reputation through accurate voting, evidence-aware posting, and cleaner escalation for risky claims.
            </p>
          </div>

          <div className="space-y-4">
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Reputation</p>
              <p className="text-xl font-bold mt-2">Weighted trust system</p>
              <p className="text-sm text-orange-50/70 mt-2">Earn influence by being consistently accurate, not simply loud.</p>
            </div>
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Moderation</p>
              <p className="text-xl font-bold mt-2">Transparent signals</p>
              <p className="text-sm text-orange-50/70 mt-2">Reasons, sources, and review states stay visible across the workflow.</p>
            </div>
          </div>
        </div>

        <div className="vv-auth-form">
          <div className="vv-auth-card">
            <p className="vv-eyebrow mb-4">Start here</p>
            <h1 className="vv-title text-3xl mb-2">Create your account</h1>
            <p className="vv-subtitle mb-6">
              Join the trust-driven network with a profile built for evidence-first conversation.
            </p>

            <div className="space-y-4">
              <div>
                <label className="vv-label block mb-1" htmlFor="register-username">
                  Username
                </label>
                <input
                  id="register-username"
                  className="vv-input"
                  placeholder="Choose a public handle"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="vv-label block mb-1" htmlFor="register-email">
                  Email
                </label>
                <input
                  id="register-email"
                  className="vv-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="vv-label block mb-1" htmlFor="register-password">
                  Password
                </label>
                <input
                  id="register-password"
                  className="vv-input"
                  placeholder="Create a strong password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="vv-label block mb-1" htmlFor="register-captcha-token">
                  Captcha Token
                </label>
                <input
                  id="register-captcha-token"
                  className="vv-input"
                  placeholder="human-verified"
                  value={captchaToken}
                  onChange={(e) => setCaptchaToken(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 my-4">
              Enter <span className="font-semibold">human-verified</span> when CAPTCHA is enabled in local development.
            </p>

            <label className="mt-2 flex items-start gap-3 rounded-2xl border border-veriverse-border bg-white/60 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-veriverse-purple focus:ring-veriverse-purple"
              />
              <span>
                I agree to the <Link href="/terms" className="font-semibold text-veriverse-blue underline underline-offset-2">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-veriverse-blue underline underline-offset-2">Privacy Policy</Link>.
              </span>
            </label>

            <button onClick={handleRegister} className="vv-btn-accent w-full mt-5">
              Register
            </button>

            {message && <div className="mt-4"><Toast message={message} type={messageType} /></div>}

            <div className="mt-6 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>Already registered?</span>
              <button
                onClick={() => router.push("/login")}
                className="vv-btn-secondary"
              >
                Login
              </button>
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-veriverse-border pt-5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-emerald-600">
                <path d="M12 2L4 6V12C4 17 7.6 21.4 12 22C16.4 21.4 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M9 12L11 14L15.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] text-slate-500">
                Every session is protected by grounded, source-checked moderation.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
