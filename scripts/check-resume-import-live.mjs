// Opt-in integration check: sends only these synthetic fixtures to configured Gemini.
import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { technical, service, fresher, senior } from "../tests/fixtures/import-candidates.mjs";
import { parseResumeWithGemini } from "../lib/gemini-resume-import.js";
import { extractDocxResumeText } from "../lib/docx-resume-import.js";
import { pdfTextItemsToLines } from "../lib/resume-import.js";
import { analyzeResume, buildDocxFromCanonical, buildResumeHtmlDocument, canonicalToPlainText, createDefaultWorkingResume, getPaginatedDocumentModel } from "../lib/ai-resume.js";
import { validateDocxBytes } from "../lib/zip-utils.js";

const outDir = new URL("../qa-artifacts/import-check/", import.meta.url);
await mkdir(outDir, { recursive: true });
const cases = [
  { name: "one-page-pdf", rawText: technical, format: "pdf" },
  { name: "two-page-pdf", rawText: senior, format: "pdf2" },
  { name: "docx", rawText: technical, format: "docx" },
  { name: "word-tables", rawText: technical, format: "table" },
  { name: "technical", rawText: technical },
  { name: "customer-service", rawText: service },
  { name: "fresher", rawText: fresher },
  { name: "senior", rawText: senior },
  { name: "four-plus-employers", rawText: senior },
  { name: "projects-and-employment", rawText: technical },
  { name: "no-summary", rawText: technical.replace(/PROFESSIONAL SUMMARY\n[^\n]+\n/, "") },
  { name: "no-skills-section", rawText: service },
  { name: "social-links", rawText: technical },
  { name: "certifications", rawText: technical },
  { name: "poor-grammar", rawText: service },
  { name: "unusual-headings", rawText: technical.replace("EMPLOYMENT HISTORY", "Career Journey").replace("ACADEMIC BACKGROUND", "Qualifications") },
  { name: "repeated-information", rawText: `${technical}\n${technical}` },
  { name: "target-role", rawText: technical, targetRole: "Frontend Developer" },
  { name: "target-role-and-jd", rawText: technical, targetRole: "Frontend Developer", jobDescription: "Build React.js interfaces. AWS and Kubernetes required. Five years management experience preferred." },
  { name: "raw-only", rawText: service },
  { name: "file-and-raw", uploadedText: technical, rawText: "Correction: current location is Mumbai.\nAdditional project: Help Guide | 2024\nDocumented JavaScript debugging steps." },
];
const selected = process.argv[2] ? cases.filter((item) => process.argv[2].split(",").includes(item.name)) : cases;
const report = [];
for (const fixture of selected) {
  let calls = 0;
  let repair = "";
  try {
    let rawText = fixture.rawText;
    if (fixture.format?.startsWith("pdf")) {
      const pdf = new jsPDF();
      const lines = rawText.split("\n");
      if (fixture.format === "pdf2") { const middle = Math.ceil(lines.length / 2); pdf.text(lines.slice(0, middle), 12, 20); pdf.addPage(); pdf.text(lines.slice(middle), 12, 20); }
      else pdf.text(lines, 12, 20);
      const bytes = new Uint8Array(pdf.output("arraybuffer"));
      await writeFile(new URL(`${fixture.name}.pdf`, outDir), bytes);
      const task = getDocument({ data: bytes, useSystemFonts: true });
      const doc = await task.promise;
      const pages = [];
      try { for (let page = 1; page <= doc.numPages; page++) pages.push(pdfTextItemsToLines((await (await doc.getPage(page)).getTextContent()).items)); }
      finally { await task.destroy(); }
      rawText = pages.join("\n\n");
    }
    if (["docx", "table"].includes(fixture.format)) {
      const zip = await JSZip.loadAsync(await buildDocxFromCanonical(createDefaultWorkingResume()).arrayBuffer());
      const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const paragraph = (line) => `<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`;
      const content = fixture.format === "table"
        ? `<w:tbl>${rawText.split("\n").map((line) => `<w:tr>${line.split(" | ").map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`
        : rawText.split("\n").map(paragraph).join("");
      zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}</w:body></w:document>`);
      const bytes = await zip.generateAsync({ type: "nodebuffer" });
      await writeFile(new URL(`${fixture.name}.docx`, outDir), bytes);
      rawText = await extractDocxResumeText(bytes);
    }
    const { resume, model } = await parseResumeWithGemini({ ...fixture, rawText }, { fetchImpl: async (url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      repair = body.contents[0].parts[1]?.text || "";
      const response = await fetch(url, options);
      if (response.ok) await writeFile(new URL(`${fixture.name}-attempt-${calls}.json`, outDir), await response.clone().text());
      else {
        const error = (await response.clone().json().catch(() => ({}))).error;
        console.log(JSON.stringify({ name: fixture.name, providerStatus: response.status, code: error?.status, quota: error?.details?.flatMap((detail) => detail.violations || []), retryDelay: error?.details?.find((detail) => detail.retryDelay)?.retryDelay }));
      }
      return response;
    } });
    assert.equal(resume.profile.fullName, "Avery Jordan");
    assert.equal(resume.profile.email, "avery@example.test");
    assert.equal(resume.profile.phone.replace(/\D/g, ""), "12025550100");
    const entries = (type) => resume.sections.filter((section) => section.type === type).flatMap((section) => section.content.entries || []);
    const original = fixture.uploadedText || fixture.rawText;
    assert.equal(entries("experience").length, original.includes("Operations Manager") ? 5 : original.includes("Software Developer") ? 2 : original.includes("Customer Adviser") ? 1 : 0);
    assert.equal(entries("education").length, 1);
    for (const item of entries("experience")) {
      assert.ok(original.includes(item.title), `Unexpected title: ${item.title}`);
      assert.ok(original.includes(item.organization), `Unexpected employer: ${item.organization}`);
      assert.ok(original.includes(`${item.title} | ${item.organization}`), "Title/company assignment changed");
      const dateWords = item.dateRange.match(/\d{4}/g) || [];
      dateWords.forEach((year) => assert.ok(original.split("\n").find((line) => line.includes(`${item.title} | ${item.organization}`))?.includes(year), "Employment year changed"));
    }
    if (original.includes("Reporting Portal")) assert.ok(entries("projects").some((entry) => entry.title === "Reporting Portal"));
    if (original.includes("SQL Certificate")) assert.ok(entries("certifications").some((entry) => entry.title === "SQL Certificate"));
    if (fixture.name === "file-and-raw") assert.equal(resume.profile.location, "Mumbai");
    const text = canonicalToPlainText(resume);
    assert.doesNotMatch(text, /\bAWS\b|Kubernetes|five years/i);
    if (fixture.targetRole) assert.equal(resume.targetRole, fixture.targetRole);
    assert.ok(resume.sections.some((section) => section.type === "summary" && section.content.text));
    assert.match(buildResumeHtmlDocument(resume), /Avery Jordan/);
    const docx = await buildDocxFromCanonical(resume).arrayBuffer();
    assert.equal(validateDocxBytes(docx).ok, true);
    const scores = analyzeResume(resume, fixture.jobDescription || "JavaScript React.js SQL customer service");
    assert.ok(Number.isFinite(scores.readinessScore) && Number.isFinite(scores.jobMatchScore));
    await writeFile(new URL(`${fixture.name}-result.json`, outDir), JSON.stringify(resume, null, 2));
    await writeFile(new URL(`${fixture.name}-result.docx`, outDir), Buffer.from(docx));
    report.push({ name: fixture.name, ok: true, model, calls, readiness: scores.readinessScore, jobMatch: scores.jobMatchScore, pages: getPaginatedDocumentModel(resume).pages.length });
  } catch (error) {
    report.push({ name: fixture.name, ok: false, calls, error: error.message, repair });
    process.exitCode = 1;
  }
  console.log(JSON.stringify(report.at(-1)));
  await writeFile(new URL(`report-${process.argv[2] || "all"}.json`, outDir), JSON.stringify(report, null, 2));
}
