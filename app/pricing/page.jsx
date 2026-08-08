import { AuthRequiredPanel } from "@/components/AuthGate";
import { Pricing } from "@/components/Pricing";
import { clerkConfigured, getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing | AI Resume Maker",
  description: "Monthly and annual AI Resume Maker pricing.",
};

export default async function PricingPage() {
  const clerkEnabled = clerkConfigured();
  const userId = await getCurrentUserId();

  if (!clerkEnabled || !userId) {
    return (
      <AuthRequiredPanel
        clerkEnabled={clerkEnabled}
        target="/pricing"
        message="Login or create an account to view AI Resume Maker pricing and premium download options."
      />
    );
  }

  return (
    <main className="pricing-page">
      <div className="pricing-page-hero">
        <p className="eyebrow">AI Resume Maker Premium</p>
        <h1>Simple pricing for ATS-ready resumes</h1>
        <p>Preview for free, then choose monthly or annual Premium when you are ready to download.</p>
      </div>
      <Pricing variant="page" clerkEnabled={clerkEnabled} />
    </main>
  );
}
