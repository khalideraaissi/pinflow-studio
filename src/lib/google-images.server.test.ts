import { afterEach, describe, expect, it, vi } from "vitest";
import { createGooglePinImage } from "./google-images.server";

afterEach(() => vi.unstubAllGlobals());

describe("Google image generation", () => {
  it("uses the connected Google account to request a portrait image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ outputs: [{ type: "image", data: "AQID", mime_type: "image/png" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createGooglePinImage("A garden", "google/gemini-nano-banana-2.1", "png", { gatewayKey: "test-gateway", connectionKey: "test-connection" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://connector-gateway.lovable.dev/udc_google_ai_studio/v1beta/interactions");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: "gemini-nano-banana-2.1", response_format: { aspect_ratio: "2:3", mime_type: "image/png" } });
    expect([...result.bytes]).toEqual([1, 2, 3]);
  });
  it("does not fall back to another account when Google rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Quota exceeded", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createGooglePinImage("A garden", "google/gemini-nano-banana-2.1", "png", { gatewayKey: "test-gateway", connectionKey: "test-connection" })).rejects.toThrow("Google image generation failed (429): Quota exceeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});