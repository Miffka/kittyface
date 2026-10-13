// Upload validation, EXIF orientation and metadata stripping (no re-encoding).

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_BYTES = 5 * 1024 * 1024;
export const FILE_RULES_MESSAGE =
  "This file can't be used. Please choose a JPEG, PNG or WebP image up to 5 MB.";

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) return FILE_RULES_MESSAGE;
  if (file.size > MAX_BYTES) return FILE_RULES_MESSAGE;
  if (file.size === 0) return FILE_RULES_MESSAGE;
  return null;
}

type Format = "jpeg" | "png" | "webp";

const ascii = (b: Uint8Array, o: number, n: number): string =>
  String.fromCharCode(...b.subarray(o, o + n));

function detectFormat(b: Uint8Array): Format | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

function tiffOrientation(view: DataView, start: number, end: number): number {
  if (start + 8 > end || end > view.byteLength) return 1;
  const order = view.getUint16(start);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return 1;
  const u16 = (o: number) => view.getUint16(o, le);
  if (u16(start + 2) !== 42) return 1;
  const ifd = start + view.getUint32(start + 4, le);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function exifPayloadOrientation(view: DataView, start: number, end: number): number {
  let s = start;
  if (end - s >= 6 && view.getUint32(s) === 0x45786966 && view.getUint16(s + 4) === 0) s += 6;
  return tiffOrientation(view, s, end);
}

/** EXIF orientation 1–8; 1 when absent or unreadable. */
export function readOrientation(buffer: ArrayBuffer): number {
  const b = new Uint8Array(buffer);
  const view = new DataView(buffer);
  try {
    switch (detectFormat(b)) {
      case "jpeg": {
        let o = 2;
        while (o + 4 <= b.length && b[o] === 0xff) {
          const m = b[o + 1] as number;
          if (m === 0xda || m === 0xd9) break;
          const len = view.getUint16(o + 2);
          if (m === 0xe1 && o + 10 <= b.length && view.getUint32(o + 4) === 0x45786966) {
            return tiffOrientation(view, o + 10, Math.min(o + 2 + len, b.length));
          }
          o += 2 + len;
        }
        return 1;
      }
      case "png": {
        let o = 8;
        while (o + 8 <= b.length) {
          const len = view.getUint32(o);
          const type = ascii(b, o + 4, 4);
          if (type === "eXIf") return exifPayloadOrientation(view, o + 8, o + 8 + len);
          if (type === "IEND") break;
          o += 12 + len;
        }
        return 1;
      }
      case "webp": {
        let o = 12;
        while (o + 8 <= b.length) {
          const type = ascii(b, o, 4);
          const size = view.getUint32(o + 4, true);
          if (type === "EXIF") return exifPayloadOrientation(view, o + 8, o + 8 + size);
          o += 8 + size + (size & 1);
        }
        return 1;
      }
      default:
        return 1;
    }
  } catch {
    return 1;
  }
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Removes EXIF/XMP/IPTC metadata while leaving the encoded pixel data untouched. */
export function stripMetadata(buffer: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const format = detectFormat(b);

  if (format === "jpeg") {
    const parts: Uint8Array[] = [b.subarray(0, 2)];
    let o = 2;
    while (o < b.length) {
      if (b[o] !== 0xff || o + 4 > b.length) {
        parts.push(b.subarray(o));
        break;
      }
      const m = b[o + 1] as number;
      if (m === 0xda || m === 0xd9) {
        parts.push(b.subarray(o));
        break;
      }
      const len = view.getUint16(o + 2);
      const end = Math.min(o + 2 + len, b.length);
      // APP1 (EXIF / XMP) and APP13 (IPTC) are dropped.
      if (m !== 0xe1 && m !== 0xed) parts.push(b.subarray(o, end));
      o = end;
    }
    return concat(parts);
  }

  if (format === "png") {
    const drop = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);
    const parts: Uint8Array[] = [b.subarray(0, 8)];
    let o = 8;
    while (o + 8 <= b.length) {
      const len = view.getUint32(o);
      const end = Math.min(o + 12 + len, b.length);
      if (!drop.has(ascii(b, o + 4, 4))) parts.push(b.subarray(o, end));
      o = end;
    }
    return concat(parts);
  }

  if (format === "webp") {
    const chunks: Uint8Array[] = [];
    let o = 12;
    while (o + 8 <= b.length) {
      const type = ascii(b, o, 4);
      const size = view.getUint32(o + 4, true);
      const end = Math.min(o + 8 + size + (size & 1), b.length);
      if (type !== "EXIF" && type !== "XMP ") {
        const chunk = b.slice(o, end);
        if (type === "VP8X" && chunk.length > 8) chunk[8] = (chunk[8] as number) & ~(0x08 | 0x04);
        chunks.push(chunk);
      }
      o = end;
    }
    const body = concat(chunks);
    const out = new Uint8Array(12 + body.length);
    out.set(b.subarray(0, 12), 0);
    new DataView(out.buffer).setUint32(4, out.length - 8, true);
    out.set(body, 12);
    return out;
  }

  return concat([b]);
}

/** Decodes a metadata-free image and rotates it upright according to `orientation`. */
export async function uprightBitmap(blob: Blob, orientation: number): Promise<ImageBitmap> {
  const raw = await createImageBitmap(blob, { imageOrientation: "none" });
  if (orientation <= 1 || orientation > 8) return raw;
  const w = raw.width;
  const h = raw.height;
  const swap = orientation >= 5;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  const t: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  };
  const m = t[orientation];
  if (m) ctx.transform(...m);
  ctx.drawImage(raw, 0, 0);
  raw.close();
  return createImageBitmap(canvas);
}
