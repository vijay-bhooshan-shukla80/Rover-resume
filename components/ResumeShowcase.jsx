"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const resumes = [
  {
    name: "MERN Stack Developer",
    summary:
      "MERN Stack Developer and Automation Engineer with experience in full-stack application development. Proficient in MongoDB, Express.js, React.js, Node.js, REST APIs, JWT, and workflow automation.",
    experience: [
      {
        role: "MERN Stack Developer and Web Developer",
        dates: "2023 - Present",
        bullets: ["Developed and deployed full-stack MERN applications", "Integrated REST APIs with JWT authentication and MongoDB queries"],
      },
    ],
    project: "Ecommerce Website",
    projectDate: "Feb 2025 - Aug 2025",
    skills: "Languages: HTML, CSS, JavaScript. Frontend: React.js, Responsive Design. Backend: Node.js, Express.js, RESTful APIs, JWT Authentication. Database: MongoDB, SQL.",
    certs: "Microsoft Azure; Web Development with MERN Stack",
    education: "Master of Computer Application; Bachelor of Computer Application",
  },
  {
    name: "Frontend Developer",
    summary:
      "Frontend Developer focused on responsive interfaces, accessible components, and clean React workflows. Experienced building dashboards and conversion-focused web screens.",
    experience: [
      {
        role: "Frontend Developer",
        dates: "2024 - Present",
        bullets: ["Built reusable React components for SaaS dashboards", "Improved page speed and mobile usability across key flows"],
      },
    ],
    project: "Analytics Dashboard UI",
    projectDate: "2025",
    skills: "Languages: JavaScript, HTML, CSS. Frontend: React.js, Next.js, Responsive Design. Tools: Git, Figma, API Integration.",
    certs: "Responsive Web Design Certification; React Fundamentals",
    education: "Bachelor of Information Technology",
  },
  {
    name: "Data Analyst",
    summary:
      "Data Analyst with experience turning raw business data into clear reporting, operational insights, and stakeholder-ready dashboards using SQL and BI tools.",
    experience: [
      {
        role: "Data Analyst",
        dates: "2023 - Present",
        bullets: ["Created weekly KPI dashboards for sales and operations", "Cleaned large datasets and improved report accuracy"],
      },
    ],
    project: "Sales Forecasting Report",
    projectDate: "2025",
    skills: "Analytics: SQL, Excel, Power BI, Tableau. Soft Skills: Stakeholder Communication, Documentation, Problem Solving.",
    certs: "Google Data Analytics Certificate",
    education: "Bachelor of Commerce",
  },
  {
    name: "Project Coordinator",
    summary:
      "Project Coordinator with strong scheduling, documentation, and cross-team communication skills. Experienced supporting delivery teams from planning to completion.",
    experience: [
      {
        role: "Project Coordinator",
        dates: "2022 - Present",
        bullets: ["Tracked milestones, risks, and action items for project teams", "Prepared client updates and weekly delivery reports"],
      },
    ],
    project: "Site Delivery Tracker",
    projectDate: "2024",
    skills: "Project Tools: MS Project, Excel, Jira. Strengths: Scheduling, Reporting, Vendor Coordination, Meeting Notes.",
    certs: "CAPM Coursework Completed",
    education: "Bachelor of Business Administration",
  },
  {
    name: "Customer Support Specialist",
    summary:
      "Customer Support Specialist known for calm communication, fast ticket resolution, and clear product guidance across chat and phone channels.",
    experience: [
      {
        role: "Customer Support Specialist",
        dates: "2023 - Present",
        bullets: ["Resolved customer tickets across billing and product issues", "Maintained help center articles for common workflows"],
      },
    ],
    project: "Help Center Refresh",
    projectDate: "2025",
    skills: "Support: Zendesk, Intercom, CRM Notes. Soft Skills: Empathy, De-escalation, Clear Writing, Follow-up.",
    certs: "Customer Service Excellence Training",
    education: "BA Communications",
  },
  {
    name: "Digital Marketing Executive",
    summary:
      "Digital Marketer with practical experience in campaign planning, SEO content, paid social, and performance reporting for growing online brands.",
    experience: [
      {
        role: "Digital Marketing Executive",
        dates: "2024 - Present",
        bullets: ["Managed social content calendars and campaign reports", "Optimized landing pages for search and lead capture"],
      },
    ],
    project: "Lead Generation Campaign",
    projectDate: "2025",
    skills: "Marketing: SEO, Google Ads, Meta Ads, Analytics. Tools: Canva, HubSpot, Google Search Console.",
    certs: "Google Ads Search Certification",
    education: "Bachelor of Management Studies",
  },
  {
    name: "Assistant Accountant",
    summary:
      "Accountant with experience in reconciliations, month-end support, invoice processing, and accurate financial reporting for small business teams.",
    experience: [
      {
        role: "Assistant Accountant",
        dates: "2022 - Present",
        bullets: ["Prepared bank reconciliations and month-end schedules", "Processed invoices and supported payroll checks"],
      },
    ],
    project: "Expense Audit Cleanup",
    projectDate: "2024",
    skills: "Accounting: Xero, MYOB, Excel, Reconciliations. Strengths: Accuracy, Compliance, Reporting, Time Management.",
    certs: "Xero Advisor Certification",
    education: "Bachelor of Accounting",
  },
  {
    name: "Mechanical Technician",
    summary:
      "Mechanical Technician experienced in equipment inspection, maintenance support, fault finding, and safe workshop practices in industrial environments.",
    experience: [
      {
        role: "Mechanical Technician",
        dates: "2023 - Present",
        bullets: ["Inspected machinery and completed preventive maintenance tasks", "Documented faults and supported repair planning"],
      },
    ],
    project: "Workshop Maintenance Log",
    projectDate: "2025",
    skills: "Technical: Preventive Maintenance, Hand Tools, Diagnostics, Safety Checks. Soft Skills: Teamwork, Documentation.",
    certs: "Mechanical Trade Certificate; First Aid Training",
    education: "Diploma in Mechanical Engineering",
  },
];

export function ResumeShowcase() {
  const carouselRef = useRef(null);
  const interactionRef = useRef({ hover: false, focus: false, manualUntil: 0 });
  const [autoPlay, setAutoPlay] = useState(true);
  const orderedResumes = [resumes[3], resumes[4], resumes[5], resumes[0], ...resumes.filter((_, index) => ![0, 3, 4, 5].includes(index))];
  const track = [...orderedResumes, ...orderedResumes];
  const moveCarousel = useCallback((direction) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const card = carousel.querySelector(".example-card");
    const step = (card?.getBoundingClientRect().width || 300) + 16;
    const cycleWidth = step * resumes.length;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let position = carousel.scrollLeft;
    if (direction < 0 && position <= 2) {
      position += cycleWidth;
      carousel.scrollTo({ left: position, behavior: "instant" });
    } else if (position >= cycleWidth) {
      position -= cycleWidth;
      carousel.scrollTo({ left: position, behavior: "instant" });
    }
    carousel.scrollTo({ left: position + direction * step, behavior: reduceMotion ? "instant" : "smooth" });
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!autoPlay) return;
    const timer = window.setInterval(() => {
      const interaction = interactionRef.current;
      if (motion.matches || document.hidden || interaction.hover || interaction.focus || Date.now() < interaction.manualUntil) return;
      moveCarousel(1);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [autoPlay, moveCarousel]);

  function scrollExamples(direction) {
    interactionRef.current.manualUntil = Date.now() + 6000;
    moveCarousel(direction);
  }

  return (
    <section className="showcase-section landing-examples" aria-label="ATS resume examples">
      <div className="section-head showcase-head">
        <p className="eyebrow">Resume Examples</p>
        <h2>Live ATS Resume <span>Examples</span></h2>
        <p>Clean, professional resumes across different roles. See how an ATS-optimized resume looks.</p>
      </div>
      <div className="examples-carousel"
        onMouseEnter={() => { interactionRef.current.hover = true; }}
        onMouseLeave={() => { interactionRef.current.hover = false; }}
        onFocusCapture={() => { interactionRef.current.focus = true; }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) interactionRef.current.focus = false; }}
        onPointerDown={() => { interactionRef.current.manualUntil = Date.now() + 6000; }}>
        <button className="example-arrow previous" type="button" onClick={() => scrollExamples(-1)} aria-label="Previous resume examples"><Chevron left /></button>
        <div className="examples-track" ref={carouselRef} tabIndex={0} aria-label="Scroll resume examples">
          {track.map((resume, index) => (
            <div className="example-card" key={`${resume.name}-${index}`} aria-hidden={index >= orderedResumes.length ? true : undefined}><article className="mini-resume">
              <h3>{resume.name}</h3>
              <MiniSection title="Professional Summary">
                <p>{resume.summary}</p>
              </MiniSection>
              <MiniSection title="Professional Experience">
                {resume.experience.map((item) => (
                  <div key={item.role}>
                    <div className="mini-resume-row">
                      <strong>{item.role}</strong>
                      <strong>{item.dates}</strong>
                    </div>
                    <ul>
                      {item.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </MiniSection>
              <MiniSection title="Projects">
                <div className="mini-resume-row">
                  <strong>{resume.project}</strong>
                  <strong>{resume.projectDate}</strong>
                </div>
              </MiniSection>
              <MiniSection title="Skills">
                <p>{resume.skills}</p>
              </MiniSection>
              <MiniSection title="Licences and Certifications">
                <p>{resume.certs}</p>
              </MiniSection>
              <MiniSection title="Education">
                <p>
                  <strong>{resume.education}</strong>
                </p>
              </MiniSection>
            </article><div className="example-caption"><span>{resume.name}</span></div></div>
          ))}
        </div>
        <button className="example-arrow next" type="button" onClick={() => scrollExamples(1)} aria-label="Next resume examples"><Chevron /></button>
      </div>
      <button className="carousel-autoplay" type="button" aria-pressed={!autoPlay} onClick={() => setAutoPlay((current) => !current)}>
        <span aria-hidden="true">{autoPlay ? "Ⅱ" : "▷"}</span>{autoPlay ? "Pause auto-slide" : "Resume auto-slide"}
      </button>
    </section>
  );
}

function Chevron({ left = false }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={left ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}

function MiniSection({ title, children }) {
  return (
    <>
      <h4>{title}</h4>
      {children}
    </>
  );
}
