import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, ApiError, STATUSES, type Application, type Interview, type Status } from "../api";
import ApplicationForm, { toPayload } from "../components/ApplicationForm";
import Field from "../components/Field";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatDateTime, formatSalary, statusLabels, toLocalInputValue } from "../format";

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ data: Application }>(`/applications/${id}`);
      setApp(res.data);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Application not found" : (err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function changeStatus(status: Status) {
    await api.patch(`/applications/${id}`, { status });
    await load();
  }

  async function handleDelete() {
    if (!confirm("Delete this application? This can't be undone.")) return;
    await api.delete(`/applications/${id}`);
    navigate("/applications");
  }

  if (error) {
    return (
      <div className="card empty">
        <p>{error}</p>
        <Link to="/applications">Back to applications</Link>
      </div>
    );
  }
  if (!app) return <div className="page-loading">Loading…</div>;

  if (editing) {
    return (
      <>
        <header className="page-header">
          <h1>Edit application</h1>
        </header>
        <div className="card">
          <ApplicationForm
            showCompany={false}
            submitLabel="Save changes"
            initial={{
              company_name: app.company_name,
              role_title: app.role_title,
              status: app.status,
              job_url: app.job_url ?? "",
              salary_min: app.salary_min?.toString() ?? "",
              salary_max: app.salary_max?.toString() ?? "",
              applied_on: app.applied_on ?? "",
              notes: app.notes ?? "",
            }}
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await api.patch(`/applications/${id}`, toPayload(values));
              await load();
              setEditing(false);
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Link to="/applications" className="back-link">← Applications</Link>
      <header className="page-header">
        <div>
          <h1>{app.role_title}</h1>
          <p className="muted">
            <Link to={`/companies/${app.company_id}`}>{app.company_name}</Link>
          </p>
        </div>
        <div className="header-actions">
          <select
            aria-label="Status"
            value={app.status}
            onChange={(e) => changeStatus(e.target.value as Status)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
          <button className="button secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="button danger" onClick={handleDelete}>Delete</button>
        </div>
      </header>

      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <dl className="details">
              <div><dt>Status</dt><dd><StatusBadge status={app.status} /></dd></div>
              <div><dt>Applied</dt><dd>{formatDate(app.applied_on)}</dd></div>
              <div><dt>Salary</dt><dd>{formatSalary(app.salary_min, app.salary_max)}</dd></div>
              <div>
                <dt>Posting</dt>
                <dd>
                  {app.job_url ? (
                    <a href={app.job_url} target="_blank" rel="noreferrer">View posting</a>
                  ) : "—"}
                </dd>
              </div>
            </dl>
            {app.notes && (
              <>
                <h3>Notes</h3>
                <p className="notes">{app.notes}</p>
              </>
            )}
          </section>

          <Interviews applicationId={app.id} interviews={app.interviews} onChange={load} />
        </div>

        <section className="card">
          <h2>Timeline</h2>
          <ol className="timeline">
            {app.history.map((h) => (
              <li key={h.id}>
                <span className={`dot dot-${h.to_status}`} />
                <div>
                  <div>
                    {h.from_status
                      ? `${statusLabels[h.from_status]} → ${statusLabels[h.to_status]}`
                      : `Added as ${statusLabels[h.to_status]}`}
                  </div>
                  <div className="muted small">{formatDateTime(h.changed_at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

type InterviewsProps = {
  applicationId: number;
  interviews: Interview[];
  onChange: () => Promise<void>;
};

function Interviews({ applicationId, interviews, onChange }: InterviewsProps) {
  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(new Date().toISOString()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const base = `/applications/${applicationId}/interviews`;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(base, {
        stage,
        // datetime-local has no timezone, so convert from the browser's local time
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : "",
      });
      setStage("");
      setErrors({});
      setAdding(false);
      await onChange();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
    }
  }

  async function setOutcome(interviewId: number, outcome: string) {
    await api.patch(`${base}/${interviewId}`, { outcome });
    await onChange();
  }

  async function remove(interviewId: number) {
    if (!confirm("Remove this interview?")) return;
    await api.delete(`${base}/${interviewId}`);
    await onChange();
  }

  return (
    <section className="card">
      <div className="section-header">
        <h2>Interviews</h2>
        {!adding && (
          <button className="button secondary small" onClick={() => setAdding(true)}>Add interview</button>
        )}
      </div>

      {adding && (
        <form className="inline-form" onSubmit={handleAdd} noValidate>
          <Field label="Stage" error={errors.stage}>
            <input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="e.g. Phone screen" autoFocus />
          </Field>
          <Field label="Date and time" error={errors.scheduled_at}>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </Field>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button className="button">Add</button>
          </div>
        </form>
      )}

      {interviews.length === 0 && !adding ? (
        <p className="muted">No interviews yet.</p>
      ) : (
        <ul className="interview-list">
          {interviews.map((i) => (
            <li key={i.id}>
              <div>
                <strong>{i.stage}</strong>
                <div className="muted small">{formatDateTime(i.scheduled_at)}</div>
              </div>
              <div className="row">
                <select
                  aria-label="Outcome"
                  value={i.outcome}
                  onChange={(e) => setOutcome(i.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Didn't pass</option>
                </select>
                <button className="link-button danger-text" onClick={() => remove(i.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
