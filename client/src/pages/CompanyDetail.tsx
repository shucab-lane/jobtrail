import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, ApiError, type CompanyDetail as Company } from "../api";
import Field from "../components/Field";
import StatusBadge from "../components/StatusBadge";
import { formatDate } from "../format";

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function load() {
    try {
      const res = await api.get<{ data: Company }>(`/companies/${id}`);
      setCompany(res.data);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Company not found" : (err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function addContact(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/companies/${id}/contacts`, { name, email, title });
      setName("");
      setEmail("");
      setTitle("");
      setErrors({});
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
    }
  }

  async function removeContact(contactId: number) {
    await api.delete(`/companies/${id}/contacts/${contactId}`);
    await load();
  }

  async function handleDelete() {
    const count = company?.applications.length ?? 0;
    const message = count
      ? `Delete this company and its ${count} application(s)? This can't be undone.`
      : "Delete this company?";
    if (!confirm(message)) return;
    await api.delete(`/companies/${id}`);
    navigate("/companies");
  }

  if (error) {
    return (
      <div className="card empty">
        <p>{error}</p>
        <Link to="/companies">Back to companies</Link>
      </div>
    );
  }
  if (!company) return <div className="page-loading">Loading…</div>;

  return (
    <>
      <Link to="/companies" className="back-link">← Companies</Link>
      <header className="page-header">
        <div>
          <h1>{company.name}</h1>
          <p className="muted">
            {[company.location, company.website].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </div>
        <button className="button danger" onClick={handleDelete}>Delete</button>
      </header>

      <div className="detail-grid">
        <section className="card table-card">
          <h2 className="table-title">Applications</h2>
          {company.applications.length === 0 ? (
            <p className="muted empty">No applications to this company yet.</p>
          ) : (
            <table>
              <tbody>
                {company.applications.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/applications/${a.id}`} className="strong-link">{a.role_title}</Link></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{formatDate(a.applied_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2>Contacts</h2>
          {company.contacts.length > 0 && (
            <ul className="contact-list">
              {company.contacts.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    {c.title && <div className="muted small">{c.title}</div>}
                    {c.email && <a href={`mailto:${c.email}`} className="small">{c.email}</a>}
                  </div>
                  <button className="link-button danger-text" onClick={() => removeContact(c.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <form className="form" onSubmit={addContact} noValidate>
            <Field label="Name" error={errors.name}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" error={errors.email}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Title" error={errors.title}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Recruiter" />
            </Field>
            <button className="button secondary">Add contact</button>
          </form>
        </section>
      </div>
    </>
  );
}
