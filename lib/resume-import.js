import { createDefaultWorkingResume, ensureCanonicalResume } from "./ai-resume.js";

export const MAX_IMPORT_CHARS = 100000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const titles = { summary: "PROFESSIONAL SUMMARY", skills: "SKILLS", experience: "EXPERIENCE", projects: "PROJECTS", education: "EDUCATION", certifications: "CERTIFICATIONS" };
const string = { type: "string" };
const strings = { type: "array", items: string };
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const entry = object({ title: string, organization: string, subtitle: string, location: string, dateRange: string, description: string, bullets: strings, url: string });
const section = (types, content) => object({ type: { type: "string", enum: types }, title: string, content });

// This is the editor's existing profile/sections shape, without client-owned IDs or settings.
export const RESUME_IMPORT_SCHEMA = object({
  resume: object({
    profile: object(Object.fromEntries(["fullName", "phone", "email", "location", "linkedin", "github", "portfolio", "website"].map((key) => [key, string]))),
    targetRole: string,
    sections: { type: "array", items: { anyOf: [
      section(["summary"], object({ text: string })),
      section(["skills"], object({ items: strings })),
      section(["experience", "projects", "education", "certifications"], object({ entries: { type: "array", items: entry } })),
      section(["custom"], object({ paragraphs: strings, bullets: strings })),
    ] } },
  }),
  evidence: { type: "array", items: object({ path: string, quotes: strings }) },
});

export class ResumeImportError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = "ResumeImportError";
    this.status = status;
  }
}

export function cleanResumeImportText(value) {
  if (typeof value !== "string") throw new ResumeImportError("Resume text must be text.", 400);
  if (value.length > MAX_IMPORT_CHARS) throw new ResumeImportError("Resume text is too long. Use up to 100,000 characters.", 413);
  return value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f\u200b\ufeff\ue000-\uf8ff\u2610-\u2612\u25a0-\u25a2\u25aa-\u25ab]/g, "")
    .split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => !/^page\s+\d+\s*(?:of\s+\d+)?$/i.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function combineResumeImportSources(uploadedText = "", rawText = "") {
  const uploaded = cleanResumeImportText(uploadedText);
  const raw = cleanResumeImportText(rawText);
  if (!uploaded || raw.includes(uploaded)) return raw;
  if (!raw || uploaded === raw) return uploaded;
  return cleanResumeImportText(`UPLOADED RESUME:\n${uploaded}\n\nADDITIONAL CANDIDATE TEXT (explicit corrections take precedence):\n${raw}`);
}

// Retain row and cell boundaries instead of flattening a whole PDF page into one paragraph.
export function pdfTextItemsToLines(items) {
  const rows = [];
  for (const item of items) {
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    const y = Number(item.transform?.[5] || 0);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => {
    let end = null;
    return row.items.sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0)).map((item) => {
      const x = Number(item.transform?.[4] || 0);
      const separator = end === null ? "" : x - end > 24 ? " | " : " ";
      end = x + Number(item.width || 0);
      return separator + item.str.trim();
    }).join("");
  }).join("\n");
}

function validateShape(value, schema, path = "response") {
  if (schema.anyOf) {
    if (schema.anyOf.some((option) => { try { validateShape(value, option, path); return true; } catch { return false; } })) return;
    throw new ResumeImportError(`Invalid section shape at ${path}.`);
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResumeImportError(`Expected object at ${path}.`);
    for (const key of schema.required) if (!Object.hasOwn(value, key)) throw new ResumeImportError(`Missing ${path}.${key}.`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new ResumeImportError(`Unexpected field at ${path}.${key}.`);
      validateShape(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > 500) throw new ResumeImportError(`Invalid array at ${path}.`);
    value.forEach((item, index) => validateShape(item, schema.items, `${path}.${index}`));
  } else if (typeof value !== "string" || value.length > MAX_IMPORT_CHARS || (schema.enum && !schema.enum.includes(value))) {
    throw new ResumeImportError(`Invalid string at ${path}.`);
  }
}

const aliases = [[/\bjava\s*script\b/gi, "JavaScript"], [/\b(?:ms|microsoft)\s+excel\b/gi, "Microsoft Excel"], [/\breact(?:\.js|js)?\b/gi, "React.js"], [/\bnode(?:\.js|js)\b/gi, "Node.js"]];
const normalizeSkill = (value) => aliases.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value.trim());
const key = (value) => normalizeSkill(String(value)).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}+#%]+/gu, " ").trim().replace(/\s+/g, " ");
const unique = (values) => [...new Map(values.filter(Boolean).map((value) => [key(value), value])).values()];
const supported = (value, source) => !value || (` ${key(source)} `).includes(` ${key(value)} `);

function safeUrl(value) {
  if (!value) return "";
  const input = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(input);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password || /\s/.test(value)) throw new Error();
    return input;
  } catch { throw new ResumeImportError("Invalid contact or credential URL."); }
}

function assertUrlGrounded(value, source) {
  value = value.trim();
  if (!value) return;
  const urlKey = (input) => {
    const url = new URL(safeUrl(input.replace(/[.,;]+$/, "")));
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}${url.hash}`;
  };
  const urls = source.match(/(?<![\w@])(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|<>"()]*)?/gi) || [];
  if (!urls.some((url) => { try { return urlKey(url) === urlKey(value); } catch { return false; } })) throw new ResumeImportError("Contact or credential URL was changed or unsupported.");
}

function assertGrounded(value, source, path) {
  if (!supported(value, source)) throw new ResumeImportError(`Unsupported source fact at ${path}.`);
}

function assertProseGrounded(value, quotes, path) {
  const sourceNumbers = new Set((quotes.match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) || []).flatMap((part) => [part.replace(/\s/g, ""), part.replace(/[\s,]/g, "")]));
  for (const number of value.match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) || []) {
    if (!sourceNumbers.has(number.replace(/\s/g, "")) && !sourceNumbers.has(number.replace(/[\s,]/g, ""))) throw new ResumeImportError(`Unsupported metric at ${path}.`);
  }
  // Catch common technology/credential additions even when they appear only in the JD.
  const terms = /\b(?:AWS|Azure|React(?:\.js)?|JavaScript|TypeScript|Python|Java|SQL|MongoDB|Kubernetes|Docker|Salesforce|SAP|PMP|CPA|PhD)\b/gi;
  for (const term of value.match(terms) || []) assertGrounded(term, quotes, path);
}

function extractDateRank(dateRange) {
  if (!dateRange || typeof dateRange !== "string") return 0;
  if (/\b(?:present|current|ongoing|now)\b/i.test(dateRange)) return 9999120000;
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const yearMatches = [...dateRange.matchAll(/\b(19\d\d|20\d\d)\b/g)];
  if (!yearMatches.length) return 0;
  const lastYear = parseInt(yearMatches[yearMatches.length - 1][1], 10);
  let month = 1;
  const matchMonth = dateRange.slice(Math.max(0, yearMatches[yearMatches.length - 1].index - 12), yearMatches[yearMatches.length - 1].index).toLowerCase();
  for (const [m, num] of Object.entries(months)) {
    if (matchMonth.includes(m)) { month = num; break; }
  }
  const firstYear = parseInt(yearMatches[0][1], 10);
  return lastYear * 1000000 + month * 10000 + firstYear;
}

function normalizeDateRange(value) {
  return value.replace(/[–—]/g, " - ").replace(/\b(?:current|now|ongoing)\b/gi, "Present")
    .replace(/\bSept\b/gi, "Sep")
    .replace(/\b(January|February|March|April|June|July|August|September|October|November|December)\b/gi, (month) => month.slice(0, 3))
    .replace(/\s+/g, " ").trim();
}

export function validateParsedResume(payload, sourceText) {
  if (payload?.resume?.sections && Array.isArray(payload.resume.sections)) {
    payload.resume.sections.forEach((s) => {
      if (s && s.type === "custom" && s.content && typeof s.content === "object") {
        if (!Array.isArray(s.content.paragraphs)) s.content.paragraphs = s.content.paragraphs ? [String(s.content.paragraphs)] : (s.content.text ? [String(s.content.text)] : []);
        if (!Array.isArray(s.content.bullets)) s.content.bullets = [];
      }
    });
  }
  validateShape(payload, RESUME_IMPORT_SCHEMA);
  const source = cleanResumeImportText(sourceText);
  const { resume, evidence } = structuredClone(payload);
  const normMatch = (text) => cleanResumeImportText(text).replace(/\s*\|\s*/g, " | ").replace(/\s+/g, " ");
  const normalizedSource = normMatch(source);
  const evidenceFor = (path) => {
    const normalizedPath = (value) => value.replace(/^resume\./, "").replace(/\[(\d+)\]/g, ".$1");
    const quotes = evidence.filter((item) => {
      const norm = normalizedPath(item.path);
      return norm === path || norm.startsWith(`${path}.`);
    }).flatMap((item) => item.quotes);
    const validQuotes = quotes.filter((quote) => quote && quote.trim() && (normalizedSource.includes(normMatch(quote)) || key(source).includes(key(quote))));
    if (!validQuotes.length) {
      throw new ResumeImportError(`Missing or invalid source evidence at ${path}.`);
    }
    return validQuotes.join("\n");
  };
  for (const [field, value] of Object.entries(resume.profile)) {
    resume.profile[field] = value.trim();
    if (["linkedin", "github", "portfolio", "website"].includes(field)) {
      assertUrlGrounded(value, source);
      resume.profile[field] = safeUrl(value.trim());
    } else if (field === "phone") {
      if (value && (value.replace(/\D/g, "").length < 7 || !source.replace(/[^\d+]/g, "").includes(value.replace(/[^\d+]/g, "")))) throw new ResumeImportError("Unsupported phone number.");
    } else if (field === "location") {
      if (value) {
        const locKey = key(value);
        const normSource = key(source);
        const isOrgOnly = locKey && (
          normSource.includes(`${locKey} polytechnic`) ||
          normSource.includes(`${locKey} university`) ||
          normSource.includes(`${locKey} college`) ||
          normSource.includes(`${locKey} institute`) ||
          normSource.includes(`${locKey} school`)
        ) && !source.split("\n").slice(0, 5).some((line) => key(line).includes(locKey) && !/(?:polytechnic|university|college|institute|school|company|ltd|pty)/i.test(line));

        if (isOrgOnly || !supported(value, source)) {
          const grounded = value.split(/[,|]/).map((p) => p.trim()).filter((p) => supported(p, source) && !isOrgOnly);
          resume.profile.location = grounded.join(", ");
        }
      }
    } else assertGrounded(value, source, `profile.${field}`);
  }
  if (resume.profile.email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(resume.profile.email)) throw new ResumeImportError("Invalid email address.");
  const sourceEmails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (sourceEmails.length && !sourceEmails.some((email) => email.toLowerCase() === resume.profile.email.toLowerCase())) throw new ResumeImportError("Source email was omitted or changed.");
  resume.sections.forEach((part, sectionIndex) => {
    const path = `sections.${sectionIndex}.content`;
    part.title = titles[part.type] || part.title.trim();
    if (part.type === "summary") {
      evidenceFor(`${path}.text`);
      // A summary synthesizes the whole career; facts may come from several roles.
      assertProseGrounded(part.content.text, source, path);
    } else if (part.type === "skills") {
      const stem = (word) => word.replace(/(?:ing|ed|s|ity|ness|tion|able|ible|al|ful)$/, "");
      const sourceAllWords = new Set(key(source).split(" ").map(stem));
      part.content.items = part.content.items.filter((skill, index) => {
        if (supported(skill, source)) return true;
        const quotes = evidenceFor(`${path}.items.${index}`);
        assertProseGrounded(skill, quotes, path);
        const quoteWords = new Set(key(quotes).split(" ").map(stem));
        return key(skill).split(" ").some((word) => word.length > 3 && (quoteWords.has(stem(word)) || sourceAllWords.has(stem(word))));
      });
      part.content.items = unique(part.content.items.map(normalizeSkill));
    } else if (part.content.entries) {
      part.content.entries.forEach((item, index) => {
        const entryPath = `${path}.entries.${index}`;
        const quotes = evidenceFor(entryPath);
        if (item.title && !supported(item.title, quotes)) {
          if (item.organization && (supported(item.organization, quotes) || supported(item.organization, source))) {
            if (key(item.title) === key(item.organization)) {
              item.title = "Team Member";
            }
          } else if (supported(item.title, source)) {
            // Supported elsewhere in candidate source
          } else if (part.type === "experience") {
            // Conservative role descriptor allowed
          } else {
            assertGrounded(item.title, quotes, `${entryPath}.title`);
          }
        }
        const SENIORITY_TITLES = /\b(?:Manager|Director|Supervisor|Lead|Senior|Principal|Head|VP|Vice President|Chief|Executive|Engineer|Specialist)\b/i;
        if (part.type === "experience" && item.title && !supported(item.title, source)) {
          for (const term of item.title.match(SENIORITY_TITLES) || []) {
            if (!supported(term, source)) {
              throw new ResumeImportError(`Unsupported seniority or regulated title '${term}' at ${entryPath}.title.`);
            }
          }
        }
        if (item.organization && !supported(item.organization, quotes)) {
          if (part.type !== "experience" && supported(item.organization, source)) {
            // Organization/issuer was mentioned elsewhere in the source document
          } else if (part.type !== "experience") {
            item.organization = "";
          } else {
            assertGrounded(item.organization, quotes, `${entryPath}.organization`);
          }
        } else if (item.organization) {
          assertGrounded(item.organization, quotes, `${entryPath}.organization`);
        }
        if (item.location && !supported(item.location, quotes)) {
          item.location = "";
        }
        for (const detail of item.subtitle.split(/[,|;]/).map((value) => value.trim()).filter(Boolean)) {
          if (!supported(detail, quotes)) {
            item.subtitle = item.subtitle.split(/[,|;]/).filter((d) => supported(d.trim(), quotes)).join(", ").trim();
            break;
          }
        }
        if (item.dateRange && !supported(normalizeDateRange(item.dateRange), normalizeDateRange(quotes))) {
          if (part.type !== "experience") {
            item.dateRange = "";
          } else {
            assertGrounded(normalizeDateRange(item.dateRange), normalizeDateRange(quotes), `${entryPath}.dateRange`);
          }
        } else if (item.dateRange) {
          assertGrounded(normalizeDateRange(item.dateRange), normalizeDateRange(quotes), `${entryPath}.dateRange`);
        }
        assertUrlGrounded(item.url, quotes);
        assertProseGrounded([item.description, ...item.bullets].join("\n"), quotes, entryPath);
        item.dateRange = normalizeDateRange(item.dateRange);
        item.url = safeUrl(item.url.trim());
        item.bullets = unique(item.bullets.map((bullet) => bullet.replace(/^[\s•·▪■□☐☑☒✓✔❖➢►]+/, "").replace(/^[-*+]\s+/, "").trim()));
      });
    } else {
      let quotes = "";
      try { quotes = evidenceFor(path); } catch { quotes = ""; }
      const text = [...part.content.paragraphs, ...part.content.bullets].join("\n");
      if (text.trim()) assertProseGrounded(text, quotes || source, path);
      part.content.paragraphs = unique(part.content.paragraphs);
      part.content.bullets = unique(part.content.bullets);
    }
  });
  if (!resume.sections.some((part) => part.type === "summary" && part.content.text.trim()) ||
      !resume.sections.some((part) => part.type !== "summary" && (part.content.items?.length || part.content.entries?.length || part.content.paragraphs?.length || part.content.bullets?.length))) {
    throw new ResumeImportError("The source did not produce a usable resume with a factual summary and supporting content.");
  }
  return resume;
}

export function mapParsedResumeToExistingSchema(parsed, { documentSettings, rawImport } = {}) {
  const next = createDefaultWorkingResume();
  next.profile = { ...parsed.profile };
  next.targetRole = parsed.targetRole.trim();
  next.documentSettings = { ...next.documentSettings, ...documentSettings, settingsConfirmed: true };
  next.rawImport = rawImport || null;
  const defaultSectionsByType = new Map(next.sections.map((item) => [item.type, item]));
  const merged = [];
  for (const part of parsed.sections) {
    if (!part.content.text?.trim() && !part.content.items?.length && !part.content.entries?.length && !part.content.paragraphs?.length && !part.content.bullets?.length) continue;
    const current = merged.find((item) => item.type === part.type && (part.type !== "custom" || key(item.title) === key(part.title)));
    if (!current) { merged.push(structuredClone(part)); continue; }
    if (part.type === "summary") current.content.text = unique([current.content.text, part.content.text]).join("\n");
    else for (const field of Object.keys(part.content)) current.content[field].push(...part.content[field]);
  }
  const CORE_SECTION_TYPES = ["summary", "skills", "experience", "projects", "education", "certifications"];
  for (const coreType of CORE_SECTION_TYPES) {
    if (!merged.some((item) => item.type === coreType)) {
      const defaultPart = defaultSectionsByType.get(coreType);
      if (defaultPart) merged.push(structuredClone(defaultPart));
    }
  }
  next.sections = merged.map((part, order) => {
    const content = part.content;
    if (content.items) content.items = unique(content.items);
    if (content.entries) {
      const entries = new Map();
      for (const item of content.entries) {
        // Keep promotions and repeat engagements separate; never deduplicate solely by employer.
        const identity = [item.title, item.organization, item.location, item.dateRange, item.subtitle, item.url].map(key).join("|");
        const prior = entries.get(identity);
        if (prior) {
          prior.bullets = unique([...prior.bullets, ...item.bullets]);
          prior.description = unique([prior.description, item.description]).join("\n");
        } else entries.set(identity, structuredClone(item));
      }
      content.entries = [...entries.values()];
      if (part.type === "experience" && content.entries.length > 1) {
        content.entries.sort((a, b) => extractDateRank(b.dateRange) - extractDateRank(a.dateRange));
      }
      for (const item of content.entries) {
        if (part.type === "experience" && item.title && item.organization && key(item.title) === key(item.organization)) {
          item.title = "";
        }
        // These fields already render but have no independent editor control.
        // Import them once into the existing editable Description field.
        const details = [item.description];
        if (item.url && ![item.description, ...item.bullets].join(" ").includes(item.url)) details.push(item.url);
        item.url = "";
        if (part.type !== "projects" && item.subtitle) { details.push(item.subtitle); item.subtitle = ""; }
        item.description = unique(details).join("\n");
        if (item.description && item.bullets?.length) {
          item.bullets = item.bullets.filter((b) => key(b) !== key(item.description));
        }
      }
    }
    return { ...part, order, visible: true, layout: part.type === "skills" ? "compact-list" : "default", contentType: part.type === "summary" ? "paragraph" : part.type === "skills" || part.type === "custom" ? "mixed" : "entry" };
  });

  // Semantic deduplication between Education and Certifications:
  // If an identical qualification title is present in both Education and Certifications,
  // consolidate it in Education (retaining any unique institution/date/issuer) and remove redundant clone.
  const eduPart = next.sections.find((s) => s.type === "education");
  const certPart = next.sections.find((s) => s.type === "certifications");
  if (eduPart?.content?.entries?.length && certPart?.content?.entries?.length) {
    const retainedCerts = [];
    for (const certEntry of certPart.content.entries) {
      const match = eduPart.content.entries.find((eduEntry) => key(eduEntry.title) === key(certEntry.title));
      if (match) {
        if (!match.organization && certEntry.organization) match.organization = certEntry.organization;
        if (!match.dateRange && certEntry.dateRange) match.dateRange = certEntry.dateRange;
        if (!match.location && certEntry.location) match.location = certEntry.location;
      } else {
        retainedCerts.push(certEntry);
      }
    }
    certPart.content.entries = retainedCerts;
  }

  // The current UI has one GitHub / Portfolio input. Keep additional links editable
  // through its already-supported custom section instead of adding profile controls.
  const otherLinks = [next.profile.portfolio, next.profile.website].filter(Boolean);
  if (!next.profile.github && otherLinks.length) next.profile.github = otherLinks.shift();
  next.profile.portfolio = "";
  next.profile.website = "";
  if (otherLinks.length) next.sections.push({ type: "custom", title: "ADDITIONAL LINKS", order: next.sections.length, visible: true, layout: "default", contentType: "mixed", content: { paragraphs: unique(otherLinks), bullets: [], entries: [] } });
  return ensureCanonicalResume(next);
}
