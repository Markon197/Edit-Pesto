// Shared between the Earnings list (mini metric chips) and the report page
// (stat cards) — one place that decides "up" vs "down" from a change
// string's sign, so the arrow and color logic can't drift between the two.
export function metricChangeDirection(change?: string | null): "up" | "down" | null {
  if (!change) return null;
  const t = change.trim();
  if (t.startsWith("+")) return "up";
  if (t.startsWith("-") || t.startsWith("−")) return "down";
  return null;
}

export default function MetricChange({ change }: { change?: string | null }) {
  if (!change) return null;
  const dir = metricChangeDirection(change);
  return (
    <span className={`metric-change${dir ? ` ${dir}` : ""}`}>
      {dir === "up" && "↑"}
      {dir === "down" && "↓"}
      {change}
    </span>
  );
}
