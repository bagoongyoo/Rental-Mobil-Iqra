export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
