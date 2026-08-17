export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="vv-card p-8 text-center">
      <p className="vv-eyebrow mx-auto mb-3">Nothing Here Yet</p>
      <h3 className="text-xl font-semibold text-veriverse-dark mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-500 mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
