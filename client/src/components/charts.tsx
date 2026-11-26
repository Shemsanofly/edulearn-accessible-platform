import { formatDate, formatShortDate, percent } from '../lib/format';

/** Simple accessible column chart; values are 0–100 percentages unless `max` is given. */
export function ColumnChart({ data, max = 100, color = 'var(--primary)', label, format = (v) => percent(v) }: {
  data: { label: string; value: number | null; title?: string }[];
  max?: number;
  color?: string;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-bars" role="img" aria-label={`${label}: ${data.map((d) => `${d.title ?? d.label} ${d.value === null ? 'no data' : format(d.value)}`).join(', ')}`}>
        {data.map((d, i) => (
          <div className="chart-bar" key={i} title={`${d.title ?? d.label}: ${d.value === null ? 'no data' : format(d.value)}`}>
            <div className={d.value === null ? 'bar empty' : 'bar'} style={{ height: `${d.value === null ? 2 : Math.max(2, (d.value / max) * 100)}%`, ['--c' as string]: color }} />
            <span className="lbl">{d.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Attendance trend: columns scaled to the useful 70–100 % range so differences are visible. */
export function TrendChart({ data }: { data: { date: string; rate: number | null }[] }) {
  const floor = 70;
  return (
    <ColumnChart
      label="Daily attendance rate"
      max={100 - floor}
      format={(v) => percent(v + floor, 1)}
      data={data.map((d) => ({
        label: formatDate(d.date, { weekday: 'narrow' }),
        title: formatShortDate(d.date),
        value: d.rate === null ? null : Math.max(0, d.rate - floor),
      }))}
    />
  );
}

export function Donut({ segments, size = 132, thickness = 16, center, label }: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  label: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={thickness} />
          {total > 0 &&
            segments.map((s, i) => {
              const len = (s.value / total) * c;
              const el = (
                <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
                  strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
              );
              offset += len;
              return el;
            })}
        </svg>
        {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
      </div>
      <ul className="list stack-sm" style={{ gap: 6 }}>
        {segments.map((s) => (
          <li key={s.label} className="row small" style={{ gap: 8 }}>
            <span className="color-dot" style={{ background: s.color }} aria-hidden />
            <span className="muted">{s.label}</span>
            <strong className="num" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
