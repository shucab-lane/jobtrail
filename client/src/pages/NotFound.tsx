import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="card empty">
      <h2>Page not found</h2>
      <Link to="/dashboard">Go to dashboard</Link>
    </div>
  );
}
