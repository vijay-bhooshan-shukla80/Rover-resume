"use client";

import Link from "next/link";

export default function HomePage() {
  const landingTemplates = [
    {
      title: "Frontend Developer",
      subtitle: "Web Development",
      param: "frontend"
    },
    {
      title: "Data Analyst",
      subtitle: "Analytics",
      param: "data"
    },
    {
      title: "Project Coordinator",
      subtitle: "Management",
      param: "project"
    },
    {
      title: "Customer Support Specialist",
      subtitle: "Support",
      param: "customer"
    }
  ];

  return (
    <div className="landing-container">
      <main className="dashboard-hero-card landing-hero-card">
        <div className="hero-card-left">
          <span className="eyebrow-pill">✨ AI RESUME MAKER</span>
          <h1>
            Create, import, and refine your resume with an <span className="highlight-gradient">ATS-focused AI workflow.</span>
          </h1>
          <p className="hero-copy">
            Build a clean professional resume, optimize it for a target role, and export matching PDF, Word, and text versions from one editor.
          </p>
          <div className="hero-actions-row">
            <Link className="primary-btn dashboard-cta-btn" href="/career-cockpit">
              ✨ Open AI Resume Maker &gt;
            </Link>
            <Link className="ghost-btn dashboard-import-btn" href="/career-cockpit?import=true">
              📤 Import Resume
            </Link>
          </div>
          <div className="hero-badges-row">
            <span>✓ ATS Optimized</span>
            <span>✨ AI Powered</span>
            <span>📄 Export Ready</span>
          </div>
        </div>
        <div className="hero-card-right">
          <div className="hero-illustration">
            <div className="ill-resume-card">
              <div className="ill-lines">
                <span className="line-long"></span>
                <span className="line-medium"></span>
                <span className="line-short"></span>
              </div>
            </div>
            <div className="ill-badge pdf-badge">PDF</div>
            <div className="ill-badge docx-badge">DOCX</div>
            <div className="ill-badge txt-badge">TXT</div>
            <div className="ill-score-pill">ATS Score 84/100</div>
            <div className="ill-glow-sphere"></div>
          </div>
        </div>
      </main>

      <section className="landing-examples-section">
        <div className="examples-header">
          <h2>Live ATS Resume Examples</h2>
          <p>Clean, parser-friendly resume across different roles.</p>
        </div>

        <div className="dashboard-templates-grid">
          {landingTemplates.map((tpl) => (
            <div className="tpl-card" key={tpl.title}>
              <div className="tpl-card-content">
                <div className="tpl-paper-mock">
                  <span className="tpl-mock-title">{tpl.title}</span>
                  <span className="tpl-mock-sub">{tpl.subtitle}</span>
                  <div className="tpl-mock-line"></div>
                  <div className="tpl-mock-line-short"></div>
                </div>
                <h3>{tpl.title}</h3>
                <p>{tpl.subtitle}</p>
              </div>
              <Link className="ghost-btn tpl-preview-btn" href={`/career-cockpit?template=${tpl.param}`}>
                👁 Preview & Edit
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper purple-glow">
            <span className="stat-icon">👤</span>
          </div>
          <div className="stat-info">
            <h3>10K+</h3>
            <p>Resumes Created</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper blue-glow">
            <span className="stat-icon">🛡️</span>
          </div>
          <div className="stat-info">
            <h3>98%</h3>
            <p>ATS Success Rate</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper cyan-glow">
            <span className="stat-icon">💾</span>
          </div>
          <div className="stat-info">
            <h3>50+</h3>
            <p>Export Formats</p>
          </div>
        </div>
      </section>

      <section className="dashboard-footer-banner">
        <div className="banner-left">
          <div className="banner-icon">✨</div>
          <div className="banner-text">
            <h3>Ready to build your perfect resume?</h3>
            <p>Join thousands of professionals who created ATS-optimized resumes.</p>
          </div>
        </div>
        <Link className="primary-btn banner-cta" href="/career-cockpit">
          Get Started Now →
        </Link>
      </section>
    </div>
  );
}
