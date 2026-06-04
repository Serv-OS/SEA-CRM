// Minimal CSV parser that handles quoted fields, escaped quotes ("") and
// commas/newlines inside quotes. Returns { headers: string[], rows: object[] }.
export function parseCSV(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  // Drop trailing empty rows
  const cleaned = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (cleaned.length === 0) return { headers: [], rows: [] };

  const headers = cleaned[0].map(h => h.trim());
  const objects = cleaned.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { headers, rows: objects };
}
