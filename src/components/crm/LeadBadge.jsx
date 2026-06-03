import { LEAD_STAGE_MAP } from '../../lib/leadStages';

// Consistent lead-status pill. Pass full to show the long label.
export default function LeadBadge({ stage, full = false, className = '' }) {
  const s = LEAD_STAGE_MAP[stage];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${s.badge} ${className}`}>
      {full ? s.label : s.short}
    </span>
  );
}
