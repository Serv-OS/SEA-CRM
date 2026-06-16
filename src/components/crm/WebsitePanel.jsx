import { useState } from 'react';
import { Globe, PencilRuler, LayoutDashboard, ExternalLink, RefreshCw } from 'lucide-react';

// The Peninsula Siding marketing site (Next.js + Payload CMS). Editing lives in
// the site's own builder/admin (separate auth); this panel surfaces it inside the
// CRM and shows a live preview. Leads from the site's forms flow into Leads.
const SITE = 'https://psc-website-7ilb.vercel.app';

const CARDS = [
  { key: 'builder', label: 'Page Builder', href: `${SITE}/builder`, icon: PencilRuler,
    desc: 'Drag-and-drop editor for every marketing page — copy, images, layout.' },
  { key: 'admin', label: 'CMS / Admin', href: `${SITE}/admin`, icon: LayoutDashboard,
    desc: 'Payload admin: blog posts, gallery projects, media, menus & site settings.' },
  { key: 'live', label: 'Live site', href: SITE, icon: Globe,
    desc: 'Open the published website in a new tab.' },
];

export default function WebsitePanel() {
  const [nonce, setNonce] = useState(0); // bump to reload the preview iframe

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-bdr flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-xl font-bold text-paper">Website</div>
          <div className="text-xs text-muted mt-0.5">Edit the marketing site &amp; manage the leads it captures</div>
        </div>
        <a href={SITE} target="_blank" rel="noopener noreferrer" className="btn-glass px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5">
          Open live site <ExternalLink size={14} />
        </a>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1100px] space-y-5">
          {/* Quick links into the site's editing surfaces */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CARDS.map(({ key, label, href, icon: Icon, desc }) => (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer"
                className="glass-card rounded-2xl p-4 hover:border-ember transition-colors group">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={18} className="text-ember" />
                  <span className="text-sm font-bold text-paper">{label}</span>
                  <ExternalLink size={13} className="ml-auto text-dim group-hover:text-ember" />
                </div>
                <div className="text-xs text-muted leading-relaxed">{desc}</div>
              </a>
            ))}
          </div>

          {/* Lead capture status */}
          <div className="glass-card rounded-2xl p-4 border-l-2 border-emerald-300">
            <div className="text-sm font-bold text-paper mb-1">Lead capture</div>
            <div className="text-xs text-muted leading-relaxed">
              The site's contact form and instant-estimate studio feed straight into <span className="text-paper font-semibold">Leads</span> —
              each submission creates a lead (with contact, source and project details) at the <span className="text-paper font-semibold">New</span> stage,
              ready to work through the pipeline.
            </div>
          </div>

          {/* Live preview */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-bdr flex items-center gap-2">
              <h3 className="text-sm font-bold text-paper">Live preview</h3>
              <span className="text-[10px] text-dim">Read-only — edit via the Page Builder above</span>
              <button onClick={() => setNonce(n => n + 1)} className="ml-auto text-xs text-muted hover:text-paper flex items-center gap-1"><RefreshCw size={12} /> Reload</button>
            </div>
            <iframe
              key={nonce}
              src={SITE}
              title="Peninsula Siding website"
              className="w-full bg-white"
              style={{ height: '70vh', border: 0 }}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
            <div className="px-4 py-2 text-[10px] text-dim border-t border-bdr">
              If the preview doesn't load, the site may block embedding — use “Open live site”.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
