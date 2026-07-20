import { statusClass } from '../utils/format.js';

export default function StatusBadge({ status }) {
  return (
    <span className={`status ${statusClass(status)}`}>
      <span className="dot" />
      {status}
    </span>
  );
}
