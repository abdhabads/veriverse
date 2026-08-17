"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Toast from "@/components/Toast";
import { getErrorMessage } from "@/lib/apiClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmedPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (!token) {
      setMessageType("error");
      setMessage("Missing reset token. Request a new password reset link.");
      return;
    }

    if (!trimmedPassword || !trimmedConfirmPassword) {
      setMessageType("error");
      setMessage("New password and confirmation are required.");
      return;
    }

    if (trimmedPassword.length < 8) {
      setMessageType("error");
      setMessage("New password must be at least 8 characters.");
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setMessageType("error");
      setMessage("New password and confirmation must match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await axios.post("/api/password/reset", {
        token,
        newPassword: trimmedPassword,
      });

      setMessageType("success");
      setMessage(res.data.message || "Password reset successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Failed to reset password"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="vv-page">
      <div className="vv-auth-shell">
        <div className="vv-auth-panel hidden lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="vv-eyebrow mb-4 bg-white/10 text-white">Reset credentials</p>
            <h1 className="text-5xl font-bold leading-tight mb-4 max-w-xl">
              Set a new password and re-enter the moderation workspace.
            </h1>
            <p className="text-base text-orange-50/82 max-w-lg leading-7">
              Use your time-limited recovery link to replace the old password with a stronger one.
            </p>
          </div>

          <div className="space-y-4">
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Policy</p>
              <p className="text-xl font-bold mt-2">Minimum 8 characters</p>
              <p className="text-sm text-orange-50/70 mt-2">The new password must differ from the current stored password.</p>
            </div>
            <div className="vv-hero-stat bg-white/10 border-white/10">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Expiry</p>
              <p className="text-xl font-bold mt-2">Short-lived recovery</p>
              <p className="text-sm text-orange-50/70 mt-2">Invalid or expired links are rejected and require a new request.</p>
            </div>
          </div>
        </div>

        <div className="vv-auth-form">
          <div className="vv-auth-card">
            <p className="vv-eyebrow mb-4">Choose a new password</p>
            <h1 className="vv-title text-3xl mb-2">Reset Password</h1>
            <p className="vv-subtitle mb-6">
              Enter your new password below and confirm it before signing back in.
            </p>

            <div className="space-y-4">
              <div>
                <label className="vv-label block mb-1" htmlFor="reset-password-new">
                  New Password
                </label>
                <input
                  id="reset-password-new"
                  className="vv-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="vv-label block mb-1" htmlFor="reset-password-confirm">
                  Confirm New Password
                </label>
                <input
                  id="reset-password-confirm"
                  className="vv-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              aria-busy={submitting}
              className="vv-btn-primary w-full mt-6"
            >
              {submitting ? "Resetting..." : "Reset Password"}
            </button>

            {message && <div className="mt-4"><Toast message={message} type={messageType} /></div>}

            <div className="mt-6 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>Need a new link?</span>
              <button
                onClick={() => router.push("/forgot-password")}
                className="vv-btn-secondary"
              >
                Request Another
              </button>
            </div>

            {messageType === "success" && message && (
              <button
                onClick={() => router.push("/login")}
                className="vv-btn-secondary mt-4"
              >
                Back to Login
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}