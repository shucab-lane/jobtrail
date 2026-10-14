import type { ReactNode } from "react";

type Props = {
  label: string;
  error?: string;
  children: ReactNode;
};

export default function Field({ label, error, children }: Props) {
  return (
    <label className={`field${error ? " has-error" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{label} {error}</span>}
    </label>
  );
}
