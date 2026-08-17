"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { runExport } from "@/lib/adminClient";
import { runMutation } from "@/lib/runMutation";

const exportOptions = [
  { key: "users", title: "Users", description: "User accounts and moderation state." },
  { key: "posts", title: "Posts", description: "Published posts and trust metadata." },
  { key: "reports", title: "Reports", description: "User reports and moderation submissions." },
  { key: "appeals", title: "Appeals", description: "Appeal records and outcomes." },
  { key: "audit", title: "Audit Logs", description: "Admin and expert action history." },
  { key: "rewards", title: "Reward Logs", description: "Reward point history." },
  { key: "reputation", title: "Reputation Logs", description: "Reputation change history." },
  { key: "trust-summary", title: "Trust Summary", description: "High-level trust and integrity snapshot." },
];

export default function AdminExportPage() {
  const router = useRouter();
  const {
    message,
    messageType,
    showError,
    showSuccess,
  } = usePageState();

  const [exportingKey, setExportingKey] = useState("");

  const noopLoad = useCallback(async () => {}, []);
  useProtectedRolePage("admin", noopLoad);

  async function exportData(type: string, format: "json" | "csv") {
    const exportKey = `${type}:${format}`;
    setExportingKey(exportKey);

    await runMutation({
      action: () => runExport(type, format),
      onSuccess: async ({ blob, filename }) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);

        showSuccess(`${type} ${format.toUpperCase()} export downloaded.`);
      },
      onError: showError,
      onFinally: () => setExportingKey(""),
    });
  }

  return (
    <PageWrapper
      title="Admin Export Tools"
      subtitle="Download data for audits, reporting, and governance."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={() => router.push("/admin/analytics")} className="vv-btn-secondary">
          Analytics
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {exportOptions.map((item) => (
          <div key={item.key} className="vv-card p-5">
            <h2 className="vv-section-title mb-2">{item.title}</h2>
            <p className="mb-4 text-sm text-slate-600">{item.description}</p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => exportData(item.key, "json")}
                disabled={exportingKey === `${item.key}:json`}
                aria-busy={exportingKey === `${item.key}:json`}
                className="vv-btn-primary"
              >
                {exportingKey === `${item.key}:json` ? "Exporting..." : "Export JSON"}
              </button>

              <button
                onClick={() => exportData(item.key, "csv")}
                disabled={exportingKey === `${item.key}:csv`}
                aria-busy={exportingKey === `${item.key}:csv`}
                className="vv-btn-secondary"
              >
                {exportingKey === `${item.key}:csv` ? "Exporting..." : "Export CSV"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}