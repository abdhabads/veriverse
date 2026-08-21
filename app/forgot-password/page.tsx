"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Toast from "@/components/Toast";
import Logo from "@/components/Logo";
import { getErrorMessage } from "@/lib/apiClient";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [resetUrl, setResetUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);

    try {
      const res = await axios.post("/api/password/forgot", {
        email: email.trim(),
      });

      setMessageType("success");
      setMessage(res.data.message || "Password reset request created.");
      setResetUrl(typeof res.data.resetUrl === "string" ? res.data.resetUrl : "");
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Failed to request password reset"));
      setResetUrl("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="vv-page">
      <div className="vv-auth-shell">
        <div className="vv-auth-panel hidden lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-8">
              <Logo size={34} />
              <span className="text-lg font-bold tracking-tight">VeriVerse</span>
            </div>
            <p className="vv-eyebrow mb-4 bg-white/10 text-white">Account recovery</p>
            <h1 className="text-5xl font-bold leading-tight mb-4 max-w-xl">
              Regain access without bypassing the trust controls.
            </h1>
            <p className="text-base text-orange-50/82 max-w-lg leading-7">
              Request a temporary reset link for the email attached to your VeriVerse account.
            </p>
          </div>

          <div className="space-y-4">
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Security</p>
              <p className="text-xl font-bold mt-2">Time-limited reset token</p>
              <p className="text-sm text-orange-50/70 mt-2">Recovery links expire automatically after 30 minutes.</p>
            </div>
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Privacy</p>
              <p className="text-xl font-bold mt-2">Non-enumerating response</p>
              <p className="text-sm text-orange-50/70 mt-2">The request response stays generic whether the email exists or not.</p>
            </div>
          </div>
        </div>

        <div className="vv-auth-form">
          <div className="vv-auth-card">
            <p className="vv-eyebrow mb-4">Recover access</p>
            <h1 className="vv-title text-3xl mb-2">Forgot your password?</h1>
            <p className="vv-subtitle mb-6">
              Enter your account email and we will prepare a reset link.
            </p>

            <div>
              <label className="vv-label block mb-1" htmlFor="forgot-password-email">
                Email
              </label>
              <input
                id="forgot-password-email"
                className="vv-input"
                placeholder="analyst@veriverse.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              aria-busy={submitting}
              className="vv-btn-primary w-full mt-6"
            >
              {submitting ? "Preparing reset..." : "Send Reset Link"}
            </button>

            {message && <div className="mt-4"><Toast message={message} type={messageType} /></div>}

            {resetUrl && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Development reset link</p>
                <p className="mt-1 break-all">{resetUrl}</p>
                <button
                  onClick={() => router.push(resetUrl)}
                  className="vv-btn-secondary mt-3"
                >
                  Open Reset Page
                </button>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>Remembered it?</span>
              <button
                onClick={() => router.push("/login")}
                className="vv-btn-secondary"
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}