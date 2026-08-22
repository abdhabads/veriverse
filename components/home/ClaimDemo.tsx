"use client";

import { useEffect, useState } from "react";

export default function ClaimDemo() {
  const [showRisk, setShowRisk] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowRisk(true), 300);
    const t2 = setTimeout(() => setShowEvidence(true), 950);
    const t3 = setTimeout(() => setShowNote(true), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div
      className="mx-auto max-w-xl rounded-2xl border p-7 text-left"
      style={{ background: "#16233A", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <span
        className="mb-3 block text-[10.5px] font-semibold uppercase tracking-wider"
        style={{ color: "#8A93A6" }}
      >
        Submitted claim
      </span>

      <p
        className="mb-6 text-lg italic leading-relaxed text-white sm:text-xl"
        style={{ fontFamily: "Georgia, serif" }}
      >
        &quot;Daily consumption of raw garlic may produce meaningful improvements in
        glycaemic markers in Type 2 diabetes patients, potentially reducing insulin
        dependency.&quot;
      </p>

      <div className="flex flex-wrap gap-3">
        <VerdictBadge
          show={showRisk}
          label="AI risk"
          value="Low"
          background="rgba(140,150,165,0.14)"
          color="#C4CAD6"
          borderColor="rgba(140,150,165,0.25)"
        />
        <VerdictBadge
          show={showEvidence}
          label="Evidence"
          value="Contradicted"
          background="rgba(193,68,60,0.14)"
          color="#E8918A"
          borderColor="rgba(193,68,60,0.35)"
        />
      </div>

      <p
        className={`mt-4 text-[11px] leading-relaxed transition-opacity duration-500 ${
          showNote ? "opacity-100" : "opacity-0"
        }`}
        style={{ color: "#8A93A6" }}
      >
        This claim reads as calm and clinical —{" "}
        <strong style={{ color: "#E8918A", fontWeight: 600 }}>
          it passes as low risk.
        </strong>{" "}
        Retrieved sources contradict it anyway. That gap is where dangerous claims
        usually hide.
      </p>
    </div>
  );
}

function VerdictBadge({
  show,
  label,
  value,
  background,
  color,
  borderColor,
}: {
  show: boolean;
  label: string;
  value: string;
  background: string;
  color: string;
  borderColor: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-all duration-500 ${
        show ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
      }`}
      style={{ background, color, borderColor }}
    >
      <span className="text-[9.5px] opacity-75 tracking-widest">{label}</span>
      {value}
    </span>
  );
}
