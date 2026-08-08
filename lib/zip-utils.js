import { inflateRawSync } from "node:zlib";

export function unzipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = new Map();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readUInt32(bytes, offset);
    if (signature !== 0x04034b50) break;
    const compression = readUInt16(bytes, offset + 8);
    const compressedSize = readUInt32(bytes, offset + 18);
    const fileNameLength = readUInt16(bytes, offset + 26);
    const extraFieldLength = readUInt16(bytes, offset + 28);
    const nameStart = offset + 30;
    const name = decodeUtf8(bytes.slice(nameStart, nameStart + fileNameLength));
    const dataStart = nameStart + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    const data = bytes.slice(dataStart, dataEnd);
    let content;
    if (compression === 0) {
      content = data;
    } else if (compression === 8) {
      content = inflateRawSync(data);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compression}`);
    }

    entries.set(name, content);
    offset = dataEnd;
  }

  return entries;
}

export function extractDocxText(input) {
  const entries = unzipEntries(input);
  const xml = entries.get("word/document.xml");
  if (!xml) throw new Error("word/document.xml not found in DOCX file.");
  return xmlToPlainText(decodeUtf8(xml));
}

export function validateDocxBytes(input) {
  const entries = unzipEntries(input);
  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
  ];
  const missing = required.filter((name) => !entries.has(name));
  if (missing.length) return { ok: false, missing };
  const documentXml = decodeUtf8(entries.get("word/document.xml"));
  return {
    ok: true,
    missing: [],
    documentXml,
    text: xmlToPlainText(documentXml),
  };
}

function xmlToPlainText(xml) {
  return String(xml || "")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function readUInt16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}
