import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readOrientation, stripMetadata, validateImageFile } from "@/lib/image";

function jpegWithOrientation(o: number): ArrayBuffer {
  // SOI, APP1 Exif (big-endian TIFF, 1 IFD entry: orientation), fake DQT, SOS + data, EOI
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  const bytes = [
    0xff, 0xd8,
    0xff, 0xe1, len >> 8, len & 0xff, ...payload,
    0xff, 0xdb, 0, 4, 1, 2,
    0xff, 0xda, 0, 2, 9, 9, 9,
    0xff, 0xd9,
  ];
  return new Uint8Array(bytes).buffer;
}

describe("image handling", () => {
  it("validates type and size", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/gif", size: 1000 })).toMatch(/JPEG, PNG or WebP.*5 MB/);
    expect(validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });

  it("reads EXIF orientation and defaults to 1", () => {
    expect(readOrientation(jpegWithOrientation(6))).toBe(6);
    expect(readOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBe(1);
  });

  it("strips EXIF without touching other segments", () => {
    const out = stripMetadata(jpegWithOrientation(6));
    expect(Array.from(out)).toEqual([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 9, 9, 9, 0xff, 0xd9]);
    expect(readOrientation(out.buffer)).toBe(1);
  });
});

describe("wording rules", () => {
  const forbidden = /\b(pain|painful|suffering|diagnosis|health)\b/i;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  it("uses forbidden words only on the about page", () => {
    const files = walk(join(__dirname, "..")).filter(
      (f) => /\.(tsx?)$/.test(f) && !f.includes("/test/") && !f.endsWith("routes/index.tsx"),
    );
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
