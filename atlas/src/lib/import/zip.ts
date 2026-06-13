import { inflateRawSync } from "node:zlib";

/**
 * Extract the first CSV entry from a ZIP buffer, with zero dependencies.
 * Exchange exports (Kraken, Binance…) are often delivered zipped; this lets
 * the user drop the .zip straight in without unzipping it first.
 *
 * Reads the central directory (robust to data descriptors) and inflates the
 * entry. Supports stored (method 0) and deflate (method 8).
 */
export function extractCsvFromZip(buf: Buffer): { name: string; content: string } | null {
  const EOCD_SIG = 0x06054b50;
  const CEN_SIG = 0x02014b50;

  // Locate the End Of Central Directory record (scan from the end).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16); // central directory offset

  for (let n = 0; n < entryCount; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CEN_SIG) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf-8", ptr + 46, ptr + 46 + nameLen);

    if (name.toLowerCase().endsWith(".csv")) {
      // Jump to the local header to find where the data starts.
      const lhNameLen = buf.readUInt16LE(localOff + 26);
      const lhExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
      const slice = buf.subarray(dataStart, dataStart + compSize);
      const content =
        method === 0 ? slice.toString("utf-8") : inflateRawSync(slice).toString("utf-8");
      return { name, content };
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** ZIP files start with the local file header signature "PK\x03\x04". */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}
