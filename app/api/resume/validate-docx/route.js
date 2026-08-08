import { NextResponse } from "next/server";
import { validateDocxBytes } from "@/lib/zip-utils";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const expected = JSON.parse(String(formData.get("expected") || "[]"));
    if (!file) return NextResponse.json({ error: "DOCX file is required." }, { status: 400 });
    const result = validateDocxBytes(await file.arrayBuffer());
    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: [`Missing DOCX entries: ${result.missing.join(", ")}`] }, { status: 400 });
    }
    const text = normalizeValidationText(result.text || "");
    const errors = expected
      .filter(Boolean)
      .map((item) => normalizeValidationText(item))
      .filter((item) => item.length > 2 && !text.includes(item.slice(0, Math.min(item.length, 40))))
      .map((item) => `Missing expected text: ${item}`);
    return NextResponse.json({ ok: errors.length === 0, errors, text: result.text });
  } catch (error) {
    return NextResponse.json({ error: error.message || "DOCX validation failed." }, { status: 500 });
  }
}

function normalizeValidationText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\|\|/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
