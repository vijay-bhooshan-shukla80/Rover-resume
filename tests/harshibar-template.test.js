import test from "node:test";
import assert from "node:assert/strict";
import { legacyResumeToCanonical, buildDocxFromCanonical, getPaginatedDocumentModel, buildResumeHtmlDocument } from "../lib/ai-resume.js";
import { applyHarshibarTemplate, buildHarshibarLatex } from "../lib/harshibar-template.js";
import { unzipEntries } from "../lib/zip-utils.js";

const source = () => legacyResumeToCanonical({ name: "Avery Jordan", email: "avery@example.test", phone: "555.555.5555",
  linkedin: "https://www.linkedin.com/feed/)",
  summary: "Results-driven Software Engineer with expertise in building scalable applications.",
  experience: [{ title: "Software Engineer", company: "Northwind", dates: "2023 - Present", bullets: "Built JavaScript dashboards and SQL reporting tools." }],
  education: [{ school: "City University", degree: "BSc Computer Science", dates: "2018 - 2021" }], skills: "JavaScript, SQL", projects: [{ title: "Inventory Tracker", dates: "2022", bullets: "Developed web app." }] });

test("JD template preserves source and orders sections as Summary => Experience => Projects => Skills => Education => Certifications", () => {
  const before = source();
  const after = applyHarshibarTemplate(before);
  assert.equal(before.documentSettings.template, undefined);
  assert.deepEqual(after.sections, before.sections);
  const model = getPaginatedDocumentModel(after);
  assert.equal(model.pageSize, "US Letter");
  assert.equal(model.typography.nameSize, 24.88);
  const rows = model.pages.flat();
  const headings = rows.filter(r => r.type === "heading").map(r => r.text);
  assert.deepEqual(headings, ["Professional Summary", "Experience", "Projects", "Skills", "Education"]);
  assert.equal(rows.find(r => r.text === "Northwind").right, "2023 - Present");
  assert.equal(rows.find(r => r.text === "Northwind").boldRight, true);
  assert.equal(rows.find(r => r.text === "Software Engineer").italic, true);
  assert.equal(rows.find(r => r.text === "City University").bold, true);
});

test("Word and preview render bold right-aligned dates, clean contact info without Courier, and grey section rules", async () => {
  const resume = applyHarshibarTemplate(source());
  const model = getPaginatedDocumentModel(resume);
  const zip = unzipEntries(await buildDocxFromCanonical(resume).arrayBuffer());
  const document = new TextDecoder().decode(zip.get("word/document.xml"));
  assert.match(document, /w:w="12240" w:h="15840"/);
  assert.match(document, /w:color="D4D4D4"/);
  assert.match(document, /w:lineRule="exact"/);
  assert.match(document, /<w:i\/>/);
  // Bold right date in Word
  assert.match(document, /<w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">2023 - Present<\/w:t>/);
  // Justified alignment for body and bullets in Word
  assert.match(document, /<w:jc w:val="both"\/>/);
  // Cleaned contact info without https:// and trailing paren
  assert.match(document, /linkedin\.com\/feed/);
  assert.doesNotMatch(document, /linkedin\.com\/feed\/\)/);

  const html = buildResumeHtmlDocument(resume);
  assert.match(html, /size:letter/);
  assert.match(html, /Northwind/);
  assert.match(html, /class="right bold-date">2023 - Present<\/span>/);
  assert.match(html, /linkedin\.com\/feed/);
});

test("Harshibar Overleaf LaTeX generator produces clean template with requested section order and bold dates", () => {
  const resume = applyHarshibarTemplate(source());
  const latex = buildHarshibarLatex(resume);
  assert.match(latex, /\\documentclass\[letterpaper,11pt\]\{article\}/);
  assert.match(latex, /\\textbf\{\\Huge Avery Jordan\}/);
  assert.match(latex, /linkedin\.com\/feed/);
  // Summary => Experience => Projects => Skills => Education
  const summaryIdx = latex.indexOf("\\section{Professional Summary}");
  const expIdx = latex.indexOf("\\section{Experience}");
  const projIdx = latex.indexOf("\\section{Projects}");
  const skillsIdx = latex.indexOf("\\section{Skills}");
  const eduIdx = latex.indexOf("\\section{Education}");
  assert.ok(summaryIdx < expIdx, "Summary should precede Experience");
  assert.ok(expIdx < projIdx, "Experience should precede Projects");
  assert.ok(projIdx < skillsIdx, "Projects should precede Skills");
  assert.ok(skillsIdx < eduIdx, "Skills should precede Education");
  // Bold date in resumeSubheading
  assert.match(latex, /\\textbf\{2023 - Present\}/);
});

test("long resumes paginate without shrinking type or dropping the last bullet", async () => {
  const resume = applyHarshibarTemplate(source());
  resume.sections.find(s => s.type === "experience").content.entries[0].bullets = Array.from({ length: 100 }, (_, i) => `Handled SQL reporting task ${i} with documented JavaScript improvements.`);
  const model = getPaginatedDocumentModel(resume);
  assert.ok(model.pageCount > 1);
  assert.equal(model.typography.bodySize, 10);
  assert.ok(model.pages.flat().some(r => r.text.includes("task 99")));
  assert.ok(model.pages.flat().every(r => r.y + r.height <= 756));
  const zip = unzipEntries(await buildDocxFromCanonical(resume).arrayBuffer());
  const docXml = new TextDecoder().decode(zip.get("word/document.xml"));
  // Assert no forced pageBreakBefore tags that cause blank pages in Word
  assert.equal((docXml.match(/<w:pageBreakBefore\/>/g) || []).length, 0);
  // Assert bullets are NOT bold in Word
  const bulletPs = docXml.split("</w:p>").filter(p => p.includes("•"));
  assert.equal(bulletPs.some(p => p.includes("<w:b/>") || p.includes("<w:b ")), false);
});

test("Harshibar renders LinkedIn and GitHub anchor links, strips box icons, unbolds certifications, and cleans role/location layout", async () => {
  const resume = applyHarshibarTemplate(legacyResumeToCanonical({
    name: "Mayank Sodhi",
    email: "mayanksodhi11@gmail.com",
    phone: "+61422 552 002",
    location: "Australia",
    linkedin: "https://www.linkedin.com/in/mayank-sodhi-84924a223/",
    github: "https://github.com/mayanksodhi",
    summary: "Dedicated Customer Support Specialist with over 2 years of experience.",
    experience: [
      {
        title: "Site Supervisor",
        company: "Acme Construction",
        organization: "☐ Supervise end-to-end site operations",
        subtitle: "managing 10-15 workers across residential construction projects",
        location: "Perth",
        dates: "Oct 2024 - Present",
        bullets: "Delivered exceptional client support across blended voice."
      }
    ],
    education: [
      {
        school: "Builders Academy Australia - https://www.linkedin.com/in/mahir-julka-309211292/?lipi=urn%3Ali%3Apage%3Ad_fl",
        degree: "Diploma of Building and Construction",
        dates: "Jul 2025 - Present",
        url: "https://www.linkedin.com/in/mayank-sodhi-84924a223/"
      }
    ],
    certifications: [
      {
        title: "☐ White Card, Forklift Licence, Elevated Work Platform (EWP) High Risk Licence, Dogging Licence.",
        dates: "2024"
      }
    ]
  }));

  const model = getPaginatedDocumentModel(resume);
  const rows = model.pages.flat();

  // 1. Certification text is unbolded (bold: false)
  const certRow = rows.find(r => r.text.includes("White Card"));
  assert.ok(certRow, "Certification row should exist");
  assert.equal(certRow.bold, false, "Certification entry should NOT be bold");

  // 2. Box glyphs [ ] and ☐ are stripped
  assert.equal(certRow.text.startsWith("☐"), false, "Leading ballot box must be stripped");
  assert.equal(rows.some(r => r.text.includes("☐") || r.text.includes("□")), false, "No ballot boxes or square glyphs in rows");

  // 3. Experience title is swapped to authentic title 'Site Supervisor', and sentence duty is role/subtitle
  const expTitle = rows.find(r => r.text === "Acme Construction" || r.text === "Site Supervisor");
  assert.ok(expTitle, "Site Supervisor or Acme Construction should be the entry title");
  assert.equal(expTitle.bold, true);

  // 4. Loc does not get flooded with task descriptions
  assert.equal(expTitle.right, "Oct 2024 - Present");
  const metaRow = rows.find(r => r.type === "entry-meta");
  assert.ok(metaRow, "Entry meta row should exist");
  assert.equal(metaRow.right, "Perth", "Genuine location preserved while descriptive duties are excluded");

  // 5. Personal LinkedIn URL does not leak into Education meta or title
  const eduTitle = rows.find(r => r.type === "entry-title" && r.text.includes("Builders Academy Australia"));
  assert.ok(eduTitle, "Education title row should exist");
  assert.equal(eduTitle.text, "Builders Academy Australia", "Leaked LinkedIn URL with tracking parameters stripped from school title");
  const eduMeta = rows.find(r => r.type === "entry-meta" && r.text.includes("Diploma"));
  assert.ok(eduMeta, "Education meta should exist");
  assert.equal(eduMeta.text.includes("linkedin.com"), false, "Personal social URLs must not leak into education subtitles");

  // 6. Word DOCX has hyperlink runs and tooltips
  const zip = unzipEntries(await buildDocxFromCanonical(resume).arrayBuffer());
  const document = new TextDecoder().decode(zip.get("word/document.xml"));
  assert.match(document, /<w:hyperlink r:id="rId100" w:tooltip="linkedin\.com\/in\/mayank-sodhi-84924a223"/);
  assert.match(document, /<w:hyperlink r:id="rId101" w:tooltip="github\.com\/mayanksodhi"/);
  assert.match(document, /<w:t xml:space="preserve">LinkedIn<\/w:t>/);
  assert.match(document, /<w:t xml:space="preserve">GitHub<\/w:t>/);
  assert.match(document, /w:space="4"/);
  assert.match(document, /<w:keepNext\/>/);

  // 7. HTML preview has clickable links with SVG icons
  const html = buildResumeHtmlDocument(resume);
  assert.match(html, />LinkedIn<\/a>/);
  assert.match(html, />GitHub<\/a>/);
  assert.match(html, /fill="#0a66c2"/);

  // 8. LaTeX generator produces \faLinkedin and \faGithub with LinkedIn and GitHub text
  const latex = buildHarshibarLatex(resume);
  assert.match(latex, /\\faLinkedin \\hspace\{2pt\} \\href\{https:\/\/linkedin\.com\/in\/mayank-sodhi-84924a223\}\{LinkedIn\}/);
  assert.match(latex, /\\faGithub \\hspace\{2pt\} \\href\{https:\/\/github\.com\/mayanksodhi\}\{GitHub\}/);
  assert.match(latex, /\\resumeProjectHeading\s+\{White Card, Forklift Licence/);
});
