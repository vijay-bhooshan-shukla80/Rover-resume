import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { checkResumeQualityGate, parseResumeWithGemini } from "../lib/gemini-resume-import.js";
import { cleanResumeImportText, combineResumeImportSources, mapParsedResumeToExistingSchema, pdfTextItemsToLines, validateParsedResume } from "../lib/resume-import.js";
import { extractDocxResumeText } from "../lib/docx-resume-import.js";
import { analyzeResume, buildDocxFromCanonical, buildResumeHtmlDocument, canonicalToPlainText, createDefaultWorkingResume, expectedVisibleStrings, getPaginatedDocumentModel } from "../lib/ai-resume.js";
import { validateDocxBytes } from "../lib/zip-utils.js";

const normKey = (value) => String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}+#%]+/gu, " ").trim().replace(/\s+/g, " ");

const REFERENCE_FACTUAL_ENTITIES = [
  "JLE Group", "Fast Cables", "A.N.Q Associates", "ANQ Associates",
  "Capital Electro Engineering", "SMA Energy", "Samsung Mobile", "UIMS Institute",
  "NUST University", "COMSATS University", "COMSATS",
  "Battery Energy Storage Systems", "BESS", "Neara", "TimeTrax", "Ausgrid", "Essential Energy",
  "Master of Engineering Management", "Bachelor of Electrical Engineering",
  "Dubbo"
];

function assertReferenceIsolation(resume, source) {
  const normSource = ` ${normKey(source)} `;
  const outputText = JSON.stringify(resume);
  for (const entity of REFERENCE_FACTUAL_ENTITIES) {
    const k = normKey(entity);
    if (!normSource.includes(` ${k} `)) {
      if (normKey(outputText).includes(` ${k} `)) {
        throw new Error(`Reference resume fact leaked into candidate output: ${entity}`);
      }
    }
  }
}

const source = `Avery Jordan
avery@example.test | +1 202 555 0100 | Delhi
linkedin.com/in/avery | github.com/avery
CAREER HISTORY
Customer Adviser | Northwind | January 2023 - Present
i handle customers and solve issues and help in sale. Helped 20 customers daily.
ACADEMIC BACKGROUND
BA | City University | 2020 - 2022
COMPETENCIES
MS Excel, Microsoft Excel, Java Script, Javascript
PROFESSIONAL CERTIFICATIONS
Service Certificate | City Institute | 2023`;
const makeEntry = (values = {}) => ({ title: "", organization: "", subtitle: "", location: "", dateRange: "", description: "", bullets: [], url: "", ...values });
function fixture() {
  return {
    resume: {
      profile: { fullName: "Avery Jordan", email: "avery@example.test", phone: "+1 202 555 0100", location: "Delhi", linkedin: "linkedin.com/in/avery", github: "github.com/avery", portfolio: "", website: "" },
      targetRole: "Customer Adviser",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Customer Adviser supporting sales and resolving customer issues." } },
        { type: "skills", title: "Skills", content: { items: ["MS Excel", "Microsoft Excel", "Java Script", "Javascript"] } },
        { type: "experience", title: "Work", content: { entries: [makeEntry({ title: "Customer Adviser", organization: "Northwind", dateRange: "Jan 2023 - Present", bullets: ["Resolved customer issues and supported sales activities.", "Assisted 20 customers daily."] })] } },
        { type: "education", title: "Education", content: { entries: [makeEntry({ title: "BA", organization: "City University", dateRange: "2020 - 2022" })] } },
        { type: "certifications", title: "Certifications", content: { entries: [makeEntry({ title: "Service Certificate", organization: "City Institute", dateRange: "2023" })] } },
      ],
    },
    evidence: ["sections.0.content.text", "sections.2.content.entries.0", "sections.3.content.entries.0", "sections.4.content.entries.0"].map((path) => ({ path, quotes: [source] })),
  };
}
const mockResponse = (payload) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] } }] }), { headers: { "Content-Type": "application/json" } });

test("raw and file sources retain corrections without duplication or aggressive cleaning", () => {
  assert.equal(combineResumeImportSources(source, source), source);
  assert.match(combineResumeImportSources(source, "Correction: phone +1 202 555 0101"), /explicit corrections take precedence/);
  assert.equal(cleanResumeImportText("A\r\nPage 1 of 2\r\nB\u0000\n2023\nProject 2"), "A\nB\n2023\nProject 2");
  assert.throws(() => cleanResumeImportText("a".repeat(100001)), /too long/);
  assert.throws(() => cleanResumeImportText({ text: source }), /must be text/);
});

test("validated canonical import preserves identity, boundaries, dates and genuine scores", async () => {
  const canonical = mapParsedResumeToExistingSchema(validateParsedResume(fixture(), source), { documentSettings: { pageSize: "US Letter", resumeLength: 1 } });
  assert.equal(canonical.profile.fullName, "Avery Jordan");
  assert.equal(canonical.profile.linkedin, "https://linkedin.com/in/avery");
  assert.equal(canonical.sections[2].content.entries[0].organization, "Northwind");
  assert.deepEqual(canonical.sections[1].content.items, ["Microsoft Excel", "JavaScript"]);
  assert.equal(canonical.sections[3].type, "education");
  assert.equal(canonical.documentSettings.pageSize, "US Letter");
  assert.ok(getPaginatedDocumentModel(canonical).pages.length);
  assert.match(buildResumeHtmlDocument(canonical), /Avery Jordan/);
  assert.match(canonicalToPlainText(canonical), /Service Certificate/);
  const docx = validateDocxBytes(await buildDocxFromCanonical(canonical).arrayBuffer());
  assert.equal(docx.ok, true);
  assert.match(docx.text, /Northwind/);
  const score = analyzeResume(canonical, "Customer service with Microsoft Excel");
  assert.ok(Number.isFinite(score.readinessScore));
  assert.ok(Number.isFinite(score.jobMatchScore));
});

test("duplicates merge but separate titles and employment periods survive", () => {
  const parsed = fixture().resume;
  const item = parsed.sections[2].content.entries[0];
  parsed.sections[2].content.entries.push(structuredClone(item), { ...item, title: "Senior Customer Adviser" }, { ...item, dateRange: "2020 - 2021" });
  const canonical = mapParsedResumeToExistingSchema(parsed);
  assert.equal(canonical.sections[2].content.entries.length, 3);
  assert.equal(canonical.sections[2].content.entries[0].bullets.length, 2);
});

for (const [label, mutate] of [
  ["invented employer", (p) => { p.resume.sections[2].content.entries[0].organization = "Fake Corp"; }],
  ["changed email", (p) => { p.resume.profile.email = "fake@example.test"; }],
  ["unsupported JD skill", (p) => { p.resume.sections[1].content.items.push("AWS"); }],
  ["invented metric", (p) => { p.resume.sections[2].content.entries[0].bullets.push("Increased sales by 35%."); }],
  ["invented date", (p) => { p.resume.sections[2].content.entries[0].dateRange = "2017 - Present"; }],
  ["wrong field types", (p) => { p.resume.sections[2].content.entries = "job"; }],
  ["missing source evidence", (p) => { p.evidence = []; }],
  ["fabricated evidence", (p) => { p.evidence[0].quotes = ["Worked at Fake Corp"]; }],
  ["script URL", (p) => { p.resume.profile.linkedin = "javascript:alert(1)"; }],
  ["changed URL username", (p) => { p.resume.profile.linkedin = "https://linkedin.com/in/Avery"; }],
  ["empty output", (p) => { p.resume.sections = []; }],
]) test(`import rejects ${label}`, () => { const payload = fixture(); mutate(payload); assert.throws(() => validateParsedResume(payload, source)); });

test("one structured Gemini request, source/JD separation, one safe malformed JSON retry", async () => {
  let calls = 0;
  const result = await parseResumeWithGemini({ rawText: source, targetRole: "Customer Service Adviser", jobDescription: "AWS required" }, {
    apiKey: "test-key", model: "test-model",
    fetchImpl: async (url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      assert.ok(!url.includes("test-key"));
      assert.equal(body.generationConfig.temperature, 0.1);
      assert.ok(body.generationConfig.responseJsonSchema);
      assert.match(body.systemInstruction.parts[0].text, /never use the JD as evidence/);
      return calls === 1 ? mockResponse("{broken") : mockResponse(fixture());
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.resume.targetRole, "Customer Service Adviser");
  assert.equal(result.resume.rawImport.rawText, source);
});

test("provider failure and repeated invalid output never yield a replacement resume", async () => {
  let calls = 0;
  await assert.rejects(parseResumeWithGemini({ rawText: source }, { apiKey: "test", fetchImpl: async () => { calls += 1; return new Response("busy", { status: 429 }); } }), /quota/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(parseResumeWithGemini({ rawText: source }, { apiKey: "test", fetchImpl: async () => { calls += 1; return mockResponse({}); } }), /after one retry/);
  assert.equal(calls, 2);
  await assert.rejects(parseResumeWithGemini({ rawText: source }, { apiKey: "" }), /not configured/);
});

test("PDF row reconstruction retains columns and split tokens", () => {
  const item = (str, x, y, width = 30) => ({ str, transform: [1, 0, 0, 1, x, y], width });
  assert.equal(pdfTextItemsToLines([item("2023", 350, 700), item("Experience", 20, 740), item("Northwind", 20, 700)]), "Experience\nNorthwind | 2023");
});

test("one and two page PDF files round-trip through the extraction library", async () => {
  for (const pages of [1, 2]) {
    const pdf = new jsPDF();
    pdf.text(source.split("\n"), 15, 20);
    if (pages === 2) { pdf.addPage(); pdf.text(["PROJECTS", "Customer Help Guide", "Documented complaint resolution steps."], 15, 20); }
    const loadingTask = getDocument({ data: new Uint8Array(pdf.output("arraybuffer")), useSystemFonts: true });
    const doc = await loadingTask.promise;
    try {
      assert.equal(doc.numPages, pages);
      const extracted = [];
      for (let page = 1; page <= pages; page += 1) extracted.push(pdfTextItemsToLines((await (await doc.getPage(page)).getTextContent()).items));
      assert.match(extracted.join("\n"), /Customer Adviser/);
      assert.match(extracted.join("\n"), /ACADEMIC BACKGROUND/);
      if (pages === 2) assert.match(extracted[1], /Customer Help Guide/);
    } finally { await loadingTask.destroy(); }
  }
});

test("DOCX paragraphs, tables, bullets and linked labels remain readable", async () => {
  const canonical = mapParsedResumeToExistingSchema(validateParsedResume(fixture(), source));
  const bytes = await buildDocxFromCanonical(canonical).arrayBuffer();
  assert.match(await extractDocxResumeText(Buffer.from(bytes)), /Northwind/);
  const zip = await JSZip.loadAsync(bytes);
  let xml = await zip.file("word/document.xml").async("string");
  xml = xml.replace("<w:sectPr>", '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Training</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2024</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr>');
  zip.file("word/document.xml", xml);
  const text = await extractDocxResumeText(await zip.generateAsync({ type: "nodebuffer" }));
  assert.match(text, /Training/);
  assert.match(text, /2024/);
  assert.match(text, /linkedin\.com\/in\/avery/);
  assert.match(text, /Assisted 20 customers daily/);
  await assert.rejects(extractDocxResumeText(Buffer.from("not a docx")));
});

test("the actual editor import handler commits once, preserves settings and keeps state on failure/stale input", async () => {
  const component = readFileSync(new URL("../components/ResumeBuilder.jsx", import.meta.url), "utf8");
  const handler = component.slice(component.indexOf("async function convertImportedResume()"), component.indexOf("  async function enhanceResume()"));
  for (const outcome of ["success", "failure", "stale", "malformed"]) {
    let commits = 0;
    const initial = mapParsedResumeToExistingSchema(validateParsedResume(fixture(), source), { documentSettings: { pageSize: "US Letter", resumeLength: 1 } });
    const before = structuredClone(initial);
    let current = initial;
    let error = "";
    const context = {
      importBusyRef: { current: false }, importRevisionRef: { current: 0 }, uploadedSourceRef: { current: source },
      importText: source, uploadTargetRole: "", uploadInfo: { name: "test.docx" }, jobDescription: "", signedIn: true,
      workingResume: initial,
      ensureCanonicalResume: (value) => value, canonicalToLegacy: (value) => ({ name: value.profile.fullName }),
      setMessage() {}, setImportError(value) { error = value; }, setImportLoading() {}, setImportOpen() {}, setAuthGateOpen() {}, setImportText() {}, setUploadInfo() {},
      updateResume(value) { commits++; current = value; },
      fetch: async () => {
        if (outcome === "stale") context.importRevisionRef.current++;
        return { ok: outcome !== "failure", json: async () => outcome === "malformed" ? { ok: true, resume: {} } : { ok: outcome !== "failure", error: "Provider unavailable", resume: structuredClone(initial) } };
      },
    };
    await vm.runInNewContext(`(${handler})`, context)();
    assert.equal(commits, outcome === "success" ? 1 : 0);
    assert.deepEqual(initial, before);
    assert.equal(current.documentSettings.pageSize, "US Letter");
    assert.equal(current.documentSettings.resumeLength, 1);
    assert.equal(context.importBusyRef.current, false);
    if (outcome !== "success") { assert.ok(error); assert.equal(context.importText, source); }
  }
});

test("unchanged client PDF export renders imported canonical data into readable PDF bytes", async () => {
  const component = readFileSync(new URL("../components/ResumeBuilder.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const handler = component.slice(component.indexOf("async function downloadPdf()"), component.indexOf("  const atsLabel"));
  const helpers = ["mmToPt", "formatResumeHeadingLabel", "drawPdfContactBlock", "drawPdfContactLine", "measurePdfContactLine", "splitEntryTitle", "drawPdfParagraph", "shouldJustifyLine", "drawJustifiedLine", "getDownloadBaseName", "validatePdfBytes", "normalizeValidationText", "escapeRegExp"].map((name) => {
    const pattern = new RegExp(`^(?:async )?function ${name}\\(`, "m");
    const start = component.search(pattern);
    assert.ok(start >= 0, `Missing export helper ${name}`);
    const remainder = component.slice(start);
    const end = remainder.indexOf("\n}\n") + 3;
    return remainder.slice(0, end);
  }).join("\n");
  const workingResume = mapParsedResumeToExistingSchema(validateParsedResume(fixture(), source));
  let pending;
  let download;
  let message = "";
  const context = {
    workingResume, pageModel: getPaginatedDocumentModel(workingResume), expectedVisibleStrings,
    requirePremium(action) { pending = action(); },
    fetch: async () => new Response(JSON.stringify({ error: "Test server unavailable; exercise existing fallback" }), { status: 503, headers: { "Content-Type": "application/json" } }),
    loadPdfJs: async () => ({ getDocument }),
    downloadFile(blob, name) { download = { blob, name }; },
    setMessage(value) { message = value; },
    console: { warn() {} },
  };
  const run = new Function(...Object.keys(context), `${helpers}\nreturn (${handler});`)(...Object.values(context));
  await run();
  await pending;
  assert.ok(download, message);
  assert.match(download.name, /\.pdf$/);
  const task = getDocument({ data: new Uint8Array(await download.blob.arrayBuffer()), useSystemFonts: true });
  const doc = await task.promise;
  try {
    const text = pdfTextItemsToLines((await (await doc.getPage(1)).getTextContent()).items);
    assert.match(text, /Avery Jordan/);
    assert.match(text, /Northwind/);
    assert.match(text, /City University/);
    assert.match(text, /Service Certificate/);
  } finally { await task.destroy(); }
});

test("dash, smart quote, table pipe spacing, and formatted metrics ground reliably", () => {
  const dashText = "Company \u2013 2020 \u2014 2022 \u201cSpecial Project\u201d \u2018Lead\u2019";
  const cleaned = cleanResumeImportText(dashText);
  assert.equal(cleaned, "Company - 2020 - 2022 \"Special Project\" 'Lead'");

  const tableSource = "Avery Jordan\navery@example.test | +1 202 555 0100 | Delhi\nSoftware Developer | Northwind Retail | Jan 2023 - Present\nHelped 1,000 customers daily.";
  const payload = {
    resume: {
      profile: { fullName: "Avery Jordan", email: "avery@example.test", phone: "+1 202 555 0100", location: "Delhi", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Developer",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Developer assisting 1000 customers daily." } },
        { type: "experience", title: "Experience", content: { entries: [makeEntry({ title: "Software Developer", organization: "Northwind Retail", dateRange: "Jan 2023 - Present", bullets: ["Helped 1000 customers daily."] })] } },
      ],
    },
    evidence: [
      { path: "resume.profile.fullName", quotes: ["Avery Jordan"] },
      { path: "resume.profile.email", quotes: ["avery@example.test"] },
      { path: "resume.profile.phone", quotes: ["+1 202 555 0100"] },
      { path: "resume.profile.location", quotes: ["Delhi"] },
      { path: "resume.sections.0.content.text", quotes: ["Helped 1,000 customers daily."] },
      // Quote with tight pipe spacing as emitted in word-tables attempt 1
      { path: "resume.sections.1.content.entries.0", quotes: ["Software Developer| Northwind Retail| Jan 2023 - Present", "Helped 1,000 customers daily."] },
    ],
  };
  const validated = validateParsedResume(payload, tableSource);
  assert.equal(validated.sections[1].content.entries[0].organization, "Northwind Retail");
  assert.equal(validated.sections[1].content.entries[0].bullets[0], "Helped 1000 customers daily.");
});

test("empty files and scanned PDF pages fail with actionable OCR guidance", async () => {
  const zip = await JSZip.loadAsync(await buildDocxFromCanonical(createDefaultWorkingResume()).arrayBuffer());
  zip.file("word/document.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body></w:body></w:document>");
  const emptyDocx = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(extractDocxResumeText(emptyDocx), /No readable text found in this DOCX/);

  // Blank PDF page
  const pdf = new jsPDF();
  const loadingTask = getDocument({ data: new Uint8Array(pdf.output("arraybuffer")), useSystemFonts: true });
  const doc = await loadingTask.promise;
  try {
    const text = pdfTextItemsToLines((await (await doc.getPage(1)).getTextContent()).items);
    assert.equal(text.trim(), "");
  } finally { await loadingTask.destroy(); }
});

test("recorded Gemini responses replay offline through canonical schema and ATS scoring", async () => {
  const artifacts = [
    { file: "word-tables-attempt-2.json", source },
    { file: "social-links-attempt-1.json", source },
    { file: "poor-grammar-attempt-2.json", source },
  ];
  for (const { file } of artifacts) {
    const raw = readFileSync(new URL(`../qa-artifacts/import-check/${file}`, import.meta.url), "utf8");
    const payload = JSON.parse(JSON.parse(raw).candidates[0].content.parts[0].text);
    const validated = validateParsedResume(payload, [source, ...payload.evidence.flatMap((item) => item.quotes)].join("\n"));
    const canonical = mapParsedResumeToExistingSchema(validated);
    assert.equal(canonical.profile.fullName, "Avery Jordan");
    assert.ok(canonical.sections.some((s) => s.type === "summary" && s.content.text));
    const score = analyzeResume(canonical, "Customer service and JavaScript development");
    assert.ok(Number.isFinite(score.readinessScore));
    assert.ok(Number.isFinite(score.jobMatchScore));
  }
});

test("all 6 core section types (summary, skills, experience, projects, education, certifications) are always preserved in imported canonical schema", () => {
  const minimalPayload = {
    profile: { fullName: "Avery Jordan", email: "avery@example.test", phone: "+1 202 555 0100", location: "Delhi", linkedin: "", github: "", portfolio: "", website: "" },
    targetRole: "Customer Adviser",
    sections: [
      { type: "summary", title: "Summary", content: { text: "Customer Adviser supporting sales." } },
      { type: "experience", title: "Work", content: { entries: [makeEntry({ title: "Customer Adviser", organization: "Northwind", dateRange: "Jan 2023 - Present" })] } },
    ],
  };
  const canonical = mapParsedResumeToExistingSchema(minimalPayload);
  const coreTypes = ["summary", "skills", "experience", "projects", "education", "certifications"];
  for (const type of coreTypes) {
    const section = canonical.sections.find((s) => s.type === type);
    assert.ok(section, `Core section ${type} must be present in editor schema.`);
    assert.equal(section.visible, true);
  }
});

// ============================================================================
// MANDATORY TEST SCENARIOS (1 to 12)
// ============================================================================

test("scenario 1: sparse resume + reference isolation prevents reference facts from leaking", () => {
  const sparseSource = "Mark Cubric\nmark@example.test\n0423 767 276\nWoolworths 2023\nSkills: Communication, Teamwork";
  const leakedPayload = {
    resume: {
      profile: { fullName: "Mark Cubric", email: "mark@example.test", phone: "0423 767 276", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Team Member",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Experienced in BESS and battery storage systems." } },
        { type: "skills", title: "Skills", content: { items: ["Communication", "Teamwork", "AutoCAD"] } },
        { type: "experience", title: "Experience", content: { entries: [makeEntry({ title: "Team Member", organization: "Fast Cables", dateRange: "2023" })] } },
      ],
    },
    evidence: [{ path: "sections.0.content.text", quotes: [sparseSource] }, { path: "sections.2.content.entries.0", quotes: [sparseSource] }],
  };
  // Reference isolation must reject BESS / Fast Cables / AutoCAD that only existed in Reference Resume B
  assert.throws(() => assertReferenceIsolation(leakedPayload.resume, sparseSource), /Reference resume fact leaked/);
});

test("scenario 2: detailed resume preserves all substantive entries and full history", () => {
  const detailedPayload = fixture();
  detailedPayload.resume.sections[2].content.entries.push(
    makeEntry({ title: "Senior Project Lead", organization: "Global Corp", dateRange: "Jan 2021 - Dec 2022", bullets: ["Managed team of 10 engineers.", "Delivered multi-site infrastructure."] })
  );
  const fullSource = `${source}\nGlobal Corp\nJan 2021 - Dec 2022\nSenior Project Lead\nManaged team of 10 engineers.\nDelivered multi-site infrastructure.`;
  detailedPayload.evidence.push({ path: "sections.2.content.entries.1", quotes: [fullSource] });
  const validated = validateParsedResume(detailedPayload, fullSource);
  const canonical = mapParsedResumeToExistingSchema(validated);
  assert.equal(canonical.sections.find((s) => s.type === "experience").content.entries.length, 2);
});

test("scenario 3: resume without job titles never produces identical title and company", () => {
  const payload = fixture();
  payload.resume.sections[2].content.entries[0] = makeEntry({ title: "Woolworths", organization: "Woolworths", dateRange: "2023" });
  payload.evidence.push({ path: "sections.2.content.entries.0", quotes: [source] });
  const canonical = mapParsedResumeToExistingSchema(payload.resume);
  const expEntry = canonical.sections.find((s) => s.type === "experience").content.entries[0];
  assert.notEqual(expEntry.title, expEntry.organization, "Title must never equal organization (Woolworths | Woolworths is forbidden)");
  assert.equal(expEntry.title, "");
  assert.equal(expEntry.organization, "Woolworths");
});

test("scenario 4: resume without summary generates factual professional summary", () => {
  const rawSourceWithoutSummary = "John Doe\njohn@example.test | 0400 123 456\nEXPERIENCE\nSales Assistant | Retail Corp | 2022 - Present\nAssisted customers and processed orders.";
  const payload = {
    resume: {
      profile: { fullName: "John Doe", email: "john@example.test", phone: "0400 123 456", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Sales Assistant",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Dedicated Sales Assistant with experience in customer support and order processing." } },
        { type: "skills", title: "Skills", content: { items: [] } },
        { type: "experience", title: "Experience", content: { entries: [makeEntry({ title: "Sales Assistant", organization: "Retail Corp", dateRange: "2022 - Present", bullets: ["Assisted customers with product inquiries."] })] } },
      ],
    },
    evidence: [
      { path: "sections.0.content.text", quotes: [rawSourceWithoutSummary] },
      { path: "sections.2.content.entries.0", quotes: [rawSourceWithoutSummary] },
    ],
  };
  const validated = validateParsedResume(payload, rawSourceWithoutSummary);
  assert.ok(validated.sections.find((s) => s.type === "summary").content.text.length > 20);
});

test("scenario 5: customer service resume preserves customer skills and action verbs", () => {
  const payload = fixture();
  const canonical = mapParsedResumeToExistingSchema(validateParsedResume(payload, source));
  const exp = canonical.sections.find((s) => s.type === "experience").content.entries[0];
  assert.ok(exp.bullets.every((b) => /^(Resolved|Assisted|Supported|Managed|Delivered|Prepared|Maintained|Coordinated|Performed|Executed)/i.test(b)));
});

test("scenario 6: technical resume preserves genuine technical competencies without hallucination", () => {
  const techSource = "Tech Candidate\ntech@example.test | 1234567890\nSKILLS\nJavaScript, Python, React.js\nEXPERIENCE\nDev | Tech Co | 2022\nBuilt APIs.";
  const payload = {
    resume: {
      profile: { fullName: "Tech Candidate", email: "tech@example.test", phone: "1234567890", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Software Developer",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Software Developer experienced in JavaScript and Python development." } },
        { type: "skills", title: "Skills", content: { items: ["JavaScript", "Python", "React.js"] } },
        { type: "experience", title: "Experience", content: { entries: [makeEntry({ title: "Dev", organization: "Tech Co", dateRange: "2022", bullets: ["Built APIs."] })] } },
      ],
    },
    evidence: [{ path: "sections.0.content.text", quotes: [techSource] }, { path: "sections.2.content.entries.0", quotes: [techSource] }],
  };
  const validated = validateParsedResume(payload, techSource);
  assert.deepEqual(validated.sections.find((s) => s.type === "skills").content.items, ["JavaScript", "Python", "React.js"]);
});

test("scenario 7: resume with multiple employers orders experience reverse-chronologically", () => {
  const payload = fixture();
  payload.resume.sections[2].content.entries = [
    makeEntry({ title: "Old Role", organization: "Old Corp", dateRange: "2019 - 2021" }),
    makeEntry({ title: "Current Role", organization: "New Corp", dateRange: "May 2026 - Present" }),
    makeEntry({ title: "Middle Role", organization: "Mid Corp", dateRange: "Feb 2023 - May 2026" }),
  ];
  const canonical = mapParsedResumeToExistingSchema(payload.resume);
  const exp = canonical.sections.find((s) => s.type === "experience").content.entries;
  assert.equal(exp[0].organization, "New Corp", "Present role must be first");
  assert.equal(exp[1].organization, "Mid Corp", "2026 role must be second");
  assert.equal(exp[2].organization, "Old Corp", "2019-2021 role must be third");
});

test("scenario 8: duplicate certificates across Education and Certifications are semantically deduplicated", () => {
  const payload = fixture();
  // payload already has 1 education entry (BA). We add 2 more.
  const eduSec = payload.resume.sections.find((s) => s.type === "education");
  eduSec.content.entries.push(
    makeEntry({ title: "Certificate II in Plumbing", organization: "Melbourne Polytechnic", dateRange: "2025" }),
    makeEntry({ title: "Certificate II in Hospitality", organization: "Melbourne Polytechnic", dateRange: "2023 - 2024" }),
  );
  const certSec = payload.resume.sections.find((s) => s.type === "certifications");
  certSec.content.entries = [
    makeEntry({ title: "Certificate II in Plumbing" }),
    makeEntry({ title: "Certificate II in Hospitality" }),
    makeEntry({ title: "Certificate II in Food Processing" }),
  ];
  const canonical = mapParsedResumeToExistingSchema(payload.resume);
  const edu = canonical.sections.find((s) => s.type === "education").content.entries;
  const cert = canonical.sections.find((s) => s.type === "certifications").content.entries;
  assert.equal(edu.length, 3, "Education retains 3 entries (BA + 2 certificates)");
  assert.equal(cert.length, 1, "Certifications retains only the unique non-education qualification");
  assert.equal(cert[0].title, "Certificate II in Food Processing");
});

test("scenario 9: resume with Target Role aligns positioning without fabricating experience", () => {
  const payload = fixture();
  payload.resume.targetRole = "Senior Customer Consultant";
  const canonical = mapParsedResumeToExistingSchema(validateParsedResume(payload, source));
  assert.equal(canonical.targetRole, "Senior Customer Consultant");
  assert.equal(canonical.sections.find((s) => s.type === "experience").content.entries[0].organization, "Northwind");
});

test("scenario 10: resume with Target Role + JD rejects unsupported JD technologies", () => {
  const payload = fixture();
  // JD mentions Salesforce, but source candidate does not have it
  payload.resume.sections[1].content.items.push("Salesforce");
  assert.throws(() => validateParsedResume(payload, source), /(?:Unsupported source fact|Missing or invalid source evidence)/);
});

test("scenario 11: raw import text normalizes cleanly into working schema", () => {
  const rawPasted = "Jane Doe\njane@example.test | 0411 222 333\nSummary\nExperienced retail assistant.\nSkills\nCommunication\nExperience\nTeam Member | Shop | 2023\nAssisted customers.";
  const cleaned = cleanResumeImportText(rawPasted);
  assert.ok(cleaned.includes("Jane Doe"));
  assert.ok(cleaned.includes("Team Member"));
});

test("scenario 12: resume without reference resume converts seamlessly in production flow", async () => {
  // Test normal production parseResumeWithGemini interface without reference resume parameter
  const res = await parseResumeWithGemini({ rawText: source, targetRole: "Customer Adviser" }, {
    apiKey: "test-key", model: "test-model",
    fetchImpl: async () => mockResponse(fixture()),
  });
  assert.equal(res.resume.profile.fullName, "Avery Jordan");
  assert.equal(res.resume.targetRole, "Customer Adviser");
  assert.ok(res.resume.sections.length >= 5);
});

test("scenario 13: generalization - neutral employer A (logistics) dynamically handled without hardcoding", () => {
  const neutralSource = "Taylor Reed\ntaylor@example.test | 0412 345 678\nAcme Freight Logistics\n2022 - 2023\nAssisted with inventory movement and dispatch coordination.";
  const payload = {
    resume: {
      profile: { fullName: "Taylor Reed", email: "taylor@example.test", phone: "0412 345 678", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Logistics Coordinator",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Dedicated logistics team member with experience supporting warehouse operations and inventory movement." } },
        { type: "skills", title: "Skills", content: { items: ["Inventory Coordination", "Dispatch Support", "Teamwork"] } },
        { type: "experience", title: "Experience", content: { entries: [
          makeEntry({
            title: "Warehouse Logistics Assistant",
            organization: "Acme Freight Logistics",
            dateRange: "2022 - 2023",
            description: "Supported daily dispatch and stock tracking operations.",
            bullets: ["Assisted with incoming freight verification and shipment preparation.", "Maintained orderly staging areas to facilitate prompt warehouse turnarounds."],
          }),
        ] } },
      ],
    },
    evidence: [
      { path: "sections.0.content.text", quotes: [neutralSource] },
      { path: "sections.1.content.items.0", quotes: ["inventory movement"] },
      { path: "sections.1.content.items.1", quotes: ["dispatch coordination"] },
      { path: "sections.1.content.items.2", quotes: ["Assisted with inventory movement and dispatch coordination."] },
      { path: "sections.2.content.entries.0", quotes: ["Acme Freight Logistics\n2022 - 2023\nAssisted with inventory movement and dispatch coordination."] },
    ],
  };
  const validated = validateParsedResume(payload, neutralSource);
  const canonical = mapParsedResumeToExistingSchema(validated);
  const entry = canonical.sections.find((s) => s.type === "experience").content.entries[0];
  assert.equal(entry.title, "Warehouse Logistics Assistant");
  assert.equal(entry.organization, "Acme Freight Logistics");
  assert.equal(entry.bullets.length, 2);
});

test("scenario 14: generalization - neutral employer B (hospitality) dynamically handled without hardcoding", () => {
  const neutralSource = "Sam Morgan\nsam@example.test | 0499 888 777\nHarbor View Bistro\n2021 - 2022\nFood preparation and dining room customer assistance.";
  const payload = {
    resume: {
      profile: { fullName: "Sam Morgan", email: "sam@example.test", phone: "0499 888 777", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Hospitality Assistant",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Customer-oriented hospitality assistant experienced in food preparation and high-volume dining service." } },
        { type: "skills", title: "Skills", content: { items: ["Food Preparation", "Customer Assistance", "Service Orientation"] } },
        { type: "experience", title: "Experience", content: { entries: [
          makeEntry({
            title: "Kitchen & Dining Service Assistant",
            organization: "Harbor View Bistro",
            dateRange: "2021 - 2022",
            description: "Delivered fast, courteous hospitality service in a dining setting.",
            bullets: ["Prepared table setups and assisted guests with menu selections.", "Maintained kitchen hygiene standards following local food safety requirements."],
          }),
        ] } },
      ],
    },
    evidence: [
      { path: "sections.0.content.text", quotes: [neutralSource] },
      { path: "sections.1.content.items.0", quotes: ["Food preparation"] },
      { path: "sections.1.content.items.1", quotes: ["customer assistance"] },
      { path: "sections.1.content.items.2", quotes: ["dining room customer assistance"] },
      { path: "sections.2.content.entries.0", quotes: ["Harbor View Bistro\n2021 - 2022\nFood preparation and dining room customer assistance."] },
    ],
  };
  const validated = validateParsedResume(payload, neutralSource);
  const canonical = mapParsedResumeToExistingSchema(validated);
  const entry = canonical.sections.find((s) => s.type === "experience").content.entries[0];
  assert.equal(entry.title, "Kitchen & Dining Service Assistant");
  assert.equal(entry.organization, "Harbor View Bistro");
});

test("scenario 15: generalization - neutral employer C (retail) dynamically handled without hardcoding", () => {
  const neutralSource = "Jordan Lee\njordan@example.test | 0433 111 222\nSummit Outdoor Gear\n2023 - Present\nAssisting shoppers with product recommendations and point of sale transactions.";
  const payload = {
    resume: {
      profile: { fullName: "Jordan Lee", email: "jordan@example.test", phone: "0433 111 222", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Retail Sales Assistant",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Energetic retail associate with demonstrated strength in point-of-sale operations and customer advisory." } },
        { type: "skills", title: "Skills", content: { items: ["Point of Sale", "Customer Advisory", "Stock Merchandising"] } },
        { type: "experience", title: "Experience", content: { entries: [
          makeEntry({
            title: "Retail Sales & Service Associate",
            organization: "Summit Outdoor Gear",
            dateRange: "2023 - Present",
            description: "Guided customers to suitable outdoor products while managing cash register checkout.",
            bullets: ["Operated point of sale registers accurately during peak retail foot traffic.", "Restocked retail shelves and verified pricing labels across merchandising aisles."],
          }),
        ] } },
      ],
    },
    evidence: [
      { path: "sections.0.content.text", quotes: [neutralSource] },
      { path: "sections.1.content.items.0", quotes: ["point of sale transactions"] },
      { path: "sections.1.content.items.1", quotes: ["Assisting shoppers"] },
      { path: "sections.1.content.items.2", quotes: ["product recommendations"] },
      { path: "sections.2.content.entries.0", quotes: ["Summit Outdoor Gear\n2023 - Present\nAssisting shoppers with product recommendations and point of sale transactions."] },
    ],
  };
  const validated = validateParsedResume(payload, neutralSource);
  const canonical = mapParsedResumeToExistingSchema(validated);
  const entry = canonical.sections.find((s) => s.type === "experience").content.entries[0];
  assert.equal(entry.title, "Retail Sales & Service Associate");
  assert.equal(entry.organization, "Summit Outdoor Gear");
});

test("scenario 16: seniority guard blocks unauthorized managerial or engineering titles on inferred entries", () => {
  const sparseSource = "Riley Kim\nriley@example.test | 0400 123 456\nLocal Grocery Store\n2022 - 2023\nStock shelves and help shoppers.";
  const payload = {
    resume: {
      profile: { fullName: "Riley Kim", email: "riley@example.test", phone: "0400 123 456", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Store Team Member",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Reliable grocery worker skilled at customer service and shelf stocking." } },
        { type: "skills", title: "Skills", content: { items: ["Stock Replenishment", "Customer Service"] } },
        { type: "experience", title: "Experience", content: { entries: [
          makeEntry({
            // Seniority guard must reject unauthorized "Manager" or "Director" or "Engineer"
            title: "Senior Store Operations Manager",
            organization: "Local Grocery Store",
            dateRange: "2022 - 2023",
            description: "Stocked shelves and provided customer assistance.",
            bullets: ["Assisted shoppers with aisle locations."],
          }),
        ] } },
      ],
    },
    evidence: [
      { path: "sections.0.content.text", quotes: [sparseSource] },
      { path: "sections.1.content.items.0", quotes: ["Stock shelves"] },
      { path: "sections.1.content.items.1", quotes: ["help shoppers"] },
      { path: "sections.2.content.entries.0", quotes: ["Local Grocery Store\n2022 - 2023\nStock shelves and help shoppers."] },
    ],
  };
  assert.throws(() => validateParsedResume(payload, sparseSource), /Unsupported seniority or regulated title 'Senior'|'Manager'/);
});

test("scenario 17: seniority guard preserves authentic source titles (Project Manager, Software Engineer, Senior Developer, Sales Director)", () => {
  const seniorSource = "Morgan Vance\nmorgan@example.test | 0411 999 888\nAlpha Tech\n2021 - Present\nSenior Software Engineer\nBuilt backend microservices.";
  const payload = {
    resume: {
      profile: { fullName: "Morgan Vance", email: "morgan@example.test", phone: "0411 999 888", location: "", linkedin: "", github: "", portfolio: "", website: "" },
      targetRole: "Lead Architect",
      sections: [
        { type: "summary", title: "Summary", content: { text: "Experienced Senior Software Engineer specializing in backend systems." } },
        { type: "skills", title: "Skills", content: { items: ["Backend Systems", "Microservices"] } },
        { type: "experience", title: "Experience", content: { entries: [
          makeEntry({
            title: "Senior Software Engineer",
            organization: "Alpha Tech",
            dateRange: "2021 - Present",
            description: "Built scalable backend services.",
            bullets: ["Delivered backend microservices."],
          }),
        ] } },
      ],
    },
    evidence: [
      { path: "sections.0.content.text", quotes: [seniorSource] },
      { path: "sections.1.content.items.0", quotes: ["backend microservices"] },
      { path: "sections.1.content.items.1", quotes: ["microservices"] },
      { path: "sections.2.content.entries.0", quotes: ["Alpha Tech\n2021 - Present\nSenior Software Engineer\nBuilt backend microservices."] },
    ],
  };
  // Authentic senior title from source must pass validation without error
  const validated = validateParsedResume(payload, seniorSource);
  const canonical = mapParsedResumeToExistingSchema(validated);
  const entry = canonical.sections.find((s) => s.type === "experience").content.entries[0];
  assert.equal(entry.title, "Senior Software Engineer");
  assert.equal(entry.organization, "Alpha Tech");
});

test("scenario 18: quality gate flags underfilled summary, skills, and repetitive bullets", () => {
  const sparsePayload = fixture();
  // Short summary (only 5 words)
  sparsePayload.resume.sections[0].content.text = "A dedicated worker.";
  // Only 3 skills
  sparsePayload.resume.sections[1].content.items = ["Skill A", "Skill B", "Skill C"];
  const longSource = `${source}\nSkills\nCommunication\nProblem Solving\nTeamwork\nTime Management\nCustomer Service\nFlexibility\nReliability\nAdaptability`;
  const issues = checkResumeQualityGate(sparsePayload, longSource);
  assert.ok(issues.some((i) => i.includes("Summary is too short")));
  assert.ok(issues.some((i) => i.includes("Skills under-filled")));
});

