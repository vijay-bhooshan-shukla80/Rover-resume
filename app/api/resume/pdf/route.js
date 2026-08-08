import { NextResponse } from "next/server";
import {
  buildResumeHtmlDocument,
  ensureCanonicalResume,
  getPaginatedDocumentModel,
} from "@/lib/ai-resume";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const apiKey = process.env.DOCRAPTOR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "DocRaptor is not configured on the server." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const resume = ensureCanonicalResume(body?.resume);
    const model = getPaginatedDocumentModel(resume);
    if (model.status !== "fit") {
      return NextResponse.json({ error: "Resume does not currently fit the selected page limit." }, { status: 400 });
    }

    const html = buildResumeHtmlDocument(resume, {
      title: resume.profile?.fullName || "Resume",
      compactShell: true,
    });

    const docRaptorResponse = await fetch("https://api.docraptor.com/docs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        test: false,
        type: "pdf",
        name: `${resume.profile?.fullName || "resume"}-${model.pageSize}-${model.allowedPages}pg`,
        document_content: html,
        prince_options: {
          media: "screen",
        },
      }),
      cache: "no-store",
    });

    if (!docRaptorResponse.ok) {
      const errorText = await docRaptorResponse.text();
      return NextResponse.json({
        error: "DocRaptor PDF generation failed.",
        details: compactError(errorText),
      }, { status: 502 });
    }

    const bytes = await docRaptorResponse.arrayBuffer();
    const pageCountHeader = Number(docRaptorResponse.headers.get("x-docraptor-num-pages") || 0);
    if (pageCountHeader && pageCountHeader > model.allowedPages) {
      return NextResponse.json({
        error: `Generated PDF exceeded the ${model.allowedPages}-page limit.`,
      }, { status: 422 });
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slugify(resume.profile?.fullName || "resume")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "PDF generation failed." }, { status: 500 });
  }
}

function compactError(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function slugify(value) {
  return String(value || "resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "resume";
}
