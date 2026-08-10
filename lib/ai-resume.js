import { autoImproveResume, localOptimizeResume, normalizeResume } from "./resume.js";

const READY_STATUSES = {
  strong: "Passed",
  warning: "Needs Improvement",
  critical: "Critical",
};

const PAGE_SPECS = {
  A4: { widthMm: 210, heightMm: 297, charsPerLine: 66, linesPerPage: 60 },
  LETTER: { widthMm: 216, heightMm: 279, charsPerLine: 68, linesPerPage: 56 },
};

const SECTION_LIBRARY = {
  summary: { title: "PROFESSIONAL SUMMARY" },
  skills: { title: "SKILLS" },
  experience: { title: "EXPERIENCE" },
  projects: { title: "PROJECTS" },
  education: { title: "EDUCATION" },
  certifications: { title: "CERTIFICATIONS" },
  custom: { title: "CUSTOM SECTION" },
};

export const TECH_DICTIONARY = [
  "Node.js",
  "React.js",
  "Next.js",
  "REST APIs",
  "QA/QC",
  "BESS",
  "HV/LV",
  "WHS",
  "GitHub",
  "TypeScript",
  "JavaScript",
  "AutoCAD",
  "ETAP",
  "MongoDB",
  "Express.js",
];

export const KEYWORD_TAXONOMY = {
  engineering: {
    BESS: ["battery energy storage systems", "battery energy storage system"],
    "QA/QC": ["quality assurance", "quality control", "quality assurance quality control"],
    WHS: ["work health and safety"],
    "HV/LV": ["high voltage", "low voltage"],
  },
  software: {
    "REST APIs": ["rest api", "restful api", "restful apis"],
    "Node.js": ["node", "nodejs"],
    "React.js": ["react", "reactjs"],
    "Next.js": ["next", "nextjs"],
  },
};

export const DEFAULT_DOCUMENT_SETTINGS = {
  pageSize: "A4",
  resumeLength: 2,
  settingsConfirmed: false,
  typographyPreset: "default",
};

export const RESUME_FONT_STACK = 'Calibri, "Carlito", Arial, sans-serif';

const LAYOUT_LIMITS = {
  nameSize: { min: 18, max: 20 },
  headingSize: { min: 10.8, max: 11.4 },
  bodySize: { min: 9.1, max: 10 },
  lineHeight: { min: 1.12, max: 1.2 },
  headingSpacing: { min: 0.78, max: 1.02 },
  paragraphSpacing: { min: 0.28, max: 0.62 },
  bulletSpacing: { min: 0.18, max: 0.46 },
  sectionSpacing: { min: 0.72, max: 1.12 },
  marginMm: { min: 11.5, max: 14.5 },
  bulletIndentPt: { min: 13, max: 16 },
  entryDateGapPt: { min: 10, max: 16 },
};

export const TYPOGRAPHY_PRESETS = {
  spacious: {
    nameSize: 20,
    headingSize: 11.4,
    bodySize: 10,
    lineHeight: 1.2,
    headingSpacing: 1.02,
    paragraphSpacing: 0.62,
    bulletSpacing: 0.46,
    sectionSpacing: 1.12,
    marginMm: 14.5,
    bulletIndentPt: 16,
    entryDateGapPt: 16,
  },
  roomy: {
    nameSize: 19.6,
    headingSize: 11.2,
    bodySize: 9.8,
    lineHeight: 1.18,
    headingSpacing: 0.96,
    paragraphSpacing: 0.52,
    bulletSpacing: 0.38,
    sectionSpacing: 1,
    marginMm: 14,
    bulletIndentPt: 15,
    entryDateGapPt: 15,
  },
  default: {
    nameSize: 19.2,
    headingSize: 11,
    bodySize: 9.8,
    lineHeight: 1.16,
    headingSpacing: 0.9,
    paragraphSpacing: 0.42,
    bulletSpacing: 0.32,
    sectionSpacing: 0.92,
    marginMm: 14,
    bulletIndentPt: 15,
    entryDateGapPt: 14,
  },
  compact: {
    nameSize: 18.8,
    headingSize: 10.9,
    bodySize: 9.5,
    lineHeight: 1.16,
    headingSpacing: 0.86,
    paragraphSpacing: 0.34,
    bulletSpacing: 0.24,
    sectionSpacing: 0.84,
    marginMm: 13,
    bulletIndentPt: 14,
    entryDateGapPt: 13,
  },
  tighter: {
    nameSize: 18,
    headingSize: 10.8,
    bodySize: 9.1,
    lineHeight: 1.12,
    headingSpacing: 0.78,
    paragraphSpacing: 0.28,
    bulletSpacing: 0.18,
    sectionSpacing: 0.72,
    marginMm: 11.5,
    bulletIndentPt: 13,
    entryDateGapPt: 10,
  },
};

const BLANK_LEGACY_RESUME = {
  name: "",
  phone: "",
  email: "",
  location: "",
  linkedin: "",
  github: "",
  targetRole: "",
  summary: "",
  skills: "",
  achievements: "",
  certifications: [],
  experience: [],
  projects: [],
  education: [],
};

export function createDefaultWorkingResume() {
  return ensureCanonicalResume({
    profile: {
      fullName: "",
      phone: "",
      email: "",
      location: "",
      linkedin: "",
      github: "",
      portfolio: "",
      website: "",
    },
    targetRole: "",
    sections: orderSections([
      createSection("summary", { order: 0 }),
      createSection("skills", { order: 1 }),
      createSection("experience", { order: 2 }),
      createSection("projects", { order: 3 }),
      createSection("education", { order: 4 }),
      createSection("certifications", { order: 5 }),
    ]),
    documentSettings: { ...DEFAULT_DOCUMENT_SETTINGS, settingsConfirmed: false },
    rawImport: null,
    atsAnalysis: null,
    jobAnalysis: null,
    versionSnapshots: {
      originalResume: structuredClone(BLANK_LEGACY_RESUME),
      workingResume: null,
      lastAIEnhancedResume: null,
    },
    fitState: {
      status: "idle",
      suggestions: [],
      appliedSuggestionIds: [],
      lastTargetPages: 2,
    },
  });
}

export function legacyResumeToCanonical(legacy, settingsOverrides = {}, rawImport = null) {
  const clean = normalizeResume(legacy || {});
  const sections = [];
  if (clean.summary) {
    sections.push(createSection("summary", {
      title: "PROFESSIONAL SUMMARY",
      contentType: "paragraph",
      content: { text: clean.summary },
    }));
  }
  sections.push(createSection("skills", {
    title: "SKILLS",
    layout: "compact-list",
    contentType: "mixed",
    content: { items: splitSkillItems(clean.skills), categories: skillCategoriesFromText(clean.skills) },
  }));
  if ((clean.experience || []).some(hasExperienceEntry)) {
    sections.push(createSection("experience", {
      title: "EXPERIENCE",
      contentType: "entry",
      content: { entries: clean.experience.map((item) => normalizeExperienceEntry(item)) },
    }));
  }
  if ((clean.projects || []).some(hasProjectEntry)) {
    sections.push(createSection("projects", {
      title: "PROJECTS",
      contentType: "entry",
      content: { entries: clean.projects.map((item) => normalizeProjectEntry(item)) },
    }));
  }
  if ((clean.education || []).some(hasEducationEntry)) {
    sections.push(createSection("education", {
      title: "EDUCATION",
      contentType: "entry",
      content: { entries: clean.education.map((item) => normalizeEducationEntry(item)) },
    }));
  }
  const certEntries = buildCertificationEntries(clean);
  if (certEntries.length) {
    sections.push(createSection("certifications", {
      title: "CERTIFICATIONS",
      contentType: "entry",
      content: { entries: certEntries },
    }));
  }

  return {
    profile: {
      fullName: clean.name || "",
      phone: clean.phone || "",
      email: clean.email || "",
      location: clean.location || "",
      linkedin: clean.linkedin || "",
      github: clean.github || "",
      portfolio: "",
      website: "",
    },
    targetRole: clean.targetRole || "",
    sections: orderSections(sections),
    documentSettings: {
      ...DEFAULT_DOCUMENT_SETTINGS,
      ...settingsOverrides,
    },
    rawImport,
    atsAnalysis: null,
    jobAnalysis: null,
    versionSnapshots: {
      originalResume: clean,
      workingResume: null,
      lastAIEnhancedResume: null,
    },
    fitState: {
      status: "idle",
      suggestions: [],
      appliedSuggestionIds: [],
      lastTargetPages: 2,
    },
  };
}

export function canonicalToLegacy(resume) {
  const canonical = ensureCanonicalResume(resume);
  const profile = canonical.profile || {};
  const summarySection = findSection(canonical, "summary");
  const skillsSection = findSection(canonical, "skills");
  const experienceSection = findSection(canonical, "experience");
  const projectsSection = findSection(canonical, "projects");
  const educationSection = findSection(canonical, "education");
  const certificationsSection = findSection(canonical, "certifications");

  return normalizeResume({
    name: profile.fullName || "",
    phone: profile.phone || "",
    email: profile.email || "",
    location: profile.location || "",
    linkedin: profile.linkedin || "",
    github: profile.github || profile.portfolio || profile.website || "",
    targetRole: canonical.targetRole || "",
    summary: summarySection?.content?.text || "",
    skills: buildLegacySkills(skillsSection),
    achievements: "",
    certifications: extractLegacyCertifications(certificationsSection),
    experience: (experienceSection?.content?.entries || []).map(legacyExperienceEntry),
    projects: (projectsSection?.content?.entries || []).map(legacyProjectEntry),
    education: (educationSection?.content?.entries || []).map(legacyEducationEntry),
  });
}

export function ensureCanonicalResume(value) {
  if (value?.profile && Array.isArray(value?.sections)) {
    return {
      ...value,
      sections: orderSections((value.sections || []).map((section, index) => normalizeSection(section, index))),
      documentSettings: {
        ...DEFAULT_DOCUMENT_SETTINGS,
        ...(value.documentSettings || {}),
      },
      fitState: value.fitState || {
        status: "idle",
        suggestions: [],
        appliedSuggestionIds: [],
        lastTargetPages: (value.documentSettings || {}).resumeLength || 2,
      },
      versionSnapshots: value.versionSnapshots || {
        originalResume: null,
        workingResume: null,
        lastAIEnhancedResume: null,
      },
    };
  }
  return legacyResumeToCanonical(value || {});
}

export function parseImportedResume(rawText, options = {}) {
  const legacy = localOptimizeResume(rawText, options.targetRole || "");
  return legacyResumeToCanonical(legacy, options.documentSettings || {}, {
    fileName: options.fileName || "",
    fileType: options.fileType || "text/plain",
    rawText,
    parserConfidence: estimateParserConfidence(rawText, legacy),
  });
}

export function preserveImportedSourceCoverage(resume, rawText) {
  const canonical = ensureCanonicalResume(resume);
  const sourceLines = normalizeImportRecoveryLines(rawText);
  if (!sourceLines.length) return canonical;

  const rendered = cleanImportRecoveryText(canonicalToPlainText(canonical));
  const missing = sourceLines.filter((line) => {
    const key = cleanImportRecoveryText(line);
    return key.length > 3 && !rendered.includes(key);
  });
  if (!missing.length) return canonical;

  const sections = canonical.sections.filter((section) => section.title !== "IMPORTED SOURCE RECOVERY");
  sections.push(createSection("custom", {
    title: "IMPORTED SOURCE RECOVERY",
    contentType: "mixed",
    order: sections.length,
    content: {
      entries: [],
      paragraphs: missing,
      bullets: [],
      blocks: [],
    },
  }));
  return ensureCanonicalResume({ ...canonical, sections });
}

export function updateProfileField(resume, field, value) {
  const next = ensureCanonicalResume(resume);
  return {
    ...next,
    profile: { ...next.profile, [field]: value },
  };
}

export function updateTargetRole(resume, value) {
  return { ...ensureCanonicalResume(resume), targetRole: value };
}

export function updateDocumentSettings(resume, patch) {
  const next = ensureCanonicalResume(resume);
  return {
    ...next,
    documentSettings: { ...next.documentSettings, ...patch },
  };
}

export function updateSection(resume, sectionId, updater) {
  const next = ensureCanonicalResume(resume);
  return {
    ...next,
    sections: next.sections.map((section) => (section.id === sectionId ? normalizeSection(updater(section), section.order) : section)),
  };
}

export function addSection(resume, type = "custom") {
  const next = ensureCanonicalResume(resume);
  const section = createSection(type, defaultSectionPayload(type));
  section.order = next.sections.length;
  return { ...next, sections: [...next.sections, section] };
}

export function deleteSection(resume, sectionId) {
  const next = ensureCanonicalResume(resume);
  return { ...next, sections: orderSections(next.sections.filter((section) => section.id !== sectionId)) };
}

export function duplicateSection(resume, sectionId) {
  const next = ensureCanonicalResume(resume);
  const source = next.sections.find((section) => section.id === sectionId);
  if (!source) return next;
  const clone = normalizeSection({
    ...structuredClone(source),
    id: createId(source.type),
    title: `${source.title} Copy`,
  }, source.order + 0.1);
  return { ...next, sections: orderSections([...next.sections, clone]) };
}

export function moveSection(resume, sectionId, direction) {
  const next = ensureCanonicalResume(resume);
  const index = next.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return next;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= next.sections.length) return next;
  const sections = [...next.sections];
  [sections[index], sections[targetIndex]] = [sections[targetIndex], sections[index]];
  return { ...next, sections: orderSections(sections) };
}

export function getVisibleSections(resume) {
  return ensureCanonicalResume(resume).sections.filter((section) => section.visible !== false && hasRenderableContent(section));
}

export function getPaginatedDocumentModel(resume) {
  const canonical = ensureCanonicalResume(resume);
  const documentSettings = canonical.documentSettings || DEFAULT_DOCUMENT_SETTINGS;
  const pageSpec = PAGE_SPECS[documentSettings.pageSize === "US Letter" ? "LETTER" : "A4"];
  const allowedPages = Number(documentSettings.resumeLength || 2);
  const presets = ["spacious", "roomy", "default", "compact", "tighter"];
  let best = null;

  presets.forEach((presetName) => {
    const typography = TYPOGRAPHY_PRESETS[presetName];
    const pages = paginateBlocks(buildDocumentBlocks(canonical, typography, pageSpec), typography, pageSpec);
    const pageCount = pages.length || 1;
    const utilization = calculatePageUtilization(pages, typography, pageSpec);
    const onePageDensityLimit = {
      spacious: 0.97,
      roomy: 0.95,
      default: 0.88,
      compact: 0,
      tighter: 0,
    }[presetName] ?? 0.93;
    const densitySafe = allowedPages !== 1 || utilization <= onePageDensityLimit;
    const fit = pageCount <= allowedPages && (allowedPages !== 1 || pageCount === 1) && densitySafe;
    const model = {
      pageSize: documentSettings.pageSize,
      allowedPages,
      typographyPreset: presetName,
      typography,
      pages,
      pageCount,
      fit,
      utilization,
    };
    if (
      !best
      || (fit && !best.fit)
      || (fit === best.fit && model.pageCount < best.pageCount)
      || (fit === best.fit && model.pageCount === best.pageCount && model.utilization > best.utilization)
    ) best = model;
  });

  const model = best || {
    pageSize: documentSettings.pageSize,
    allowedPages,
    typographyPreset: "tighter",
    typography: TYPOGRAPHY_PRESETS.tighter,
    pages: [],
    pageCount: 0,
    fit: false,
    utilization: 0,
  };

  const balancedModel = model.fit ? rebalancePaginatedModel(canonical, model, pageSpec) : model;
  const suggestions = generateFitSuggestions(canonical, balancedModel);
  return {
    ...balancedModel,
    status: balancedModel.fit ? "fit" : "overflow",
    fitSuggestions: suggestions,
  };
}

export function applyFitSuggestions(resume, suggestionIds = []) {
  let next = ensureCanonicalResume(resume);
  const suggestions = generateFitSuggestions(next, getPaginatedDocumentModel(next)).filter((item) => suggestionIds.includes(item.id));
  suggestions.forEach((suggestion) => {
    if (suggestion.type === "shorten-summary") {
      const summary = findSection(next, "summary");
      if (summary?.content?.text) {
        next = updateSection(next, summary.id, (section) => ({
          ...section,
          content: {
            ...section.content,
            text: shortenSummary(section.content.text),
          },
        }));
      }
    }
    if (suggestion.type === "dedupe-skills") {
      const skills = findSection(next, "skills");
      if (skills) {
        next = updateSection(next, skills.id, (section) => ({
          ...section,
          content: {
            ...section.content,
            items: dedupeSkillItems(section.content?.items || []),
            categories: dedupeSkillCategories(section.content?.categories || []),
          },
        }));
      }
    }
    if (suggestion.type === "trim-bullets") {
      next = trimEntriesByType(next, suggestion.sectionType, suggestion.keepCount || 3);
    }
  });
  return {
    ...next,
    fitState: {
      ...(next.fitState || {}),
      status: "applied",
      appliedSuggestionIds: suggestionIds,
      suggestions,
      lastTargetPages: next.documentSettings.resumeLength,
    },
  };
}

export function analyzeResume(resume, jobDescription = "") {
  const canonical = ensureCanonicalResume(resume);
  const text = canonicalToPlainText(canonical);
  const visibleSections = getVisibleSections(canonical);
  const bullets = collectBullets(canonical);
  const skills = collectSkillItems(canonical);
  const grammarIssues = findGrammarIssues(text);
  const repetitionIssues = findRepetitionIssues(canonical);
  const bulletIssues = findBulletIssues(canonical);
  const profile = canonical.profile || {};

  const readinessCategories = [
    scoredCategory("Parse Safety", 10, [
      [!/[│┌┐└┘]/.test(text), "Avoid table-like characters."],
      [text.length <= 6500, "Resume is overly long for parser-friendly scanning."],
      [visibleSections.length >= 3, "Add more core sections."],
    ]),
    scoredCategory("Formatting Safety", 10, [
      [visibleSections.every((section) => section.title), "Missing section heading title."],
      [getPaginatedDocumentModel(canonical).status === "fit", "Content does not fit the selected page limit."],
      [collectHyperlinks(canonical).every(Boolean), "Broken or incomplete hyperlinks found."],
    ]),
    scoredCategory("Grammar & Spelling", 12, [
      [grammarIssues.length === 0, grammarIssues[0]?.message || "Grammar issues found."],
      [!/\b(responsible for|worked on|helped with)\b/i.test(text), "Replace weak phrases with stronger action wording."],
    ]),
    scoredCategory("Section Completeness", 10, [
      [Boolean(profile.fullName && (profile.email || profile.phone)), "Add name and at least one contact method."],
      [visibleSections.some((section) => section.type === "summary"), "Add a professional summary."],
      [visibleSections.some((section) => section.type === "skills"), "Add a skills section."],
      [visibleSections.some((section) => section.type === "education" || section.type === "experience" || section.type === "projects"), "Add experience, projects, or education content."],
    ]),
    scoredCategory("Contact & Readability", 8, [
      [validEmail(profile.email), "Add a valid email."],
      [validPhone(profile.phone), "Add a valid phone number."],
      [Boolean(profile.location), "Add location."],
      [text.split("\n").every((line) => line.length <= 180), "Break long lines into shorter content blocks."],
    ]),
    scoredCategory("Bullet Quality", 14, [
      [bulletIssues.filter((item) => item.level === "Weak").length === 0, bulletIssues[0]?.message || "Weak bullets detected."],
      [bullets.filter((bullet) => startsWithActionVerb(bullet)).length >= Math.max(1, Math.round(bullets.length * 0.6)), "Start more bullets with clear action verbs."],
      [bullets.filter((bullet) => wordCount(bullet) >= 7 && wordCount(bullet) <= 28).length >= Math.max(1, Math.round(bullets.length * 0.65)), "Keep bullets concise and specific."],
    ]),
    scoredCategory("Repetition", 8, [
      [repetitionIssues.length === 0, repetitionIssues[0]?.message || "Repeated concepts found."],
      [new Set(skills.map(skillKey)).size >= Math.max(1, Math.round(skills.length * 0.82)), "Remove duplicate or near-duplicate skills."],
    ]),
    scoredCategory("Skills Quality", 10, [
      [skills.length >= 8, "Add more ATS-relevant skills."],
      [skills.length <= 40, "Skills list is too noisy; trim low-value items."],
      [findSection(canonical, "skills")?.layout !== "categorized" || (findSection(canonical, "skills")?.content?.categories || []).length > 0, "Categorized skills need named buckets with items."],
    ]),
    scoredCategory("Role Clarity", 8, [
      [Boolean(canonical.targetRole), "Add a target role."],
      [text.toLowerCase().includes(String(canonical.targetRole || "").toLowerCase()), "Reference the target role in the resume content."],
    ]),
    scoredCategory("General ATS Structure", 10, [
      [visibleSections.length >= 4, "Add more visible sections."],
      [collectEntriesByType(canonical, "experience").length + collectEntriesByType(canonical, "projects").length >= 1, "Add role or project evidence."],
      [getPaginatedDocumentModel(canonical).fit, "Resume does not currently fit the selected page count."],
    ]),
  ];

  const readinessScore = totalScore(readinessCategories);
  const jobAnalysis = analyzeJobDescription(jobDescription, canonical);
  const response = {
    readinessScore,
    jobMatchScore: jobAnalysis.score,
    mode: jobDescription.trim() ? "readiness-and-job-match" : "readiness-only",
    breakdown: readinessCategories,
    issues: [...flattenIssues(readinessCategories), ...grammarIssues, ...repetitionIssues, ...bulletIssues].slice(0, 24),
    recommendations: buildRecommendations(readinessCategories, grammarIssues, repetitionIssues, bulletIssues, jobAnalysis),
    matchedKeywords: jobAnalysis.matched,
    missingKeywords: jobAnalysis.missing,
    partialKeywords: jobAnalysis.partial,
    jobAnalysis,
  };
  return response;
}

export function buildAiDiff(beforeResume, afterResume) {
  const before = ensureCanonicalResume(beforeResume);
  const after = ensureCanonicalResume(afterResume);
  const changes = [];
  const sectionTypes = ["summary", "skills", "experience", "projects"];
  sectionTypes.forEach((type) => {
    const previous = serializeSectionForDiff(findSection(before, type));
    const next = serializeSectionForDiff(findSection(after, type));
    if (cleanText(previous) !== cleanText(next)) {
      changes.push({
        id: type,
        title: findSection(after, type)?.title || findSection(before, type)?.title || type.toUpperCase(),
        before: previous,
        after: next,
      });
    }
  });
  return changes;
}

export function canonicalToPlainText(resume) {
  const canonical = ensureCanonicalResume(resume);
  const lines = [];
  const profile = canonical.profile || {};
  lines.push(profile.fullName || "");
  lines.push([profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio, profile.website].filter(Boolean).join(" | "));
  getVisibleSections(canonical).forEach((section) => {
    lines.push(section.title);
    lines.push(...sectionTextLines(section));
  });
  return lines.filter(Boolean).join("\n").trim();
}

export function buildTxtExport(resume) {
  return canonicalToPlainText(resume);
}

export function buildResumeHtmlDocument(resume, options = {}) {
  const model = getPaginatedDocumentModel(resume);
  const title = escapeHtml(options.title || ensureCanonicalResume(resume).profile?.fullName || "Resume");
  const bodyClass = options.compactShell ? "resume-doc compact-shell" : "resume-doc";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>${buildResumeHtmlCss()}</style>
  </head>
  <body class="${bodyClass}">
    ${buildResumeHtmlPages(model)}
  </body>
</html>`;
}

export function buildResumeHtmlPages(modelOrResume) {
  const model = modelOrResume?.pages ? modelOrResume : getPaginatedDocumentModel(modelOrResume);
  return (model.pages || [])
    .map((page, pageIndex) => {
      const vars = resumeCssVariables(model);
      const content = renderResumeHtmlPage(page);
      return `<article class="resume-page" data-page="${pageIndex + 1}" style="${vars}"><span class="resume-page-chip">Page ${pageIndex + 1}</span>${content}</article>`;
    })
    .join("");
}

function buildResumeHtmlCss() {
  return `
    @page {
      margin: 0;
      size: A4;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #0b1117;
      color: #111827;
      font-family: ${RESUME_FONT_STACK};
    }
    body.resume-doc {
      display: grid;
      justify-content: center;
      gap: 20px;
      padding: 20px;
    }
    body.resume-doc.compact-shell {
      background: #ffffff;
      padding: 0;
      gap: 0;
    }
    .resume-page {
      position: relative;
      width: var(--resume-page-width);
      min-height: var(--resume-page-min-height);
      background: #ffffff;
      color: #111827;
      padding: var(--resume-padding);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.20);
      font-family: ${RESUME_FONT_STACK};
      line-height: var(--resume-line-height);
    }
    .compact-shell .resume-page {
      box-shadow: none;
      margin: 0 auto;
    }
    .resume-page-chip {
      position: absolute;
      top: 14px;
      right: 18px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .resume-name {
      margin: 0;
      text-align: center;
      font-size: var(--resume-name-size);
      line-height: 1;
      font-weight: 700;
      color: #111827;
    }
    .resume-contact {
      margin: 0 0 calc(var(--resume-heading-gap) * 1.2);
      color: #334155;
      text-align: center;
      font-size: var(--resume-body-size);
      line-height: calc(var(--resume-line-height) * 0.98);
      text-wrap: balance;
    }
    .resume-contact a {
      color: inherit;
      text-decoration: none;
    }
    .resume-contact-sep {
      margin: 0 3px;
    }
    .resume-heading {
      margin: var(--resume-section-gap) 0 var(--resume-heading-gap);
      padding-bottom: 4px;
      border-bottom: 1px solid #222222;
      text-align: left;
      letter-spacing: 0.3px;
      font-size: var(--resume-heading-size);
      line-height: 1.08;
      font-weight: 700;
    }
    .resume-paragraph,
    .resume-bullet-text {
      margin: 0 0 var(--resume-paragraph-gap);
      font-size: var(--resume-body-size);
      line-height: var(--resume-line-height);
      text-align: justify;
      text-justify: inter-word;
      orphans: 3;
      widows: 3;
    }
    .resume-entry-title {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 14px;
      margin: 0 0 3px;
      font-size: var(--resume-body-size);
      line-height: var(--resume-line-height);
      font-weight: 700;
    }
    .resume-entry-left {
      min-width: 0;
      text-align: left;
    }
    .resume-entry-right {
      white-space: nowrap;
      text-align: right;
      margin-left: auto;
    }
    .resume-meta {
      margin: 0 0 4px;
      text-align: left;
      color: #334155;
      font-size: var(--resume-body-size);
      line-height: var(--resume-line-height);
    }
    .resume-bullets {
      margin: 0 0 var(--resume-bullet-gap);
      padding: 0;
      list-style: none;
    }
    .resume-bullet {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0 0 var(--resume-bullet-gap);
    }
    .resume-bullet-marker {
      flex: 0 0 10px;
      padding-top: 1px;
      font-size: var(--resume-body-size);
      line-height: var(--resume-line-height);
    }
    .resume-bullet-text {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
    }
    @media print {
      html, body {
        background: #ffffff;
      }
      body.resume-doc {
        padding: 0;
        gap: 0;
      }
      .resume-page {
        box-shadow: none;
        break-after: page;
      }
      .resume-page:last-child {
        break-after: auto;
      }
    }
  `;
}

function renderResumeHtmlBlock(item) {
  if (item.type === "name") return `<h1 class="resume-name">${escapeHtml(item.text)}</h1>`;
  if (item.type === "contact") return `<p class="resume-contact">${renderContactHtml(item.parts)}</p>`;
  if (item.type === "heading") return `<h2 class="resume-heading">${escapeHtml(formatResumeHeading(item.text))}</h2>`;
  if (item.type === "entry-title") {
    const { left, right } = splitEntryTitleText(item.text);
    const combinedLeft = [left, item.metaLine].filter(Boolean).join(" | ");
    return `<div class="resume-entry-title"><span class="resume-entry-left">${escapeHtml(combinedLeft)}</span>${right ? `<span class="resume-entry-right">${escapeHtml(right)}</span>` : ""}</div>`;
  }
  if (item.type === "entry-meta") return `<p class="resume-meta">${escapeHtml(item.text)}</p>`;
  if (item.type === "bullet") {
    return `<div class="resume-bullet"><span class="resume-bullet-marker">•</span><span class="resume-bullet-text">${escapeHtml(item.text)}</span></div>`;
  }
  return `<p class="resume-paragraph">${escapeHtml(item.text)}</p>`;
}

function renderResumeHtmlPage(page) {
  const blocks = [];
  for (let index = 0; index < page.length; index += 1) {
    const item = page[index];
    if (item.type === "entry-title" && item.metaLine && page[index + 1]?.type === "entry-meta" && page[index + 1]?.text === item.metaLine) {
      blocks.push(renderResumeHtmlBlock(item));
      index += 1;
      continue;
    }
    blocks.push(renderResumeHtmlBlock(item));
  }
  return blocks.join("");
}

function renderContactHtml(parts = []) {
  return parts
    .map((part) => {
      if (part.url) {
        return `<a href="${escapeHtml(part.url)}" target="_blank" rel="noreferrer">${escapeHtml(part.label)}</a>`;
      }
      return escapeHtml(part.label);
    })
    .join(' <span class="resume-contact-sep">|</span> ');
}

function resumeCssVariables(model) {
  const pageWidth = model.pageSize === "US Letter" ? "816px" : "794px";
  const pageHeight = model.pageSize === "US Letter" ? "1056px" : "1122px";
  const preset = model.typography || TYPOGRAPHY_PRESETS.default;
  return [
    `--resume-page-width:${pageWidth}`,
    `--resume-page-min-height:${pageHeight}`,
    `--resume-padding:${Math.round(mmToPt(preset.marginMm || 14))}px`,
    `--resume-name-size:${preset.nameSize || 19.2}pt`,
    `--resume-heading-size:${preset.headingSize || 11}pt`,
    `--resume-body-size:${preset.bodySize || 9.8}pt`,
    `--resume-line-height:${preset.lineHeight || 1.16}`,
    `--resume-heading-gap:${Math.max(10, Math.round((preset.headingSpacing || 0.9) * 12))}px`,
    `--resume-paragraph-gap:${Math.max(4, Math.round((preset.paragraphSpacing || 0.42) * 10))}px`,
    `--resume-bullet-gap:${Math.max(2, Math.round((preset.bulletSpacing || 0.32) * 8))}px`,
    `--resume-section-gap:${Math.max(8, Math.round((preset.sectionSpacing || 0.92) * 12))}px`,
  ].join(";");
}

export function buildDocxFromCanonical(resume) {
  const model = getPaginatedDocumentModel(resume);
  const canonical = ensureCanonicalResume(resume);
  const files = [
    { name: "[Content_Types].xml", content: buildContentTypesXml() },
    { name: "_rels/.rels", content: buildRootRelsXml() },
    { name: "docProps/core.xml", content: buildCoreXml(canonical) },
    { name: "docProps/app.xml", content: buildAppXml() },
    { name: "word/document.xml", content: buildDocumentXml(model, canonical) },
    { name: "word/styles.xml", content: buildStylesXml(model) },
    { name: "word/fontTable.xml", content: buildFontTableXml() },
    { name: "word/settings.xml", content: buildSettingsXml() },
    { name: "word/webSettings.xml", content: buildWebSettingsXml() },
    { name: "word/numbering.xml", content: buildNumberingXml() },
    { name: "word/_rels/document.xml.rels", content: buildDocumentRelsXml(canonical) },
  ];
  return new Blob([createZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function expectedVisibleStrings(resume) {
  const canonical = ensureCanonicalResume(resume);
  const expectations = [canonical.profile?.fullName];
  getVisibleSections(canonical).forEach((section) => {
    expectations.push(section.title);
    expectations.push(...sectionTextLines(section).slice(0, 2));
  });
  return expectations.filter(Boolean);
}

export function canBypassPremiumGate() {
  return true;
}

function createSection(type, overrides = {}) {
  const definition = SECTION_LIBRARY[type] || SECTION_LIBRARY.custom;
  return normalizeSection({
    id: createId(type),
    type,
    title: overrides.title || definition.title,
    visible: overrides.visible ?? true,
    order: overrides.order ?? 0,
    layout: overrides.layout || (type === "skills" ? "compact-list" : "default"),
    contentType: overrides.contentType || defaultSectionPayload(type).contentType,
    content: overrides.content || defaultSectionPayload(type).content,
  }, overrides.order ?? 0);
}

function normalizeSection(section, order = 0) {
  const safeSection = section && typeof section === "object" ? section : {};
  const libraryTitle = SECTION_LIBRARY[safeSection.type]?.title || "SECTION";
  const incomingTitle = String(safeSection.title !== undefined ? safeSection.title : libraryTitle);
  const normalizedTitle = shouldRepairSectionTitle(safeSection.type, incomingTitle)
    ? libraryTitle
    : incomingTitle;
  return {
    id: safeSection.id || createId(safeSection.type || "custom"),
    type: safeSection.type || "custom",
    title: normalizedTitle,
    visible: safeSection.visible !== false,
    order: Number.isFinite(Number(safeSection.order)) ? Number(safeSection.order) : order,
    layout: safeSection.layout || (safeSection.type === "skills" ? "compact-list" : "default"),
    contentType: safeSection.contentType || "paragraph",
    content: normalizeSectionContent(safeSection),
  };
}

function shouldRepairSectionTitle(type, title) {
  return false;
}

function normalizeImportRecoveryLines(rawText) {
  return String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);
}

function cleanImportRecoveryText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2022\u25cf\u25aa]/g, " ")
    .replace(/[^a-z0-9+#/().,&:% -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSectionContent(section) {
  const safeSection = section && typeof section === "object" ? section : {};
  const content = safeSection.content && typeof safeSection.content === "object" ? safeSection.content : {};
  if (safeSection.type === "summary") return { text: String(content.text || "").trim() };
  if (safeSection.type === "skills") {
    return {
      items: Array.isArray(content.items) ? content.items.map((item) => String(item || "").trim()).filter(Boolean) : [],
      categories: Array.isArray(content.categories) ? content.categories.map((category) => ({
        name: String(category.name || "").trim(),
        items: Array.isArray(category.items) ? category.items.map((item) => String(item || "").trim()).filter(Boolean) : [],
      })) : [],
    };
  }
  if (safeSection.contentType === "entry" || ["experience", "projects", "education", "certifications", "custom"].includes(safeSection.type)) {
    return {
      entries: Array.isArray(content.entries) ? content.entries.map((entry) => normalizeGenericEntry(entry, safeSection.type)) : [],
      paragraphs: Array.isArray(content.paragraphs) ? content.paragraphs.map((item) => String(item || "").trim()).filter(Boolean) : [],
      bullets: Array.isArray(content.bullets) ? content.bullets.map((item) => String(item || "").trim()).filter(Boolean) : [],
      blocks: Array.isArray(content.blocks) ? content.blocks.map(normalizeMixedBlock) : [],
    };
  }
  return {
    text: String(content.text || "").trim(),
    bullets: Array.isArray(content.bullets) ? content.bullets.map((item) => String(item || "").trim()).filter(Boolean) : [],
  };
}

function defaultSectionPayload(type) {
  if (type === "summary") return { contentType: "paragraph", content: { text: "" } };
  if (type === "skills") return { contentType: "mixed", content: { items: [], categories: [] } };
  if (["experience", "projects", "education", "certifications"].includes(type)) return { contentType: "entry", content: { entries: [] } };
  return { contentType: "mixed", content: { entries: [], paragraphs: [], bullets: [], blocks: [] } };
}

function normalizeExperienceEntry(item) {
  const parts = splitImportedEntryFields({
    title: item.title || "",
    organization: item.company || "",
    location: item.location || "",
  });
  return normalizeGenericEntry({
    title: parts.title,
    organization: parts.organization,
    dateRange: item.dates || "",
    bullets: mergeWrappedListLines(splitBullets(item.bullets)),
    location: parts.location,
  }, "experience");
}

function normalizeProjectEntry(item) {
  const parts = splitImportedEntryFields({
    title: item.title || "",
    organization: item.organization || "",
    location: item.location || "",
  });
  return normalizeGenericEntry({
    title: parts.title,
    organization: parts.organization,
    location: parts.location,
    subtitle: item.subtitle || "",
    dateRange: item.dates || "",
    bullets: mergeWrappedListLines(splitBullets(item.bullets)),
    url: extractUrl(item.subtitle || ""),
  }, "projects");
}

function normalizeEducationEntry(item) {
  const organizationParts = splitOrganizationLocation(item.school || "", item.location || "");
  return normalizeGenericEntry({
    title: item.degree || "",
    organization: organizationParts.organization,
    location: organizationParts.location,
    dateRange: item.dates || "",
    bullets: [],
  }, "education");
}

function splitImportedEntryFields({ title = "", organization = "", location = "" }) {
  const titleParts = String(title || "").split("|").map((part) => part.trim()).filter(Boolean);
  let nextTitle = String(title || "").trim();
  let nextOrganization = String(organization || "").trim();
  let nextLocation = String(location || "").trim();

  if (titleParts.length >= 2) {
    nextTitle = titleParts[0];
    if (!nextOrganization || /^(company|organization)$/i.test(nextOrganization)) {
      nextOrganization = titleParts[1] || nextOrganization;
    }
    if (!nextLocation && titleParts.length >= 3) {
      nextLocation = titleParts.slice(2).join(", ");
    }
  }

  const organizationParts = splitOrganizationLocation(nextOrganization, nextLocation);
  return {
    title: nextTitle,
    organization: organizationParts.organization,
    location: organizationParts.location,
  };
}

function splitOrganizationLocation(organization = "", location = "") {
  const nextOrganization = String(organization || "").trim();
  const nextLocation = String(location || "").trim();
  if (nextLocation || !nextOrganization.includes(",")) {
    return { organization: nextOrganization, location: nextLocation };
  }

  const parts = nextOrganization.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { organization: nextOrganization, location: nextLocation };
  }

  return {
    organization: parts[0],
    location: parts.slice(1).join(", "),
  };
}

function normalizeGenericEntry(item, type) {
  return {
    id: item.id || createId(type),
    title: String(item.title || "").trim(),
    organization: String(item.organization || item.company || item.school || item.issuer || "").trim(),
    subtitle: String(item.subtitle || "").trim(),
    location: String(item.location || "").trim(),
    dateRange: String(item.dateRange || item.dates || "").trim(),
    bullets: Array.isArray(item.bullets)
      ? mergeWrappedListLines(item.bullets.map((bullet) => String(bullet || "").trim()).filter(Boolean))
      : splitBullets(item.bullets || ""),
    description: String(item.description || item.text || "").trim(),
    url: String(item.url || "").trim(),
  };
}

function normalizeMixedBlock(block) {
  return {
    id: block.id || createId("block"),
    type: block.type || "paragraph",
    text: String(block.text || "").trim(),
    bullets: Array.isArray(block.bullets) ? block.bullets.map((item) => String(item || "").trim()).filter(Boolean) : [],
    entry: block.entry ? normalizeGenericEntry(block.entry, "custom") : null,
  };
}

function hasRenderableEntry(entry) {
  if (!entry) return false;
  return [
    entry.title,
    entry.organization,
    entry.subtitle,
    entry.location,
    entry.dateRange,
    entry.description,
    entry.url,
  ].some((value) => String(value || "").trim())
    || (entry.bullets || []).some((bullet) => String(bullet || "").trim());
}

function hasRenderableBlock(block) {
  if (!block) return false;
  if (String(block.text || "").trim()) return true;
  if ((block.bullets || []).some((bullet) => String(bullet || "").trim())) return true;
  if (block.entry && hasRenderableEntry(block.entry)) return true;
  return false;
}

function buildCertificationEntries(clean) {
  const entries = [];
  (clean.certifications || []).forEach((item) => {
    const title = [item.title, item.issuer].filter(Boolean).join(" | ");
    if (title || item.dates) {
      entries.push(normalizeGenericEntry({
        title,
        dateRange: item.dates || "",
        bullets: [],
      }, "certifications"));
    }
  });
  mergeWrappedListLines(splitBullets(clean.achievements || "")).forEach((item) => {
    entries.push(normalizeGenericEntry({ title: item }, "certifications"));
  });
  return entries;
}

function orderSections(sections) {
  return [...sections]
    .sort((left, right) => left.order - right.order)
    .map((section, index) => ({ ...section, order: index }));
}

function findSection(resume, type) {
  return ensureCanonicalResume(resume).sections.find((section) => section.type === type);
}

function buildLegacySkills(section) {
  if (!section) return "";
  if (section.layout === "categorized" && (section.content?.categories || []).length) {
    return section.content.categories
      .filter((category) => category.name && category.items.length)
      .map((category) => `${category.name}: ${category.items.join(", ")}`)
      .join("\n");
  }
  return (section.content?.items || []).join(", ");
}

function extractLegacyCertifications(section) {
  return (section?.content?.entries || []).map((entry) => ({
    title: entry.title || "",
    issuer: entry.organization || "",
    dates: entry.dateRange || "",
  }));
}

function legacyExperienceEntry(entry) {
  return {
    title: entry.title || "",
    company: [entry.organization, entry.location].filter(Boolean).join(", "),
    dates: entry.dateRange || "",
    bullets: (entry.bullets || []).join("\n"),
  };
}

function legacyProjectEntry(entry) {
  return {
    title: entry.title || "",
    subtitle: [entry.subtitle, entry.url].filter(Boolean).join(" | "),
    dates: entry.dateRange || "",
    bullets: (entry.bullets || []).join("\n"),
  };
}

function legacyEducationEntry(entry) {
  return {
    degree: entry.title || "",
    school: entry.organization || "",
    dates: entry.dateRange || "",
  };
}

function buildDocumentBlocks(resume, typography, pageSpec) {
  const canonical = ensureCanonicalResume(resume);
  const blocks = [];
  const profile = canonical.profile || {};
  blocks.push(block("name", profile.fullName || "Your Name", typography.nameSize, 2));
  const contactParts = buildContactParts(profile);
  const contact = contactParts.map((part) => part.label).join(" | ");
  if (contact) blocks.push(block("contact", contact, typography.bodySize, 1.2, { parts: contactParts }));

  getVisibleSections(canonical).forEach((section) => {
    blocks.push(block("heading", section.title, typography.headingSize, typography.headingSpacing + typography.sectionSpacing));
    sectionToBlocks(section, typography, pageSpec).forEach((item) => blocks.push(item));
  });

  return blocks;
}

function sectionToBlocks(section, typography, pageSpec) {
  const blocks = [];
  if (section.type === "summary") {
    if (section.content?.text) blocks.push(block("paragraph", section.content.text, typography.bodySize, typography.paragraphSpacing));
    return blocks;
  }
  if (section.type === "skills") {
    if (section.layout === "categorized") {
      (section.content?.categories || []).forEach((category) => {
        if (!category.name || !category.items.length) return;
        blocks.push(block("entry-title", `${category.name}: ${category.items.join(", ")}`, typography.bodySize, typography.paragraphSpacing));
      });
      return blocks;
    }
    const skillLine = (section.content?.items || []).join(", ");
    if (skillLine) blocks.push(block("paragraph", skillLine, typography.bodySize, typography.paragraphSpacing));
    return blocks;
  }

  (section.content?.paragraphs || []).forEach((text) => {
    blocks.push(block("paragraph", text, typography.bodySize, typography.paragraphSpacing));
  });
  (section.content?.bullets || []).forEach((text) => {
    blocks.push(block("bullet", text, typography.bodySize, typography.bulletSpacing));
  });
  (section.content?.entries || []).forEach((entry) => {
    const titleLine = [entry.title, entry.dateRange].filter(Boolean).join(" || ");
    const metaLine = [entry.organization, entry.location, entry.subtitle, entry.url].filter(Boolean).join(" | ");
    if (titleLine.trim()) blocks.push(block("entry-title", titleLine, typography.bodySize, 0.35, { metaLine }));
    if (metaLine) blocks.push(block("entry-meta", metaLine, typography.bodySize, 0.35));
    if (entry.description) blocks.push(block("paragraph", entry.description, typography.bodySize, typography.paragraphSpacing));
    (entry.bullets || []).forEach((bulletText) => blocks.push(block("bullet", bulletText, typography.bodySize, typography.bulletSpacing)));
  });
  (section.content?.blocks || []).forEach((item) => {
    if (item.type === "paragraph" && item.text) blocks.push(block("paragraph", item.text, typography.bodySize, typography.paragraphSpacing));
    if (item.type === "bullets") item.bullets.forEach((bulletText) => blocks.push(block("bullet", bulletText, typography.bodySize, typography.bulletSpacing)));
    if (item.type === "entry" && item.entry) {
      const titleLine = [item.entry.title, item.entry.dateRange].filter(Boolean).join(" || ");
      const metaLine = [item.entry.organization, item.entry.location, item.entry.subtitle, item.entry.url].filter(Boolean).join(" | ");
      if (titleLine) blocks.push(block("entry-title", titleLine, typography.bodySize, 0.35, { metaLine }));
      if (metaLine) blocks.push(block("entry-meta", metaLine, typography.bodySize, 0.35));
      (item.entry.bullets || []).forEach((bulletText) => blocks.push(block("bullet", bulletText, typography.bodySize, typography.bulletSpacing)));
    }
  });
  return blocks;
}

function block(type, text, size, after, extra = {}) {
  return { type, text, size, after, lines: [], ...extra };
}

function rebalancePaginatedModel(resume, model, pageSpec) {
  if (!model?.fit || !model.pages?.length) return model;
  const minimumUtilization = model.allowedPages === 1 ? 0.84 : 0.72;
  if (model.utilization >= minimumUtilization) return model;

  const steps = [0.18, 0.34, 0.5, 0.68, 0.85, 1];
  let best = model;
  steps.forEach((ratio) => {
    const typography = blendTypography(model.typography, TYPOGRAPHY_PRESETS.spacious, ratio);
    const pages = paginateBlocks(buildDocumentBlocks(resume, typography, pageSpec), typography, pageSpec);
    const pageCount = pages.length || 1;
    const fit = pageCount <= model.allowedPages && (model.allowedPages !== 1 || pageCount === 1);
    if (!fit) return;
    const utilization = calculatePageUtilization(pages, typography, pageSpec);
    if (utilization > best.utilization) {
      best = {
        ...best,
        typography,
        pages,
        pageCount,
        fit,
        utilization,
      };
    }
  });
  return best;
}

function blendTypography(base, target, ratio) {
  const next = { ...base };
  Object.keys(LAYOUT_LIMITS).forEach((key) => {
    const limit = LAYOUT_LIMITS[key];
    const start = Number(base[key] ?? target[key] ?? 0);
    const end = Number(target[key] ?? start);
    next[key] = roundTo(clamp(start + (end - start) * ratio, limit.min, limit.max), 2);
  });
  return next;
}

function paginateBlocks(blocks, typography, pageSpec) {
  const pages = [];
  let page = [];
  const usableHeight = mmToPt(pageSpec.heightMm - typography.marginMm * 2);
  let used = 0;

  blocks.forEach((item) => {
    const renderedLines = wrapBlock(item.text, item.type, pageSpec, typography);
    const blockCost = estimateBlockHeight(item, renderedLines, typography);
    const keepWithNextPadding = item.type === "heading" ? typography.bodySize * typography.lineHeight * 1.25 : 0;
    if (page.length && used + blockCost + keepWithNextPadding > usableHeight) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push({ ...item, lines: renderedLines });
    used += blockCost;
  });
  if (page.length) pages.push(page);
  return pages;
}

function calculatePageUtilization(pages, typography, pageSpec) {
  if (!pages.length) return 0;
  const usableHeight = mmToPt(pageSpec.heightMm - typography.marginMm * 2);
  const lastPage = pages[pages.length - 1] || [];
  const usedHeight = lastPage.reduce((sum, item) => sum + estimateBlockHeight(item, item.lines || [], typography), 0);
  return usedHeight / Math.max(1, usableHeight);
}

function wrapBlock(text, type, pageSpec, typography) {
  const fontSize = type === "name" ? typography.nameSize : type === "heading" ? typography.headingSize : typography.bodySize;
  const source = normalizeLayoutText(text);
  if (!source) return [];
  if (type === "heading") return [source];
  if (type === "entry-title") {
    const { left } = splitEntryTitleText(source);
    return wrapTextByWidth(left, availableWidthForBlock(type, pageSpec, typography, source), fontSize, { bold: true });
  }
  return wrapTextByWidth(source, availableWidthForBlock(type, pageSpec, typography, source), fontSize, {
    bold: type === "entry-meta",
    compact: type === "contact",
  });
}

function normalizeLayoutText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u2022/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function availableWidthForBlock(type, pageSpec, typography, text) {
  const usableWidthPt = mmToPt(pageSpec.widthMm - typography.marginMm * 2);
  if (type === "bullet") return usableWidthPt - (typography.bulletIndentPt || 15);
  if (type === "entry-title") {
    const { right } = splitEntryTitleText(text);
    const rightWidth = estimateTextWidthPt(right, typography.bodySize, { bold: true });
    return Math.max(mmToPt(64), usableWidthPt - rightWidth - (typography.entryDateGapPt || 12));
  }
  return usableWidthPt;
}

function wrapTextByWidth(text, maxWidthPt, fontSize, options = {}) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const next = `${current} ${word}`;
    if (estimateTextWidthPt(next, fontSize, options) <= maxWidthPt) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return rebalanceOrphanedLines(lines, maxWidthPt, fontSize, options);
}

function rebalanceOrphanedLines(lines, maxWidthPt, fontSize, options = {}) {
  if (lines.length < 2) return lines;
  const adjusted = [...lines];
  for (let index = 0; index < adjusted.length - 1; index += 1) {
    const currentWords = adjusted[index].split(/\s+/);
    const nextWords = adjusted[index + 1].split(/\s+/);
    if (nextWords.length >= 4) continue;
    while (currentWords.length > 4 && nextWords.length < 4) {
      const moved = currentWords.pop();
      if (!moved) break;
      const candidateCurrent = currentWords.join(" ");
      const candidateNext = [moved, ...nextWords].join(" ");
      if (estimateTextWidthPt(candidateCurrent, fontSize, options) > maxWidthPt || estimateTextWidthPt(candidateNext, fontSize, options) > maxWidthPt) {
        currentWords.push(moved);
        break;
      }
      nextWords.unshift(moved);
    }
    adjusted[index] = currentWords.join(" ");
    adjusted[index + 1] = nextWords.join(" ");
  }
  return adjusted.filter(Boolean);
}

function estimateTextWidthPt(text, fontSize, options = {}) {
  let units = 0;
  for (const char of String(text || "")) {
    if (char === " ") units += 0.28;
    else if (/[A-Z0-9]/.test(char)) units += 0.62;
    else if (/[mwMW@#%&]/.test(char)) units += 0.78;
    else if (/[iltI1|.,:;'"`]/.test(char)) units += 0.26;
    else if (/[-/\\()]/.test(char)) units += 0.34;
    else units += 0.52;
  }
  const compactBoost = options.compact ? -0.01 : 0;
  const weightBoost = options.bold ? 0.03 : 0;
  return units * fontSize * (0.51 + compactBoost + weightBoost);
}

function splitEntryTitleText(value) {
  const [left, right] = String(value || "").split(" || ").map((item) => String(item || "").trim());
  return { left, right };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(Number(value || 0) * power) / power;
}

function estimateBlockHeight(item, renderedLines, typography) {
  const fontSize = item.type === "name" ? typography.nameSize : item.type === "heading" ? typography.headingSize : typography.bodySize;
  const lineHeight = fontSize * typography.lineHeight;
  const afterSpacing = fontSize * Number(item.after || 0) * 0.42;
  return Math.max(1, renderedLines.length || 1) * lineHeight + afterSpacing;
}

export function hasRenderableContent(section) {
  if (!section || section.visible === false) return false;
  if (section.type === "summary") return Boolean(String(section.content?.text || "").trim());
  if (section.type === "skills") {
    return Boolean((section.content?.items || []).length || (section.content?.categories || []).some((category) => category.name || (category.items || []).length));
  }

  if ((section.content?.paragraphs || []).some((text) => String(text || "").trim())) return true;
  if ((section.content?.bullets || []).some((text) => String(text || "").trim())) return true;
  if ((section.content?.entries || []).some(hasRenderableEntry)) return true;
  if ((section.content?.blocks || []).some(hasRenderableBlock)) return true;
  return false;
}

function generateFitSuggestions(resume, model) {
  const canonical = ensureCanonicalResume(resume);
  const suggestions = [];
  const summary = findSection(canonical, "summary");
  if (summary?.content?.text && wordCount(summary.content.text) > 70) {
    suggestions.push({
      id: "shorten-summary",
      type: "shorten-summary",
      label: "Shorten the summary",
      description: "Reduce the professional summary to the strongest 2-3 lines for the selected page target.",
    });
  }
  const skills = findSection(canonical, "skills");
  const items = skills?.content?.items || [];
  if (items.length !== dedupeSkillItems(items).length) {
    suggestions.push({
      id: "dedupe-skills",
      type: "dedupe-skills",
      label: "Remove duplicate skills",
      description: "Clean repeated or near-identical skills without removing distinct evidence.",
    });
  }
  if (collectEntriesByType(canonical, "experience").some((entry) => (entry.bullets || []).length > 4)) {
    suggestions.push({
      id: "trim-experience-bullets",
      type: "trim-bullets",
      sectionType: "experience",
      keepCount: 3,
      label: "Trim longer experience sections",
      description: "Reduce lower-priority bullets in experience entries after user approval.",
    });
  }
  if (collectEntriesByType(canonical, "projects").some((entry) => (entry.bullets || []).length > 3)) {
    suggestions.push({
      id: "trim-project-bullets",
      type: "trim-bullets",
      sectionType: "projects",
      keepCount: 2,
      label: "Trim longer project sections",
      description: "Reduce lower-priority project bullets after user approval.",
    });
  }
  if (!model.fit) {
    suggestions.push({
      id: "format-only-tighten",
      type: "format-only",
      label: "Apply tighter formatting",
      description: "Formatting-only compression is already applied automatically up to safe limits.",
    });
  }
  return suggestions;
}

function trimEntriesByType(resume, type, keepCount) {
  const section = findSection(resume, type);
  if (!section) return resume;
  return updateSection(resume, section.id, (current) => ({
    ...current,
    content: {
      ...current.content,
      entries: (current.content.entries || []).map((entry, index) => ({
        ...entry,
        bullets: index === 0 ? entry.bullets : entry.bullets.slice(0, keepCount),
      })),
    },
  }));
}

function sectionTextLines(section) {
  if (!section) return [];
  if (section.type === "summary") return [section.content?.text || ""].filter(Boolean);
  if (section.type === "skills") {
    if (section.layout === "categorized") {
      return (section.content?.categories || []).map((category) => `${category.name}: ${category.items.join(", ")}`);
    }
    return [(section.content?.items || []).join(", ")].filter(Boolean);
  }
  const lines = [];
  (section.content?.paragraphs || []).forEach((text) => lines.push(text));
  (section.content?.bullets || []).forEach((text) => lines.push(`• ${text}`));
  (section.content?.entries || []).forEach((entry) => {
    lines.push([entry.title, entry.dateRange].filter(Boolean).join(" | "));
    const meta = [entry.organization, entry.location, entry.subtitle, entry.url].filter(Boolean).join(" | ");
    if (meta) lines.push(meta);
    if (entry.description) lines.push(entry.description);
    (entry.bullets || []).forEach((bullet) => lines.push(`• ${bullet}`));
  });
  (section.content?.blocks || []).forEach((blockItem) => {
    if (blockItem.text) lines.push(blockItem.text);
    (blockItem.bullets || []).forEach((bullet) => lines.push(`• ${bullet}`));
  });
  return lines.filter(Boolean);
}

function collectBullets(resume) {
  const canonical = ensureCanonicalResume(resume);
  return canonical.sections.flatMap((section) => {
    const entryBullets = (section.content?.entries || []).flatMap((entry) => entry.bullets || []);
    const directBullets = section.content?.bullets || [];
    const blockBullets = (section.content?.blocks || []).flatMap((item) => item.bullets || []);
    return [...entryBullets, ...directBullets, ...blockBullets].filter(Boolean);
  });
}

function collectSkillItems(resume) {
  const section = findSection(resume, "skills");
  if (!section) return [];
  if (section.layout === "categorized") {
    return (section.content?.categories || []).flatMap((category) => category.items || []);
  }
  return section.content?.items || [];
}

function collectEntriesByType(resume, type) {
  return findSection(resume, type)?.content?.entries || [];
}

function collectHyperlinks(resume) {
  const canonical = ensureCanonicalResume(resume);
  const profile = canonical.profile || {};
  return [profile.linkedin, profile.github, profile.portfolio, profile.website]
    .filter(Boolean)
    .map(normalizeExternalUrl);
}

function analyzeJobDescription(jobDescription, resume) {
  const text = String(jobDescription || "").trim();
  if (!text) return { score: null, matched: [], missing: [], partial: [], requirements: [] };
  const evidence = cleanText(canonicalToPlainText(resume));
  const requirements = extractJobRequirements(text);
  const matched = [];
  const partial = [];
  const missing = [];

  requirements.forEach((requirement) => {
    const canonicalTerm = requirement.canonical;
    const variants = [canonicalTerm, ...(requirement.variants || [])].map(cleanText);
    const hasDirect = variants.some((variant) => evidence.includes(variant));
    const hasPartial = !hasDirect && variants.some((variant) => variant.split(" ").some((token) => token.length > 3 && evidence.includes(token)));
    if (hasDirect) matched.push(canonicalTerm);
    else if (hasPartial) partial.push(canonicalTerm);
    else missing.push(canonicalTerm);
  });

  const total = requirements.length || 1;
  const score = Math.round(((matched.length + partial.length * 0.5) / total) * 100);
  return { score, matched, partial, missing, requirements };
}

function extractJobRequirements(jobDescription) {
  const text = cleanText(jobDescription);
  const requirements = [];
  Object.entries(KEYWORD_TAXONOMY).forEach(([, group]) => {
    Object.entries(group).forEach(([canonical, variants]) => {
      const all = [cleanText(canonical), ...variants.map(cleanText)];
      if (all.some((variant) => text.includes(variant))) {
        requirements.push({ canonical, variants });
      }
    });
  });
  text.split(/[,.\n]/).forEach((part) => {
    const value = String(part || "").trim();
    if (value.split(" ").length <= 6 && /[a-z]/i.test(value) && !requirements.some((item) => cleanText(item.canonical) === cleanText(value))) {
      requirements.push({ canonical: value, variants: [] });
    }
  });
  return requirements.slice(0, 30);
}

function scoredCategory(label, max, checks) {
  const passed = checks.filter(([pass]) => pass).length;
  const points = Math.round((passed / Math.max(1, checks.length)) * max * 10) / 10;
  const percent = Math.round((points / max) * 100);
  return {
    label,
    max,
    points,
    percent,
    status: percent >= 85 ? READY_STATUSES.strong : percent >= 60 ? READY_STATUSES.warning : READY_STATUSES.critical,
    issues: checks.filter(([pass]) => !pass).map(([, message]) => ({ label, message })),
  };
}

function totalScore(categories) {
  return Math.round(categories.reduce((sum, category) => sum + category.points, 0));
}

function flattenIssues(categories) {
  return categories.flatMap((category) => category.issues.map((issue) => ({ type: category.label, message: issue.message })));
}

function buildRecommendations(categories, grammarIssues, repetitionIssues, bulletIssues, jobAnalysis) {
  const recommendations = [];
  categories.forEach((category) => {
    category.issues.forEach((issue) => recommendations.push(issue.message));
  });
  grammarIssues.forEach((issue) => recommendations.push(issue.message));
  repetitionIssues.forEach((issue) => recommendations.push(issue.message));
  bulletIssues.forEach((issue) => recommendations.push(issue.message));
  if (jobAnalysis.missing?.length) {
    recommendations.push(`Missing job evidence: ${jobAnalysis.missing.join(", ")}.`);
  }
  return [...new Set(recommendations)].slice(0, 16);
}

function findGrammarIssues(text) {
  const issues = [];
  const raw = String(text || "");
  if (/\b([A-Za-z]+)\s+\1\b/i.test(raw)) issues.push({ type: "Grammar", message: "Repeated word detected." });
  if (/\b(improved worked|delivered debugged|managed monitored|integrated collaborated)\b/i.test(raw)) issues.push({ type: "Grammar", message: "Broken verb phrase detected." });
  if (/[a-z0-9][.!?][A-Z]/.test(raw)) issues.push({ type: "Grammar", message: "Add spaces after punctuation." });
  if (/\b(responsible for|worked on|helped with)\b/i.test(raw)) issues.push({ type: "Grammar", message: "Weak phrasing found in resume content." });
  return issues;
}

function findRepetitionIssues(resume) {
  const bullets = collectBullets(resume);
  const issues = [];
  const starts = new Set();
  bullets.forEach((bullet) => {
    const opener = bullet.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    if (opener && starts.has(opener)) issues.push({ type: "Repetition", message: `Repeated bullet opener detected: "${opener}".` });
    starts.add(opener);
  });
  const skills = collectSkillItems(resume);
  if (skills.length !== dedupeSkillItems(skills).length) issues.push({ type: "Repetition", message: "Duplicate or near-duplicate skills detected." });
  return issues;
}

function findBulletIssues(resume) {
  const bullets = collectBullets(resume);
  return bullets.flatMap((bullet) => {
    const issues = [];
    if (wordCount(bullet) < 5) issues.push({ level: "Weak", message: `Bullet is too short: "${bullet}".` });
    if (wordCount(bullet) > 32) issues.push({ level: "Needs Improvement", message: `Bullet is too long: "${bullet}".` });
    if (!startsWithActionVerb(bullet)) issues.push({ level: "Needs Improvement", message: `Bullet should start with a clearer action verb: "${bullet}".` });
    if (/\b(responsible for|worked on|helped with)\b/i.test(bullet)) issues.push({ level: "Weak", message: `Bullet uses generic phrasing: "${bullet}".` });
    return issues;
  });
}

function serializeSectionForDiff(section) {
  if (!section) return "";
  return [section.title, ...sectionTextLines(section)].filter(Boolean).join("\n");
}

function estimateParserConfidence(rawText, legacy) {
  const source = cleanText(rawText);
  let score = 0.4;
  if (legacy.name && source.includes(cleanText(legacy.name))) score += 0.15;
  if (legacy.email && source.includes(cleanText(legacy.email))) score += 0.15;
  if (legacy.phone && source.includes(cleanText(legacy.phone))) score += 0.1;
  if ((legacy.experience || []).length) score += 0.1;
  if ((legacy.education || []).length) score += 0.1;
  return Math.min(0.98, Math.round(score * 100) / 100);
}

function splitSkillItems(value) {
  if (!value) return [];
  return String(value)
    .split(/\n|,/)
    .map((item) => item.replace(/^[A-Za-z /&-]+:\s*/, "").trim())
    .filter(Boolean);
}

function skillCategoriesFromText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /:/.test(line))
    .map((line) => {
      const [name, items] = line.split(":");
      return {
        name: String(name || "").trim(),
        items: String(items || "").split(",").map((item) => item.trim()).filter(Boolean),
      };
    });
}

function dedupeSkillItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = skillKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSkillCategories(categories) {
  return categories.map((category) => ({
    ...category,
    items: dedupeSkillItems(category.items || []),
  })).filter((category) => category.name || category.items.length);
}

function shortenSummary(text) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ").trim() || String(text || "").split(/\s+/).slice(0, 38).join(" ");
}

function splitBullets(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.replace(/^[•*-]\s*/, "").trim())
    .filter(Boolean);
}

function hasExperienceEntry(item) {
  return Boolean(item?.title || item?.company || item?.bullets);
}

function hasProjectEntry(item) {
  return Boolean(item?.title || item?.subtitle || item?.bullets);
}

function hasEducationEntry(item) {
  return Boolean(item?.degree || item?.school);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validPhone(value) {
  return String(value || "").replace(/[^\d]/g, "").length >= 8;
}

function startsWithActionVerb(value) {
  return /^(developed|built|created|implemented|optimized|improved|integrated|managed|led|delivered|configured|designed|supported|maintained|prepared|assisted|coordinated|performed|engineered|enhanced|reduced|analyzed|executed)\b/i.test(String(value || "").trim());
}

function looksLikeIndependentListLine(value) {
  return /^(?:responsible|worked|built|developed|designed|managed|improved|delivered|supported|implemented|created|optimized|coordinated|assisted|prepared|led|engineered|maintained|analyzed|automated|configured|handled|monitored|ensured|integrated|performed|executed)\b/i.test(String(value || "").trim());
}

function mergeWrappedListLines(lines) {
  const merged = [];
  lines.forEach((rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return;
    if (!merged.length) {
      merged.push(line);
      return;
    }
    const previous = merged[merged.length - 1];
    const looksLikeContinuation =
      !looksLikeIndependentListLine(line)
      && !/[.!?]$/.test(previous)
      && (wordCount(line) <= 8 || /^[A-Za-z0-9/+.#()&,-]+(?:\s+[A-Za-z0-9/+.#()&,-]+){0,7}[.]?$/.test(line));
    if (looksLikeContinuation) {
      merged[merged.length - 1] = `${previous} ${line}`.replace(/\s+/g, " ").trim();
      return;
    }
    merged.push(line);
  });
  return merged;
}

function wordCount(value) {
  return cleanText(value).split(" ").filter(Boolean).length;
}

function cleanText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9+#/. -]+/g, " ").replace(/\s+/g, " ").trim();
}

function skillKey(value) {
  return cleanText(value)
    .replace(/reactjs/g, "react.js")
    .replace(/nodejs/g, "node.js")
    .replace(/nextjs/g, "next.js")
    .replace(/restful apis/g, "rest apis");
}

function normalizeExternalUrl(value) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function extractUrl(value) {
  const match = String(value || "").match(/https?:\/\/\S+/i);
  return match ? match[0] : "";
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildCoreXml(resume) {
  const now = new Date().toISOString();
  const title = escapeXml([resume.profile?.fullName || "Resume", resume.targetRole || "", "Resume"].filter(Boolean).join(" "));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${title}</dc:title>
  <dc:creator>AI Resume Maker</dc:creator>
  <cp:lastModifiedBy>AI Resume Maker</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>AI Resume Maker</Application>
</Properties>`;
}

function buildDocumentXml(model, resume) {
  const pageSpec = PAGE_SPECS[model.pageSize === "US Letter" ? "LETTER" : "A4"];
  const body = [];
  model.pages.forEach((page, pageIndex) => {
    page.forEach((item, itemIndex) => {
      if (item.type === "heading") body.push(docxParagraph(formatResumeHeading(item.lines.join(" ")), { style: "SectionHeading" }));
      else if (item.type === "name") body.push(docxParagraph(item.lines.join(" "), { style: "Name" }));
      else if (item.type === "contact") body.push(docxParagraph(item.lines.join(" "), { style: "Contact" }));
      else if (item.type === "bullet") body.push(docxParagraph(`• ${item.text}`, { style: "BulletItem" }));
      else if (item.type === "entry-title") body.push(docxEntryTitleParagraph(item, model));
      else if (item.type === "entry-meta") {
        const previousItem = page[itemIndex - 1];
        if (!(previousItem?.type === "entry-title" && previousItem?.metaLine === item.text)) {
          body.push(docxParagraph(item.lines.join(" "), { style: "MetaLine" }));
        }
      }
      else body.push(docxParagraph(item.lines.join(" "), { style: "Normal" }));
    });
    if (pageIndex < model.pages.length - 1) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14 wp14">
  <w:body>
    ${body.join("")}
    <w:sectPr>
      <w:pgSz w:w="${mmToTwips(pageSpec.widthMm)}" w:h="${mmToTwips(pageSpec.heightMm)}"/>
      <w:pgMar w:top="${mmToTwips(model.typography.marginMm)}" w:right="${mmToTwips(model.typography.marginMm)}" w:bottom="${mmToTwips(model.typography.marginMm)}" w:left="${mmToTwips(model.typography.marginMm)}" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildStylesXml(model) {
  const typography = model?.typography || TYPOGRAPHY_PRESETS.default;
  const bodyHalfPoints = ptToHalfPoints(typography.bodySize);
  const nameHalfPoints = ptToHalfPoints(Math.max(typography.nameSize, 19));
  const headingHalfPoints = ptToHalfPoints(Math.max(typography.headingSize, 10.8));
  const contactHalfPoints = ptToHalfPoints(Math.max(typography.bodySize, 9.5));
  const metaHalfPoints = ptToHalfPoints(Math.max(typography.bodySize - 0.1, 9.2));
  const bodyLineTwips = lineHeightToTwips(typography.bodySize, typography.lineHeight);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="${bodyHalfPoints}"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:jc w:val="both"/><w:spacing w:after="48" w:line="${bodyLineTwips}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="${bodyHalfPoints}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Name">
    <w:name w:val="Name"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="96" w:line="${lineHeightToTwips(typography.nameSize, 1.02)}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="${nameHalfPoints}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Contact">
    <w:name w:val="Contact"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="132" w:line="${lineHeightToTwips(Math.max(typography.bodySize, 9.5), 1.12)}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:color w:val="334155"/><w:sz w:val="${contactHalfPoints}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="SectionHeading">
    <w:name w:val="Section Heading"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="132" w:after="54" w:line="${lineHeightToTwips(Math.max(typography.headingSize, 10.8), 1.08)}" w:lineRule="auto"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="222222"/></w:pBdr></w:pPr>
    <w:rPr><w:b/><w:sz w:val="${headingHalfPoints}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="EntryLine">
    <w:name w:val="Entry Line"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="10" w:line="${bodyLineTwips}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="${bodyHalfPoints}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="MetaLine">
    <w:name w:val="Meta Line"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="left"/><w:spacing w:after="32" w:line="${bodyLineTwips}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:color w:val="334155"/><w:sz w:val="${metaHalfPoints}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BulletItem">
    <w:name w:val="Bullet Item"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="both"/><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="18" w:line="${bodyLineTwips}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="${bodyHalfPoints}"/></w:rPr>
  </w:style>
</w:styles>`;
}

function buildFontTableXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Calibri"><w:family w:val="swiss"/></w:font>
  <w:font w:name="Calibri"><w:family w:val="swiss"/></w:font>
</w:fonts>`;
}

function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
</w:settings>`;
}

function buildWebSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`;
}

function buildNumberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
}

function buildDocumentRelsXml(resume) {
  const relationships = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>',
    '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  ].concat(collectHyperlinks(resume)
    .map((href, index) => `<Relationship Id="rId${100 + index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}

function docxParagraph(text, options = {}) {
  const styleXml = options.style ? `<w:pStyle w:val="${options.style}"/>` : "";
  const isBullet = options.style === "BulletItem" || options.bullet;
  const bulletXml = isBullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "";
  const escaped = escapeXml(String(text || "").replace(/^[•·]\s*/u, "").replace(/\t/g, " "));
  return `<w:p><w:pPr>${styleXml}${bulletXml}</w:pPr><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

function docxEntryTitleParagraph(text, model) {
  const sourceText = typeof text === "string" ? text : text?.text;
  const { left, right } = splitEntryTitleText(sourceText);
  const combinedLeft = [left, text?.metaLine].filter(Boolean).join(" | ");
  const pageSpec = PAGE_SPECS[model.pageSize === "US Letter" ? "LETTER" : "A4"];
  const usableWidthTwips = mmToTwips(pageSpec.widthMm - model.typography.marginMm * 2);
  return `<w:p>
    <w:pPr>
      <w:pStyle w:val="EntryLine"/>
      <w:tabs><w:tab w:val="right" w:pos="${usableWidthTwips}"/></w:tabs>
    </w:pPr>
    <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(combinedLeft || left)}</w:t></w:r>
    ${right ? `<w:r><w:tab/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(right)}</w:t></w:r>` : ""}
  </w:p>`;
}

function mmToPt(mm) {
  return Number(mm || 0) * 2.83465;
}

function mmToTwips(mm) {
  return Math.round(mm * 56.7);
}

function ptToHalfPoints(value) {
  return Math.round(Number(value || 10) * 2);
}

function lineHeightToTwips(fontPt, ratio) {
  return Math.round(Number(fontPt || 10) * Number(ratio || 1.2) * 20);
}

function buildContactParts(profile) {
  const parts = [];
  if (profile.phone) parts.push({ label: profile.phone });
  if (profile.email) parts.push({ label: profile.email, url: `mailto:${profile.email}` });
  if (profile.location) parts.push({ label: profile.location });
  if (profile.linkedin) parts.push({ label: "LinkedIn", url: profile.linkedin });
  if (profile.github) parts.push({ label: "GitHub", url: profile.github });
  if (profile.portfolio) parts.push({ label: "Portfolio", url: profile.portfolio });
  if (profile.website) parts.push({ label: "Website", url: profile.website });
  return parts;
}

function formatResumeHeading(value) {
  return String(value || "");
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const totalLength = offset + centralDirectorySize + endRecord.length;
  const result = new Uint8Array(totalLength);
  let cursor = 0;
  [...localParts, ...centralParts, endRecord].forEach((part) => {
    result.set(part, cursor);
    cursor += part.length;
  });
  return result;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}
