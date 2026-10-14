import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, STATUSES, type ApplicationSummary, type Paginated } from "../api";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatSalary, statusLabels } from "../format";

export default function Applications() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "newest";
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";

  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<Paginated<ApplicationSummary> | null>(null);
  const [error, setError] = useState("");

  function setParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true }
    );
  }

  // Wait until the user stops typing before hitting the API
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => setParam("q", search), 300);
    return () => clearTimeout(timer);
  }, [search, q]);

  useEffect(() => {
    const query = new URLSearchParams({ sort, page: String(page), limit: "15" });
    if (status) query.set("status", status);
    if (q) query.set("q", q);

    let cancelled = false;
    api
      .get<Paginated<ApplicationSummary>>(`/applications?${query}`)
      .then((res) => !cancelled && setResult(res))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, sort, page, q]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Applications</h1>
          {result && <p className="muted">{result.total} total</p>}
        </div>
        <Link to="/applications/new" className="button">Add application</Link>
      </header>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search role or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabels[s]}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setParam("sort", e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="company">Company A–Z</option>
          <option value="updated">Recently updated</option>
        </select>
      </div>

      {error && <div className="alert">{error}</div>}

      {result && result.data.length === 0 ? (
        <div className="card empty">
          <p className="muted">No applications match these filters.</p>
        </div>
      ) : (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Salary</th>
              </tr>
            </thead>
            <tbody>
              {result?.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/companies/${a.company_id}`}>{a.company_name}</Link>
                  </td>
                  <td>
                    <Link to={`/applications/${a.id}`} className="strong-link">{a.role_title}</Link>
                  </td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{formatDate(a.applied_on)}</td>
                  <td>{formatSalary(a.salary_min, a.salary_max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.totalPages > 1 && (
        <div className="pagination">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
          >
            Previous
          </button>
          <span className="muted">Page {page} of {result.totalPages}</span>
          <button
            className="button secondary"
            disabled={page >= result.totalPages}
            onClick={() => setParam("page", String(page + 1))}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
