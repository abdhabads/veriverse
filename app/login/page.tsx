"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import Toast from "@/components/Toast";
import Logo from "@/components/Logo";
import TurnstileWidget, { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import { api, getErrorMessage } from "@/lib/apiClient";

const CAPTCHA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY);

// The exact, stable, non-interpolated message app/api/login/route.ts
// returns for a deactivated account (only ever reached after the caller's
// password has already been verified - see that route's comment on why
// account-specific state is never disclosed before that point). Matched by
// exact equality, never substring/heuristic parsing of arbitrary server
// text, and the login/restore APIs themselves are untouched - this only
// recognizes a message they already contractually return.
const DEACTIVATED_ACCOUNT_MESSAGE =
  "This account has been deactivated. You can restore it from the login page.";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  useEffect(() => {
    if (searchParams.get("deactivated") === "1") {
      setMessageType("success");
      setMessage(
        "Your account has been deactivated. You can restore it later by signing in with your credentials."
      );
    }
  }, [searchParams]);

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

  const canSubmit = !isSubmitting && (!CAPTCHA_CONFIGURED || Boolean(captchaToken));

  const handleLogin = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setShowRestore(false);

    try {
      const res = await axios.post("/api/login", {
        email: email.trim(),
        password,
        captchaToken: captchaToken ?? "",
      });

      localStorage.setItem("user", JSON.stringify(res.data.user));
      setMessageType("success");
      setMessage("Login successful");
      router.push(res.data.user?.onboardingCompleted ? "/feed" : "/onboarding");
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Login failed");
      setMessageType("error");
      setMessage(errorMessage);
      // This exact message is only ever returned after the password above
      // has already been verified as correct - showing the restore
      // affordance here discloses nothing an incorrect password wouldn't
      // already have been blocked from reaching.
      setShowRestore(errorMessage === DEACTIVATED_ACCOUNT_MESSAGE);
      // Turnstile tokens are single-use - the server has already consumed
      // (or rejected) this one, so a retry needs a fresh one. This covers
      // wrong-password, network errors, and server-side captcha rejection
      // alike, without requiring a page refresh.
      turnstileRef.current?.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);

    try {
      const res = await api.post("/profile/account/restore", {
        email: email.trim(),
        password,
      });

      localStorage.setItem("user", JSON.stringify(res.data.user));
      setShowRestore(false);
      setMessageType("success");
      setMessage(res.data.message || "Account restored successfully.");
      router.push(res.data.user?.onboardingCompleted ? "/feed" : "/onboarding");
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Failed to restore account"));
    } finally {
      setIsRestoring(false);
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

              {CAPTCHA_CONFIGURED && (
                <div className="mt-2">
                  <TurnstileWidget ref={turnstileRef} onTokenChange={setCaptchaToken} />
                </div>
              )}
            </div>

            <button
              onClick={handleLogin}
              className="vv-btn-primary w-full mt-4"
              disabled={!canSubmit}
              aria-busy={isSubmitting}
            >
              {isSubmitting
                ? "Logging in…"
                : CAPTCHA_CONFIGURED && !captchaToken
                ? "Complete verification to continue"
                : "Login"}
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

            {showRestore && (
              <div className="vv-card-soft mt-4 p-4">
                <p className="mb-3 text-sm text-slate-600">
                  Your password was correct, but this account is currently deactivated. You can
                  restore it now and continue into VeriVerse.
                </p>
                <button
                  onClick={handleRestore}
                  disabled={isRestoring}
                  aria-busy={isRestoring}
                  className="vv-btn-primary w-full"
                >
                  {isRestoring ? "Restoring..." : "Restore my account"}
                </button>
              </div>
            )}

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
