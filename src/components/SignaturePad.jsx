import { forwardRef, useImperativeHandle, useRef } from 'react';

// A drawn signature, shared by the client's agreement page and the CRM's
// countersign. The parent reads it with ref.current.toDataURL(), or null when
// nothing has been drawn.
const SignaturePad = forwardRef(function SignaturePad({ height = 150 }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasSig = useRef(false);

  const pos = (e) => { const c = canvasRef.current; const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext('2d'); const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const { x, y } = pos(e); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a1a1a'; ctx.lineTo(x, y); ctx.stroke(); hasSig.current = true; };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); hasSig.current = false; };

  useImperativeHandle(ref, () => ({ toDataURL: () => (hasSig.current ? canvasRef.current.toDataURL('image/png') : null), clear }));

  return (
    <div>
      <div className="border border-slate-300 rounded-lg bg-white">
        <canvas ref={canvasRef} width={620} height={height} className="w-full touch-none block"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      </div>
      <button type="button" onClick={clear} className="text-xs text-slate-400 mt-1 hover:text-slate-600">Clear signature</button>
    </div>
  );
});

export default SignaturePad;
