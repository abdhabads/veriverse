import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Terms of Service — VeriVerse",
  description: "Review the VeriVerse Terms of Service and community rules.",
};

const sections = [
  {
    title: "1. Welcome to VeriVerse",
    body:
      "VeriVerse is a trust and evidence platform for evaluating claims, sharing context, and moderating public content responsibly. By creating an account or using the platform, you agree to these Terms of Service and all rules described within them.",
  },
  {
    title: "2. Your account responsibilities",
    body:
      "You are responsible for the accuracy of your account information, the security of your password, and all activity performed through your account. You must not impersonate others, create duplicate accounts, or misuse the platform to manipulate trust, reputation, or moderation outcomes.",
  },
  {
    title: "3. Content and claims",
    body:
      "Users may post statements, commentary, and evidence for review. VeriVerse does not guarantee that any content is true, accurate, or complete. We may flag, label, restrict, or remove content that is misleading, harmful, abusive, or inconsistent with our community standards.",
  },
  {
    title: "4. Evidence and moderation",
    body:
      "The platform may display sources, confidence scores, risk indicators, and moderation decisions. These signals are operational tools designed to help users evaluate claims; they are not legal determinations, endorsements, or guarantees of truth.",
  },
  {
    title: "5. Prohibited conduct",
    body:
      "You may not use VeriVerse to harass others, share private or sensitive personal information, spam, coordinate abuse, spread disinformation, or evade moderation systems. Attempts to manipulate votes, reputation, or evidence signals are prohibited.",
  },
  {
    title: "6. Suspension, removal, and appeals",
    body:
      "VeriVerse may suspend, restrict, or remove any account or content that violates these terms or creates material risk to users, moderators, or platform integrity. If a moderation action is taken, users may use the appeals and review flows provided in the app where available.",
  },
  {
    title: "7. Platform changes",
    body:
      "We may adjust features, policy rules, moderation systems, and platform design over time. Continued use of VeriVerse after changes are made indicates acceptance of the updated terms.",
  },
  {
    title: "8. Contact",
    body:
      "If you have questions about these Terms of Service, contact the VeriVerse team through the support channels available in the app or the company contact information listed in the product documentation.",
  },
];

export default function TermsPage() {
  return (
    <main className="vv-page">
      <div className="vv-container max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-veriverse-blue transition hover:text-veriverse-purple">
            <Logo size={24} dark={false} />
            <span className="text-base font-bold">eriVerse</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/register" className="vv-btn-secondary">
              Create account
            </Link>
          </div>
        </div>

        <div className="vv-card overflow-hidden">
          <div className="vv-hero mb-0 rounded-none border-0 border-b border-veriverse-border px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="vv-eyebrow mb-4">Legal</p>
                <h1 className="vv-title text-4xl sm:text-5xl">Terms of Service</h1>
              </div>
              <Link href="/privacy" className="rounded-full border border-veriverse-border bg-white/70 px-4 py-2 text-sm font-semibold text-veriverse-blue transition hover:bg-white">
                Privacy Policy
              </Link>
            </div>
            <p className="vv-subtitle mt-4 max-w-3xl">
              These Terms of Service govern your use of VeriVerse and set the expectations for trust, moderation, and community behavior.
            </p>
          </div>

          <div className="p-6 sm:p-8 md:p-10">
            <div className="space-y-6">
              {sections.map((section) => (
                <section key={section.title} className="rounded-[24px] border border-veriverse-border bg-white/65 p-5 sm:p-6 shadow-[0_12px_30px_rgba(20,32,51,0.04)]">
                  <h2 className="mb-3 text-xl font-bold text-veriverse-blue">{section.title}</h2>
                  <p className="text-[15px] leading-7 text-slate-700">{section.body}</p>
                </section>
              ))}
            </div>

            <div className="mt-8 rounded-[24px] border border-veriverse-border bg-veriverse-slate/70 p-5 text-sm leading-7 text-slate-700">
              Effective date: This policy is effective as of the date it is published in the application and may be updated over time.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
