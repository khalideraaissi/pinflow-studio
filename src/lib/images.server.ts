import { generateImage, GatewayError } from "@lovable.dev/ai-gateway";

export const IMAGE_MODELS = ["openai/gpt-image-2.5-sunburst", "openai/gpt-image-2"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];

// 1008x1504 ≈ 1000x1500 (2:3); the model requires edges divisible by 16.
export async function createPinImage(prompt: string, model: string, format: "png" | "jpeg") {
  const m: ImageModel = (IMAGE_MODELS as readonly string[]).includes(model) ? (model as ImageModel) : IMAGE_MODELS[0];
  const fullPrompt = `Vertical Pinterest pin image, 2:3 portrait composition, no text overlays unless requested. ${prompt}`;
  try {
    const res =
      m === "openai/gpt-image-2"
        ? await generateImage({ model: "openai/gpt-image-2", prompt: fullPrompt, size: "1008x1504", output_format: format, quality: "medium" })
        : await generateImage({ model: "openai/gpt-image-2.5-sunburst", prompt: fullPrompt, size: "1008x1504", output_format: format, quality: "medium" });
    const img = res.data?.[0];
    if (img?.b64_json) return Uint8Array.from(atob(img.b64_json), (c) => c.charCodeAt(0));
    if (img?.url) return new Uint8Array(await (await fetch(img.url)).arrayBuffer());
    throw new Error("The image service returned no image");
  } catch (e) {
    if (e instanceof GatewayError) throw new Error(`Image generation failed (${e.code}): ${e.message}`);
    throw e;
  }
}

export const TEXT_MODELS = ["openai/gpt-6-astra", "openai/gpt-5-mini"] as const;

// Writes an image prompt from the pin's title/description. Never changes the pin text itself.
export async function writeImagePrompt(title: string, description: string, model: string) {
  const { generateResponse } = await import("@lovable.dev/ai-gateway");
  const input = `Write one vivid image-generation prompt (max 80 words) for a vertical Pinterest pin photo. No text in the image. Return only the prompt.\nTitle: ${title}\nDescription: ${description}`;
  try {
    const res = model === "openai/gpt-5-mini"
      ? await generateResponse({ model: "openai/gpt-5-mini", input })
      : await generateResponse({ model: "openai/gpt-6-astra", input });
    let text = "";
    for (const item of res.output ?? []) {
      if (item.type === "message") for (const c of item.content) if (c.type === "output_text") text += c.text;
    }
    if (!text.trim()) throw new Error("The writing model returned no prompt");
    return text.trim();
  } catch (e) {
    if (e instanceof GatewayError) throw new Error(`Prompt writing failed (${e.code}): ${e.message}`);
    throw e;
  }
}
