import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sanitizeFilename } from "./sanitizeFilename";

describe("sanitizeFilename", () => {
  it("keeps a normal filename", () => {
    expect(sanitizeFilename("photo-1.jpg")).toBe("photo-1.jpg");
  });

  it("strips path traversal and separators", () => {
    const out = sanitizeFilename("../../etc/passwd");
    expect(out).toBe("passwd");
    expect(sanitizeFilename("..\\..\\win.ini")).toBe("win.ini");
  });

  it("replaces unsafe characters and collapses repeats", () => {
    expect(sanitizeFilename("my   photo (1)!.png")).toBe("my_photo_1_.png");
  });

  it("falls back to a default for empty results", () => {
    expect(sanitizeFilename("")).toBe("upload");
    expect(sanitizeFilename("../")).toBe("upload");
    expect(sanitizeFilename("....")).toBe("upload");
  });

  it("limits length", () => {
    expect(sanitizeFilename("a".repeat(500) + ".jpg").length).toBeLessThanOrEqual(100);
  });

  it("never yields '..', separators or empty output", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = sanitizeFilename(s);
        expect(out.length).toBeGreaterThan(0);
        expect(out).not.toContain("..");
        expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
      }),
    );
  });
});
