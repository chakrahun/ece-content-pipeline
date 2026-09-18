import { config, higgsfield } from "@higgsfield/client/v2";

// Higgsfield native API wrapper. Server-side only — the credentials live here and
// are read from .env.local, never sent to the browser (the SDK itself refuses to
// run in a browser). We drive it through the official @higgsfield/client v2 SDK:
// subscribe(endpoint, { input }) POSTs `input` as the request body to
// https://platform.higgsfield.ai/<endpoint> and polls /requests/{id}/status until
// the job reaches a terminal state.

let configured = false;

function credentials(): string {
  // Accept either a single "id:secret" pair or the two halves separately.
  const combined = process.env.HF_CREDENTIALS?.trim();
  if (combined) return combined;
  const id = process.env.HF_API_KEY_ID?.trim();
  const secret = process.env.HF_API_KEY_SECRET?.trim();
  if (id && secret) return `${id}:${secret}`;
  return "";
}

function ensureConfigured() {
  if (configured) return;
  const creds = credentials();
  if (!creds || !creds.includes(":")) {
    throw new Error(
      'Higgsfield credentials missing. Set HF_CREDENTIALS="<key-id>:<key-secret>" (or HF_API_KEY_ID + HF_API_KEY_SECRET) in dashboard/.env.local.'
    );
  }
  config({
    credentials: creds,
    // Videos can take a while; give polling more headroom than the 5-min default.
    maxPollTime: 600000,
    pollInterval: 3000,
  } as any);
  configured = true;
}

export function higgsfieldConfigured(): boolean {
  return !!credentials();
}

export type ShotSpec = {
  model: string; // exact Higgsfield endpoint path, e.g. "higgsfield-ai/soul/standard"
  shotType: string; // "Image" | "Text-to-Video" | "Image-to-Video"
  prompt: string;
  inputImageUrl?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  duration?: string | null;
  seed?: number | null;
};

export type RenderResult = { url: string; requestId: string | null; kind: "image" | "video" };

// The soul (image) endpoint only accepts this aspect-ratio set (verified against
// the live API — its error rejects anything else, e.g. 4:5). We map common
// compose-target ratios that soul doesn't support onto the nearest allowed one;
// the finished post is composed/cropped by hand anyway.
const IMAGE_ASPECT_RATIOS = new Set(["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"]);
const IMAGE_ASPECT_FALLBACK: Record<string, string> = { "4:5": "3:4", "5:4": "4:3" };

function imageAspectRatio(ar?: string | null): string | undefined {
  if (!ar) return undefined;
  if (IMAGE_ASPECT_RATIOS.has(ar)) return ar;
  return IMAGE_ASPECT_FALLBACK[ar]; // undefined -> omit and let the API default
}

// soul wants "720p"/"1080p"; our rows may carry "2K"/"4K"/"1080"/"720p". Normalize.
function imageResolution(res?: string | null): string {
  const r = (res || "").toLowerCase();
  return r.includes("720") ? "720p" : "1080p";
}

// Build the request body for a shot, matching the Higgsfield endpoint's live input schema.
function buildInput(spec: ShotSpec): Record<string, any> {
  const input: Record<string, any> = { prompt: spec.prompt };
  if (spec.seed != null) input.seed = spec.seed;

  if (spec.shotType === "Image") {
    // higgsfield-ai/soul/standard
    input.resolution = imageResolution(spec.resolution);
    const ar = imageAspectRatio(spec.aspectRatio);
    if (ar) input.aspect_ratio = ar;
  } else {
    // Text-to-Video / Image-to-Video
    if (spec.aspectRatio) input.aspect_ratio = spec.aspectRatio;
    if (spec.resolution) input.resolution = spec.resolution; // "720" | "1080"
    if (spec.duration) input.duration = spec.duration; // "4" | "6" | "8"
    if (spec.shotType === "Image-to-Video") {
      if (!spec.inputImageUrl) {
        throw new Error("Image-to-Video shot has no Input Image URL to animate.");
      }
      input.image_url = spec.inputImageUrl;
    }
  }
  return input;
}

// Submit one shot to Higgsfield and wait for the finished media URL.
export async function renderShot(spec: ShotSpec): Promise<RenderResult> {
  ensureConfigured();
  if (!spec.model) throw new Error("Shot has no Model set.");
  if (!spec.prompt?.trim()) throw new Error("Shot has an empty Prompt.");

  const res: any = await higgsfield.subscribe(spec.model, {
    input: buildInput(spec),
    withPolling: true,
  });

  const status = res?.status;
  if (status === "nsfw") throw new Error("Higgsfield flagged this generation as NSFW.");
  if (status === "failed") throw new Error("Higgsfield reported the generation failed.");
  if (status !== "completed") throw new Error(`Higgsfield returned an unexpected status: ${status}`);

  const videoUrl = res?.video?.url;
  const imageUrl = Array.isArray(res?.images) ? res.images[0]?.url : undefined;
  const url = videoUrl || imageUrl;
  if (!url) throw new Error("Higgsfield completed but returned no media URL.");

  return {
    url,
    requestId: res?.request_id ?? null,
    kind: videoUrl ? "video" : "image",
  };
}
