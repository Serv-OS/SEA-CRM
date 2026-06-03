import LeadBadge from './LeadBadge.jsx';

// Lists the lead(s) linked to a company/location/contact record.
export default function LeadsCard({ leads = [] }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bdr flex items-center gap-2">
        <h3 className="text-sm font-bold text-paper">Leads</h3>
        <span className="text-xs text-dim font-mono">({leads.length})</span>
      </div>
      <div className="p-4 space-y-2">
        {leads.length === 0 ? (
          <div className="text-xs text-dim italic">No leads linked</div>
        ) : (
          leads.map(l => (
            <div key={l.id} className="flex items-center gap-2 p-2 glass-inner rounded-xl">
              <LeadBadge stage={l.stage} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-paper truncate">{l.name}</div>
                {l.source && <div className="text-[10px] text-dim">{String(l.source).replace(/_/g, ' ')}</div>}
              </div>
              {l.priority && (
                <span className="text-[9px] text-dim uppercase">{l.priority}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
