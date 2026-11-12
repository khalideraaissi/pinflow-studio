export const PIN_DESCRIPTION_LIMIT = 500;

export function tagsToHashtags(tags: string): string[] {
  return tags
    .split(/[,;\n]+/)
    .map((t) => t.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]+/gu, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);
}

export function buildPinDescription(description: string, tags: string, appendHashtags: boolean) {
  const base = description.trim();
  if (!appendHashtags) return base.slice(0, PIN_DESCRIPTION_LIMIT);
  let out = base;
  for (const h of tagsToHashtags(tags)) {
    const next = out ? `${out}${out === base ? "\n\n" : " "}${h}` : h;
    if (next.length > PIN_DESCRIPTION_LIMIT) break;
    out = next;
  }
  return out.slice(0, PIN_DESCRIPTION_LIMIT);
}

export const REQUIRED_COLUMNS = ["title", "description", "tags", "image_prompt", "article_url"] as const;

export function validateRow(r: { title: string; description: string; image_prompt: string; article_url: string }) {
  const errs: string[] = [];
  if (!r.title.trim()) errs.push("title");
  if (!r.description.trim()) errs.push("description");
  if (!r.image_prompt.trim()) errs.push("image_prompt");
  if (!/^https?:\/\/\S+$/i.test(r.article_url.trim())) errs.push("article_url");
  return errs;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  generating: "Generating Image",
  image_ready: "Image Ready",
  sending: "Sending to Buffer",
  added: "Added to Buffer",
  failed: "Failed",
};
