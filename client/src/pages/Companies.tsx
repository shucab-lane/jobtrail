import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, ApiError, type Company } from "../api";
import Field from "../components/Field";

export default function Companies() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  async function load() {
    const res = await api.get<{ data: Company[] }>("/companies");
    setCompanies(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError("");
    try {
      await api.post("/companies", { name, website, location });
      setName("");
      setWebsite("");
      setLocation("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      else if (err instanceof ApiError && err.status === 409) setFormError("You already have a company with that name.");
      else setFormError((err as Error).message);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Companies</h1>
          <p className="muted">Everywhere you've applied or want to.</p>
        </div>
      </header>

      <div className="detail-grid">
        <div className="card table-card">
          {companies === null ? (
            <div className="page-loading">Loading…</div>
          ) : companies.length === 0 ? (
            <p className="muted empty">No companies yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th className="num">Applications</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/companies/${c.id}`} className="strong-link">{c.name}</Link></td>
                    <td>{c.location ?? "—"}</td>
                    <td className="num">{c.application_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form className="card form" onSubmit={handleAdd} noValidate>
          <h2>Add company</h2>
          {formError && <div className="alert">{formError}</div>}
          <Field label="Name" error={errors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Website" error={errors.website}>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Location" error={errors.location}>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Toronto or Remote" />
          </Field>
          <button className="button">Add company</button>
        </form>
      </div>
    </>
  );
}
