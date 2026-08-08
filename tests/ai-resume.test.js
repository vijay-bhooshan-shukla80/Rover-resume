import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeResume,
  applyFitSuggestions,
  buildDocxFromCanonical,
  createDefaultWorkingResume,
  hasRenderableContent,
  expectedVisibleStrings,
  getPaginatedDocumentModel,
  legacyResumeToCanonical,
  updateDocumentSettings,
  updateSection,
} from "../lib/ai-resume.js";
import { unzipEntries, validateDocxBytes } from "../lib/zip-utils.js";

test("legacy resumes normalize into canonical sections without losing core fields", () => {
  const canonical = legacyResumeToCanonical({
    name: "Vijay Shukla",
    phone: "8052869880",
    email: "vijay@example.com",
    location: "Delhi, IN",
    targetRole: "Full Stack Developer",
    summary: "Full stack developer with API and UI delivery experience.",
    skills: "JavaScript, Node.js, React.js, REST APIs",
    experience: [{ title: "Developer", company: "Example Corp", dates: "2024 - Present", bullets: "Built APIs\nDelivered UI features" }],
    projects: [],
    education: [{ school: "State University", degree: "BCA", dates: "2020 - 2023" }],
    certifications: [],
  });

  assert.equal(canonical.profile.fullName, "Vijay Shukla");
  assert.equal(canonical.targetRole, "Full Stack Developer");
  assert.ok(canonical.sections.some((section) => section.type === "summary"));
  assert.ok(canonical.sections.some((section) => section.type === "skills"));
  assert.ok(canonical.sections.some((section) => section.type === "experience"));
  assert.ok(canonical.sections.some((section) => section.type === "education"));
});

test("page model exposes overflow state and fit suggestions for long one-page resumes", () => {
  let resume = buildRichResume();
  const experience = resume.sections.find((section) => section.type === "experience");
  resume = updateDocumentSettings(resume, { settingsConfirmed: true, resumeLength: 1 });
  resume = updateSection(resume, experience.id, (section) => ({
    ...section,
    content: {
      ...section.content,
      entries: [
        {
          ...section.content.entries[0],
          bullets: Array.from({ length: 16 }, (_, index) => `Developed production feature number ${index + 1} with detailed technical explanation, stakeholder context, backend coordination, and release follow-through across multiple product surfaces.`),
        },
        {
          ...section.content.entries[1],
          bullets: Array.from({ length: 14 }, (_, index) => `Implemented workflow improvement ${index + 1} with repeated delivery details, technical documentation, regression handling, and long descriptive wording for realistic page pressure.`),
        },
      ],
    },
  }));

  const model = getPaginatedDocumentModel(resume);
  assert.equal(model.status, "overflow");
  assert.ok(model.fitSuggestions.length > 0);
});

test("applying fit suggestions keeps page target and reduces overflow pressure", () => {
  let resume = buildRichResume();
  const summary = resume.sections.find((section) => section.type === "summary");
  resume = updateDocumentSettings(resume, { settingsConfirmed: true, resumeLength: 1 });
  resume = updateSection(resume, summary.id, (section) => ({
    ...section,
    content: {
      ...section.content,
      text: `${section.content.text} ${section.content.text} ${section.content.text}`,
    },
  }));

  const before = getPaginatedDocumentModel(resume);
  const suggested = before.fitSuggestions.map((item) => item.id).filter((id) => id !== "format-only-tighten");
  const next = applyFitSuggestions(resume, suggested);
  const after = getPaginatedDocumentModel(next);

  assert.equal(next.documentSettings.resumeLength, 1);
  assert.ok(after.pageCount <= before.pageCount);
});

test("ATS analysis separates readiness from job match scoring", () => {
  const resume = buildRichResume();
  const analysis = analyzeResume(resume, "React.js, Node.js, AWS, REST APIs, TypeScript");

  assert.equal(typeof analysis.readinessScore, "number");
  assert.equal(typeof analysis.jobMatchScore, "number");
  assert.ok(Array.isArray(analysis.matchedKeywords));
  assert.ok(Array.isArray(analysis.missingKeywords));
});

test("DOCX export produces a valid OOXML document with visible content", async () => {
  const resume = buildRichResume();
  const blob = buildDocxFromCanonical(resume);
  const validation = validateDocxBytes(await blob.arrayBuffer());
  const expected = expectedVisibleStrings(resume).slice(0, 6);

  assert.equal(validation.ok, true);
  expected.forEach((value) => {
    const needle = String(value || "").trim().toLowerCase();
    if (!needle || needle.length <= 2) return;
    assert.match(validation.text.toLowerCase(), new RegExp(escapeForRegex(needle.slice(0, Math.min(needle.length, 30)))));
  });
});

test("DOCX export wires document relationships and real bullet numbering", async () => {
  const resume = buildRichResume();
  const blob = buildDocxFromCanonical(resume);
  const entries = unzipEntries(await blob.arrayBuffer());
  const rels = new TextDecoder("utf-8").decode(entries.get("word/_rels/document.xml.rels"));
  const numbering = new TextDecoder("utf-8").decode(entries.get("word/numbering.xml"));
  const documentXml = new TextDecoder("utf-8").decode(entries.get("word/document.xml"));

  assert.match(rels, /relationships\/styles/);
  assert.match(rels, /relationships\/numbering/);
  assert.match(numbering, /<w:numFmt w:val="bullet"\/>/);
  assert.match(documentXml, /<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr>/);
});

test("default working resume starts blank and does not expose empty section headings", () => {
  const resume = createDefaultWorkingResume();

  assert.equal(resume.profile.fullName, "");
  assert.equal(resume.targetRole, "");
  assert.equal(expectedVisibleStrings(resume).length, 0);
  assert.equal(resume.sections.some((section) => hasRenderableContent(section)), false);
});

function buildRichResume() {
  return legacyResumeToCanonical({
    name: "Vijay Shukla",
    phone: "+61 485 686 867",
    email: "vijay@example.com",
    location: "Melbourne VIC",
    targetRole: "Full Stack Developer",
    summary: "Full Stack Developer with experience building React, Next.js, Node.js, and SQL-backed products for real users.",
    skills: "JavaScript, TypeScript, React.js, Next.js, Node.js, Express.js, REST APIs, SQL, MySQL, MongoDB, Git, GitHub",
    experience: [
      {
        title: "Full Stack Developer",
        company: "Example Labs",
        dates: "2024 - Present",
        bullets: "Developed scalable dashboard features for operations teams.\nBuilt REST APIs and authentication flows with Node.js and Express.js.",
      },
      {
        title: "Frontend Developer",
        company: "Studio Pixel",
        dates: "2022 - 2024",
        bullets: "Implemented responsive React.js interfaces for marketing and SaaS pages.\nCollaborated with backend teams to integrate APIs and production fixes.",
      },
    ],
    projects: [
      {
        title: "Resume Builder Platform",
        subtitle: "Next.js | Node.js | PDF export",
        dates: "2025",
        bullets: "Built canonical resume editing with export validation.\nImplemented upload parsing for PDF and DOCX resumes.",
      },
    ],
    education: [{ school: "State University", degree: "B.Tech Computer Science", dates: "2018 - 2022" }],
    certifications: [{ title: "AWS Cloud Practitioner", issuer: "AWS", dates: "2024" }],
  });
}

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
