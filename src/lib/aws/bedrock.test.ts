import { describe, expect, it } from "vitest";
import { resolveImageFormat } from "@/lib/aws/imageFormat";

describe("resolveImageFormat", () => {
  it("maps content types", () => {
    expect(resolveImageFormat("image/jpeg", "a")).toBe("jpeg");
    expect(resolveImageFormat("image/jpg", "a")).toBe("jpeg");
    expect(resolveImageFormat("image/png", "a")).toBe("png");
    expect(resolveImageFormat("image/webp", "a")).toBe("webp");
    expect(resolveImageFormat("IMAGE/PNG; charset=binary", "a")).toBe("png");
  });

  it("content type wins over extension", () => {
    expect(resolveImageFormat("image/png", "photo.jpg")).toBe("png");
  });

  it("falls back to extension, case-insensitive", () => {
    expect(resolveImageFormat(null, "uploads/x.JPG")).toBe("jpeg");
    expect(resolveImageFormat(undefined, "x.jpeg")).toBe("jpeg");
    expect(resolveImageFormat("application/octet-stream", "x.PNG")).toBe("png");
    expect(resolveImageFormat("", "x.WebP")).toBe("webp");
  });

  it("throws when nothing resolves", () => {
    expect(() => resolveImageFormat(null, "x.gif")).toThrow(/Unsupported image format/);
    expect(() => resolveImageFormat("image/gif", "noext")).toThrow();
  });
});
