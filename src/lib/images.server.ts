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
