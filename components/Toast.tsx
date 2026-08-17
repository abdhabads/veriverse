export default function Toast({
  message,
  type = "info",
}: {
  message: string;
  type?: "success" | "error" | "info";
}) {
  const color =
    type === "success"
      ? "border border-emerald-500/15 bg-emerald-500/10 text-emerald-800"
      : type === "error"
      ? "border border-red-500/15 bg-red-500/10 text-red-800"
      : "border border-slate-700/10 bg-white/70 text-slate-700";

  return (
    <div className={`rounded-2xl px-4 py-3 text-sm shadow-sm backdrop-blur-md ${color}`}>
      {message}
    </div>
  );
}
