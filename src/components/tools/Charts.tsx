import type { ReactNode } from "react";

/**
 * Two charts drawn by hand, because two charts do not justify a charting
 * library in a wallet bundle. Both are plain SVG scaled to the width of
 * their container: the geometry is stretched, the strokes are not
 * (`vector-effect`), so a line keeps the same weight on a phone and on a
 * desktop. Each one carries the same figures in text beside it, so the
 * chart is the quick read and never the only one.
 */

const WIDTH = 100;
const HEIGHT = 34;

export type Point = { key: string; value: number; title: string };

/**
 * Counts are read against zero, not against their own minimum: a scale that
 * started at the smallest day would turn a 2% difference into a cliff.
 */
function scale(values: number[]): { top: number; bottom: number } {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return { top: 1, bottom: 0 };
  const bottom = Math.min(0, ...finite);
  const high = Math.max(...finite);
  return { top: high > bottom ? high : bottom + 1, bottom };
}

/**
 * A trend line with the area under it filled. Fewer than two points cannot
 * make a line, so a single reading is drawn as a dot.
 */
export function Sparkline({ points, label }: { points: Point[]; label: string }) {
  const { top, bottom } = scale(points.map((point) => point.value));
  const x = (index: number) => (points.length < 2 ? WIDTH / 2 : (index / (points.length - 1)) * WIDTH);
  const y = (value: number) => HEIGHT - ((Number.isFinite(value) ? value : bottom) - bottom) / (top - bottom) * HEIGHT;
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(" ");
  const area = points.length > 1 ? `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z` : "";
  return (
    <svg
      className="chart chart-line"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {area && <path className="chart-area" d={area} />}
      {points.length > 1 ? (
        <path className="chart-stroke" d={line} vectorEffect="non-scaling-stroke" />
      ) : (
        points.map((point, index) => (
          <circle key={point.key} className="chart-dot" cx={x(index)} cy={y(point.value)} r={1.6} />
        ))
      )}
    </svg>
  );
}

/**
 * One bar per period. Bars keep a visible stub at zero so an empty day is
 * still a day rather than a gap in the axis.
 */
export function BarChart({ points, label }: { points: Point[]; label: string }) {
  const { top } = scale(points.map((point) => point.value));
  const slot = points.length ? WIDTH / points.length : WIDTH;
  const bar = Math.max(slot * 0.6, Math.min(slot - 0.6, slot * 0.78));
  return (
    <svg
      className="chart chart-bars"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {points.map((point, index) => {
        const value = Number.isFinite(point.value) ? Math.max(0, point.value) : 0;
        const height = top > 0 ? Math.max(value > 0 ? 1.2 : 0.5, (value / top) * HEIGHT) : 0.5;
        return (
          <rect
            key={point.key}
            className={value > 0 ? "chart-bar" : "chart-bar empty"}
            x={index * slot + (slot - bar) / 2}
            y={HEIGHT - height}
            width={bar}
            height={height}
          >
            <title>{point.title}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** A chart with its name, its latest reading and its range around it. */
export function ChartBlock({
  title,
  value,
  meta,
  children,
}: {
  title: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="chart-block">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-value">{value}</span>
      </div>
      {children}
      {meta && <small className="chart-meta">{meta}</small>}
    </div>
  );
}
