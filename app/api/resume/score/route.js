import { NextResponse } from "next/server";
import { analyzeResume, legacyResumeToCanonical } from "@/lib/ai-resume";
import { getCurrentUserId } from "@/lib/auth";

export async function POST(request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { resume = {}, targetRole = "", jobDescription = "" } = await request.json();
    const canonical = legacyResumeToCanonical({ ...resume, targetRole: resume.targetRole || targetRole });
    const ats = analyzeResume(canonical, jobDescription);
    return NextResponse.json({ ok: true, ats, provider: "deterministic" });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "ATS score check failed." },
      { status: 500 },
    );
  }
}
