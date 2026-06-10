import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Cpu } from 'lucide-react';

// Hardware deployed at a customer (company or specific location), fed by the
// inventory module. Renders nothing when no kit is deployed there.
export default function HardwareCard({ companyId, locationId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    (async () => {
      let q = supabase.from('inv_serials').select('serial, product_name, category, condition, deployed_at, status, location:locations(name)')
        .in('status', ['deployed', 'servicing']);
      if (locationId) q = q.eq('location_id', locationId);
      else if (companyId) q = q.eq('company_id', companyId);
      else { setRows([]); return; }
      const { data } = await q.order('deployed_at', { ascending: false });
      setRows(data || []);
    })();
  }, [companyId, locationId]);

  if (!rows || rows.length === 0) return null;

  // group by product
  const groups = {};
  rows.forEach(r => { (groups[r.product_name] = groups[r.product_name] || []).push(r); });

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bdr flex items-center gap-2">
        <Cpu size={15} className="text-ember" />
        <h3 className="text-sm font-bold text-paper">Hardware on site</h3>
        <span className="text-xs text-dim font-mono">({rows.length})</span>
      </div>
      <div className="p-4 space-y-3">
        {Object.entries(groups).map(([product, units]) => (
          <div key={product}>
            <div className="text-sm text-paper font-medium mb-1">{product} <span className="text-dim font-normal">× {units.length}</span></div>
            <div className="flex flex-wrap gap-1">
              {units.map(u => (
                <span key={u.serial} title={`${u.deployed_at ? 'Deployed ' + new Date(u.deployed_at).toLocaleDateString('en-GB') : ''}${!locationId && u.location?.name ? ' · ' + u.location.name : ''}`}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${u.status === 'servicing' ? 'bg-orange-100 text-orange-700' : 'bg-card text-muted'}`}>
                  {u.serial}{u.status === 'servicing' ? ' · servicing' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
