import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildPinDescription } from "./pin-text";
import type { TablesUpdate } from "@/integrations/supabase/types";

const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function settings() {
  const s = await db();
  const { data, error } = await s.from("app_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return data;
}
const mask = (k?: string | null) => (k ? `••••${k.slice(-4)}` : null);

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const s = await settings();
  return { ...s, buffer_api_key: undefined, api_key_hint: mask(s.buffer_api_key), has_key: !!s.buffer_api_key };
});

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      buffer_api_key: z.string().max(500).optional(),
      organization_id: z.string().nullable().optional(),
      channel_id: z.string().nullable().optional(),
      default_board_id: z.string().nullable().optional(),
      image_model: z.string().max(100).optional(),
      image_format: z.enum(["png", "jpeg"]).optional(),
      append_hashtags: z.boolean().optional(),
      ai_prompts_enabled: z.boolean().optional(),
      text_model: z.string().max(100).optional(),
      image_style: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await db();
    const { buffer_api_key, ...rest } = data;
    const patch = clean({ ...rest, ...(buffer_api_key ? { buffer_api_key } : {}), updated_at: new Date().toISOString() }) as TablesUpdate<"app_settings">;
    const { error } = await s.from("app_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bufferOverview = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ organizationId: z.string().nullable().optional(), channelId: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const st = await settings();
    if (!st.buffer_api_key) return { connected: false as const, error: "No Buffer API key saved yet." };
    const b = await import("./buffer.server");
    try {
      const account = await b.getOrganizations(st.buffer_api_key);
      const orgId = data.organizationId ?? st.organization_id ?? account.organizations[0]?.id ?? null;
      const channels = orgId ? await b.getPinterestChannels(st.buffer_api_key, orgId) : [];
      const chId = data.channelId ?? st.channel_id ?? channels[0]?.id ?? null;
      const boards = chId && channels.some((c) => c.id === chId) ? await b.getBoards(st.buffer_api_key, chId) : [];
      return { connected: true as const, email: account.email ?? null, organizations: account.organizations, organizationId: orgId, channels, channelId: chId, boards };
    } catch (e) {
      return { connected: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const listPins = createServerFn({ method: "GET" }).handler(async () => {
  const s = await db();
  // Rows left mid-process (e.g. the tab was closed) become retryable after 10 minutes.
  await s.from("pins").update({ status: "failed", error: "Interrupted — retry this row" })
    .in("status", ["generating", "sending"]).lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data, error } = await s.from("pins").select("*").order("position").limit(1000);
  if (error) throw new Error(error.message);
  return data;
});

const rowSchema = z.object({
  title: z.string().max(500), description: z.string().max(5000), tags: z.string().max(2000),
  image_prompt: z.string().max(4000), article_url: z.string().max(2000),
});

export const importPins = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ batchName: z.string().max(200), rows: z.array(rowSchema).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const s = await db();
    const { data: last } = await s.from("pins").select("position").order("position", { ascending: false }).limit(1);
    const start = (last?.[0]?.position ?? -1) + 1;
    const { error } = await s.from("pins").insert(data.rows.map((r, i) => ({ ...r, batch_name: data.batchName, position: start + i })));
    if (error) throw new Error(error.message);
    return { inserted: data.rows.length };
  });

export const updatePin = createServerFn({ method: "POST" })
  .inputValidator((d) => rowSchema.partial().extend({ id: z.string().uuid(), board_id: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const s = await db();
    const { error } = await s.from("pins").update(clean(patch) as TablesUpdate<"pins">).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBoardForPins = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(1000), board_id: z.string().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const s = await db();
    const { error } = await s.from("pins").update({ board_id: data.board_id }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePins = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const s = await db();
    const { data: rows } = await s.from("pins").select("image_path").in("id", data.ids);
    const paths = (rows ?? []).map((r) => r.image_path).filter(Boolean) as string[];
    if (paths.length) await s.storage.from("pin-images").remove(paths);
    const { error } = await s.from("pins").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function makeImage(id: string) {
  const s = await db();
  const st = await settings();
  const { data: pin, error } = await s.from("pins").select("*").eq("id", id).single();
  if (error || !pin) throw new Error("Row not found");
  const { createPinImage, writeImagePrompt } = await import("./images.server");
  let prompt = pin.image_prompt.trim();
  if (!prompt) {
    if (!st.ai_prompts_enabled) throw new Error("image_prompt is empty");
    if (!pin.title.trim() && !pin.description.trim()) throw new Error("Need a title or description to write an image prompt");
    prompt = await writeImagePrompt(pin.title, pin.description, st.text_model);
    await s.from("pins").update({ image_prompt: prompt }).eq("id", id);
  }
  if (st.image_style.trim()) prompt = `${prompt}\nStyle: ${st.image_style.trim()}`;
  let fmt: "jpeg" | "png" = st.image_format === "jpeg" ? "jpeg" : "png";
  let bytes: Uint8Array;
  if (st.image_model.startsWith("google/")) {
    const { createGooglePinImage } = await import("./google-images.server");
    const image = await createGooglePinImage(prompt, st.image_model, fmt, {
      gatewayKey: process.env["LOVABLE_API_KEY"], connectionKey: process.env["UDC_GOOGLE_AI_STUDIO_API_KEY"],
    });
    bytes = image.bytes;
    fmt = image.format;
  } else {
    bytes = await createPinImage(prompt, st.image_model, fmt);
  }
  const path = `${id}/${Date.now()}.${fmt === "jpeg" ? "jpg" : "png"}`;
  const up = await s.storage.from("pin-images").upload(path, bytes, { contentType: `image/${fmt}`, upsert: true });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
  if (pin.image_path) await s.storage.from("pin-images").remove([pin.image_path]);
  const signed = await s.storage.from("pin-images").createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error) throw new Error(signed.error.message);
  return { path, url: signed.data.signedUrl };
}

export const generatePinImage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await db();
    const { data: claimed } = await s.from("pins").update({ status: "generating", error: null })
      .eq("id", data.id).in("status", ["pending", "image_ready", "failed"]).select("id");
    if (!claimed?.length) return { skipped: true };
    try {
      const img = await makeImage(data.id);
      await s.from("pins").update({ status: "image_ready", image_path: img.path, image_url: img.url }).eq("id", data.id);
      return { skipped: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await s.from("pins").update({ status: "failed", error: msg }).eq("id", data.id);
      return { skipped: false, error: msg };
    }
  });

export const sendPinToBuffer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await db();
    const st = await settings();
    if (!st.buffer_api_key) return { error: "Add your Buffer API key in Settings first." };
    if (!st.channel_id) return { error: "Choose a Pinterest channel in Settings first." };
    const { data: claimed } = await s.from("pins").update({ status: "sending", error: null })
      .eq("id", data.id).is("buffer_post_id", null).in("status", ["pending", "image_ready", "failed"]).select("*");
    const pin = claimed?.[0];
    if (!pin) return { skipped: true };
    try {
      const board = pin.board_id || st.default_board_id;
      if (!board) throw new Error("No Pinterest board selected");
      let imageUrl = pin.image_url;
      if (!imageUrl) {
        await s.from("pins").update({ status: "generating" }).eq("id", pin.id);
        const img = await makeImage(pin.id);
        imageUrl = img.url;
        await s.from("pins").update({ status: "sending", image_path: img.path, image_url: img.url }).eq("id", pin.id);
      }
      const { addPinToQueue } = await import("./buffer.server");
      const post = await addPinToQueue(st.buffer_api_key, {
        channelId: st.channel_id, imageUrl, boardServiceId: board, title: pin.title, url: pin.article_url,
        text: buildPinDescription(pin.description, pin.tags, st.append_hashtags),
      });
      await s.from("pins").update({ status: "added", buffer_post_id: post.id, buffer_status: post.status ?? "scheduled" }).eq("id", pin.id);
      return { skipped: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await s.from("pins").update({ status: "failed", error: msg }).eq("id", pin.id);
      return { skipped: false, error: msg };
    }
  });
