"use client";
import { colorFor } from "@/lib/colors";

// A select/multi-select value is { name, color }. Accepts that, or a raw string.
export function Badge({ value }: { value: { name: string; color: string } | string | null }) {
  if (!value) return <span className="muted">—</span>;
  const name = typeof value === "string" ? value : value.name;
  const color = typeof value === "string" ? "default" : value.color;
  const c = colorFor(color);
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {name}
    </span>
  );
}

export function Badges({ values }: { values: { name: string; color: string }[] | null }) {
  if (!values || values.length === 0) return <span className="muted">—</span>;
  return (
    <span className="badges">
      {values.map((v) => (
        <Badge key={v.name} value={v} />
      ))}
    </span>
  );
}
