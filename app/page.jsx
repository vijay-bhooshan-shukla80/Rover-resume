import Link from "next/link";
import { ResumeShowcase } from "@/components/ResumeShowcase";
import "./homepage.css";

export default function HomePage() {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-orb orb-left" aria-hidden="true" />
        <div className="landing-orb orb-right" aria-hidden="true" />
        <div className="landing-dots dots-left" aria-hidden="true" />
        <div className="landing-dots dots-right" aria-hidden="true" />
        <div className="landing-visual" aria-label="Illustration of a resume and an example ATS analysis">
          <div className="visual-orbit orbit-one" aria-hidden="true" />
          <div className="visual-orbit orbit-two" aria-hidden="true" />
          <VisualCallout className="callout-import" icon="document" title="Import Your Resume" text="PDF, Word or Text" />
          <VisualCallout className="callout-refine" icon="edit" title="AI-Powered Refinement" text="Tailor to the job description" />
          <VisualCallout className="callout-match" icon="target" title="Match Job Description" text="Find the right keywords" />
          <VisualCallout className="callout-export" icon="chart" title="Export & Apply" text="Ready for your next opportunity" />
          <div className="visual-doc-back" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ width: `${45 + (i % 4) * 12}%` }} />)}</div>
          <div className="visual-resume" aria-hidden="true">
            <div className="visual-resume-name">Your Name <span><i /><i /></span></div>
            <div className="visual-resume-contact" />
            {["Professional Summary", "Skills", "Experience"].map((title, index) => <div className="visual-resume-section" key={title}><strong>{title}</strong>{Array.from({ length: index === 0 ? 3 : 4 }, (_, i) => <i key={i} style={{ width: `${94 - ((i + index) % 3) * 13}%` }} />)}</div>)}
            <small>RESUME PREVIEW</small>
          </div>
          <div className="visual-analysis" aria-hidden="true">
            <strong>ATS Analysis</strong>
            <div className="visual-score"><span><b>96</b><small>/100</small></span></div>
            {["Job Match", "Skills Match", "Keywords", "Formatting", "Section Complete"].map((label, i) => <div className="visual-analysis-row" key={label}><span className="visual-check">✓</span><span>{label}</span><i><b style={{ width: `${[92, 96, 88, 94, 96][i]}%` }} /></i><small>{[92, 96, 88, 94, 96][i]}</small></div>)}
            <small className="visual-sample-label">Illustrative score</small>
          </div>
        </div>
        <div className="landing-copy">
          <p className="landing-badge">AI RESUME MAKER</p>
          <h1 id="landing-title">Create, import, and refine your<br className="desktop-break" /> resume with an <span>ATS-focused AI workflow.</span></h1>
          <p className="landing-description">Build a clean, professional resume, optimize it for a target job, and export matching PDF, Word,<br className="desktop-break" /> and text versions from one editor — powered by AI.</p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/career-cockpit">Open AI Resume Maker <HomeIcon name="arrow" /></Link>
            <a className="landing-secondary" href="#how-it-works"><span className="play-disc"><HomeIcon name="play" /></span>See How It Works</a>
          </div>
        </div>
        <div className="landing-features" id="how-it-works" aria-label="How it works">
          <Feature icon="document" title="AI-Powered Optimization" text="Tailored for your target role" />
          <Feature icon="shield" title="ATS-Friendly Output" text="Clean, structured and easy to read" />
          <Feature icon="download" title="Export in Multiple Formats" text="PDF, Word and Text" />
        </div>
      </section>
      <ResumeShowcase />
    </main>
  );
}
function VisualCallout({ className, icon, title, text }) {
  return <div className={`visual-callout ${className}`}><span className="landing-icon"><HomeIcon name={icon} /></span><div><strong>{title}</strong><p>{text}</p></div></div>;
}
function Feature({ icon, title, text }) {
  return <div className="landing-feature"><span className="landing-icon"><HomeIcon name={icon} /></span><div><strong>{title}</strong><p>{text}</p></div></div>;
}
function HomeIcon({ name }) {
  const paths = {
    document: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></>,
    edit: <><path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5M3 7V4h6" /></>,
    target: <><circle cx="11" cy="13" r="8" /><circle cx="11" cy="13" r="4" /><path d="m11 13 9-10M17 3h4v4" /></>,
    chart: <path d="M5 20v-6M12 20V9M19 20V4" strokeWidth="4" />,
    shield: <><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7Z" /><path d="m8 12 3 3 5-6" /></>,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    play: <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
  };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
