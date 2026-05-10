import { useState, useMemo } from “react”;

const BG      = “#F7F4EF”;
const PANEL   = “#FFFFFF”;
const BORDER  = “#D6CEBF”;
const INK     = “#1A1410”;
const INK2    = “#4A3F30”;
const INK3    = “#8A7A64”;
const ACCENT  = “#C0390F”;
const WARN    = “#A05800”;
const SUCCESS = “#1E7A32”;
const BLUE    = “#1A5FA8”;
const RING_COLORS = [”#1A5FA8”,”#C05A10”,”#267A3A”,”#7A1A8A”,”#8A6A10”,”#10607A”];

function fmtFt(v) {
if (!isFinite(v)) return “—”;
const sign = v < 0 ? “−” : “”;
const abs = Math.abs(v);
const tot = Math.round(abs * 12);
const ft = Math.floor(tot / 12), inch = tot % 12;
if (ft === 0) return `${sign}${inch}"`;
if (inch === 0) return `${sign}${ft}'`;
return `${sign}${ft}' ${inch}"`;
}
function fmtIn(v) { if (!isFinite(v)) return “—”; return `${(v * 12).toFixed(1)}"`; }

function catenarySag(L, D) {
// Solve 2c·sinh(D/2c) = L for catenary parameter c using bisection.
// Returns sag = depth of lowest point below the two (level) endpoints.
if (D < 1e-6) return { sag: 0, taut: true, c: 0 };
if (L <= D + 1e-6) return { sag: 0, taut: true, c: D * 1e6 };
const f = c => {
const x = D / (2 * c);
return x > 300 ? c * Math.exp(x) - L : 2 * c * Math.sinh(x) - L;
};
// Bracket: f→+∞ as c→0, f→(D−L)<0 as c→∞
let lo = 1e-9, hi = D;
while (f(hi) > 0) hi *= 2;
for (let i = 0; i < 100; i++) {
const mid = (lo + hi) / 2;
f(mid) > 0 ? (lo = mid) : (hi = mid);
if (hi - lo < 1e-10) break;
}
const c = (lo + hi) / 2;
const sag = c * (Math.cosh(D / (2 * c)) - 1);
return { sag: Math.max(0, sag), taut: false, c };
}

// Build a catenary SVG path from real-world foot coordinates.
// rx1,ry1 = canopy exit (ft from ceiling); rx2,ry2 = socket top (ft from ceiling).
// sX/sY convert real-world feet to SVG pixels.
function catenaryPathFt(rx1, ry1, rx2, ry2, L, sX, sY, steps = 100) {
const Dx = rx2 - rx1;   // horizontal span (ft), signed
const Dy = ry2 - ry1;   // vertical drop (ft), positive = downward in ceiling-relative coords
const D  = Math.abs(Dx);

const svgStart = `M${sX(rx1).toFixed(1)},${sY(ry1).toFixed(1)}`;
const svgEnd   = `L${sX(rx2).toFixed(1)},${sY(ry2).toFixed(1)}`;
if (D < 1e-4) return `${svgStart} ${svgEnd}`;

const { sag, taut, c: cp } = catenarySag(L, D);
if (taut) return `${svgStart} ${svgEnd}`;

// Catenary sag is computed over the horizontal span.
// The chord tilts from ry1 to ry2; we add catenary sag perpendicular-ish to it
// by offsetting each point below the chord by the catenary sag amount at that x.
const pts = Array.from({ length: steps + 1 }, (_, i) => {
const t   = i / steps;
const rx  = rx1 + t * Dx;                               // real x (ft from center)
const lx  = t * D - D / 2;                              // local x for catenary, centred
// sagT = 0 at endpoints, = sag at midpoint (downward, positive = toward floor)
const sagT = cp * (Math.cosh(D / (2 * cp)) - Math.cosh(lx / cp));
const ry  = ry1 + t * Dy + sagT;                        // chord y + sag (downward)
return `${sX(rx).toFixed(1)},${sY(ry).toFixed(1)}`;
});
return `M${pts[0]} ` + pts.slice(1).map(p => `L${p}`).join(” “);
}

// Build a subdivided catenary SVG path by splitting [rx1,ry1]→[rx2,ry2] into N equal segments.
// Each segment receives totalL/N of cord; intermediate endpoints are ceiling attachment nodes.
function subdivCatenaryPath(rx1, ry1, rx2, ry2, totalL, sX, sY, N = 1) {
const n = Math.max(1, Math.round(N));
const segL = totalL / n;
return Array.from({ length: n }, (_, k) => {
const t0 = k / n, t1 = (k + 1) / n;
return catenaryPathFt(
rx1 + t0 * (rx2 - rx1), ry1 + t0 * (ry2 - ry1),
rx1 + t1 * (rx2 - rx1), ry1 + t1 * (ry2 - ry1),
segL, sX, sY
);
}).join(" ");
}

let _id = 0;
function makeRing(o = {}) {
return { id: ++_id, count: 6, radius: 2, drop: 1.5, socketH: 0.5, segments: 1, …o };
}

function deriveRing(ring, ceilingH, cordLength, bulbH) {
const { radius, drop, socketH, segments = 1 } = ring;
const fixtureH = socketH + bulbH;
// The single cord runs from the ceiling hub, arcs out to the ring radius, then
// drops straight down by `drop` to the socket top.
// Arc cord available = cordLength - drop (the drop uses that much of the cord).
// With `segments` divisions, each sub-span is radius/N wide with arcCord/N of cord.
// Sag per segment = catenarySag(arcCord/N, radius/N) — scales down by N vs. undivided.
const arcCord  = cordLength - drop;
const segSpan  = radius / segments;
const segCord  = arcCord / segments;
const taut     = arcCord <= radius + 1e-4;
const availSeg = Math.max(segCord, segSpan + 1e-4);
const { sag }  = taut ? { sag: 0 } : catenarySag(availSeg, segSpan);
const socketBotFromFloor = ceilingH - (drop + fixtureH);
const availLen = Math.max(arcCord, radius + 1e-4);
return {
socketBotFromFloor,
socketBotFromCeil: drop + fixtureH,
fixtureH,
arcCord,
slack: Math.max(0, arcCord - radius),   // total spare arc cord (undivided)
taut,
sag,                                    // per-segment sag = worst-case sag depth
sagLowestFromFloor: ceilingH - sag,
availLen,
segSpan,
};
}

const mono = { fontFamily: “‘Courier New’, Courier, monospace” };
const sans = { fontFamily: “system-ui, -apple-system, sans-serif” };

function SectionHead({ title }) {
return (
<div style={{ fontSize: 11, fontWeight: 700, color: INK3, letterSpacing: 2, textTransform: “uppercase”,
marginBottom: 10, marginTop: 4, borderBottom: `1px solid ${BORDER}`, paddingBottom: 5, …sans }}>
{title}
</div>
);
}

function SliderField({ label, value, setValue, min, max, step, fmt, sub }) {
return (
<div style={{ marginBottom: 12 }}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “baseline”, marginBottom: 2 }}>
<span style={{ fontSize: 13, color: INK2, fontWeight: 600, …sans }}>{label}</span>
<span style={{ fontSize: 16, color: INK, fontWeight: 700, …mono }}>{fmt ? fmt(value) : value}</span>
</div>
{sub && <div style={{ fontSize: 11, color: INK3, marginBottom: 3, …sans }}>{sub}</div>}
<input type=“range” min={min} max={max} step={step} value={value}
onChange={e => setValue(parseFloat(e.target.value))}
style={{ width: “100%”, accentColor: BLUE, cursor: “pointer” }} />
</div>
);
}

function Stepper({ value, onChange, min = 1, max = 48 }) {
const Btn = ({ delta }) => {
const disabled = delta > 0 ? value >= max : value <= min;
return (
<button onClick={() => !disabled && onChange(Math.min(max, Math.max(min, value + delta)))}
style={{ width: 30, height: 30, border: `1.5px solid ${BORDER}`, borderRadius: 4,
background: disabled ? “#F0EBE2” : PANEL, color: disabled ? INK3 : INK,
fontSize: 18, fontWeight: 700, cursor: disabled ? “default” : “pointer”,
display: “flex”, alignItems: “center”, justifyContent: “center”, …sans }}>
{delta > 0 ? “+” : “−”}
</button>
);
};
return (
<div style={{ display: “flex”, alignItems: “center”, gap: 8 }}>
<Btn delta={-1} /><span style={{ fontSize: 22, fontWeight: 800, color: INK, minWidth: 36, textAlign: “center”, …mono }}>{value}</span><Btn delta={1} />
</div>
);
}

function StatCard({ label, value, note, warn, warnAmber }) {
const clr = warn ? ACCENT : warnAmber ? WARN : SUCCESS;
return (
<div style={{ background: warn ? “#FEF0EC” : warnAmber ? “#FFF8EC” : “#F0F7F1”, border: `2px solid ${clr}`, borderRadius: 6, padding: “10px 14px” }}>
<div style={{ fontSize: 11, fontWeight: 700, color: clr, letterSpacing: 1, …sans }}>{label}</div>
<div style={{ fontSize: 20, fontWeight: 800, color: clr, …mono, marginTop: 2 }}>{value}</div>
{note && <div style={{ fontSize: 11, color: clr, fontWeight: 600, …sans }}>{note}</div>}
</div>
);
}

function ClearancePill({ value, warn }) {
return (
<span style={{ display: “inline-block”, padding: “3px 10px”, borderRadius: 4,
background: warn ? “#FEF0EC” : “#EBF5ED”, border: `1.5px solid ${warn ? ACCENT : SUCCESS}`,
fontSize: 14, fontWeight: 800, color: warn ? ACCENT : SUCCESS, …mono }}>
{fmtFt(value)}
</span>
);
}

function RingEditor({ ring, idx, color, derived, onUpdate, onRemove, ceilingH }) {
const set = (key) => (val) => onUpdate(ring.id, { [key]: val });
const socketWarn = derived.socketBotFromFloor < 7;
const sagWarn    = !derived.taut && derived.sagLowestFromFloor < 7;
const cordWarn   = derived.taut || derived.slack < 0.01;
const maxDrop    = Math.max(0.25, ceilingH - 0.25);
return (
<div style={{ background: PANEL, border: `2px solid ${color}`, borderRadius: 8, marginBottom: 12, overflow: “hidden” }}>
<div style={{ background: color, padding: “8px 14px”, display: “flex”, alignItems: “center”, gap: 10, flexWrap: “wrap” }}>
<span style={{ fontSize: 15, fontWeight: 800, color: “#fff”, …sans, letterSpacing: 1 }}>RING {idx + 1}</span>
<span style={{ fontSize: 12, color: “rgba(255,255,255,0.75)”, …sans }}>r = {fmtFt(ring.radius)} · ↓ {fmtFt(ring.drop)}{(ring.segments ?? 1) > 1 ? ` · ${ring.segments} seg` : “”}</span>
<div style={{ marginLeft: “auto”, display: “flex”, gap: 8, alignItems: “center”, flexWrap: “wrap” }}>
<span style={{ fontSize: 11, color: “rgba(255,255,255,0.8)”, …sans }}>socket clr</span>
<ClearancePill value={derived.socketBotFromFloor} warn={socketWarn} />
<span style={{ fontSize: 11, color: “rgba(255,255,255,0.8)”, …sans }}>cord sag clr</span>
<ClearancePill value={derived.sagLowestFromFloor} warn={sagWarn} />
{cordWarn && <span style={{ fontSize: 12, fontWeight: 700, color: “#FFD0C0”, …sans }}>⚠ TAUT</span>}
</div>
<button onClick={() => onRemove(ring.id)} style={{ background: “rgba(255,255,255,0.2)”, border: “1.5px solid rgba(255,255,255,0.5)”,
color: “#fff”, borderRadius: 4, cursor: “pointer”, fontSize: 13, fontWeight: 700, padding: “2px 9px”, marginLeft: 8, …sans }}>✕</button>
</div>
<div style={{ padding: “12px 16px” }}>
<div style={{ display: “grid”, gridTemplateColumns: “auto auto 1fr”, gap: “0 24px”, alignItems: “start” }}>
<div>
<div style={{ fontSize: 13, color: INK2, fontWeight: 600, marginBottom: 6, …sans }}>Sockets in ring</div>
<Stepper value={ring.count} onChange={val => onUpdate(ring.id, { count: val })} />
</div>
<div>
<div style={{ fontSize: 13, color: INK2, fontWeight: 600, marginBottom: 6, …sans }}>Cord segments</div>
<Stepper value={ring.segments ?? 1} onChange={val => onUpdate(ring.id, { segments: val })} min={1} max={8} />
</div>
<div>
<SliderField label=”Radius” value={ring.radius} setValue={set(“radius”)} min={0.5} max={12} step={0.5} fmt={fmtFt} sub=”Horiz. reach from canopy center” />
<SliderField label=”Vertical drop” value={ring.drop} setValue={set(“drop”)} min={0.25} max={maxDrop} step={0.25} fmt={fmtFt} sub=”Canopy bottom → socket top” />
<SliderField label=”Socket height” value={ring.socketH} setValue={set(“socketH”)} min={0.25} max={1.5} step={0.25} fmt={fmtFt} />
</div>
</div>
<div style={{ display: “flex”, gap: 20, flexWrap: “wrap”, borderTop: `1px solid ${BORDER}`, paddingTop: 8, marginTop: 4, fontSize: 12, color: INK2, …mono }}>
{[[“arc radius”, fmtFt(ring.radius)],
  [“arc slack”, cordWarn ? “TAUT” : fmtIn(derived.slack)],
  [(ring.segments ?? 1) > 1 ? “sag/seg” : “sag”, fmtIn(derived.sag)],
  ...((ring.segments ?? 1) > 1 ? [[“segments”, String(ring.segments)]] : []),
  [“arc spacing”, fmtFt((2 * Math.PI * ring.radius) / ring.count)]
].map(([k, v]) => (
<span key={k}><span style={{ color: INK3 }}>{k}: </span><span style={{ fontWeight: 700, color: cordWarn && k === “slack” ? ACCENT : INK }}>{v}</span></span>
))}
</div>
</div>
</div>
);
}

export default function App() {
const [ceilingH,     setCeilingH]     = useState(8);
const [cordLength,   setCordLength]   = useState(6);
const [bulbH,        setBulbH]        = useState(0.25); // 3 inches = 0.25 ft
const [socketBudget, setSocketBudget] = useState(14);
const [rings, setRings] = useState([
makeRing({ count: 8, radius: 3,   drop: 2,   socketH: 0.5 }),
makeRing({ count: 6, radius: 1.5, drop: 1,   socketH: 0.5 }),
]);
const MIN_CLR = 7;

const addRing    = () => { const maxR = rings.length ? Math.max(…rings.map(r => r.radius)) + 1 : 2; setRings(rs => […rs, makeRing({ radius: Math.min(maxR, 8), count: 4, drop: 1.5 })]); };
const removeRing = (id)      => setRings(rs => rs.filter(r => r.id !== id));
const updateRing = (id, pat) => setRings(rs => rs.map(r => r.id === id ? { …r, …pat } : r));

const derived = useMemo(() => rings.map(r => deriveRing(r, ceilingH, cordLength, bulbH)), [rings, ceilingH, cordLength, bulbH]);

const assignedSockets = rings.reduce((s, r) => s + r.count, 0);
const budgetDelta     = assignedSockets - socketBudget;
const budgetOk        = budgetDelta === 0;
const anyLampWarn     = derived.some(d => d.socketBotFromFloor < MIN_CLR);
const anyCordWarn     = derived.some(d => !d.taut && d.sagLowestFromFloor < MIN_CLR);
const minSocketClr    = rings.length ? Math.min(…derived.map(d => d.socketBotFromFloor)) : Infinity;
const minSagClr       = rings.length ? Math.min(…derived.map(d => d.sagLowestFromFloor)) : Infinity;

// SVG
const SVG_W = 600, SVG_H = 310, PL = 52, PR = 20, PT = 22, PB = 28;
const dW = SVG_W - PL - PR, dH = SVG_H - PT - PB;
const maxR = Math.max(1, …rings.map(r => r.radius));
const cx0  = PL + dW / 2;
const sY   = y => PT + (y / ceilingH) * dH;
const sX   = x => cx0 + (x / (maxR * 1.25)) * (dW / 2);
const ceilSvgY = sY(0), floorSvgY = sY(ceilingH);

const TV = 260, tvcx = TV / 2 + 8, tvcy = TV / 2 + 8;
const tvScale = (TV / 2 - 22) / (maxR * 1.15);

return (
<div style={{ minHeight: “100vh”, background: BG, color: INK, …sans }}>
<div style={{ background: BLUE, padding: “14px 28px”, display: “flex”, alignItems: “center”, gap: 16 }}>
<div style={{ fontSize: 20, fontWeight: 800, color: “#fff”, letterSpacing: 2 }}>SPIDER PENDANT</div>
<div style={{ fontSize: 13, color: “rgba(255,255,255,0.7)”, letterSpacing: 1 }}>MULTI-RING LAYOUT CALCULATOR</div>
<div style={{ marginLeft: “auto”, fontSize: 11, color: “rgba(255,255,255,0.55)”, …mono }}>IMPERIAL · FT & IN</div>
</div>

```
  <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto" }}>
    <div style={{ width: 440, flexShrink: 0, padding: "16px 18px", borderRight: `2px solid ${BORDER}`, overflowY: "auto", maxHeight: "calc(100vh - 54px)", background: "#F2EDE5" }}>

      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
        <SectionHead title="Room &amp; Canopy" />
        <SliderField label="Ceiling height" value={ceilingH} setValue={setCeilingH} min={7} max={20} step={0.5} fmt={fmtFt} />
        <SliderField label="Cord length" value={cordLength} setValue={setCordLength} min={0.5} max={20} step={0.5} fmt={fmtFt} sub="Fixed cable length — same for all cords" />
        <SliderField label="Bulb height" value={bulbH} setValue={setBulbH} min={0.0833} max={1} step={0.0833} fmt={fmtIn} sub="Adds to socket height — reduces clearance" />
      </div>

      <div style={{ background: PANEL, border: `2px solid ${budgetOk ? BLUE : WARN}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
        <SectionHead title="Fixture Socket Budget" />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: INK2, fontWeight: 600, marginBottom: 6 }}>Total sockets on fixture</div>
            <Stepper value={socketBudget} onChange={setSocketBudget} min={1} max={48} />
          </div>
          <div style={{ flex: 1 }}>
            {budgetOk ? (
              <div style={{ background: "#EBF5ED", border: `2px solid ${SUCCESS}`, borderRadius: 6, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: SUCCESS }}>✓ FULLY ASSIGNED</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: SUCCESS, ...mono }}>{socketBudget} / {socketBudget}</div>
              </div>
            ) : (
              <div style={{ background: "#FFF8EC", border: `2px solid ${WARN}`, borderRadius: 6, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: WARN }}>{budgetDelta > 0 ? `▲ ${budgetDelta} OVER` : `▼ ${Math.abs(budgetDelta)} UNASSIGNED`}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: WARN, ...mono }}>{assignedSockets} / {socketBudget}</div>
                <div style={{ fontSize: 11, color: WARN }}>{budgetDelta > 0 ? "rings use more sockets than available" : "rings don't use all sockets"}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <StatCard label="MIN SOCKET CLR"   value={fmtFt(minSocketClr)} warn={anyLampWarn} note={anyLampWarn ? "↓ below 7'" : "✓ above 7'"} />
        <StatCard label="MIN CORD SAG CLR" value={fmtFt(minSagClr)}   warn={anyCordWarn} note={anyCordWarn ? "↓ below 7'" : "✓ above 7'"} />
      </div>

      <SectionHead title="Rings" />
      {rings.map((ring, idx) => (
        <RingEditor key={ring.id} ring={ring} idx={idx} color={RING_COLORS[idx % RING_COLORS.length]}
          derived={derived[idx]} onUpdate={updateRing} onRemove={removeRing} ceilingH={ceilingH} />
      ))}

      <button onClick={addRing} style={{ width: "100%", padding: "11px 0", background: PANEL, border: `2px dashed ${BORDER}`, borderRadius: 8, color: BLUE, fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 1 }}>+ ADD RING</button>

      {(anyLampWarn || anyCordWarn || derived.some(d => d.taut)) && (
        <div style={{ marginTop: 14, background: "#FEF0EC", border: `2px solid ${ACCENT}`, borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, marginBottom: 8 }}>⚠ CLEARANCE WARNINGS</div>
          {rings.map((r, i) => {
            const d = derived[i], sw = d.socketBotFromFloor < MIN_CLR, cw = !d.taut && d.sagLowestFromFloor < MIN_CLR, tw = d.taut;
            if (!sw && !cw && !tw) return null;
            return (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: RING_COLORS[i % RING_COLORS.length], marginBottom: 3 }}>Ring {i + 1}:</div>
                {sw && <div style={{ fontSize: 12, color: ACCENT, paddingLeft: 12 }}>· Socket bottom {fmtFt(d.socketBotFromFloor)} from floor — below 7' minimum</div>}
                {cw && <div style={{ fontSize: 12, color: ACCENT, paddingLeft: 12 }}>· Cord sag lowest {fmtFt(d.sagLowestFromFloor)} from floor</div>}
                {tw && <div style={{ fontSize: 12, color: ACCENT, paddingLeft: 12 }}>· Cord too short — will be pulled taut</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>

    <div style={{ flex: 1, padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12 }}>

        {/* Side elevation — one cord+socket per ring per side, showing ring radius profile */}
        <div style={{ flex: 1, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: INK3, letterSpacing: 2, padding: "8px 14px 4px", borderBottom: `1px solid ${BORDER}` }}>
            SIDE ELEVATION — RING PROFILES
          </div>
          <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block", background: "#FAFAF8" }}>
            <rect x={0} y={floorSvgY} width={SVG_W} height={PB + 4} fill="#EDE8DE" />
            {Array.from({ length: Math.floor(ceilingH) + 1 }, (_, h) => h).map(h => (
              <line key={h} x1={PL} x2={SVG_W - PR} y1={sY(h)} y2={sY(h)} stroke={BORDER} strokeWidth={0.8} />
            ))}
            <rect x={PL} y={sY(ceilingH - MIN_CLR)} width={dW} height={floorSvgY - sY(ceilingH - MIN_CLR)}
              fill={(anyLampWarn || anyCordWarn) ? "#FDECEA" : "#EEF7EF"} />
            <line x1={PL} x2={SVG_W - PR} y1={sY(ceilingH - MIN_CLR)} y2={sY(ceilingH - MIN_CLR)}
              stroke={(anyLampWarn || anyCordWarn) ? ACCENT : SUCCESS} strokeWidth={1.5} strokeDasharray="6,4" />
            <text x={PL - 4} y={sY(ceilingH - MIN_CLR)} textAnchor="end" dominantBaseline="middle"
              fill={(anyLampWarn || anyCordWarn) ? ACCENT : SUCCESS} fontSize={11} fontWeight="700" fontFamily="Courier New">7'</text>
            <line x1={PL} x2={SVG_W - PR} y1={ceilSvgY}  y2={ceilSvgY}  stroke={INK}  strokeWidth={2} />
            <line x1={PL} x2={SVG_W - PR} y1={floorSvgY} y2={floorSvgY} stroke={INK2} strokeWidth={1.5} />
            {Array.from({ length: Math.floor(ceilingH) + 1 }, (_, h) => h).map(h => (
              <text key={h} x={PL - 6} y={sY(h)} textAnchor="end" dominantBaseline="middle"
                fill={INK2} fontSize={10} fontWeight="600" fontFamily="Courier New">{fmtFt(ceilingH - h)}</text>
            ))}
            <circle cx={cx0} cy={ceilSvgY} r={8} fill={INK} />
            <text x={cx0} y={ceilSvgY} textAnchor="middle" dominantBaseline="middle"
              fill="#fff" fontSize={7} fontWeight="700" fontFamily="Courier New">HUB</text>

            {/* One cord profile per ring per side:
                 - catenary arc at ceiling level from hub (0,0) to (±radius,0), sags down
                 - straight drop from (±radius,0) down by ring.drop to socket top */}
            {rings.map((ring, idx) => {
              const d = derived[idx], color = RING_COLORS[idx % RING_COLORS.length];
              const segs = ring.segments ?? 1;
              const socketTopY = sY(ring.drop);
              const socketBotY = sY(ring.drop + d.fixtureH);
              const sagW       = !d.taut && d.sagLowestFromFloor < MIN_CLR;
              return [-1, 1].map(side => {
                const sockX   = sX(side * ring.radius);
                const arcPath = subdivCatenaryPath(0, 0, side * ring.radius, 0, d.availLen, sX, sY, segs);
                return (
                  <g key={`${idx}-${side}`}>
                    {/* Subdivided catenary arc(s) at ceiling */}
                    <path d={arcPath} stroke={color} strokeWidth={2.5} fill="none" />
                    {/* Per-segment sag dots */}
                    {!d.taut && d.sag > 0.01 && Array.from({ length: segs }, (_, k) => (
                      <circle key={k} cx={sX(side * (k + 0.5) * d.segSpan)} cy={sY(d.sag)}
                        r={4} fill={sagW ? ACCENT : color} />
                    ))}
                    {/* Intermediate ceiling attachment nodes */}
                    {segs > 1 && Array.from({ length: segs - 1 }, (_, k) => (
                      <circle key={k} cx={sX(side * (k + 1) * d.segSpan)} cy={ceilSvgY}
                        r={5} fill={PANEL} stroke={color} strokeWidth={2} />
                    ))}
                    {/* Straight drop from arc endpoint to socket */}
                    <line x1={sockX} y1={ceilSvgY} x2={sockX} y2={socketTopY}
                      stroke={color} strokeWidth={2.5} />
                    {/* Socket + bulb */}
                    <rect x={sockX - 8} y={socketTopY} width={16} height={Math.max(4, socketBotY - socketTopY)}
                      fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} rx={2} />
                    <ellipse cx={sockX} cy={socketBotY + 3} rx={13} ry={5} fill={color} fillOpacity={0.15} />
                    {side === 1 && (
                      <text x={sockX + 12} y={socketTopY + (socketBotY - socketTopY) / 2}
                        dominantBaseline="middle" fill={color} fontSize={10} fontWeight="700" fontFamily="Courier New">
                        R{idx + 1}
                      </text>
                    )}
                  </g>
                );
              });
            })}

            {rings.map((ring, idx) => {
              const d = derived[idx], color = RING_COLORS[idx % RING_COLORS.length];
              const bx = SVG_W - PR - 8 - idx * 16, topY = sY(ring.drop + d.fixtureH);
              const warn = d.socketBotFromFloor < MIN_CLR;
              return (
                <g key={idx}>
                  <line x1={bx} x2={bx} y1={topY} y2={floorSvgY} stroke={warn ? ACCENT : color} strokeWidth={1.5} strokeDasharray="3,2" />
                  <text x={bx - 4} y={(topY + floorSvgY) / 2} textAnchor="middle" fill={warn ? ACCENT : color}
                    fontSize={10} fontWeight="700" fontFamily="Courier New" transform={`rotate(-90,${bx - 4},${(topY + floorSvgY) / 2})`}>
                    {fmtFt(d.socketBotFromFloor)}
                  </text>
                </g>
              );
            })}

            <text x={SVG_W / 2} y={SVG_H - 4} textAnchor="middle" fill={INK3} fontSize={11} fontWeight="600" fontFamily="Courier New">
              {fmtFt(ceilingH)} ceiling · {rings.length} ring{rings.length !== 1 ? "s" : ""} · {assignedSockets}/{socketBudget} sockets assigned
            </text>
          </svg>
        </div>

        {/* Top view */}
        <div style={{ width: TV + 16, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: INK3, letterSpacing: 2, padding: "8px 14px 4px", borderBottom: `1px solid ${BORDER}` }}>TOP VIEW</div>
          <svg width={TV + 16} height={TV + 16} viewBox={`0 0 ${TV + 16} ${TV + 16}`} style={{ display: "block", background: "#FAFAF8" }}>
            <rect x={8} y={8} width={TV} height={TV} fill="none" stroke={BORDER} strokeWidth={1.5} rx={3} />
            {rings.map((ring, idx) => {
              const color = RING_COLORS[idx % RING_COLORS.length], tvR = ring.radius * tvScale;
              const angles = Array.from({ length: ring.count }, (_, i) => (2 * Math.PI * i) / ring.count);
              return (
                <g key={ring.id}>
                  <circle cx={tvcx} cy={tvcy} r={tvR} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="5,4" />
                  <text x={tvcx + tvR + 3} y={tvcy} dominantBaseline="middle" fill={color} fontSize={11} fontWeight="700" fontFamily="Courier New">{fmtFt(ring.radius)}</text>
                  {angles.map((a, i) => {
                    const sx = tvcx + Math.cos(a) * tvR, sy = tvcy + Math.sin(a) * tvR;
                    const segs = ring.segments ?? 1;
                    return (
                      <g key={i}>
                        <line x1={tvcx} y1={tvcy} x2={sx} y2={sy} stroke={color} strokeWidth={1.5} strokeOpacity={0.5} />
                        {segs > 1 && Array.from({ length: segs - 1 }, (_, k) => {
                          const frac = (k + 1) / segs;
                          return <circle key={k} cx={tvcx + Math.cos(a) * tvR * frac} cy={tvcy + Math.sin(a) * tvR * frac}
                            r={3} fill={PANEL} stroke={color} strokeWidth={1.5} />;
                        })}
                        <circle cx={sx} cy={sy} r={6} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2} />
                        <circle cx={sx} cy={sy} r={2.5} fill={color} />
                      </g>
                    );
                  })}
                </g>
              );
            })}
            <circle cx={tvcx} cy={tvcy} r={12} fill={INK} />
            <text x={tvcx} y={tvcy} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={9} fontWeight="700" fontFamily="Courier New">▲</text>
            {rings.map((ring, idx) => (
              <g key={ring.id}>
                <circle cx={17} cy={TV - 10 - idx * 16} r={5} fill={RING_COLORS[idx % RING_COLORS.length]} />
                <text x={26} y={TV - 10 - idx * 16} dominantBaseline="middle" fill={INK} fontSize={11} fontWeight="700" fontFamily="Courier New">
                  R{idx + 1}: {ring.count}× r={fmtFt(ring.radius)} ↓{fmtFt(ring.drop)}
                </text>
              </g>
            ))}
            {!budgetOk && (() => {
              const over = budgetDelta > 0;
              return (
                <g>
                  <rect x={8} y={14} width={TV} height={34} fill={over ? "#FFF3E0" : "#FFF8EC"} fillOpacity={0.93} stroke={WARN} strokeWidth={1.5} rx={4} />
                  <text x={22} y={26} fontSize={14} dominantBaseline="middle">⚠</text>
                  <text x={38} y={24} fill={WARN} fontSize={12} fontWeight="800" fontFamily="Courier New">
                    {over ? `${assignedSockets}/${socketBudget} — ${budgetDelta} TOO MANY` : `${assignedSockets}/${socketBudget} — ${Math.abs(budgetDelta)} UNASSIGNED`}
                  </text>
                  <text x={38} y={40} fill={WARN} fontSize={10} fontFamily="Courier New">
                    {over ? "reduce sockets in rings or increase budget" : "add sockets to rings or reduce budget"}
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* Summary table */}
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: INK3, letterSpacing: 2, padding: "8px 16px", borderBottom: `1px solid ${BORDER}` }}>RING SUMMARY TABLE</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", ...mono }}>
            <thead>
              <tr style={{ background: "#F0EBE2" }}>
                {["Ring","Count","Radius","Drop","Segs","Slack","Sag/Seg","Socket Clr","Cord Sag Clr"].map(h => (
                  <th key={h} style={{ textAlign: h === "Ring" ? "left" : "right", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: INK2, borderBottom: `2px solid ${BORDER}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rings.map((ring, idx) => {
                const d = derived[idx], color = RING_COLORS[idx % RING_COLORS.length];
                const sw = d.socketBotFromFloor < MIN_CLR, sagW = !d.taut && d.sagLowestFromFloor < MIN_CLR, cw = d.taut;
                return (
                  <tr key={ring.id} style={{ borderBottom: `1px solid ${BORDER}`, background: idx % 2 ? "#FAF8F5" : PANEL }}>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, display: "inline-block" }} />
                        <span style={{ fontWeight: 800, color, fontSize: 14 }}>R{idx + 1}</span>
                      </span>
                    </td>
                    {[{ v: ring.count, w: false }, { v: fmtFt(ring.radius), w: false }, { v: fmtFt(ring.drop), w: false },
                      { v: ring.segments ?? 1, w: false },
                      { v: cw ? "TAUT" : fmtIn(d.slack), w: cw }, { v: fmtIn(d.sag), w: false }, { v: fmtFt(d.socketBotFromFloor), w: sw }, { v: fmtFt(d.sagLowestFromFloor), w: sagW }
                    ].map(({ v, w }, ci) => (
                      <td key={ci} style={{ textAlign: "right", padding: "9px 12px", fontSize: 14, fontWeight: w ? 800 : 600, color: w ? ACCENT : INK, background: w ? "#FEF0EC" : "inherit" }}>{v}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#F0EBE2", borderTop: `2px solid ${BORDER}` }}>
                <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 800, color: INK }}>TOTAL</td>
                <td style={{ textAlign: "right", padding: "8px 12px", fontSize: 14, fontWeight: 800, color: budgetOk ? SUCCESS : WARN }}>{assignedSockets} / {socketBudget}</td>
                <td colSpan={6} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: budgetOk ? SUCCESS : WARN, textAlign: "right" }}>
                  {budgetOk ? "✓ all sockets assigned" : budgetDelta > 0 ? `▲ ${budgetDelta} over budget` : `▼ ${Math.abs(budgetDelta)} unassigned`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
```

);
}

