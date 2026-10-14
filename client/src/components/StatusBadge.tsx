import type { Status } from "../api";
import { statusLabels } from "../format";

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{statusLabels[status]}</span>;
}
