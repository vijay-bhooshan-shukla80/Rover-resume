import { NextResponse } from "next/server";
import { tailorResumeToJobDescription } from "@/lib/jd-optimizer";
import { tailorWithGemini } from "@/lib/gemini-jd-tailor";
import { ensureCanonicalResume } from "@/lib/ai-resume";
import { applyHarshibarTemplate } from "@/lib/harshibar-template";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      resume,
      jobTitle = "",
      jobDescription = "",
      targetPages = 1,
    } = body;

    if (!jobDescription.trim() && !jobTitle.trim()) {
      return NextResponse.json(
        { error: "Please enter a Job Title or Job Description to tailor your resume." },
        { status: 400 }
      );
    }

    const canonical = ensureCanonicalResume(resume || {});
    const cleanTitle = String(jobTitle || "").trim();
    const cleanJd = String(jobDescription || "").trim();
    const pages = Number(targetPages) || 1;

    let result;
    if (process.env.GEMINI_API_KEY) {
      try {
        result = await tailorWithGemini({
          resume: canonical,
          jobTitle: cleanTitle,
          jobDescription: cleanJd,
          targetPages: pages,
        });
      } catch (geminiError) {
        console.warn("Gemini JD tailor fallback to local engine:", geminiError?.message || geminiError);
        result = tailorResumeToJobDescription({
          resume: canonical,
          jobTitle: cleanTitle,
          jobDescription: cleanJd,
          targetPages: pages,
        });
      }
    } else {
      result = tailorResumeToJobDescription({
        resume: canonical,
        jobTitle: cleanTitle,
        jobDescription: cleanJd,
        targetPages: pages,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        resume: applyHarshibarTemplate(result.optimizedResume),
        beforeScore: result.beforeScore ?? result.beforeAnalysis?.readinessScore ?? null,
        afterScore: result.afterScore ?? result.afterAnalysis?.readinessScore ?? null,
        beforeMatchScore: result.beforeMatchScore ?? result.beforeAnalysis?.jobMatchScore ?? null,
        afterMatchScore: result.afterMatchScore ?? result.afterAnalysis?.jobMatchScore ?? null,
        matchedKeywords: result.matchedKeywords || [],
        addedKeywords: result.addedKeywords || [],
        changedBullets: result.changedBullets || [],
        summaryChanged: Boolean(result.summaryChanged),
        highlightData: result.highlightData || null,
        diff: result.diff || [],
        engine: result.engine || "local",
        analysis: result.analysis || null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("JD Tailoring Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to tailor resume to job description." },
      { status: 500 }
    );
  }
}
