import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { Buffer } from "node:buffer";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return NextResponse.json({ error: "DOCX file is required." }, { status: 400 });
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
    const text = String(result.value || "").replace(/\r\n?/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
    return NextResponse.json({ ok: true, text });
  } catch (error) {
    return NextResponse.json({ error: error.message || "DOCX parsing failed." }, { status: 500 });
  }
}
