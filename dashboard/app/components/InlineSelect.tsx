"use client";
import { useState } from "react";

// A small dropdown that PATCHes a single field to the given API path and reports back.
export function InlineSelect({
  apiBase,
  id,
  field,
  value,
  options,
  onSaved,
}: {
  apiBase: string; // e.g. "/api/queue"
  id: string;
  field: string; // e.g. "Status"
  value: string | null;
  options: string[];
  onSaved?: (newValue: string) => void;
}) {
  const [current, setCurrent] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function change(v: string) {
    const prev = current;
    setCurrent(v);
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: v }),
      });
      if (!res.ok) throw new Error();
      onSaved?.(v);
    } catch {
      setCurrent(prev);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const opts = options.includes(current) || !current ? options : [current, ...options];
  return (
    <select
      className="mini-select"
      value={current}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      style={error ? { borderColor: "#d44c47" } : undefined}
      title={error ? "Save failed — try again" : undefined}
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
