import { describe, it, expect } from "vitest";
import { buildPinDescription, validateRow } from "./pin-text";

describe("pin text", () => {
  it("appends tags as hashtags after the exact description", () => {
    expect(buildPinDescription("Hello", "home decor, diy", true)).toBe("Hello\n\n#homedecor #diy");
  });
  it("keeps description unchanged when hashtags are off", () => {
    expect(buildPinDescription("Hello", "a,b", false)).toBe("Hello");
  });
  it("never exceeds Pinterest's 500 character limit", () => {
    expect(buildPinDescription("x".repeat(495), "longtag", true).length).toBeLessThanOrEqual(500);
  });
  it("flags missing fields and bad urls", () => {
    expect(validateRow({ title: "", description: "d", image_prompt: "p", article_url: "nope" })).toEqual(["title", "article_url"]);
  });
});
