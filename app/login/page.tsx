"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import Toast from "@/components/Toast";
import Logo from "@/components/Logo";
import { api, getErrorMessage } from "@/lib/apiClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");

  useEffect(() => {
    let active = true;

    void api
      .get("/access")
      .then((res) => {
        if (!active) return;

        const user = res.data?.user;
        if (user) {
          router.replace(user.onboardingCompleted ? "/feed" : "/onboarding");
        }
      })
      .catch(() => {
        // Guests stay on the login page.
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleLogin = async () => {
    try {
      const res = await axios.post("/api/login", {
        email: email.trim(),
        password,
        captchaToken,
      });

      localStorage.setItem("user", JSON.stringify(res.data.user));
      setMessageType("success");
      setMessage("Login successful");
      router.push(res.data.user?.onboardingCompleted ? "/feed" : "/onboarding");
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Login failed"));
    }
  };

  return (
    <div className="vv-page">
      <div className="vv-auth-shell">
        <div className="vv-auth-panel hidden lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-8">
              <Logo size={34} />
              <span className="text-lg font-bold tracking-tight">VeriVerse</span>
            </div>
            <p className="vv-eyebrow mb-4 bg-white/10 text-white">Signal-first moderation</p>
            <h1 className="text-5xl font-bold leading-tight mb-4 max-w-xl">
              Enter the trust layer built for evidence-heavy conversation.
            </h1>
            <p className="text-base text-orange-50/82 max-w-lg leading-7">
              VeriVerse blends automated screening, grounded sources, and expert escalation into one operational feed for high-stakes claims.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Pipeline</p>
              <p className="text-2xl font-bold mt-2">AI + experts</p>
              <p className="text-sm text-orange-50/70 mt-2">Automated triage with human escalation where it matters.</p>
            </div>
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Evidence</p>
              <p className="text-2xl font-bold mt-2">Grounded links</p>
              <p className="text-sm text-orange-50/70 mt-2">Source-backed context attached directly to moderation output.</p>
            </div>
          </div>
        </div>

        <div className="vv-auth-form">
          <div className="vv-auth-card">
            <p className="vv-eyebrow mb-4">Welcome back</p>
            <h1 className="vv-title text-3xl mb-2">Login to VeriVerse</h1>
            <p className="vv-subtitle mb-6">Continue into the moderation, trust, and evidence workspace.</p>

            <div className="space-y-4">
              <div>
                <label className="vv-label block mb-1" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  className="vv-input"
                  placeholder="analyst@veriverse.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="vv-label block mb-1" htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  className="vv-input"
                  placeholder="Enter your password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div>
                <label className="vv-label block mb-1" htmlFor="login-captcha-token">
                  Captcha Token
                </label>
                <input
                  id="login-captcha-token"
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

            <button onClick={handleLogin} className="vv-btn-primary w-full">
              Login
            </button>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => router.push("/forgot-password")}
                className="text-sm font-medium text-amber-700 transition hover:text-amber-800"
              >
                Forgot password?
              </button>
            </div>

            {message && <div className="mt-4"><Toast message={message} type={messageType} /></div>}

            <div className="mt-6 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>No account yet?</span>
              <button
                onClick={() => router.push("/register")}
                className="vv-btn-secondary"
              >
                Create account
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
