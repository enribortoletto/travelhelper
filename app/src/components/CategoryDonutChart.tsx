import { CATEGORY_CONFIG } from "@/lib/categories";
import type { EventCategory } from "@/types/database";

interface CategoryDonutChartProps {
  data: { category: EventCategory; count: number }[];
  size?: number;
}

const STROKE_WIDTH = 14;

export default function CategoryDonutChart({ data, size = 128 }: CategoryDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map(({ category, count }) => {
    const fraction = total > 0 ? count / total : 0;
    const dash = fraction * circumference;
    const segment = {
      category,
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -offset,
    };
    offset += dash;
    return segment;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE_WIDTH}
        />
        {segments.map(({ category, dasharray, dashoffset }) => (
          <circle
            key={category}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CATEGORY_CONFIG[category].hex}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            strokeLinecap="butt"
          />
        ))}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90"
          style={{ transformOrigin: "center", fill: "var(--text)", fontSize: 22, fontWeight: 700 }}
        >
          {total}
        </text>
      </svg>

      <ul className="flex flex-col gap-1.5 text-xs">
        {data.map(({ category, count }) => (
          <li key={category} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: CATEGORY_CONFIG[category].hex }}
            />
            <span className="text-[var(--text)]">{CATEGORY_CONFIG[category].label}</span>
            <span className="text-[var(--text-muted)]">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
