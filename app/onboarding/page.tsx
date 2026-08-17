"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import { api, getErrorMessage } from "@/lib/apiClient";
import { requireAuthenticated } from "@/lib/frontendAccess";

const INTEREST_OPTIONS = [
  { label: "Health", value: "health" },
  { label: "Social", value: "social" },
  { label: "Politics", value: "politics" },
  { label: "Technology", value: "tech" },
  { label: "Finance", value: "finance" },
  { label: "Climate", value: "climate" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screen, setScreen] = useState(1);
  const [interests, setInterests] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    loadOnboarding();
  }, []);

  async function loadOnboarding() {
    try {
      setLoading(true);

      const user = await requireAuthenticated(router);
      if (!user) return;

      if (user.onboardingCompleted) {
        router.push("/feed");
        return;
      }

      const res = await api.get("/onboarding");
      setInterests(Array.isArray(res.data?.interests) ? res.data.interests : []);
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Failed to load onboarding"));
    } finally {
      setLoading(false);
    }
  }

  function toggleInterest(value: string) {
    setInterests((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  async function completeOnboarding() {
    if (interests.length === 0) {
      setMessageType("error");
      setMessage("Choose at least one interest before continuing.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      await api.patch("/onboarding", { interests });

      const localUser = localStorage.getItem("user");
      if (localUser) {
        try {
          const parsedUser = JSON.parse(localUser);
          localStorage.setItem(
            "user",
            JSON.stringify({
              ...parsedUser,
              onboardingCompleted: true,
            })
          );
        } catch {
        }
      }

      setMessageType("success");
      setMessage("Onboarding complete. Redirecting to your feed...");
      setScreen(4);
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Failed to save onboarding"));
    } finally {
      setSaving(false);
    }
  }

  async function skipOnboarding() {
    try {
      setSaving(true);
      setMessage("");

      await api.patch("/onboarding", { skip: true });

      const localUser = localStorage.getItem("user");
      if (localUser) {
        try {
          const parsedUser = JSON.parse(localUser);
          localStorage.setItem(
            "user",
            JSON.stringify({
              ...parsedUser,
              onboardingCompleted: true,
            })
          );
        } catch {
        }
      }

      router.push("/feed");
    } catch (error: unknown) {
      setMessageType("error");
      setMessage(getErrorMessage(error, "Failed to skip onboarding"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageWrapper title="Onboarding" subtitle="Setting up your account workspace.">
        <LoadingSpinner label="Loading onboarding..." />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Welcome to VeriVerse"
      subtitle="Complete a short setup so your account lands in the right trust workflow."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="vv-card p-5">
          <p className="vv-eyebrow mb-3">Setup Progress</p>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`rounded-2xl border p-3 ${screen === step ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
              >
                <p className="text-sm font-semibold text-slate-900">Step {step}</p>
                <p className="text-sm text-slate-600">
                  {step === 1 && "Understand the trust workflow."}
                  {step === 2 && "See how moderation and reputation connect."}
                  {step === 3 && "Choose the topics you care about."}
                  {step === 4 && "Enter the feed."}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="vv-card p-6">
          {screen === 1 && (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="vv-eyebrow">Step 1</p>
                <button
                  className="vv-btn-secondary"
                  onClick={skipOnboarding}
                  disabled={saving}
                  aria-busy={saving}
                >
                  Skip
                </button>
              </div>
              <h2 className="vv-section-title mb-3">Truth signals come first</h2>
              <p className="text-slate-700 leading-7 mb-6">
                Posts move through AI screening, grounded evidence checks, and community verification so the feed reflects credibility instead of raw velocity.
              </p>
              <div className="flex gap-3">
                <button className="vv-btn-primary ml-auto" onClick={() => setScreen(2)}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {screen === 2 && (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="vv-eyebrow">Step 2</p>
                <button
                  className="vv-btn-secondary"
                  onClick={skipOnboarding}
                  disabled={saving}
                  aria-busy={saving}
                >
                  Skip
                </button>
              </div>
              <h2 className="vv-section-title mb-3">How your actions affect trust</h2>
              <ol className="list-decimal list-inside space-y-2 text-slate-700 mb-6">
                <li>Post claims and context.</li>
                <li>AI and grounding systems classify risk.</li>
                <li>The community votes on accuracy.</li>
                <li>Accurate participation builds reputation and rewards.</li>
              </ol>
              <div className="flex gap-3">
                <button className="vv-btn-secondary" onClick={() => setScreen(1)}>
                  Back
                </button>
                <button className="vv-btn-primary ml-auto" onClick={() => setScreen(3)}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {screen === 3 && (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="vv-eyebrow">Step 3</p>
                <button
                  className="vv-btn-secondary"
                  onClick={skipOnboarding}
                  disabled={saving}
                  aria-busy={saving}
                >
                  Skip
                </button>
              </div>
              <h2 className="vv-section-title mb-3">Pick your interest areas</h2>
              <p className="text-slate-700 mb-5">
                These topics help tailor the early experience. You can change them later.
              </p>

              <div className="grid gap-3 sm:grid-cols-2 mb-6">
                {INTEREST_OPTIONS.map((option) => {
                  const selected = interests.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleInterest(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${selected ? "border-amber-300 bg-amber-50 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                    >
                      <p className="font-semibold">{option.label}</p>
                      <p className="text-sm mt-1 opacity-80">Follow related content and trust signals.</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button className="vv-btn-secondary" onClick={() => setScreen(2)}>
                  Back
                </button>
                <button
                  className="vv-btn-primary ml-auto"
                  onClick={completeOnboarding}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? "Saving..." : "Finish Onboarding"}
                </button>
              </div>
            </div>
          )}

          {screen === 4 && (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="vv-eyebrow">Complete</p>
                <button
                  className="vv-btn-secondary"
                  onClick={skipOnboarding}
                  disabled={saving}
                  aria-busy={saving}
                >
                  Skip
                </button>
              </div>
              <h2 className="vv-section-title mb-3">Your account is ready</h2>
              <p className="text-slate-700 mb-6">
                You can now move into the feed, start participating, and build reputation through evidence-backed activity.
              </p>
              <button className="vv-btn-primary" onClick={() => router.push("/feed")}>
                Go to Feed
              </button>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
