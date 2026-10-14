import { useState, type FormEvent } from "react";
import { ApiError, STATUSES, type Status } from "../api";
import { statusLabels, toLocalInputValue } from "../format";
import Field from "./Field";

export type ApplicationFormValues = {
  company_name: string;
  role_title: string;
  status: Status;
  job_url: string;
  salary_min: string;
  salary_max: string;
  applied_on: string;
  notes: string;
};

type Props = {
  initial: ApplicationFormValues;
  submitLabel: string;
  showCompany?: boolean;
  onSubmit: (values: ApplicationFormValues) => Promise<void>;
  onCancel: () => void;
};

export function emptyApplication(): ApplicationFormValues {
  return {
    company_name: "",
    role_title: "",
    status: "applied",
    job_url: "",
    salary_min: "",
    salary_max: "",
    applied_on: toLocalInputValue(new Date().toISOString()).slice(0, 10),
    notes: "",
  };
}

// Empty inputs become null so the API clears the field instead of failing validation
export function toPayload(values: ApplicationFormValues) {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    role_title: values.role_title,
    status: values.status,
    job_url: orNull(values.job_url),
    salary_min: orNull(values.salary_min),
    salary_max: orNull(values.salary_max),
    applied_on: orNull(values.applied_on),
    notes: orNull(values.notes),
  };
}

export default function ApplicationForm({ initial, submitLabel, showCompany = true, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      else setFormError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert">{formError}</div>}

      <div className="form-grid">
        {showCompany && (
          <Field label="Company" error={errors.company_name}>
            <input
              value={values.company_name}
              onChange={(e) => update("company_name", e.target.value)}
              placeholder="e.g. Shopify"
              autoFocus
            />
          </Field>
        )}
        <Field label="Role" error={errors.role_title}>
          <input
            value={values.role_title}
            onChange={(e) => update("role_title", e.target.value)}
            placeholder="e.g. Junior Developer"
          />
        </Field>
        <Field label="Status" error={errors.status}>
          <select value={values.status} onChange={(e) => update("status", e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Date applied" error={errors.applied_on}>
          <input type="date" value={values.applied_on} onChange={(e) => update("applied_on", e.target.value)} />
        </Field>
        <Field label="Salary min" error={errors.salary_min}>
          <input
            type="number"
            min={0}
            step={1000}
            value={values.salary_min}
            onChange={(e) => update("salary_min", e.target.value)}
          />
        </Field>
        <Field label="Salary max" error={errors.salary_max}>
          <input
            type="number"
            min={0}
            step={1000}
            value={values.salary_max}
            onChange={(e) => update("salary_max", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Job posting URL" error={errors.job_url}>
        <input
          type="url"
          value={values.job_url}
          onChange={(e) => update("job_url", e.target.value)}
          placeholder="https://"
        />
      </Field>
      <Field label="Notes" error={errors.notes}>
        <textarea rows={4} value={values.notes} onChange={(e) => update("notes", e.target.value)} />
      </Field>

      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
