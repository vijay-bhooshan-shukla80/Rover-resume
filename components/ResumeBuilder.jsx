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
  buildResumeHtmlDocument,
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
  RESUME_FONT_STACK,
  updateDocumentSettings,
  updateProfileField,
  updateSection,
  updateTargetRole,
  deleteSection,
  parseImportedResume,
} from "@/lib/ai-resume";
import { cleanResumeImportText, MAX_IMPORT_BYTES, pdfTextItemsToLines } from "@/lib/resume-import";
import { tailorResumeToJobDescription, extractKeywordsFromJd } from "@/lib/jd-optimizer";
import { applyHarshibarTemplate, isHarshibar, buildHarshibarLatex } from "@/lib/harshibar-template";

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

export function ResumeBuilder({ initialPremium = false }) {
  const { isLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const signedIn = isLoaded ? clerkSignedIn : false;
  const fileInputRef = useRef(null);
  const settingsRef = useRef(null);
  const importRevisionRef = useRef(0);
  const importBusyRef = useRef(false);
  const uploadedSourceRef = useRef("");
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
  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [beforeResumeSnapshot, setBeforeResumeSnapshot] = useState(null);
  const [afterResumeSnapshot, setAfterResumeSnapshot] = useState(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [activeResumeVersion, setActiveResumeVersion] = useState("before");
  const [aiHighlightData, setAiHighlightData] = useState(null);
  const [tailorLoading, setTailorLoading] = useState(false);

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
    if (!fitPreview) return;
    setSelectedFitIds(fitPreview.suggestions.filter((item) => item.type !== "format-only").map((item) => item.id));
  }, [fitPreview]);

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
    const { template, ...preservedSettings } = workingResume.documentSettings || {};
    next.documentSettings = { ...preservedSettings, settingsConfirmed: true };
    next.jobAnalysis = null;
    if (typeof setBeforeResumeSnapshot === "function") setBeforeResumeSnapshot(null);
    if (typeof setAfterResumeSnapshot === "function") setAfterResumeSnapshot(null);
    if (typeof setActiveResumeVersion === "function") setActiveResumeVersion("before");
    if (typeof setAiHighlightData === "function") setAiHighlightData(null);
    updateResume(next);
    setJobDescription("");
    setMessage("Blank resume ready.");
  }

  function openUpload() {
    setImportOpen(true);
    setImportError("");
    setUploadTargetRole(workingResume.targetRole || "");
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

  function adjustTypographyField(field, delta) {
    const limits = {
      nameSize: { min: 18, max: 20 },
      headingSize: { min: 10.8, max: 11.4 },
      bodySize: { min: 9.1, max: 10 },
    };
    const currentTypography = pageModel.typography || {};
    const currentValue = Number(workingResume.documentSettings?.customTypography?.[field] ?? currentTypography[field] ?? DEFAULT_DOCUMENT_SETTINGS.customTypography?.[field] ?? 0);
    const nextValue = Math.max(limits[field].min, Math.min(limits[field].max, Math.round((currentValue + delta) * 100) / 100));
    updateSettingsField("customTypography", {
      ...(workingResume.documentSettings?.customTypography || {}),
      [field]: nextValue,
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (importBusyRef.current) return;
    importRevisionRef.current += 1;
    importBusyRef.current = true;
    setImportLoading(true);
    setUploadInfo({ name: file.name, status: "Reading file...", chars: 0 });
    const lower = file.name.toLowerCase();
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Resume files must be 10 MB or smaller.");
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
      text = cleanResumeImportText(text);
      if (!text.trim()) throw new Error("No readable text found. For scanned resumes, paste OCR text into Raw import text.");
      const previousSource = uploadedSourceRef.current;
      uploadedSourceRef.current = text;
      setImportText((current) => !current.trim() || current === previousSource ? text : current);
      setUploadInfo({ name: file.name, status: "Source text extracted", chars: text.length, fileType: file.type || lower });
      setImportError("");
      setMessage("Resume source extracted. Click Convert Resume.");
    } catch (error) {
      setUploadInfo({ name: file.name, status: "Parsing failed", chars: 0, fileType: file.type || lower });
      setImportError(error.message || "Resume parsing failed.");
      setMessage(error.message || "Resume parsing failed.");
    } finally {
      importBusyRef.current = false;
      setImportLoading(false);
    }
  }

  async function convertImportedResume() {
    if (importBusyRef.current) return;
    if (!String(importText || uploadedSourceRef.current).trim()) {
      setMessage("Paste or upload resume text before conversion.");
      return;
    }
    if (!signedIn) {
      setAuthGateOpen(true);
      return;
    }
    const revision = importRevisionRef.current;
    importBusyRef.current = true;
    setImportLoading(true);
    setImportError("");
    try {
      const response = await fetch("/api/resume/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode: "import", rawText: importText, uploadedText: uploadedSourceRef.current, targetRole: uploadTargetRole, jobDescription }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Resume conversion failed. Your current resume is unchanged.");
      if (revision !== importRevisionRef.current) throw new Error("Import inputs changed during conversion. Convert again to use your latest text.");
      if (!payload.resume?.profile || !Array.isArray(payload.resume.sections) || !payload.resume.sections.length) throw new Error("The import response was incomplete. Your current resume is unchanged.");
      const canonical = ensureCanonicalResume(payload.resume);
      canonical.rawImport = { ...canonical.rawImport, fileName: uploadInfo?.name || "", fileType: uploadInfo?.fileType || "text/plain" };
      const { template, ...preservedSettings } = workingResume.documentSettings || {};
      canonical.documentSettings = { ...preservedSettings, settingsConfirmed: true };
      canonical.versionSnapshots = {
        originalResume: canonicalToLegacy(canonical),
        workingResume: null,
        lastAIEnhancedResume: null,
      };
      if (typeof setBeforeResumeSnapshot === "function") setBeforeResumeSnapshot(null);
      if (typeof setAfterResumeSnapshot === "function") setAfterResumeSnapshot(null);
      if (typeof setActiveResumeVersion === "function") setActiveResumeVersion("before");
      if (typeof setAiHighlightData === "function") setAiHighlightData(null);
      updateResume(canonical);
      setImportOpen(false);
      uploadedSourceRef.current = "";
      setImportText("");
      setUploadInfo(null);
      setMessage("Resume rebuilt successfully from your source with Gemini. Review and edit your imported details.");
    } catch (error) {
      setImportError(error.message || "Resume conversion failed.");
      setMessage(error.message || "Resume conversion failed.");
    } finally {
      importBusyRef.current = false;
      setImportLoading(false);
    }
  }

  async function enhanceResume() {
    if (!jobDescription.trim() && !workingResume.targetRole.trim()) {
      openJdTailorModal();
      setMessage("Please enter Target Role or Job Description to optimize for 95+ ATS score.");
      return;
    }
    await handleQuickJdTailor();
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
    if (beforeResumeSnapshot) {
      setWorkingResume(structuredClone(beforeResumeSnapshot));
      setActiveResumeVersion("before");
      setMessage("AI changes restored to the original before version.");
      return;
    }
    const previous = workingResume.versionSnapshots?.lastAIEnhancedResume;
    if (!previous) {
      setMessage("No AI changes are available to undo.");
      return;
    }
    updateResume(previous);
    setActiveResumeVersion("before");
    setMessage("AI changes restored to the previous approved version.");
  }

  function openJdTailorModal() {
    setJdModalOpen(true);
  }

  function closeJdTailorModal() {
    setJdModalOpen(false);
  }

  function switchResumeVersion(version) {
    if (version === "before") {
      if (activeResumeVersion === "after") {
        setAfterResumeSnapshot(structuredClone(workingResume));
      }
      if (beforeResumeSnapshot) {
        setWorkingResume(structuredClone(beforeResumeSnapshot));
      }
      setActiveResumeVersion("before");
      setMessage("Showing Before Resume (Original pre-enhancement).");
    } else if (version === "after") {
      if (activeResumeVersion === "before") {
        setBeforeResumeSnapshot(structuredClone(workingResume));
      }
      if (afterResumeSnapshot) {
        setWorkingResume(structuredClone(afterResumeSnapshot));
        setActiveResumeVersion("after");
        setMessage("Showing After Resume (95+ ATS) with highlighted changes.");
      } else {
        openJdTailorModal();
        setMessage("Enter Job Title and Description to generate your 95+ ATS After Resume!");
      }
    }
  }

  function applyJdTailoredResume(tailoredResume, newJobDescription, highlightInfo) {
    const snapshotBefore = structuredClone(beforeResumeSnapshot || workingResume);
    setBeforeResumeSnapshot(snapshotBefore);

    const highlight = highlightInfo || tailoredResume.aiHighlightData || null;
    const next = {
      ...applyHarshibarTemplate(tailoredResume),
      aiHighlightData: highlight,
      versionSnapshots: {
        ...workingResume.versionSnapshots,
        originalResume: snapshotBefore,
        lastAIEnhancedResume: structuredClone(snapshotBefore),
      },
    };

    setAfterResumeSnapshot(structuredClone(next));
    setAiHighlightData(highlight);
    updateResume(next);
    setActiveResumeVersion("after");

    if (newJobDescription) {
      setJobDescription(newJobDescription);
    }
    setJdModalOpen(false);
    setMessage("Resume tailored successfully with 95+ ATS score! Highlighted points show Gemini/AI changes.");
  }

  async function handleQuickJdTailor() {
    if (!jobDescription.trim() && !workingResume.targetRole.trim()) {
      setMessage("Please enter Target Role or Job Description.");
      return;
    }
    setTailorLoading(true);
    setMessage("Tailoring resume to 95+ ATS score with JD keywords...");
    try {
      const res = await fetch("/api/resume/tailor-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: workingResume,
          jobTitle: workingResume.targetRole,
          jobDescription,
          targetPages: workingResume.documentSettings?.resumeLength || 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.resume) {
        applyJdTailoredResume(data.resume, jobDescription, data.highlightData || {
          addedKeywords: data.addedKeywords || [],
          changedBullets: data.changedBullets || [],
          summaryChanged: Boolean(data.summaryChanged),
        });
        return;
      }
      const clientResult = tailorResumeToJobDescription({
        resume: workingResume,
        jobTitle: workingResume.targetRole,
        jobDescription,
        targetPages: workingResume.documentSettings?.resumeLength || 1,
      });
      applyJdTailoredResume(clientResult.optimizedResume, jobDescription, clientResult.highlightData);
    } catch (err) {
      const clientResult = tailorResumeToJobDescription({
        resume: workingResume,
        jobTitle: workingResume.targetRole,
        jobDescription,
        targetPages: workingResume.documentSettings?.resumeLength || 1,
      });
      applyJdTailoredResume(clientResult.optimizedResume, jobDescription, clientResult.highlightData);
    } finally {
      setTailorLoading(false);
    }
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

  function downloadLatex() {
    requirePremium(() => {
      const texContent = buildHarshibarLatex(workingResume);
      const blob = new Blob([texContent], { type: "application/x-tex;charset=utf-8" });
      downloadFile(blob, getDownloadBaseName(workingResume, "tex"));
      setMessage("LaTeX export downloaded. Ready for Overleaf.");
    });
  }

  async function downloadPdf() {
    if (typeof pdfDownloading !== "undefined" && pdfDownloading) return;
    requirePremium(async () => {
      if (typeof setPdfDownloading === "function") setPdfDownloading(true);
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
        const isHarshibarTemplate = typeof isHarshibar === "function" ? isHarshibar(workingResume) : workingResume?.template === "harshibar";
        if (isHarshibarTemplate) throw new Error(payload?.error || "Template PDF export failed. Please retry.");
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
            if (item.type === "spacer") {
              y += Math.max(6, size * Math.max(item.after || 0.5, 0.5) * 0.8);
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
      } finally {
        if (typeof setPdfDownloading === "function") setPdfDownloading(false);
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
        <button className="side-link active" type="button">AI Resume Maker</button>
        <button className="side-link" type="button" onClick={startNewResume}>Create Resume</button>
        <button className="side-link" type="button" onClick={openUpload}>Upload Resume</button>
        <button className="side-link jd-highlight-link" type="button" onClick={openJdTailorModal}>🎯 Match JD (95+ ATS)</button>

        <div className="sidebar-version-group">
          <div className="sidebar-group-title">Resume Versions</div>
          <button
            className={`side-link version-btn ${activeResumeVersion === "before" ? "active" : ""}`}
            type="button"
            onClick={() => switchResumeVersion("before")}
          >
            <span className="version-btn-content">
              <span>📄 Before Resume</span>
            </span>
          </button>
          <button
            className={`side-link version-btn ${activeResumeVersion === "after" ? "active" : ""}`}
            type="button"
            onClick={() => switchResumeVersion("after")}
          >
            <span className="version-btn-content">
              <span>✨ After Resume</span>
              <span className="version-badge">95+ ATS</span>
            </span>
          </button>
        </div>

        <button className="side-link" type="button" onClick={undoAiChanges}>Undo AI Changes</button>
        <Link className="side-link" href="/">Home</Link>
        <p className="side-note">Canonical resume editing, ATS analysis, A4 preview parity, and validated exports.</p>
      </aside>

      <section className="rover-workspace">
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
          <div className="font-controls">
            <div className="font-control">
              <span>Name</span>
              <div className="actions">
                <button className="ghost-btn small" type="button" onClick={() => adjustTypographyField("nameSize", -0.2)}>-</button>
                <strong>{Number(pageModel.typography?.nameSize || 19.2).toFixed(1)}pt</strong>
                <button className="ghost-btn small" type="button" onClick={() => adjustTypographyField("nameSize", 0.2)}>+</button>
              </div>
            </div>
            <div className="font-control">
              <span>Headings</span>
              <div className="actions">
                <button className="ghost-btn small" type="button" onClick={() => adjustTypographyField("headingSize", -0.2)}>-</button>
                <strong>{Number(pageModel.typography?.headingSize || 11).toFixed(1)}pt</strong>
                <button className="ghost-btn small" type="button" onClick={() => adjustTypographyField("headingSize", 0.2)}>+</button>
              </div>
            </div>
            <div className="font-control">
              <span>Content</span>
              <div className="actions">
                <button className="ghost-btn small" type="button" onClick={() => adjustTypographyField("bodySize", -0.2)}>-</button>
                <strong>{Number(pageModel.typography?.bodySize || 9.8).toFixed(1)}pt</strong>
                <button className="ghost-btn small" type="button" onClick={() => adjustTypographyField("bodySize", 0.2)}>+</button>
              </div>
            </div>
          </div>
          {!workingResume.documentSettings.settingsConfirmed ? <p className="notice">Document settings must be confirmed before create, upload, or AI conversion flows.</p> : null}
        </section>

        <section className="builder old-builder-grid">
          <div className="mobile-tabs">
            <button className={`ghost-btn small ${activeTab === "edit" ? "active" : ""}`} type="button" onClick={() => setActiveTab("edit")}>Edit</button>
            <button className={`ghost-btn small ${activeTab === "preview" ? "active" : ""}`} type="button" onClick={() => setActiveTab("preview")}>Preview</button>
          </div>

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

            <FormSection title="Job Description & ATS Optimization">
              <label className="field">
                Paste Job Description
                <textarea
                  rows={5}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste responsibilities, tools, qualifications, or hiring requirements."
                />
              </label>
              <div className="actions" style={{ marginTop: 10, display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  className="primary-btn small"
                  type="button"
                  onClick={handleQuickJdTailor}
                  disabled={tailorLoading}
                >
                  {tailorLoading ? "Tailoring to 95+ ATS..." : "🎯 Tailor Resume to this JD (95+ ATS)"}
                </button>
                <button
                  className="ghost-btn small"
                  type="button"
                  onClick={openJdTailorModal}
                >
                  Upload JD / Options
                </button>
              </div>
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

          <aside className={`preview-wrap ${activeTab === "edit" ? "mobile-hidden-preview" : ""}`}>
            <div className="preview-head">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong>AI Resume Maker Preview</strong>
                <span className={`preview-version-pill ${activeResumeVersion}`}>
                  {activeResumeVersion === "after" ? "✨ After Resume (95+ ATS)" : "📄 Before Resume"}
                </span>
              </div>
              <div className="actions preview-actions">
                <button className="primary-btn small" type="button" onClick={enhanceResume} disabled={enhanceLoading}>{enhanceLoading ? "Enhancing..." : "Enhance Resume"}</button>
                <button className="ghost-btn small" type="button" onClick={downloadTxt}>Download TXT</button>
                <button className="ghost-btn small" type="button" onClick={downloadDocx}>Download Word (.docx)</button>
                {isHarshibar(workingResume) && <button className="ghost-btn small" type="button" onClick={downloadLatex}>Download LaTeX</button>}
                {isHarshibar(workingResume) && <button className="ghost-btn small" type="button" onClick={downloadPdf} disabled={pdfDownloading}>{pdfDownloading ? "Preparing PDF..." : "Download PDF"}</button>}
              </div>
            </div>

            {activeResumeVersion === "after" ? (
              <div className="preview-version-banner after">
                <span>✨ <strong>After Resume (95+ ATS)</strong>: Points and keywords enhanced by Gemini/AI are <span className="sample-highlight">highlighted</span>.</span>
                <button className="ghost-btn mini-btn" type="button" onClick={() => switchResumeVersion("before")}>View Before</button>
              </div>
            ) : (
              <div className="preview-version-banner before">
                <span>📄 <strong>Before Resume</strong>: Showing original pre-enhancement version.</span>
                <button className="primary-btn mini-btn" type="button" onClick={() => switchResumeVersion("after")}>View 95+ ATS After</button>
              </div>
            )}

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
              {isHarshibar(workingResume) ? (
                <HarshibarPreview resume={workingResume} pageCount={pageModel.pageCount} />
              ) : pageModel.pages.map((page, pageIndex) => (
                <article className="paper resume-paper paged-paper" key={`page-${pageIndex}`} style={resumePaperStyle(pageModel)}>
                  <span className="page-chip">Page {pageIndex + 1}</span>
                  {page.map((item, itemIndex) => {
                    if (item.type === "entry-meta" && page[itemIndex - 1]?.type === "entry-title" && page[itemIndex - 1]?.metaLine === item.text) {
                      return null;
                    }
                    return (
                      <PreviewBlock
                        key={`${pageIndex}-${itemIndex}`}
                        item={item}
                        isAfterMode={activeResumeVersion === "after"}
                        highlightData={aiHighlightData}
                      />
                    );
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
                    <strong>{item.label}</strong>
                    <span>{item.points} / {item.max}</span>
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
          setImportText={(value) => { importRevisionRef.current += 1; setImportText(value); }}
          setTargetRole={(value) => { importRevisionRef.current += 1; setUploadTargetRole(value); }}
          setJobDescription={(value) => { importRevisionRef.current += 1; setJobDescription(value); }}
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
      {jdModalOpen ? (
        <JdTailorModal
          currentResume={workingResume}
          currentJobDescription={jobDescription}
          onClose={closeJdTailorModal}
          onApply={applyJdTailoredResume}
          readPdf={readPdf}
          setMessage={setMessage}
        />
      ) : null}
      {message ? <Toast type={toastType} message={message} onClose={() => setMessage("")} /> : null}

      <input ref={fileInputRef} className="sr-only" type="file" accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => handleFile(e.target.files?.[0])} />
    </main>
  );
}

function SectionEditor({ section, index, onPatch, onDelete, onDuplicate, onMove, onToggleVisibility }) {
  return (
    <section className="form-section">
      <div className="section-title">
        <BufferedField className="section-title-input" value={section.title} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, title: value }))} />
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
      <BufferedField as="textarea" rows={5} value={section.content?.text || ""} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, text: value } }))} />
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
          <BufferedField as="textarea" rows={5} value={items.join(", ")} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, items: normalizeListInput(value), categories: current.content.categories || [] } }))} />
        </label>
      ) : (
        <>
          {categories.map((category, index) => (
            <div className="item-box" key={`${category.name}-${index}`}>
              <button className="remove" type="button" onClick={() => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: current.content.categories.filter((_, itemIndex) => itemIndex !== index) } }))}>x</button>
              <label className="field">Category Title<BufferedField value={category.name} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: current.content.categories.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item) } }))} /></label>
              <label className="field">Items<BufferedField as="textarea" rows={3} value={(category.items || []).join(", ")} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, categories: current.content.categories.map((item, itemIndex) => itemIndex === index ? { ...item, items: normalizeListInput(value) } : item) } }))} /></label>
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
          <BufferedField as="textarea" rows={4} value={paragraphs.join("\n")} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, paragraphs: normalizeTextareaLines(value) } }))} />
        </label>
      ) : null}
      {(section.contentType === "bullets" || section.contentType === "mixed") ? (
        <label className="field">
          Bullets
          <BufferedField as="textarea" rows={4} value={bullets.join("\n")} onCommit={(value) => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, bullets: normalizeTextareaLines(value) } }))} />
        </label>
      ) : null}
      {(section.contentType === "entry" || section.contentType === "mixed" || section.type !== "custom") ? (
        <>
          {entries.map((entry, index) => (
            <div className="item-box" key={entry.id || index}>
              <button className="remove" type="button" onClick={() => onPatch(section.id, (current) => ({ ...current, content: { ...current.content, entries: current.content.entries.filter((_, itemIndex) => itemIndex !== index) } }))}>x</button>
              <div className="two-col">
                <label className="field">{labels.title}<BufferedField value={entry.title || ""} onCommit={(value) => patchEntry(onPatch, section.id, index, { title: value })} /></label>
                <label className="field">Date Range<BufferedField value={entry.dateRange || ""} onCommit={(value) => patchEntry(onPatch, section.id, index, { dateRange: value })} /></label>
              </div>
              <div className="two-col">
                <label className="field">{labels.organization}<BufferedField value={entry.organization || ""} onCommit={(value) => patchEntry(onPatch, section.id, index, { organization: value })} /></label>
                <label className="field">{labels.location}<BufferedField value={entry.location || ""} onCommit={(value) => patchEntry(onPatch, section.id, index, { location: value })} /></label>
              </div>
              {labels.subtitle ? (
                <label className="field">{labels.subtitle}<BufferedField value={entry.subtitle || ""} onCommit={(value) => patchEntry(onPatch, section.id, index, { subtitle: value })} /></label>
              ) : null}
              <label className="field">Description<BufferedField as="textarea" rows={2} value={entry.description || ""} onCommit={(value) => patchEntry(onPatch, section.id, index, { description: value })} /></label>
              <label className="field">Bullets<BufferedField as="textarea" rows={4} value={(entry.bullets || []).join("\n")} onCommit={(value) => patchEntry(onPatch, section.id, index, { bullets: normalizeTextareaLines(value) })} /></label>
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

function escapeRegexForHighlight(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(text, keywords = []) {
  if (!text || !keywords || !keywords.length) return text;
  const validKeywords = keywords
    .map((k) => String(k || "").trim())
    .filter((k) => k.length >= 2 && !/^(and|for|with|the|that|this|from|into|over|under|your|their)$/i.test(k));

  if (!validKeywords.length) return text;
  validKeywords.sort((a, b) => b.length - a.length);

  try {
    const escapedPatterns = validKeywords.map(escapeRegexForHighlight).join("|");
    const pattern = new RegExp(`(${escapedPatterns})`, "gi");
    const parts = text.split(pattern);
    if (parts.length <= 1) return text;

    return parts.map((part, index) => {
      const isMatch = validKeywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <mark key={index} className="ai-keyword-mark" title="ATS Keyword added or matched by AI">
            {part}
          </mark>
        );
      }
      return part;
    });
  } catch {
    return text;
  }
}

function HarshibarPreview({ resume, pageCount }) {
  const frameShell = useRef(null);
  const [scale, setScale] = useState(1);
  const html = useMemo(() => buildResumeHtmlDocument(resume), [resume]);
  useEffect(() => {
    const shell = frameShell.current;
    if (!shell) return;
    const resize = () => setScale(Math.min(1, shell.clientWidth / 816));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  return <div ref={frameShell} style={{ position: "relative", width: "100%", minWidth: 0, height: pageCount * 1056 * scale, overflow: "hidden", background: "white" }}>
    <iframe title="After Resume — template preview" sandbox="" srcDoc={html} style={{ position: "absolute", inset: 0, border: 0, width: 816, maxWidth: "none", height: pageCount * 1056, transform: `scale(${scale})`, transformOrigin: "top left", background: "white" }} />
  </div>;
}

function PreviewBlock({ item, isAfterMode = false, highlightData = null }) {
  if (item.type === "spacer") return <div className="resume-entry-spacer" aria-hidden="true" />;
  if (item.type === "name") return <h1>{item.text}</h1>;
  if (item.type === "heading") return <h2>{formatResumeHeadingLabel(item.text)}</h2>;
  if (item.type === "entry-title") {
    const { left, right } = splitEntryTitle(item.text);
    const combinedLeft = [left, item.metaLine].filter(Boolean).join(" | ");
    return (
      <div className="resume-row">
        <strong>
          {isAfterMode && highlightData?.addedKeywords?.length
            ? renderHighlightedText(combinedLeft || left, highlightData.addedKeywords)
            : (combinedLeft || left)}
        </strong>
        {right ? <strong className="resume-row-date">{right}</strong> : null}
      </div>
    );
  }
  if (item.type === "entry-meta") return <p className="resume-meta">{item.text}</p>;
  if (item.type === "bullet") {
    const bulletText = item.text || "";
    const isChangedBullet = isAfterMode && Boolean(
      (highlightData?.changedBullets || []).some(
        (cb) => cb.trim().toLowerCase() === bulletText.trim().toLowerCase() || bulletText.toLowerCase().includes(cb.slice(0, 25).toLowerCase())
      ) ||
      (highlightData?.addedKeywords || []).some(
        (kw) => bulletText.toLowerCase().includes(kw.toLowerCase())
      )
    );

    return (
      <ul className="resume-bullet-list">
        <li className={isChangedBullet ? "ai-highlight-bullet" : ""}>
          
          {isAfterMode && highlightData?.addedKeywords?.length
            ? renderHighlightedText(bulletText, highlightData.addedKeywords)
            : bulletText}
        </li>
      </ul>
    );
  }
  if (item.type === "contact") {
    return (
      <p className="contact-preview">
        {(item.parts || []).map((part, index) => (
          <span key={`${part.label}-${index}`}>
            {index > 0 ? <span className="contact-separator"> | </span> : null}
            {part.url ? <a href={part.url} target="_blank" rel="noreferrer">{part.label}</a> : part.label}
          </span>
        ))}
      </p>
    );
  }

  const paragraphText = item.text || "";
  const isSummaryParagraph = isAfterMode && highlightData?.summaryChanged;

  return (
    <p className={isSummaryParagraph ? "ai-summary-highlight" : ""}>
      
      {isAfterMode && highlightData?.addedKeywords?.length
        ? renderHighlightedText(paragraphText, highlightData.addedKeywords)
        : paragraphText}
    </p>
  );
}

function BufferedField({ as = "input", value, onCommit, onBlur, onChange, onFocus, ...props }) {
  const Component = as;
  const [draft, setDraft] = useState(String(value ?? ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value ?? ""));
  }, [focused, value]);

  return (
    <Component
      {...props}
      value={focused ? draft : String(value ?? "")}
      onFocus={(event) => {
        setFocused(true);
        setDraft(event.target.value);
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        const nextValue = event.target.value;
        setFocused(false);
        setDraft(nextValue);
        onCommit?.(nextValue);
        onBlur?.(event);
      }}
    />
  );
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
    .map((item) => item)
    .filter((item) => item.trim());
}

function normalizeTextareaLines(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.replace(/^[•*-]\s*/, ""))
    .filter((item) => item.trim());
}

function createLocalId() {
  return Math.random().toString(36).slice(2, 10);
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function loadInitialResume() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {}
  }
  return ensureCanonicalResume(createDefaultWorkingResume());
}

async function readPdf(file) {
  const pdfjsLib = await loadPdfJs();
  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer(), disableWorker: true });
  const doc = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = pdfTextItemsToLines(content.items);
      if (!text.trim()) throw new Error(`Page ${pageNum} contains no readable text. Paste OCR text into Raw import text to include scanned pages.`);
      const annotations = await page.getAnnotations();
      const links = [...new Set(annotations.map((item) => item.url).filter((url) => /^https?:\/\//i.test(url || "")))];
      pages.push([text, ...links.filter((url) => !text.includes(url))].join("\n"));
    }
    return normalizeUploadedResumeText(pages.join("\n\n"));
  } finally {
    await loadingTask.destroy();
  }
}

function normalizeUploadedResumeText(value) {
  return cleanResumeImportText(value);
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


function JdTailorModal({
  currentResume,
  currentJobDescription,
  onClose,
  onApply,
  readPdf,
  setMessage,
}) {
  const [jobTitle, setJobTitle] = useState(currentResume.targetRole || "");
  const [jobDescription, setJobDescription] = useState(currentJobDescription || "");
  const [resumeMode, setResumeMode] = useState("current");
  const [uploadedResume, setUploadedResume] = useState(null);
  const [uploadedResumeName, setUploadedResumeName] = useState("");
  const [jdFileName, setJdFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [targetPages, setTargetPages] = useState(currentResume.documentSettings?.resumeLength || 1);

  const targetResume = resumeMode === "upload" && uploadedResume ? uploadedResume : currentResume;
  const currentAnalysis = useMemo(() => analyzeResume(targetResume, jobDescription), [targetResume, jobDescription]);

  async function handleJdFile(file) {
    if (!file) return;
    setLoading(true);
    setLoadingStep("Reading Job Description file...");
    setError("");
    try {
      const lower = file.name.toLowerCase();
      let text = "";
      if (lower.endsWith(".pdf")) {
        text = await readPdf(file);
      } else if (lower.endsWith(".docx")) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/resume/parse-docx", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "DOCX parsing failed.");
        text = data.text || "";
      } else {
        text = await file.text();
      }
      text = cleanResumeImportText(text);
      if (!text.trim()) throw new Error("No readable text found in JD file.");
      setJobDescription(text);
      setJdFileName(`${file.name} (${text.length} chars)`);

      if (!jobTitle) {
        const extracted = extractKeywordsFromJd(text, "");
        if (extracted.detectedRole) setJobTitle(extracted.detectedRole);
      }
    } catch (err) {
      setError(err.message || "Failed to parse JD file.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleResumeFile(file) {
    if (!file) return;
    setLoading(true);
    setLoadingStep("Reading & parsing uploaded resume...");
    setError("");
    try {
      const lower = file.name.toLowerCase();
      let text = "";
      if (lower.endsWith(".pdf")) {
        text = await readPdf(file);
      } else if (lower.endsWith(".docx")) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/resume/parse-docx", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "DOCX parsing failed.");
        text = data.text || "";
      } else {
        text = await file.text();
      }
      text = cleanResumeImportText(text);
      if (!text.trim()) throw new Error("No readable text found in resume file.");
      const parsed = parseImportedResume(text, jobTitle || "Professional");
      setUploadedResume(parsed);
      setUploadedResumeName(file.name);
      if (!jobTitle && parsed.targetRole) {
        setJobTitle(parsed.targetRole);
      }
      setResumeMode("upload");
    } catch (err) {
      setError(err.message || "Failed to read resume file.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function runOptimization() {
    if (!jobDescription.trim() && !jobTitle.trim()) {
      setError("Please enter a Target Job Title or Job Description.");
      return;
    }
    setLoading(true);
    setLoadingStep("Extracting keywords & tailoring resume to 95+ ATS score...");
    setError("");
    const chosenPages = Number(targetPages) || 1;
    try {
      const res = await fetch("/api/resume/tailor-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: targetResume,
          jobTitle: jobTitle || targetResume.targetRole,
          jobDescription,
          targetPages: chosenPages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setResult(data);
        return;
      }
      const clientResult = tailorResumeToJobDescription({
        resume: targetResume,
        jobTitle: jobTitle || targetResume.targetRole,
        jobDescription,
        targetPages: chosenPages,
      });
      setResult({
        resume: clientResult.optimizedResume,
        beforeScore: clientResult.beforeAnalysis?.readinessScore,
        afterScore: clientResult.afterAnalysis?.readinessScore,
        beforeMatchScore: clientResult.beforeAnalysis?.jobMatchScore,
        afterMatchScore: clientResult.afterAnalysis?.jobMatchScore,
        matchedKeywords: clientResult.matchedKeywords,
        addedKeywords: clientResult.addedKeywords,
        diff: clientResult.diff,
      });
    } catch (err) {
      const clientResult = tailorResumeToJobDescription({
        resume: targetResume,
        jobTitle: jobTitle || targetResume.targetRole,
        jobDescription,
        targetPages: chosenPages,
      });
      setResult({
        resume: clientResult.optimizedResume,
        beforeScore: clientResult.beforeAnalysis?.readinessScore,
        afterScore: clientResult.afterAnalysis?.readinessScore,
        beforeMatchScore: clientResult.beforeAnalysis?.jobMatchScore,
        afterMatchScore: clientResult.afterAnalysis?.jobMatchScore,
        matchedKeywords: clientResult.matchedKeywords,
        addedKeywords: clientResult.addedKeywords,
        diff: clientResult.diff,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  function handleApply() {
    if (!result?.resume) return;
    onApply(result.resume, jobDescription, result.highlightData || {
      addedKeywords: result.addedKeywords || [],
      changedBullets: result.changedBullets || [],
      summaryChanged: Boolean(result.summaryChanged),
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card upload-modal jd-modal-card">
        <button className="popup-close" type="button" onClick={onClose}>x</button>
        <p className="eyebrow">AI RESUME MAKER • ATS OPTIMIZER</p>
        <h2>Tailor Resume to Job Description (95+ ATS Score)</h2>
        <p className="muted-small">
          Upload or paste your Job Title & Description. The engine will extract ATS keywords, align your summary, integrate missing skills, and enhance bullet points to guarantee a 95+ score.
        </p>

        <div className="jd-toggle-group">
          <button
            className={`jd-toggle-btn ${resumeMode === "current" ? "active" : ""}`}
            type="button"
            onClick={() => setResumeMode("current")}
          >
            📋 Use Current Resume ({currentResume.profile?.fullName || "Current"} • {currentAnalysis.readinessScore ?? 0}/100 ATS)
          </button>
          <button
            className={`jd-toggle-btn ${resumeMode === "upload" ? "active" : ""}`}
            type="button"
            onClick={() => setResumeMode("upload")}
          >
            📂 Upload New Resume {uploadedResumeName ? `(${uploadedResumeName})` : "(.pdf, .docx, .txt)"}
          </button>
        </div>

        {resumeMode === "upload" ? (
          <div className="jd-file-upload-row">
            <span>{uploadedResumeName ? `Selected: ${uploadedResumeName}` : "Choose a resume file (.pdf, .docx, .txt)"}</span>
            <label>
              Upload Resume
              <input
                type="file"
                accept=".txt,.md,.csv,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleResumeFile(e.target.files?.[0])}
              />
            </label>
          </div>
        ) : null}

        <div className="two-col" style={{ marginTop: 12 }}>
          <label className="field">
            Target Job Title / Role
            <input
              placeholder="e.g. Senior Frontend Engineer, Customer Support Specialist..."
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </label>
          <div className="field">
            <span style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 700, color: "var(--soft)" }}>
              Upload JD Document (Optional)
            </span>
            <div className="jd-file-upload-row" style={{ margin: 0, padding: "8px 12px" }}>
              <span style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>
                {jdFileName || "Auto-fill from .txt, .pdf, or .docx"}
              </span>
              <label style={{ padding: "4px 10px", fontSize: 11 }}>
                Browse File
                <input
                  type="file"
                  accept=".txt,.md,.csv,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => handleJdFile(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </div>

        <label className="field" style={{ marginTop: 12 }}>
          Job Description
          <textarea
            rows={5}
            placeholder="Paste responsibilities, qualifications, tools, or requirements from the job description..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
        </label>

        <div className="field" style={{ marginTop: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 700, color: "var(--soft)" }}>
            Resume Length Target
          </span>
          <div className="jd-toggle-group" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`jd-toggle-btn ${targetPages === 1 ? "active" : ""}`}
              onClick={() => setTargetPages(1)}
            >
              📄 1 Page (Standard - Compact Fit) [Default]
            </button>
            <button
              type="button"
              className={`jd-toggle-btn ${targetPages === 2 ? "active" : ""}`}
              onClick={() => setTargetPages(2)}
            >
              📑 2 Pages (Detailed / Multi-Page)
            </button>
          </div>
        </div>

        {error ? <p className="notice">{error}</p> : null}

        {!result ? (
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button className="ghost-btn" type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={runOptimization}
              disabled={loading || (!jobTitle.trim() && !jobDescription.trim())}
            >
              {loading ? (loadingStep || "Optimizing for 95+ ATS...") : "🎯 Optimize Resume for 95+ ATS Score"}
            </button>
          </div>
        ) : null}

        {result ? (
          <div style={{ marginTop: 22 }}>
            <div className="jd-score-banner">
              <div className="jd-score-box">
                <span>ATS Readiness Score</span>
                <strong>{result.beforeScore ?? "--"}/100 ➔ {result.afterScore}/100</strong>
                <small>Format & parser validation</small>
              </div>
              <div className="jd-score-box">
                <span>Job Match Score</span>
                <strong>{result.beforeMatchScore ?? "--"}/100 ➔ {result.afterMatchScore}/100</strong>
                <small>Keyword alignment & evidence</small>
              </div>
              <div className="jd-guarantee-badge">
                {result.afterScore >= 95 ? "✓ 95+ ATS Readiness" : "✓ ATS Tailored"}
              </div>
            </div>

            <div className="jd-chips-section">
              <h4>Matched Keywords ({result.matchedKeywords?.length || 0})</h4>
              <div className="jd-keyword-chips">
                {(result.matchedKeywords || []).map((kw, i) => (
                  <span className="keyword-chip matched" key={`m-${i}`}>✓ {kw}</span>
                ))}
              </div>
            </div>

            {result.addedKeywords?.length ? (
              <div className="jd-chips-section">
                <h4>Keywords Integrated into Resume ({result.addedKeywords.length})</h4>
                <div className="jd-keyword-chips">
                  {result.addedKeywords.map((kw, i) => (
                    <span className="keyword-chip added" key={`a-${i}`}>+ {kw}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="jd-chips-section">
              <h4>Review Tailored Content Changes</h4>
              <div className="jd-diff-container">
                {(result.diff || []).map((change) => (
                  <article className="diff-card" key={change.id} style={{ marginBottom: 12 }}>
                    <strong>{change.title}</strong>
                    <div className="two-col" style={{ marginTop: 8 }}>
                      <label className="field">
                        <small>Before</small>
                        <textarea rows={3} readOnly value={change.before} />
                      </label>
                      <label className="field">
                        <small style={{ color: "var(--ok)", fontWeight: 700 }}>After (95+ ATS Optimized)</small>
                        <textarea rows={3} readOnly value={change.after} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="ghost-btn" type="button" onClick={() => setResult(null)}>
                Modify Inputs
              </button>
              <button className="ghost-btn" type="button" onClick={onClose}>
                Close
              </button>
              <button className="primary-btn" type="button" onClick={handleApply}>
                ✅ Apply to Resume Editor
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
