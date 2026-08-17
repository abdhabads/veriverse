import Navbar from "./Navbar";

export default function PageWrapper({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="vv-page">
      <Navbar />

      <div className="vv-container">
        {(title || subtitle) && (
          <div className="vv-hero">
            <div className="max-w-3xl">
              <p className="vv-eyebrow mb-3">Operational View</p>
              {title && <h1 className="vv-title">{title}</h1>}
              {subtitle && <p className="vv-subtitle mt-3 max-w-2xl">{subtitle}</p>}
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
