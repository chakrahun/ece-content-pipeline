// Option lists mirrored from the live Notion databases, used to render dropdowns.
// (Read-only display of any other value still works even if not listed here.)

export const TOPICS = [
  "sleep",
  "feeding",
  "language development",
  "screen time",
  "discipline",
  "potty training",
  "attachment",
  "motor development",
  "social-emotional",
];

// --- Topic Queue ---
export const QUEUE_STATUS = ["Queued", "In Progress", "Done", "Skipped"];
export const QUEUE_PRIORITY = ["High", "Medium", "Low"];

// --- Findings ---
export const FINDING_CONTENT_STATUS = ["Not Used", "Drafted", "Published"];
export const FINDING_VERDICTS = [
  "VERIFIED",
  "VERIFIED_WITH_CAVEATS",
  "ANECDOTAL_ONLY",
  "UNVERIFIABLE",
  "CONTRADICTED",
  "REJECT",
];
export const FINDING_SAFE_AS = ["fact", "expert_opinion", "parent_anecdote", "not_publishable"];
export const FINDING_SOURCE_TIER = ["academic", "expert_commentary", "anecdotal"];

// --- Content Drafts ---
export const DRAFT_STATUS = ["Needs Review", "Approved", "Published", "Rejected"];
export const DRAFT_FORMAT = ["Short-Form Video", "Long-Form Video", "Social Caption/Carousel"];

// --- Content Ideas ---
export const IDEA_STATUS = ["New", "Shortlisted", "In Production", "Made", "Archived"];
export const IDEA_EFFORT = ["Low", "Medium", "High"];
export const IDEA_FORMAT_CATEGORY = ["Digital Product", "Social Post", "Short-Form Video"];
export const IDEA_PRODUCT_FORMAT = [
  "Printable Pack",
  "Activity Kit",
  "Checklist / Cheat Sheet",
  "Flashcards",
  "Workbook / Journal",
  "Ebook / Guide",
  "Mini-Course",
  "Email Course",
  "Template / Tracker",
  "Instagram Carousel",
  "Instagram/Facebook Post",
  "Short-Form Video",
];

// Property type map per database so the API knows how to build write payloads.
export const WRITE_TYPES: Record<string, Record<string, string>> = {
  queue: {
    Topic: "title",
    Status: "select",
    Priority: "select",
    "Angle Or Notes": "rich_text",
    "Requested By": "rich_text",
  },
  findings: {
    "Content Status": "select",
  },
  drafts: {
    Status: "select",
  },
  ideas: {
    Status: "select",
    Effort: "select",
  },
};
