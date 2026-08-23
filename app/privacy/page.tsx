import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy — VeriVerse",
  description: "Read the VeriVerse Privacy Policy and how your information is handled.",
};

const sections = [
  {
    title: "1. Information we collect",
    body:
      "We collect the information you provide when creating an account, including your username, email address, profile details, and password hash. We may also collect information about your activity on the platform, such as posts, votes, moderation actions, reputation changes, and security logs necessary to keep the service operating safely.",
  },
  {
    title: "2. How we use your information",
    body:
      "We use your information to create and maintain your account, support trust and moderation systems, personalize your experience, prevent abuse, and improve platform reliability. Your public profile, activity, and contributions may be visible to other users as part of the social product experience.",
  },
  {
    title: "3. Data sharing",
    body:
      "We do not sell personal data. We may share information with service providers who support hosting, security, analytics, moderation, or infrastructure operations, when necessary to run VeriVerse. We may also disclose data where required by law or to protect against fraud, abuse, or serious harm to users or the platform.",
  },
  {
    title: "4. Content and public profile",
    body:
      "Posts, replies, votes, username, profile details, and reputation information may be displayed publicly within the platform. If you choose to share information in a public context, it may be accessed by the broader VeriVerse community and by moderators or administrators charged with maintaining community safety.",
  },
  {
    title: "5. Security and retention",
    body:
      "We use reasonable administrative, technical, and organizational safeguards to protect account information and platform data. We retain account and moderation history only as long as needed for product operation, legal compliance, safety, and dispute resolution, unless a longer retention period is required.",
  },
  {
    title: "6. Your choices",
    body:
      "You may update your profile information and manage your account settings within the app. If you want to delete or deactivate certain account data, use the account-management tools available in the product. We may retain some information as required for legal, security, or moderation reasons.",
  },
  {
    title: "7. Cookies and device data",
    body:
      "VeriVerse may use essential cookies or local session data to keep the product secure and operational. We may also collect basic technical information such as browser type, device details, and activity logs to troubleshoot errors, reduce abuse, and improve service quality.",
  },
  {
    title: "8. Changes to this policy",
    body:
      "We may update this Privacy Policy as product features, moderation needs, and legal obligations change. If the changes are material, we will notify users through the app or in the relevant communication channels before they take effect.",
  },
];

export default function PrivacyPolicyPage() {
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
                <p className="vv-eyebrow mb-4">Privacy</p>
                <h1 className="vv-title text-4xl sm:text-5xl">Privacy Policy</h1>
              </div>
              <Link href="/terms" className="rounded-full border border-veriverse-border bg-white/70 px-4 py-2 text-sm font-semibold text-veriverse-blue transition hover:bg-white">
                Terms of Service
              </Link>
            </div>
            <p className="vv-subtitle mt-4 max-w-3xl">
              This Privacy Policy explains what information VeriVerse collects, how it is used, and the choices available to you while using the platform.
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
                Contact: For support, you can contact <a href="mailto:admin@veriverse.io" className="font-semibold text-veriverse-blue underline underline-offset-2">admin@veriverse.io</a>.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
