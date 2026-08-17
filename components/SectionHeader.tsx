export default function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div>
        <h2 className="vv-section-title">{title}</h2>
        {subtitle && <p className="vv-subtitle mt-1">{subtitle}</p>}
      </div>

      {actions && <div className="vv-action-row">{actions}</div>}
    </div>
  );
}