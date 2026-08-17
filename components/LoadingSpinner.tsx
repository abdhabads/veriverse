export default function LoadingSpinner({
  label = "Loading...",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="w-10 h-10 border-4 border-white/70 border-t-veriverse-purple rounded-full animate-spin mb-3 shadow-sm" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
