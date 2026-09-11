import mammoth from "mammoth";
import { cleanResumeImportText, MAX_IMPORT_BYTES, ResumeImportError } from "./resume-import.js";

export async function extractDocxResumeText(buffer) {
  if (!buffer.length || buffer.length > MAX_IMPORT_BYTES) throw new ResumeImportError("DOCX files must be nonempty and 10 MB or smaller.", 400);
  // Mammoth preserves table cells, lists and hyperlink targets in HTML. This HTML is
  // converted to plain text here and is never inserted into the browser DOM.
  const result = await mammoth.convertToHtml({ buffer }, { convertImage: () => [] });
  const decode = (text) => text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => {
    const code = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  }).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const text = cleanResumeImportText(decode(result.value
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label} ${/^https?:\/\//i.test(decode(href)) ? `(${href})` : ""}`)
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(?:td|th)>/gi, " | ")
    .replace(/<\/(?:p|h[1-6]|li|tr|table)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\s*\|\s*(?=\n|$)/g, "\n")));
  if (!text) throw new ResumeImportError("No readable text found in this DOCX. Paste extracted/OCR text and retry.");
  return text;
}
