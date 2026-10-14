import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, STATUSES, type Stats } from "../api";
import { useAuth } from "../auth";
import { formatDateTime, statusLabels } from "../format";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<{ data: Stats }>("/stats")
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!stats) return <div className="page-loading">Loading…</div>;

  const count = (s: keyof Stats["byStatus"]) => stats.byStatus[s] ?? 0;
  const maxWeekly = Math.max(1, ...stats.weekly.map((w) => w.count));

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Hi, {user?.name.split(" ")[0]}</h1>
          <p className="muted">Here's how your search is going.</p>
        </div>
        <Link to="/applications/new" className="button">Add application</Link>
      </header>

      {stats.total === 0 ? (
        <div className="card empty">
          <h2>No applications yet</h2>
          <p className="muted">Add the first job you applied to and it will show up here.</p>
          <Link to="/applications/new" className="button">Add application</Link>
        </div>
      ) : (
        <>
          <section className="stat-grid">
            <div className="card stat">
              <span className="stat-label">Total tracked</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Active</span>
              <span className="stat-value">{count("applied") + count("interviewing")}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Interviewing</span>
              <span className="stat-value">{count("interviewing")}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Response rate</span>
              <span className="stat-value">{stats.responseRate}%</span>
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="card">
              <h2>Applications per week</h2>
              <div className="bar-chart">
                {stats.weekly.map((w) => (
                  <div key={w.week} className="bar-col" title={`Week of ${w.week}: ${w.count}`}>
                    <span className="bar-count">{w.count || ""}</span>
                    <div className="bar" style={{ height: `${(w.count / maxWeekly) * 100}%` }} />
                    <span className="bar-label">
                      {new Date(`${w.week}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h2>By status</h2>
              <ul className="status-list">
                {STATUSES.map((s) => (
                  <li key={s}>
                    <Link to={`/applications?status=${s}`}>
                      <span className={`dot dot-${s}`} />
                      {statusLabels[s]}
                    </Link>
                    <span className="status-count">{count(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card">
            <h2>Upcoming interviews</h2>
            {stats.upcomingInterviews.length === 0 ? (
              <p className="muted">Nothing scheduled.</p>
            ) : (
              <ul className="interview-list">
                {stats.upcomingInterviews.map((i) => (
                  <li key={i.id}>
                    <Link to={`/applications/${i.application_id}`}>
                      <strong>{i.company_name}</strong> · {i.role_title}
                    </Link>
                    <span className="muted">
                      {i.stage} · {formatDateTime(i.scheduled_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
