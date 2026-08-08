import Link from "next/link";
import { ResumeShowcase } from "@/components/ResumeShowcase";

export default function HomePage() {
  return (
    <>
      <main className="hero">
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-mock hero-mock-editor">
            <i style={{ "--line-width": "38%" }} />
            <i style={{ "--line-width": "56%" }} />
            <i style={{ "--line-width": "74%" }} />
            <i style={{ "--line-width": "48%" }} />
            <i style={{ "--line-width": "66%" }} />
            <i style={{ "--line-width": "86%" }} />
            <i style={{ "--line-width": "55%" }} />
            <i style={{ "--line-width": "76%" }} />
            <i style={{ "--line-width": "47%" }} />
          </div>
          <div className="hero-mock hero-mock-resume">
            <b />
            <i style={{ "--line-width": "44%" }} />
            <i style={{ "--line-width": "66%" }} />
            <i style={{ "--line-width": "82%" }} />
            <hr />
            <i style={{ "--line-width": "44%" }} />
            <i style={{ "--line-width": "66%" }} />
            <i style={{ "--line-width": "82%" }} />
            <i style={{ "--line-width": "52%" }} />
            <hr />
            <i style={{ "--line-width": "44%" }} />
            <i style={{ "--line-width": "66%" }} />
            <i style={{ "--line-width": "82%" }} />
          </div>
          <div className="hero-mock hero-mock-score">
            <strong>AI</strong>
            <span>ATS Review</span>
            <i style={{ "--line-width": "43%" }} />
            <i style={{ "--line-width": "64%" }} />
            <i style={{ "--line-width": "84%" }} />
            <i style={{ "--line-width": "54%" }} />
          </div>
        </div>
        <p className="eyebrow">AI RESUME MAKER</p>
        <h1>
          <span>Create, import, and refine your resume</span>
          <span>with an ATS-focused AI workflow.</span>
        </h1>
        <p className="hero-copy">
          Build a clean professional resume, optimize it for a target role,
          and export matching PDF, Word, and text versions from one editor.
        </p>
        <div className="hero-actions">
          <Link className="primary-btn" href="/career-cockpit">
            Open AI Resume Maker
          </Link>
        </div>
      </main>
      <ResumeShowcase />
    </>
  );
}
