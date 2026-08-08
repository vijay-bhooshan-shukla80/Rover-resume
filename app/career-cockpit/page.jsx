import { ResumeBuilder } from "@/components/ResumeBuilder";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Resume Maker Workspace",
  description: "Build, optimize, preview, and export ATS-friendly resumes.",
};

export default function CareerCockpitPage() {
  return <ResumeBuilder initialPremium={false} />;
}
