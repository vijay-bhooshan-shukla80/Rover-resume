import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { extractDocxResumeText } from "@/lib/docx-resume-import";
import { MAX_IMPORT_BYTES } from "@/lib/resume-import";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || !/\.docx$/i.test(file.name || "")) return NextResponse.json({ error: "DOCX file is required." }, { status: 400 });
    if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "DOCX files must be 10 MB or smaller." }, { status: 413 });
    const arrayBuffer = await file.arrayBuffer();
    const text = await extractDocxResumeText(Buffer.from(arrayBuffer));
    return NextResponse.json({ ok: true, text });
  } catch (error) {
    return NextResponse.json({ error: error.message || "DOCX parsing failed." }, { status: error.status || 422 });
  }
}
