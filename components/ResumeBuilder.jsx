"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { PaymentButtons } from "@/components/PaymentButtons";
import {
  addSection,
  analyzeResume,
  applyFitSuggestions,
  buildAiDiff,
  buildDocxFromCanonical,
  buildTxtExport,
  canBypassPremiumGate,
  canonicalToLegacy,
  canonicalToPlainText,
  createDefaultWorkingResume,
  DEFAULT_DOCUMENT_SETTINGS,
  duplicateSection,
  ensureCanonicalResume,
  expectedVisibleStrings,
  getPaginatedDocumentModel,
  legacyResumeToCanonical,
  moveSection,
  parseImportedResume,
  preserveImportedSourceCoverage,
  RESUME_FONT_STACK,
  updateDocumentSettings,
  updateProfileField,
  updateSection,
  updateTargetRole,
  deleteSection,
} from "@/lib/ai-resume";

const STORAGE_KEY = "ai_resume_maker_v2";
const LEGACY_STORAGE_KEYS = ["ai_resume_maker_v1"];
const pendingAts = {
  readinessScore: null,
  jobMatchScore: null,
  breakdown: [],
  issues: [],
  recommendations: [],
  matchedKeywords: [],
  missingKeywords: [],
  partialKeywords: [],
};

const DASHBOARD_TEMPLATES = [
  {
    title: "Frontend Developer",
    subtitle: "Web Development",
    name: "Frontend Developer",
    summary: "Frontend Developer focused on responsive interfaces, accessible components, and clean React workflows.",
    experience: [
      {
        role: "Frontend Developer",
        dates: "2024 - Present",
        bullets: ["Built reusable React components for SaaS dashboards", "Improved page speed and mobile usability across key flows"]
      }
    ],
    project: "Analytics Dashboard UI",
    projectDate: "2025",
    skills: "Languages: JavaScript, HTML, CSS. Frontend: React.js, Next.js, Responsive Design.",
    certs: "Responsive Web Design Certification; React Fundamentals",
    education: "Bachelor of Information Technology"
  },
  {
    title: "Data Analyst",
    subtitle: "Analytics",
    name: "Data Analyst",
    summary: "Data Analyst with experience turning raw business data into clear reporting, operational insights, and stakeholder-ready dashboards using SQL and BI tools.",
    experience: [
      {
        role: "Data Analyst",
        dates: "2023 - Present",
        bullets: ["Created weekly KPI dashboards for sales and operations", "Cleaned large datasets and improved report accuracy"]
      }
    ],
    project: "Sales Forecasting Report",
    projectDate: "2025",
    skills: "Analytics: SQL, Excel, Power BI, Tableau. Soft Skills: Stakeholder Communication.",
    certs: "Google Data Analytics Certificate",
    education: "Bachelor of Commerce"
  },
  {
    title: "Project Coordinator",
    subtitle: "Management",
    name: "Project Coordinator",
    summary: "Project Coordinator with strong scheduling, documentation, and cross-team communication skills. Experienced supporting delivery teams from planning to completion.",
    experience: [
      {
        role: "Project Coordinator",
        dates: "2022 - Present",
        bullets: ["Tracked milestones, risks, and action items for project teams", "Prepared client updates and weekly delivery reports"]
      }
    ],
    project: "Site Delivery Tracker",
    projectDate: "2024",
    skills: "Project Tools: MS Project, Excel, Jira. Strengths: Scheduling, Reporting, Vendor Coordination.",
    certs: "CAPM Coursework Completed",
    education: "Bachelor of Business Administration"
  },
  {
    title: "Customer Support Specialist",
    subtitle: "Support",
    name: "Customer Support Specialist",
    summary: "Customer Support Specialist known for calm communication, fast ticket resolution, and clear product guidance across chat and phone channels.",
    experience: [
      {
        role: "Customer Support Specialist",
        dates: "2023 - Present",
        bullets: ["Resolved customer tickets across billing and product issues", "Maintained help center articles for common workflows"]
      }
    ],
    project: "Help Center Refresh",
    projectDate: "2025",
    skills: "Support: Zendesk, Intercom, CRM Notes. Soft Skills: Empathy, De-escalation.",
    certs: "Customer Service Excellence Training",
    education: "BA Communications"
  }
];

export function ResumeBuilder({ initialPremium = false }) {
  const { isLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const signedIn = isLoaded ? clerkSignedIn : false;
  const fileInputRef = useRef(null);
  const settingsRef = useRef(null);
  const [workingResume, setWorkingResume] = useState(loadInitialResume);
  const [premium, setPremium] = useState(initialPremium);
  const [jobDescription, setJobDescription] = useState("");
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [uploadTargetRole, setUploadTargetRole] = useState("");
  const [importError, setImportError] = useState("");
  const [fitPreview, setFitPreview] = useState(null);
  const [aiProposal, setAiProposal] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  const [selectedFitIds, setSelectedFitIds] = useState([]);
  const [activeView, setActiveView] = useState("dashboard");

  function handleLoadTemplate(tpl) {
    const legacy = {
      name: "Vijay Bhooshan Shukla",
      summary: tpl.summary,
      experience: tpl.experience.map((item) => ({
        role: item.role,
        company: "Corsing Hurdling",
        dates: item.dates,
        bullets: item.bullets,
        location: "Melbourne VIC | Australia",
      })),
      projects: [{ title: tpl.project, dates: tpl.projectDate, bullets: ["Developed template project using standard stack"] }],
      skills: tpl.skills,
      certifications: tpl.certs,
      education: tpl.education,
    };
    const canonical = legacyResumeToCanonical(legacy);
    canonical.profile = {
      fullName: "Vijay Bhooshan Shukla",
      phone: "+61 405 686 667",
      email: "vijaybhooshanconserv@gmail.com",
      location: "Melbourne VIC | Australia",
      linkedin: "LinkedIn",
      github: "Github",
    };
    canonical.documentSettings = {
      ...workingResume.documentSettings,
      settingsConfirmed: true,
    };
    updateResume(canonical);
    setJobDescription("");
    setActiveView("editor");
    setMessage(`${tpl.title} template loaded successfully.`);
  }

  const analysis = useMemo(() => analyzeResume(workingResume, jobDescription), [workingResume, jobDescription]);
  const pageModel = useMemo(() => getPaginatedDocumentModel(workingResume), [workingResume]);
  const canTestExports = canBypassPremiumGate();
  const premiumUnlocked = premium || canTestExports;
  const toastType = /success|saved|ready|applied|downloaded|accepted|restored/i.test(message) ? "success" : "warning";

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/payments/status")
      .then((res) => res.json())
      .then((status) => setPremium(Boolean(status.premium)))
      .catch(() => {});
  }, [signedIn]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workingResume));
    } catch {}
  }, [workingResume]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tplName = params.get("template");
    const importParam = params.get("import");
    if (tplName) {
      const found = DASHBOARD_TEMPLATES.find((t) => t.title.toLowerCase().includes(tplName.toLowerCase()));
      if (found) {
        handleLoadTemplate(found);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (importParam === "true") {
      openUpload();
      setActiveView("editor");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  function updateResume(next) {
    setWorkingResume(ensureCanonicalResume(next));
  }

  function requireDocumentSettings() {
    if (workingResume.documentSettings?.settingsConfirmed) return true;
    setMessage("Confirm document settings before creating, uploading, or generating a resume.");
    settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return false;
  }

  function confirmDocumentSettingsSilently() {
    if (workingResume.documentSettings?.settingsConfirmed) return;
    updateResume(updateDocumentSettings(workingResume, { settingsConfirmed: true }));
  }

  function confirmDocumentSettings() {
    updateResume(updateDocumentSettings(workingResume, { settingsConfirmed: true }));
    setMessage("Document settings confirmed.");
  }

  function startNewResume() {
    if (!requireDocumentSettings()) return;
    const next = createDefaultWorkingResume();
    next.documentSettings = { ...workingResume.documentSettings, settingsConfirmed: true };
    next.jobAnalysis = null;
    updateResume(next);
    setJobDescription("");
    setMessage("Blank resume ready.");
  }

  function openUpload() {
    confirmDocumentSettingsSilently();
    setImportOpen(true);
    setImportError("");
    setUploadTargetRole(workingResume.targetRole || "");
    setUploadInfo(null);
    setMessage("Upload PDF, DOCX, or TXT, then convert it into the canonical resume editor.");
  }

  function setProfileField(field, value) {
    updateResume(updateProfileField(workingResume, field, value));
  }

  function setTargetRoleField(value) {
    updateResume(updateTargetRole(workingResume, value));
  }

  function patchSection(sectionId, updater) {
    updateResume(updateSection(workingResume, sectionId, updater));
  }

  function addNewSection(type = "custom") {
    updateResume(addSection(workingResume, type));
  }

  function handleSectionDelete(sectionId) {
    updateResume(deleteSection(workingResume, sectionId));
  }

  function handleSectionDuplicate(sectionId) {
    updateResume(duplicateSection(workingResume, sectionId));
  }

  function handleSectionMove(sectionId, direction) {
    updateResume(moveSection(workingResume, sectionId, direction));
  }

  function toggleSectionVisibility(sectionId) {
    patchSection(sectionId, (section) => ({ ...section, visible: !section.visible }));
  }

  function updateSettingsField(field, value) {
    updateResume(updateDocumentSettings(workingResume, { [field]: value }));
  }

  async function handleFile(file) {
    if (!file) return;
    setUploadInfo({ name: file.name, status: "Reading file...", chars: 0 });
    const lower = file.name.toLowerCase();
    try {
      let text = "";
      if (lower.endsWith(".pdf")) {
        text = await readPdf(file);
      } else if (lower.endsWith(".docx")) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/resume/parse-docx", { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "DOCX parsing failed.");
        text = payload.text || "";
      } else if (/\.(txt|md|csv)$/i.test(file.name) || file.type.startsWith("text/")) {
        text = normalizeUploadedResumeText(await file.text());
      } else {
        throw new Error("Use PDF, DOCX, TXT, MD, or CSV files.");
      }
      setImportText(text);
      setUploadInfo({ name: file.name, status: "Source text extracted", chars: text.length, fileType: file.type || lower });
      setImportError("");
      setMessage("Resume source extracted. Click Convert Resume.");
    } catch (error) {
      setUploadInfo({ name: file.name, status: "Parsing failed", chars: 0, fileType: file.type || lower });
      setImportError(error.message || "Resume parsing failed.");
      setMessage(error.message || "Resume parsing failed.");
    }
  }

  async function convertImportedResume() {
    if (!String(importText || "").trim()) {
      setMessage("Paste or upload resume text before conversion.");
      return;
    }
    setImportLoading(true);
    setImportError("");
    try {
      let canonical = parseImportedResume(importText, {
        targetRole: uploadTargetRole,
        documentSettings: workingResume.documentSettings,
        fileName: uploadInfo?.name || "",
        fileType: uploadInfo?.fileType || "text/plain",
      });
      canonical = preserveImportedSourceCoverage(canonical, importText);
      canonical.documentSettings = { ...workingResume.documentSettings, settingsConfirmed: true };
      canonical.versionSnapshots = {
        originalResume: canonicalToLegacy(canonical),
        workingResume: null,
        lastAIEnhancedResume: null,
      };
      updateResume(canonical);
      setImportOpen(false);
      setActiveView("editor");
      setMessage("Resume converted locally with source recovery, so skipped upload text stays preserved.");
    } catch (error) {
      setImportError(error.message || "Resume conversion failed.");
      setMessage(error.message || "Resume conversion failed.");
    } finally {
      setImportLoading(false);
    }
  }

  async function enhanceResume() {
    const sourceText = canonicalToPlainText(workingResume);
    if (!sourceText.trim()) {
      setMessage("Add resume content before running AI enhancement.");
      return;
    }
    if (!signedIn) {
      setAuthGateOpen(true);
      return;
    }
    setEnhanceLoading(true);
    try {
      const response = await fetch("/api/resume/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          rawText: sourceText,
          targetRole: workingResume.targetRole,
          jobDescription,
          mode: "enhance",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "AI enhancement failed.");
      const next = legacyResumeToCanonical(payload.resume, workingResume.documentSettings, workingResume.rawImport);
      const diff = buildAiDiff(workingResume, next);
      if (!diff.length) {
        setMessage("AI returned no meaningful content changes.");
        return;
      }
      setAiProposal({
        resume: next,
        diff,
        beforeScore: analysis.readinessScore,
        afterScore: analyzeResume(next, jobDescription).readinessScore,
      });
    } catch (error) {
      setMessage(error.message || "AI enhancement failed.");
    } finally {
      setEnhanceLoading(false);
    }
  }

  function acceptAiProposal() {
    if (!aiProposal) return;
    const next = {
      ...aiProposal.resume,
      versionSnapshots: {
        ...workingResume.versionSnapshots,
        lastAIEnhancedResume: structuredClone(workingResume),
      },
    };
    updateResume(next);
    setAiProposal(null);
    setMessage("AI changes accepted.");
  }

  function undoAiChanges() {
    const previous = workingResume.versionSnapshots?.lastAIEnhancedResume;
    if (!previous) {
      setMessage("No AI changes are available to undo.");
      return;
    }
    updateResume(previous);
    setMessage("AI changes restored to the previous approved version.");
  }

  function previewFit(targetPages) {
    const next = updateDocumentSettings(workingResume, { resumeLength: targetPages, settingsConfirmed: true });
    const model = getPaginatedDocumentModel(next);
    if (model.fit) {
      updateResume(next);
      setMessage(`Resume now fits within ${targetPages} page${targetPages > 1 ? "s" : ""}.`);
      return;
    }
    setFitPreview({
      targetPages,
      suggestions: model.fitSuggestions,
    });
    setMessage("Content does not fit yet. Review fit suggestions before applying content changes.");
  }

  function applySuggestedFit() {
    if (!fitPreview) return;
    let next = updateDocumentSettings(workingResume, { resumeLength: fitPreview.targetPages, settingsConfirmed: true });
    next = applyFitSuggestions(next, selectedFitIds);
    updateResume(next);
    setFitPreview(null);
    const model = getPaginatedDocumentModel(next);
    setMessage(model.fit ? "Fit suggestions applied." : "Fit suggestions applied, but more reductions are still needed.");
  }

  function requirePremium(action) {
    action();
  }

  function downloadTxt() {
    requirePremium(() => {
      const blob = new Blob([buildTxtExport(workingResume)], { type: "text/plain;charset=utf-8" });
      downloadFile(blob, getDownloadBaseName(workingResume, "txt"));
      setMessage("TXT export downloaded.");
    });
  }

  async function downloadDocx() {
    requirePremium(async () => {
      const blob = buildDocxFromCanonical(workingResume);
      try {
        const formData = new FormData();
        formData.append("file", new File([blob], "resume.docx", { type: blob.type }));
        formData.append("expected", JSON.stringify(expectedVisibleStrings(workingResume)));
        const response = await fetch("/api/resume/validate-docx", { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          console.warn("DOCX validation warning:", payload.error || payload.errors);
          downloadFile(blob, getDownloadBaseName(workingResume, "docx"));
          setMessage(payload.error || payload.errors?.[0] || "Word document downloaded with validation warning.");
          return;
        }
      } catch (error) {
        console.warn("DOCX validation unavailable:", error);
      }
      downloadFile(blob, getDownloadBaseName(workingResume, "docx"));
      setMessage("Word document downloaded.");
    });
  }

  async function downloadPdf() {
    requirePremium(async () => {
      try {
        const response = await fetch("/api/resume/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume: workingResume }),
        });
        const payload = response.headers.get("content-type")?.includes("application/json")
          ? await response.json().catch(() => ({}))
          : null;
        if (response.ok) {
          const serverPdfBlob = await response.blob();
          const serverBytes = await serverPdfBlob.arrayBuffer();
          const validation = await validatePdfBytes(serverBytes, Math.max(workingResume.documentSettings.resumeLength, pageModel.pageCount), expectedVisibleStrings(workingResume));
          if (!validation.ok) {
            console.warn("PDF validation warnings:", validation.errors);
            downloadFile(serverPdfBlob, getDownloadBaseName(workingResume, "pdf"));
            setMessage(validation.errors[0] ? `PDF downloaded with warning: ${validation.errors[0]}` : "PDF export downloaded.");
            return;
          }
          downloadFile(serverPdfBlob, getDownloadBaseName(workingResume, "pdf"));
          setMessage("PDF export downloaded.");
          return;
        }
        console.warn("Falling back to client PDF export:", payload?.details || payload?.error || "PDF generation failed.");

        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({
          unit: "pt",
          format: workingResume.documentSettings.pageSize === "US Letter" ? "letter" : "a4",
        });
        const preset = pageModel.typography;
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = mmToPt(preset.marginMm);

        pageModel.pages.forEach((page, pageIndex) => {
          if (pageIndex > 0) doc.addPage();
          let y = margin + preset.bodySize * 0.55;
          page.forEach((item, itemIndex) => {
            const size = item.type === "name" ? preset.nameSize : item.type === "heading" ? preset.headingSize : preset.bodySize;
            const lineHeight = size * preset.lineHeight;
            doc.setFont("helvetica", item.type === "entry-title" || item.type === "heading" || item.type === "name" ? "bold" : "normal");
            doc.setFontSize(size);
            if (item.type === "heading") {
              doc.text(formatResumeHeadingLabel(item.text), margin, y);
              y += size * 0.38;
              doc.setLineWidth(0.3);
              doc.line(margin, y, pageWidth - margin, y);
              y += lineHeight + size * item.after * 0.18;
              return;
            }
            if (item.type === "name") {
              doc.text(item.text, pageWidth / 2, y, { align: "center" });
              y += lineHeight + size * item.after * 0.18;
              return;
            }
            if (item.type === "contact") {
              const consumedHeight = drawPdfContactBlock(doc, item, pageWidth, margin, y, lineHeight);
              y += consumedHeight + size * item.after * 0.18;
              return;
            }
            if (item.type === "entry-title") {
              const previousItem = page[itemIndex - 1];
              if (item.metaLine && previousItem?.type === "entry-title" && previousItem.metaLine === item.metaLine) {
                return;
              }
              const { left, right } = splitEntryTitle(item.text);
              const combinedLeft = [left, item.metaLine].filter(Boolean).join(" | ");
              const rightWidth = right ? doc.getTextWidth(right) : 0;
              const firstLineWidth = Math.max(90, pageWidth - margin * 2 - rightWidth - (preset.entryDateGapPt || 14));
              const titleLines = doc.splitTextToSize(combinedLeft || left, firstLineWidth);
              const [firstLine, ...restLines] = titleLines;
              doc.text(firstLine || combinedLeft || left, margin, y);
              if (right) doc.text(right, pageWidth - margin, y, { align: "right" });
              y += lineHeight;
              restLines.forEach((line) => {
                doc.text(line, margin, y);
                y += lineHeight;
              });
              y += size * item.after * 0.18;
              return;
            }
            if (item.type === "entry-meta" && page[itemIndex - 1]?.type === "entry-title" && page[itemIndex - 1]?.metaLine === item.text) {
              return;
            }
            if (item.type === "bullet") {
              const bulletX = margin + 2;
              const bulletIndent = preset.bulletIndentPt || 15;
              const textX = margin + bulletIndent;
              const lines = item.lines?.length ? item.lines : doc.splitTextToSize(item.text, pageWidth - margin * 2 - bulletIndent);
              if (lines.length) {
                doc.text("•", bulletX, y);
                doc.text(lines[0], textX, y);
                for (let index = 1; index < lines.length; index += 1) {
                  y += size * 1.15;
                  doc.text(lines[index], textX, y);
                }
              }
              y += size * 1.15 + size * item.after * 0.28;
              return;
            }
            const printableWidth = pageWidth - margin * 2;
            const lines = item.lines?.length ? item.lines : doc.splitTextToSize(item.text, printableWidth);
            drawPdfParagraph(doc, lines, margin, y, printableWidth, lineHeight, { justify: item.type === "paragraph" });
            y += lines.length * lineHeight + size * item.after * 0.18;
          });
          if (y > pageHeight - margin + 6) {
            throw new Error("PDF layout exceeded the printable page height.");
          }
        });

        const pdfBlob = doc.output("blob");
        const bytes = await pdfBlob.arrayBuffer();
        const legacyValidation = await validatePdfBytes(bytes, Math.max(workingResume.documentSettings.resumeLength, pageModel.pageCount), expectedVisibleStrings(workingResume));
        if (!legacyValidation.ok) {
          console.warn("PDF validation warnings:", legacyValidation.errors);
          downloadFile(pdfBlob, getDownloadBaseName(workingResume, "pdf"));
          setMessage(legacyValidation.errors[0] ? `PDF downloaded with warning: ${legacyValidation.errors[0]}` : "PDF export downloaded.");
          return;
        }
        downloadFile(pdfBlob, getDownloadBaseName(workingResume, "pdf"));
        setMessage("PDF export downloaded.");
      } catch (error) {
        setMessage(error.message || "PDF generation failed.");
      }
    });
  }

  const atsLabel = analysis.readinessScore !== null ? `${analysis.readinessScore}/100` : "--";
  const jobMatchLabel = analysis.jobMatchScore !== null ? `${analysis.jobMatchScore}/100` : "N/A";

  return (
    <main className="rover-dashboard old-builder">
      <aside className="rover-sidebar">
        <Link className="brand side-brand" href="/">
          <span>Rx</span>
          <strong>AI Resume Maker</strong>
        </Link>
        <button className={`side-link ${activeView === "dashboard" ? "active" : ""}`} type="button" onClick={() => setActiveView("dashboard")}>AI Resume Maker</button>
        <button className="side-link" type="button" onClick={() => { startNewResume(); setActiveView("editor"); }}>Create Resume</button>
        <button className="side-link" type="button" onClick={() => { openUpload(); setActiveView("editor"); }}>Upload Resume</button>
        <button className="side-link" type="button" onClick={() => { undoAiChanges(); setActiveView("editor"); }}>Undo AI Changes</button>
        <Link className="side-link" href="/">Home</Link>
        
        <div className="sidebar-promo-card">
          <h4>AI-Powered. ATS-Optimized.</h4>
          <p>Create, tailor, and export a professional resume that gets you noticed.</p>
          <div className="promo-illustration">
            <div className="promo-page p1"></div>
            <div className="promo-page p2">
              <span className="p2-line long"></span>
              <span className="p2-line med"></span>
              <span className="p2-check">✓</span>
            </div>
            <div className="promo-page p3"></div>
          </div>
          <div className="promo-score-bar">
            <div className="bar-label">
              <span>ATS Score Boost</span>
              <span>+35%</span>
            </div>
            <div className="bar-outer">
              <div className="bar-inner" style={{ width: '85%' }}></div>
            </div>
          </div>
        </div>
      </aside>

      <section className="rover-workspace">
        {activeView === "editor" && (
          <>
            <header className="workspace-headline">
              <div>
                <p className="eyebrow">Current resume</p>
                <h1>Build, tailor, fit, and export a professional ATS-friendly resume</h1>
              </div>
              <div className="actions">
                <button className="ghost-btn" type="button" onClick={openUpload}>Upload / Convert</button>
                <button className="primary-btn" type="button" onClick={startNewResume}>Create Resume</button>
              </div>
            </header>

            <section className="choice-panel">
              <article className="choice-card static-card">
                <span>ATS</span>
                <strong>ATS Readiness Score</strong>
                <small>{atsLabel}</small>
              </article>
              <article className="choice-card static-card">
                <span>JD</span>
                <strong>Job Match Score</strong>
                <small>{jobMatchLabel}</small>
              </article>
              <article className={`ats-hero-score${pageModel.status !== "fit" ? " warning" : ""}`}>
                <span>Pages</span>
                <strong>{pageModel.pageCount}</strong>
                <small>{pageModel.status === "fit" ? `Fits ${workingResume.documentSettings.resumeLength} page limit` : "Content does not fit"}</small>
              </article>
            </section>

            <section ref={settingsRef} className="form-section settings-card">
              <div className="section-title">
                <h3>Document Settings</h3>
                <button className="mini-btn" type="button" onClick={confirmDocumentSettings}>
                  {workingResume.documentSettings.settingsConfirmed ? "Confirmed" : "Confirm Settings"}
                </button>
              </div>
              <div className="two-col">
                <label className="field">
                  Page Size
                  <select value={workingResume.documentSettings.pageSize} onChange={(e) => updateSettingsField("pageSize", e.target.value)}>
                    <option value="A4">A4</option>
                    <option value="US Letter">US Letter</option>
                  </select>
                </label>
                <label className="field">
                  Resume Length
                  <select value={String(workingResume.documentSettings.resumeLength)} onChange={(e) => updateSettingsField("resumeLength", Number(e.target.value))}>
                    <option value="1">1 Page</option>
                    <option value="2">2 Pages</option>
                  </select>
                </label>
              </div>
              <div className="actions settings-actions">
                <button className="ghost-btn small" type="button" onClick={() => previewFit(1)}>Fit to 1 Page</button>
                <button className="ghost-btn small" type="button" onClick={() => previewFit(2)}>Fit to 2 Pages</button>
              </div>
              {!workingResume.documentSettings.settingsConfirmed ? <p className="notice">Document settings must be confirmed before create, upload, or AI conversion flows.</p> : null}
            </section>
          </>
        )}

        <section className="builder old-builder-grid">
          <div className="mobile-tabs">
            <button className={`ghost-btn small ${activeTab === "edit" ? "active" : ""}`} type="button" onClick={() => setActiveTab("edit")}>Edit</button>
            <button className={`ghost-btn small ${activeTab === "preview" ? "active" : ""}`} type="button" onClick={() => setActiveTab("preview")}>Preview</button>
          </div>

          {activeView === "dashboard" ? (
            <div className={`dashboard-column ${activeTab === "preview" ? "mobile-hidden" : ""}`}>
              <div className="dashboard-hero-card">
                <div className="hero-card-left">
                  <span className="eyebrow-pill">✨ AI RESUME MAKER</span>
                  <h1>
                    Create, import, and refine your resume with an <span className="highlight-gradient">ATS-focused AI workflow.</span>
                  </h1>
                  <p className="hero-copy">
                    Build a clean professional resume, optimize it for a target role, and export matching PDF, Word, and text versions from one editor.
                  </p>
                  <div className="hero-actions-row">
                    <button className="primary-btn dashboard-cta-btn" type="button" onClick={() => setActiveView("editor")}>
                      ✨ Open AI Resume Maker &gt;
                    </button>
                    <button className="ghost-btn dashboard-import-btn" type="button" onClick={() => { openUpload(); setActiveView("editor"); }}>
                      📤 Import Resume
                    </button>
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
                      <div className="ill-header">
                        <span className="ill-avatar"></span>
                        <div className="ill-header-lines">
                          <span className="line-short"></span>
                          <span className="line-medium"></span>
                        </div>
                      </div>
                      <div className="ill-body">
                        <div className="ill-checkbox-line"><span className="ill-check">✓</span><span className="line-long"></span></div>
                        <div className="ill-checkbox-line"><span className="ill-check">✓</span><span className="line-medium"></span></div>
                        <div className="ill-checkbox-line"><span className="ill-check">✓</span><span className="line-short"></span></div>
                      </div>
                    </div>
                    <div className="ill-badge pdf-badge">PDF</div>
                    <div className="ill-badge docx-badge">DOCX</div>
                    <div className="ill-badge txt-badge">TXT</div>
                    <div className="ill-score-pill">ATS Score 84/100</div>
                    <div className="ill-glow-sphere"></div>
                  </div>
                </div>
              </div>

              <div className="examples-header">
                <h2>Live ATS Resume Examples</h2>
                <p>Clean, parser-friendly resume across different roles.</p>
              </div>

              <div className="dashboard-templates-grid">
                {DASHBOARD_TEMPLATES.map((tpl) => (
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
                    <button className="ghost-btn tpl-preview-btn" type="button" onClick={() => handleLoadTemplate(tpl)}>
                      👁 Preview
                    </button>
                  </div>
                ))}
              </div>

              <div className="dashboard-stats-grid">
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
              </div>

              <div className="dashboard-footer-banner">
                <div className="banner-left">
                  <div className="banner-icon">✨</div>
                  <div className="banner-text">
                    <h3>Ready to build your perfect resume?</h3>
                    <p>Join thousands of professionals who created ATS-optimized resumes.</p>
                  </div>
                </div>
                <button className="primary-btn banner-cta" type="button" onClick={() => setActiveView("editor")}>
                  Get Started Now →
                </button>
              </div>
            </div>
          ) : (
            <form className={`editor old-editor ${activeTab === "preview" ? "mobile-hidden" : ""}`}>
              <FormSection title="Profile">
                <label className="field">Full Name<input value={workingResume.profile.fullName || ""} onChange={(e) => setProfileField("fullName", e.target.value)} /></label>
                <label className="field">Target Role<input value={workingResume.targetRole || ""} onChange={(e) => setTargetRoleField(e.target.value)} /></label>
                <div className="two-col">
                  <label className="field">Phone<input value={workingResume.profile.phone || ""} onChange={(e) => setProfileField("phone", e.target.value)} /></label>
                  <label className="field">Email<input value={workingResume.profile.email || ""} onChange={(e) => setProfileField("email", e.target.value)} /></label>
                </div>
                <label className="field">Location<input value={workingResume.profile.location || ""} onChange={(e) => setProfileField("location", e.target.value)} /></label>
                <div className="two-col">
                  <label className="field">LinkedIn URL<input value={workingResume.profile.linkedin || ""} onChange={(e) => setProfileField("linkedin", e.target.value)} /></label>
                  <label className="field">GitHub / Portfolio URL<input value={workingResume.profile.github || ""} onChange={(e) => setProfileField("github", e.target.value)} /></label>
                </div>
              </FormSection>

              <FormSection title="Job Description">
                <label className="field">Paste Job Description<textarea rows={5} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste responsibilities, tools, qualifications, or hiring requirements." /></label>
              </FormSection>

              <FormSection title="Section Library">
                <div className="actions section-add-grid">
                  {["summary", "skills", "experience", "projects", "education", "certifications", "custom"].map((type) => (
                    <button key={type} className="ghost-btn small" type="button" onClick={() => addNewSection(type)}>
                      Add {type === "custom" ? "Custom Section" : capitalize(type)}
                    </button>
                  ))}
                </div>
              </FormSection>

              {workingResume.sections.map((section, index) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  index={index}
                  onPatch={patchSection}
                  onDelete={handleSectionDelete}
                  onDuplicate={handleSectionDuplicate}
                  onMove={handleSectionMove}
                  onToggleVisibility={toggleSectionVisibility}
                />
              ))}
            </form>
          )}

          <aside className={`preview-wrap ${activeTab === "edit" ? "mobile-hidden-preview" : ""}`}>
            <div className="preview-head">
              <strong>AI Resume Maker Preview</strong>
              <div className="actions preview-actions">
                <button className="primary-btn small" type="button" onClick={enhanceResume} disabled={enhanceLoading}>{enhanceLoading ? "Enhancing..." : "Enhance Resume"}</button>
                <button className="ghost-btn small" type="button" onClick={downloadTxt}>Download TXT</button>
                <button className="ghost-btn small" type="button" onClick={downloadDocx}>Download Word (.docx)</button>
              </div>
            </div>

            {pageModel.status !== "fit" ? (
              <div className="fit-warning-card">
                <strong>Content does not fit</strong>
                <p>The preview and export pipeline will not hide or clip overflow. Review Fit Suggestions and apply them explicitly if you want content reductions.</p>
                <div className="actions">
                  <button className="ghost-btn small" type="button" onClick={() => previewFit(workingResume.documentSettings.resumeLength)}>Fit Suggestions</button>
                </div>
              </div>
            ) : null}

            <div className="resume-preview-shell paged-preview-shell">
              {pageModel.pages.map((page, pageIndex) => (
                <article className="paper resume-paper paged-paper" key={`page-${pageIndex}`} style={resumePaperStyle(pageModel)}>
                  <span className="page-chip">Page {pageIndex + 1}</span>
                  {page.map((item, itemIndex) => {
                    if (item.type === "entry-meta" && page[itemIndex - 1]?.type === "entry-title" && page[itemIndex - 1]?.metaLine === item.text) {
                      return null;
                    }
                    return <PreviewBlock key={`${pageIndex}-${itemIndex}`} item={item} />;
                  })}
                </article>
              ))}
            </div>

            <div className="suggestions">
              <h3>ATS Analysis</h3>
              <p className="notice">ATS Readiness Score: {atsLabel}</p>
              {analysis.jobMatchScore !== null ? <p className="notice">Job Match Score: {jobMatchLabel}</p> : null}
              <div className="ats-breakdown">
                {(analysis.breakdown || []).map((item) => (
                  <p key={item.label} className={item.percent >= 80 ? "success" : "notice"}>
                    <span className="ats-breakdown-label">
                      <strong>{item.label}</strong>
                      <span>{item.points} / {item.max}</span>
                    </span>
                    <span className="ats-progress-bar">
                      <span className="ats-progress-fill" style={{ width: `${item.percent}%` }}></span>
                    </span>
                  </p>
                ))}
              </div>
              {(analysis.issues || []).slice(0, 12).map((issue, index) => (
                <p className="notice" key={`${issue.type}-${index}`}>{String(issue.type || "Issue")}: {formatIssueMessage(issue.message)}</p>
              ))}
              {analysis.matchedKeywords?.length ? <p className="success">Matched: {analysis.matchedKeywords.join(", ")}</p> : null}
              {analysis.partialKeywords?.length ? <p className="notice">Partial: {analysis.partialKeywords.join(", ")}</p> : null}
              {analysis.missingKeywords?.length ? <p className="notice">Not Found: {analysis.missingKeywords.join(", ")}</p> : null}
            </div>

            {!premiumUnlocked ? (
              <div className="popup-card preview-paywall">
                <span className="plan-pill">Premium required</span>
                <h2>Unlock downloads</h2>
                <p>Production exports remain premium-gated. Development and localhost builds can still validate exports for testing.</p>
                {signedIn ? <PaymentButtons onPaid={() => setPremium(true)} /> : <button className="primary-btn" type="button" onClick={() => setAuthGateOpen(true)}>Login to unlock</button>}
              </div>
            ) : null}
          </aside>
        </section>
      </section>

      {importOpen ? (
        <UploadModal
          importText={importText}
          uploadInfo={uploadInfo}
          importLoading={importLoading}
          importError={importError}
          targetRole={uploadTargetRole}
          jobDescription={jobDescription}
          setImportText={setImportText}
          setTargetRole={setUploadTargetRole}
          setJobDescription={setJobDescription}
          onClose={() => !importLoading && setImportOpen(false)}
          onFile={handleFile}
          onConvert={convertImportedResume}
        />
      ) : null}

      {fitPreview ? (
        <FitSuggestionModal
          targetPages={fitPreview.targetPages}
          suggestions={fitPreview.suggestions}
          selectedIds={selectedFitIds}
          setSelectedIds={setSelectedFitIds}
          onClose={() => setFitPreview(null)}
          onApply={applySuggestedFit}
        />
      ) : null}

      {aiProposal ? (
        <AiDiffModal
          proposal={aiProposal}
          onAccept={acceptAiProposal}
          onClose={() => setAiProposal(null)}
        />
      ) : null}

      {upgradeOpen ? <UpgradeModal onClose={() => setUpgradeOpen(false)} onBuyNow={() => (window.location.href = "/pricing")} /> : null}
      {authGateOpen ? <LoginPromptModal onClose={() => setAuthGateOpen(false)} /> : null}
      {message ? <Toast type={toastType} message={message} onClose={() => setMessage("")} /> : null}

      <input ref={fileInputRef} className="sr-only" type="file" accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => handleFile(e.target.files?.[0])} />
    </main>
  );
}

function SectionEditor({ section, index, onPatch, onDelete, onDuplicate, onMove, onToggleVisibility }) {
  return (
    <section className="form-section">
      <div className="section-title">
        <input className="section-title-input" value={section.title} onChange={(e) => onPatch(section.id, (current) => ({ ...current, title: e.target.value }))} />
        <div className="actions inline-actions">
          <button className="mini-btn" type="button" onClick={() => onMove(section.id, "up")} disabled={index === 0}>Up</button>
          <button className="mini-btn" type="button" onClick={() => onMove(section.id, "down")}>Down</button>
          <button className="mini-btn" type="button" onClick={() => onDuplicate(section.id)}>Duplicate</button>
          <button className="mini-btn" type="button" onClick={() => onToggleVisibility(section.id)}>{section.visible ? "Hide" : "Show"}</button>
          <button className="mini-btn danger" type="button" onClick={() => onDelete(section.id)}>Delete</button>
        </div>
      </div>
      {section.type === "summary" ? <SummarySectionEditor section={section} onPatch={onPatch} /> : null}
      {section.type === "skills" ? <SkillsSectionEditor section={section} onPatch={onPatch} /> : null}
      {section.type !== "summary" && section.type !== "skills" ? <EntrySectionEditor section={section} onPatch={onPatch} /> : null}
    </section>
  );
}

function SummarySectionEditor({ section, onPatch }) {
  return (
    <label className="field">
      Summary
      <textarea rows={5} value={section.content?.text || ""} onChange={(e) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, text: e.target.value } }))} />
    </label>
  );
}

function SkillsSectionEditor({ section, onPatch }) {
  const items = section.content?.items || [];
  const categories = section.content?.categories || [];
  return (
    <>
      <label className="field">
        Skills Layout
        <select value={section.layout || "compact-list"} onChange={(e) => onPatch(section.id, (current) => ({ ...current, layout: e.target.value }))}>
          <option value="compact-list">Compact List</option>
          <option value="categorized">Categorized</option>
        </select>
      </label>
      {section.layout !== "categorized" ? (
        <label className="field">
          Skills
          <textarea rows={5} value={items.join(", ")} onChange={(e) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, items: normalizeListInput(e.target.value), categories: current.content.categories || [] } }))} />
        </label>
      ) : (
        <>
          {categories.map((category, index) => (
            <div className="item-box" key={`${category.name}-${index}`}>
              <button className="remove" type="button" onClick={() => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: current.content.categories.filter((_, itemIndex) => itemIndex !== index) } }))}>x</button>
              <label className="field">Category Title<input value={category.name} onChange={(e) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: current.content.categories.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item) } }))} /></label>
              <label className="field">Items<textarea rows={3} value={(category.items || []).join(", ")} onChange={(e) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: current.content.categories.map((item, itemIndex) => itemIndex === index ? { ...item, items: normalizeListInput(e.target.value) } : item) } }))} /></label>
            </div>
          ))}
          <button className="mini-btn" type="button" onClick={() => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: [...(current.content.categories || []), { name: "Category", items: [] }] } }))}>Add Category</button>
        </>
      )}
    </>
  );
}

function EntrySectionEditor({ section, onPatch }) {
  const entries = section.content?.entries || [];
  const paragraphs = section.content?.paragraphs || [];
  const bullets = section.content?.bullets || [];
  const supportsMixed = section.type === "custom";
  const labels = getEntryEditorLabels(section.type);
  return (
    <>
      {supportsMixed ? (
        <label className="field">
          Content Type
          <select value={section.contentType || "mixed"} onChange={(e) => onPatch(section.id, (current) => ({ ...current, contentType: e.target.value }))}>
            <option value="mixed">Mixed Content</option>
            <option value="paragraph">Paragraph</option>
            <option value="bullets">Bullet List</option>
            <option value="entry">Structured Entries</option>
          </select>
        </label>
      ) : null}
      {(section.contentType === "paragraph" || section.contentType === "mixed") ? (
        <label className="field">
          Paragraphs
          <textarea rows={4} value={paragraphs.join("\n")} onChange={(e) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, paragraphs: normalizeTextareaLines(e.target.value) } }))} />
        </label>
      ) : null}
      {(section.contentType === "bullets" || section.contentType === "mixed") ? (
        <label className="field">
          Bullets
          <textarea rows={4} value={bullets.join("\n")} onChange={(e) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, bullets: normalizeTextareaLines(e.target.value) } }))} />
        </label>
      ) : null}
      {(section.contentType === "entry" || section.contentType === "mixed" || section.type !== "custom") ? (
        <>
          {entries.map((entry, index) => (
            <div className="item-box" key={entry.id || index}>
              <button className="remove" type="button" onClick={() => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, entries: current.content.entries.filter((_, itemIndex) => itemIndex !== index) } }))}>x</button>
              <div className="two-col">
                <label className="field">{labels.title}<input value={entry.title || ""} onChange={(e) => patchEntry(onPatch, section.id, index, { title: e.target.value })} /></label>
                <label className="field">Date Range<input value={entry.dateRange || ""} onChange={(e) => patchEntry(onPatch, section.id, index, { dateRange: e.target.value })} /></label>
              </div>
              <div className="two-col">
                <label className="field">{labels.organization}<input value={entry.organization || ""} onChange={(e) => patchEntry(onPatch, section.id, index, { organization: e.target.value })} /></label>
                <label className="field">{labels.location}<input value={entry.location || ""} onChange={(e) => patchEntry(onPatch, section.id, index, { location: e.target.value })} /></label>
              </div>
              {labels.subtitle ? (
                <label className="field">{labels.subtitle}<input value={entry.subtitle || ""} onChange={(e) => patchEntry(onPatch, section.id, index, { subtitle: e.target.value })} /></label>
              ) : null}
              <label className="field">Description<textarea rows={2} value={entry.description || ""} onChange={(e) => patchEntry(onPatch, section.id, index, { description: e.target.value })} /></label>
              <label className="field">Bullets<textarea rows={4} value={(entry.bullets || []).join("\n")} onChange={(e) => patchEntry(onPatch, section.id, index, { bullets: normalizeTextareaLines(e.target.value) })} /></label>
            </div>
          ))}
          <button className="mini-btn" type="button" onClick={() => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, entries: [...(current.content.entries || []), createEntry(section.type)] } }))}>Add Entry</button>
        </>
      ) : null}
    </>
  );
}

function UploadModal({ importText, uploadInfo, importLoading, importError, targetRole, jobDescription, setImportText, setTargetRole, setJobDescription, onClose, onFile, onConvert }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card upload-modal old-upload-modal">
        <button className="popup-close" type="button" onClick={onClose}>x</button>
        <p className="eyebrow">Resume Import</p>
        <h2>Upload resume source for conversion</h2>
        <p className="muted-small">Supported: PDF, DOCX, TXT, MD, and CSV. Raw import text will be preserved for review and recovery.</p>
        <label className="drop">
          <span>Choose PDF, DOCX, or TXT</span>
          <input type="file" accept=".txt,.md,.csv,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {uploadInfo ? <div className="upload-status"><strong>{uploadInfo.name}</strong><span>{uploadInfo.status}{uploadInfo.chars ? ` - ${uploadInfo.chars} characters` : ""}</span></div> : null}
        <label className="field">Target role<input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} /></label>
        <label className="field">Job description<textarea rows={3} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} /></label>
        <label className="field">Raw import text<textarea rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} /></label>
        {importError ? <p className="notice">{importError}</p> : null}
        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-btn" type="button" onClick={onConvert} disabled={importLoading}>{importLoading ? "Converting..." : "Convert Resume"}</button>
        </div>
      </div>
    </div>
  );
}

function getEntryEditorLabels(sectionType) {
  if (sectionType === "experience") {
    return {
      title: "Job Title",
      organization: "Company",
      location: "Location",
      subtitle: null,
    };
  }
  if (sectionType === "projects") {
    return {
      title: "Project Title",
      organization: "Organization",
      location: "Location",
      subtitle: "Subtitle / Link",
    };
  }
  if (sectionType === "education") {
    return {
      title: "Degree",
      organization: "School / University",
      location: "Location",
      subtitle: null,
    };
  }
  if (sectionType === "certifications") {
    return {
      title: "Certification",
      organization: "Issuer",
      location: "Location",
      subtitle: null,
    };
  }
  return {
    title: "Title",
    organization: "Organization",
    location: "Location",
    subtitle: "Subtitle",
  };
}

function FitSuggestionModal({ targetPages, suggestions, selectedIds, setSelectedIds, onClose, onApply }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card upload-modal">
        <button className="popup-close" type="button" onClick={onClose}>x</button>
        <p className="eyebrow">Fit Suggestions</p>
        <h2>Fit to {targetPages} page{targetPages > 1 ? "s" : ""}</h2>
        <p className="muted-small">Formatting-only tightening has already been applied where safe. Select the content changes you want to approve.</p>
        {suggestions.map((suggestion) => (
          <label className="fit-suggestion" key={suggestion.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(suggestion.id)}
              disabled={suggestion.type === "format-only"}
              onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, suggestion.id] : current.filter((item) => item !== suggestion.id))}
            />
            <span>
              <strong>{suggestion.label}</strong>
              <small>{suggestion.description}</small>
            </span>
          </label>
        ))}
        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-btn" type="button" onClick={onApply}>Apply Suggestions</button>
        </div>
      </div>
    </div>
  );
}

function AiDiffModal({ proposal, onAccept, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card upload-modal">
        <button className="popup-close" type="button" onClick={onClose}>x</button>
        <p className="eyebrow">AI Change Review</p>
        <h2>Review AI enhancements before applying</h2>
        <p className="muted-small">ATS Readiness Score: {proposal.beforeScore}/100 {"->"} {proposal.afterScore}/100</p>
        <div className="diff-list">
          {proposal.diff.map((change) => (
            <article className="diff-card" key={change.id}>
              <strong>{change.title}</strong>
              <label className="field">Before<textarea rows={4} readOnly value={change.before} /></label>
              <label className="field">After<textarea rows={4} readOnly value={change.after} /></label>
            </article>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-btn" type="button" onClick={onAccept}>Accept Changes</button>
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({ item }) {
  if (item.type === "name") return <h1>{item.text}</h1>;
  if (item.type === "heading") return <h2>{formatResumeHeadingLabel(item.text)}</h2>;
  if (item.type === "entry-title") {
    const { left, right } = splitEntryTitle(item.text);
    const combinedLeft = [left, item.metaLine].filter(Boolean).join(" | ");
    return (
      <div className="resume-row">
        <strong>{combinedLeft || left}</strong>
        {right ? <strong className="resume-row-date">{right}</strong> : null}
      </div>
    );
  }
  if (item.type === "entry-meta") return <p className="resume-meta">{item.text}</p>;
  if (item.type === "bullet") return <ul className="resume-bullet-list"><li>{item.text}</li></ul>;
  if (item.type === "contact") return <p className="contact-preview">{item.text}</p>;
  return <p>{item.text}</p>;
}

function FormSection({ title, children }) {
  return <section className="form-section"><div className="section-title"><h3>{title}</h3></div>{children}</section>;
}

function LoginPromptModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="popup-card">
        <span className="plan-pill">Login Required</span>
        <h2>AI actions require an account</h2>
        <p>Please login or sign up to use AI resume conversion and enhancement features.</p>
        <div className="popup-actions">
          <Link href="/sign-up" className="primary-btn">Sign Up</Link>
          <button className="ghost-btn" type="button" onClick={onClose}>Maybe Later</button>
        </div>
      </div>
    </div>
  );
}

function UpgradeModal({ onClose, onBuyNow }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="popup-card">
        <span className="plan-pill">Premium required</span>
        <h2>Unlock production downloads</h2>
        <p>Production PDF, Word, and TXT downloads stay premium-gated. Local testing remains available without repeated live payments.</p>
        <div className="popup-actions">
          <button className="primary-btn" type="button" onClick={onBuyNow}>Buy Now</button>
          <button className="ghost-btn" type="button" onClick={onClose}>Not Now</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ type, message, onClose }) {
  return <div className={`toast ${type}`} role="status"><span>{type === "success" ? "Success" : "Notice"}</span><p>{message}</p><button type="button" onClick={onClose}>x</button></div>;
}

function patchEntry(onPatch, sectionId, index, patch) {
  onPatch(sectionId, (current) => ({
    ...current,
    content: {
      ...current.content,
      entries: current.content.entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry),
    },
  }));
}

function createEntry(type) {
  if (type === "education") return { id: createLocalId(), title: "", organization: "", dateRange: "", bullets: [], description: "" };
  return { id: createLocalId(), title: "", organization: "", subtitle: "", location: "", dateRange: "", bullets: [], description: "", url: "" };
}

function normalizeListInput(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTextareaLines(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.replace(/^[•*-]\s*/, "").trim())
    .filter(Boolean);
}

function createLocalId() {
  return Math.random().toString(36).slice(2, 10);
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function loadInitialResume() {
  if (typeof window === "undefined") return ensureCanonicalResume(createDefaultWorkingResume());
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return ensureCanonicalResume(createDefaultWorkingResume());
    return ensureCanonicalResume(JSON.parse(stored));
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {}
    return ensureCanonicalResume(createDefaultWorkingResume());
  }
}

async function readPdf(file) {
  const pdfjsLib = await loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), disableWorker: true }).promise;
  const pages = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => String(item.str || "").trim())
        .filter(Boolean)
        .join(" "),
    );
  }
  return normalizeUploadedResumeText(pages.join("\n\n"));
}

function normalizeUploadedResumeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2022\u25cf\u25aa]/g, "\n- ")
    .replace(/[\u2013\u2014]/g, "-")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

function getDownloadBaseName(resume, extension) {
  const fullName = String(resume.profile?.fullName || "resume").trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const role = String(resume.targetRole || "").trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = [fullName, role, "Resume"].filter(Boolean).join("_") || "Resume";
  return `${base}.${extension}`;
}

async function validatePdfBytes(bytes, allowedPages, expectedStrings) {
  const pdfjsLib = await loadPdfJs();
  const doc = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
  const errors = [];
  if (allowedPages === 1 && doc.numPages !== 1) errors.push("PDF must be exactly 1 page.");
  if (allowedPages === 2 && doc.numPages > 2) errors.push("PDF exceeds the 2-page limit.");
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => String(item.str || "").trim()).filter(Boolean).join(" "));
  }
  const joined = normalizeValidationText(pageTexts.join(" "));
  const headingCounts = new Map();
  expectedStrings
    .filter((value, index) => index > 0 && /^[A-Z][A-Z &/()-]+$/.test(String(value || "").trim()))
    .forEach((heading) => {
      const normalizedHeading = normalizeValidationText(heading);
      if (!normalizedHeading) return;
      const matches = joined.match(new RegExp(escapeRegExp(normalizedHeading), "g")) || [];
      headingCounts.set(heading, matches.length);
    });
  expectedStrings.slice(0, 10).forEach((value) => {
    const needle = normalizeValidationText(value);
    if (needle && needle.length > 2 && !joined.includes(needle.slice(0, Math.min(needle.length, 40)))) {
      errors.push(`Missing expected PDF text: ${value}`);
    }
  });
  headingCounts.forEach((count, heading) => {
    if (count > 1) errors.push(`Duplicated PDF heading detected: ${heading}`);
  });
  if (pageTexts.some((text) => !text.trim())) errors.push("Unexpected blank PDF page detected.");
  return { ok: errors.length === 0, errors };
}

function mmToPt(mm) {
  return Math.round(mm * 2.83465 * 100) / 100;
}

function normalizeValidationText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\|\|/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatIssueMessage(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return "Issue detected.";
    }
  }
  return String(value || "Issue detected.");
}

function splitEntryTitle(value) {
  const [left, right] = String(value || "").split(" || ").map((item) => String(item || "").trim());
  return { left, right };
}

function formatResumeHeadingLabel(value) {
  return String(value || "");
}

function drawPdfContactBlock(doc, item, pageWidth, margin, y, lineHeight) {
  const parts = Array.isArray(item.parts) && item.parts.length ? item.parts : String(item.text || "").split("|").map((part) => ({ label: String(part).trim() })).filter((part) => part.label);
  const maxWidth = pageWidth - margin * 2;
  const lines = [];
  let currentLine = [];

  parts.forEach((part) => {
    const nextLine = [...currentLine, part];
    if (currentLine.length && measurePdfContactLine(doc, nextLine) > maxWidth) {
      lines.push(currentLine);
      currentLine = [part];
      return;
    }
    currentLine = nextLine;
  });
  if (currentLine.length) lines.push(currentLine);

  lines.forEach((lineParts, lineIndex) => {
    drawPdfContactLine(doc, lineParts, pageWidth / 2, y + lineIndex * lineHeight);
  });
  return Math.max(1, lines.length) * lineHeight;
}

function drawPdfContactLine(doc, parts, centerX, y) {
  const separator = " | ";
  const totalWidth = parts.reduce((sum, part, index) => {
    return sum + doc.getTextWidth(part.label) + (index < parts.length - 1 ? doc.getTextWidth(separator) : 0);
  }, 0);
  let cursorX = centerX - totalWidth / 2;
  parts.forEach((part, index) => {
    if (part.url) {
      doc.textWithLink(part.label, cursorX, y, { url: part.url });
    } else {
      doc.text(part.label, cursorX, y);
    }
    cursorX += doc.getTextWidth(part.label);
    if (index < parts.length - 1) {
      doc.text(separator, cursorX, y);
      cursorX += doc.getTextWidth(separator);
    }
  });
}

function measurePdfContactLine(doc, parts) {
  const separator = " | ";
  return parts.reduce((sum, part, index) => {
    return sum + doc.getTextWidth(part.label) + (index < parts.length - 1 ? doc.getTextWidth(separator) : 0);
  }, 0);
}

function resumePaperStyle(pageModel) {
  const preset = pageModel.typography || {};
  return {
    "--resume-font-family": RESUME_FONT_STACK,
    "--resume-page-width": `${pageModel.pageSize === "US Letter" ? 816 : 794}px`,
    "--resume-page-min-height": `${pageModel.pageSize === "US Letter" ? 1056 : 1122}px`,
    "--resume-padding": `${Math.round(mmToPt(preset.marginMm || 14))}px`,
    "--resume-name-size": `${preset.nameSize || 19.2}pt`,
    "--resume-heading-size": `${preset.headingSize || 11}pt`,
    "--resume-body-size": `${preset.bodySize || 9.8}pt`,
    "--resume-line-height": String(preset.lineHeight || 1.16),
    "--resume-heading-gap": `${Math.max(10, Math.round((preset.headingSpacing || 0.9) * 12))}px`,
    "--resume-paragraph-gap": `${Math.max(4, Math.round((preset.paragraphSpacing || 0.42) * 10))}px`,
    "--resume-bullet-gap": `${Math.max(2, Math.round((preset.bulletSpacing || 0.32) * 8))}px`,
    "--resume-section-gap": `${Math.max(8, Math.round((preset.sectionSpacing || 0.92) * 12))}px`,
    "--resume-bullet-indent": `${Math.round(preset.bulletIndentPt || 15)}pt`,
  };
}

function drawPdfParagraph(doc, lines, x, y, width, lineHeight, options = {}) {
  const renderedLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  renderedLines.forEach((line, index) => {
    const isLast = index === renderedLines.length - 1;
    if (options.justify && !isLast && shouldJustifyLine(doc, line, width)) {
      drawJustifiedLine(doc, line, x, y + index * lineHeight, width);
    } else {
      doc.text(line, x, y + index * lineHeight);
    }
  });
}

function shouldJustifyLine(doc, line, width) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const lineWidth = doc.getTextWidth(line);
  if (lineWidth >= width * 0.97) return false;
  const extraPerGap = (width - lineWidth) / Math.max(1, words.length - 1);
  return extraPerGap <= doc.getFontSize() * 0.65;
}

function drawJustifiedLine(doc, line, x, y, width) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    doc.text(line, x, y);
    return;
  }
  const wordWidths = words.map((word) => doc.getTextWidth(word));
  const textWidth = wordWidths.reduce((sum, value) => sum + value, 0);
  const gap = (width - textWidth) / (words.length - 1);
  let cursorX = x;
  words.forEach((word, index) => {
    doc.text(word, cursorX, y);
    cursorX += wordWidths[index] + (index < words.length - 1 ? gap : 0);
  });
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let pdfJsPromise = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs")
      .then((module) => {
        const pdfjsLib = module?.default || module;
        if (pdfjsLib?.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }
        return pdfjsLib;
      })
      .catch((error) => {
        pdfJsPromise = null;
        throw new Error(error?.message || "PDF parser unavailable.");
      });
  }
  return pdfJsPromise;
}
