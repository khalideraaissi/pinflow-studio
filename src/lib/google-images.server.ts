const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_google_ai_studio";

export const GOOGLE_IMAGE_MODELS = ["google/gemini-nano-banana-2.1", "google/gemini-3-pro-image"] as const;

export async function createGooglePinImage(prompt: string, model: string, format: "png" | "jpeg", credentials: { gatewayKey?: string | undefined; connectionKey?: string | undefined }) {
  if (!(GOOGLE_IMAGE_MODELS as readonly string[]).includes(model)) throw new Error("Unsupported Google image model");
  if (!credentials.gatewayKey || !credentials.connectionKey) throw new Error("Connect Google AI Studio in Lovable's Connectors first.");
  const response = await fetch(`${GATEWAY_URL}/v1beta/interactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.gatewayKey}`,
      "X-Connection-Api-Key": credentials.connectionKey,
      "Content-Type": "application/json",
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model: model.slice("google/".length),
      input: `Vertical Pinterest pin image, 2:3 portrait composition, no text overlays unless requested. ${prompt}`,
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "2:3", image_size: "1K" },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google image generation failed (${response.status}): ${body}`);
  }
  const result = await response.json() as { outputs?: { type: string; data?: string; mime_type?: string }[]; output_image?: { data?: string; mime_type?: string }; status?: string };
  const image = result.output_image ?? result.outputs?.find((output) => output.type === "image" && output.data);
  if (!image?.data) throw new Error("Google returned no image. Try a different prompt or check your Google AI account limits.");
  const mimeType = image.mime_type ?? "image/jpeg";
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") throw new Error(`Google returned an unsupported image format: ${mimeType}`);
  return { bytes: Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0)), format: mimeType === "image/jpeg" ? "jpeg" as const : "png" as const };
}