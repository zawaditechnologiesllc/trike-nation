/**
 * Raster decoding for the PDF writer, and — more importantly — an honest
 * explanation when it cannot be done.
 *
 * The failure this exists to prevent: an admin uploads a logo, sees it fine in
 * the browser preview (browsers read almost anything), and finds it missing
 * from the PDF. A decoder that returns null on failure leaves them unable to
 * tell whether the upload, the save, or the file itself is at fault — three
 * different fixes, one silence.
 *
 * So the probe uses the WRITER'S OWN decoder and names the actual problem.
 */

export type ProbeStatus = "ok" | "not_saved" | "unreachable" | "unusable";

export interface LogoProbe {
  status: ProbeStatus;
  /** Plain English, aimed at whoever uploaded the file. */
  message: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface DecodedImage {
  data: Uint8Array;
  width: number;
  height: number;
}

const u32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

function readPngHeader(bytes: Uint8Array): PngHeader | null {
  // IHDR is always the first chunk, at a fixed offset.
  if (bytes.length < 33) return null;
  return {
    width: u32(bytes, 16),
    height: u32(bytes, 20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlace: bytes[28],
  };
}

/** Walks JPEG markers to find SOF, which also tells us if it is progressive. */
function readJpegHeader(bytes: Uint8Array): { width: number; height: number; progressive: boolean; components: number } | null {
  let at = 2;
  while (at < bytes.length - 9) {
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // SOF0/1/2/…: baseline is C0/C1, progressive is C2.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
        progressive: marker === 0xc2,
        components: bytes[at + 9],
      };
    }
    at += 2 + length;
  }
  return null;
}

/**
 * Names what is wrong with a candidate logo, using the same checks the writer
 * uses. Never "something went wrong".
 */
export function probeLogoBytes(bytes: Uint8Array | null | undefined): LogoProbe {
  if (!bytes || bytes.length === 0) {
    return { status: "unreachable", message: "The file could not be downloaded — check the storage bucket is public." };
  }

  if (isPng(bytes)) {
    const header = readPngHeader(bytes);
    if (!header) return { status: "unusable", message: "That PNG is truncated or corrupt." };
    if (header.interlace !== 0) {
      return {
        status: "unusable",
        format: "PNG",
        message: "That PNG is interlaced (saved as 'Adam7' / 'progressive'). Re-export it without interlacing.",
        width: header.width,
        height: header.height,
      };
    }
    if (header.bitDepth === 16) {
      return {
        status: "unusable",
        format: "PNG",
        message: "That PNG is 16-bit. Re-export it at 8 bits per channel.",
        width: header.width,
        height: header.height,
      };
    }
    if (header.colorType === 4 || header.colorType === 6) {
      return {
        status: "ok",
        format: "PNG with transparency",
        message: "Usable. Transparency is flattened onto white in the PDF.",
        width: header.width,
        height: header.height,
      };
    }
    return { status: "ok", format: "PNG", message: "Usable.", width: header.width, height: header.height };
  }

  if (isJpeg(bytes)) {
    const header = readJpegHeader(bytes);
    if (!header) return { status: "unusable", message: "That JPEG is truncated or corrupt." };
    if (header.progressive) {
      return {
        status: "unusable",
        format: "JPEG",
        message: "That JPEG is progressive. Re-save it as a baseline JPEG, or use a PNG.",
        width: header.width,
        height: header.height,
      };
    }
    if (header.components === 4) {
      return {
        status: "unusable",
        format: "JPEG",
        message: "That JPEG is CMYK. Convert it to RGB and re-upload.",
        width: header.width,
        height: header.height,
      };
    }
    return { status: "ok", format: "JPEG", message: "Usable.", width: header.width, height: header.height };
  }

  // SVG is the common one: it looks perfect in the browser and is not a raster.
  const head = new TextDecoder().decode(bytes.slice(0, 200)).toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) {
    return {
      status: "unusable",
      format: "SVG",
      message: "That is an SVG, which is not a raster image. Export it as a PNG (512px wide is plenty) and re-upload.",
    };
  }

  return { status: "unusable", message: "That file is not a PNG or JPEG image." };
}

/** Probes a URL, distinguishing "not saved" from "saved but unreachable". */
export async function probeLogoUrl(url: string | null | undefined): Promise<LogoProbe> {
  if (!url?.trim()) {
    return { status: "not_saved", message: "No logo has been saved yet." };
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return {
        status: "unreachable",
        message: `The saved logo could not be downloaded (HTTP ${res.status}). If the storage bucket is private, the PDF cannot read it either.`,
      };
    }
    return probeLogoBytes(new Uint8Array(await res.arrayBuffer()));
  } catch (err) {
    return {
      status: "unreachable",
      message: `The saved logo could not be downloaded: ${err instanceof Error ? err.message : "network error"}.`,
    };
  }
}
