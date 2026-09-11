// Notion option colors -> CSS. Works in light and dark via CSS variables set in globals.css.
export const NOTION_COLORS: Record<string, { bg: string; fg: string }> = {
  default: { bg: "var(--tag-default-bg)", fg: "var(--tag-default-fg)" },
  gray: { bg: "rgba(120,119,116,0.18)", fg: "#6b6a66" },
  brown: { bg: "rgba(159,107,83,0.20)", fg: "#8a5a44" },
  orange: { bg: "rgba(217,115,13,0.20)", fg: "#b96613" },
  yellow: { bg: "rgba(203,145,47,0.22)", fg: "#a67c1a" },
  green: { bg: "rgba(68,131,97,0.22)", fg: "#3f7a5a" },
  blue: { bg: "rgba(51,126,169,0.20)", fg: "#3277a4" },
  purple: { bg: "rgba(144,101,176,0.22)", fg: "#8a5fb0" },
  pink: { bg: "rgba(193,76,138,0.20)", fg: "#c14c8a" },
  red: { bg: "rgba(212,76,71,0.20)", fg: "#d44c47" },
};

export function colorFor(name?: string) {
  return NOTION_COLORS[name || "default"] || NOTION_COLORS.default;
}
