import { jsPDF } from "jspdf";

// The supplied TeX template: US Letter, half-inch margins, Helvetica,
// 11pt entry rows, 10pt bullets, 12pt headings and a 24.88pt name.
export const HARSHIBAR_TEMPLATE = "harshibar";
export function applyHarshibarTemplate(resume) {
  const currentLength = Number(resume?.documentSettings?.resumeLength || 0);
  const expCount = (resume?.sections || []).find((s) => s.type === "experience")?.content?.entries?.length || 0;
  const targetLength = currentLength >= 1 ? currentLength : (expCount > 3 ? 2 : 1);
  return {
    ...resume,
    documentSettings: {
      ...resume?.documentSettings,
      template: HARSHIBAR_TEMPLATE,
      pageSize: "US Letter",
      resumeLength: Math.min(2, Math.max(1, targetLength)),
    },
  };
}
export const isHarshibar = (resume) => resume?.documentSettings?.template === HARSHIBAR_TEMPLATE;
const xml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
export function stripLeadingBulletsAndBoxes(text) {
  if (!text) return "";
  return String(text)
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/[\u2610-\u2612\u25A0-\u25A2\u25AA-\u25AB\u25FB-\u25FE]/g, "")
    .replace(/^[\s•·▪■□☐☑☒✓✔❖➢►]+/, "")
    .replace(/^[-*+]\s+/, "")
    .trim();
}

const clean = (s) => stripLeadingBulletsAndBoxes(s).replace(/\s+/g, " ").trim();

export function formatSectionHeading(rawTitle, fallbackType = "") {
  const text = clean(rawTitle || fallbackType);
  if (!text) return "";
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function stripSocialUrls(text) {
  if (!text) return "";
  let s = String(text);
  s = s.replace(/\s*[-|–—•/]?\s*\(?\s*https?:\/\/(?:www\.)?(?:linkedin\.com|github\.com|twitter\.com|x\.com)[^)\s]*\)?/gi, "");
  s = s.replace(/\s*[-|–—•/]?\s*\(?\s*(?:www\.)?(?:linkedin\.com|github\.com)[^)\s]*\)?/gi, "");
  s = s.replace(/\s+[-|–—•/]\s*$/, "").trim();
  return s;
}

function cleanContactUrl(url) {
  if (!url) return "";
  let s = String(url).trim();
  s = s.split(/[?#]/)[0];
  s = s.replace(/[)\]"'>.,;]+$/g, "").trim();
  s = s.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
  return s;
}

function isProbableLocation(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (!s) return false;
  const words = s.split(/\s+/);
  if (words.length > 4) return false;
  if (/\b(managing|handling|working|leading|supporting|operating|supervising|building|producing|responsible|across|projects|duties|staff|workers|teams?|stages?|framing|concreting|formwork)\b/i.test(s)) {
    return false;
  }
  return true;
}

export function isActionSentence(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (!s) return false;
  const words = s.split(/\s+/);
  if (/^(design|deliver|develop|manag|analys|analyz|facilitat|lead|led\b|assist|coordinat|supervis|support|contribut|oversaw|oversee|provid|maintain|operat|execut|build\b|built\b|building\b|implement|creat|generat|perform|conduct|optimi|streamlin|automat|collaborat|engag|translat|configur|produc|ensur|prep|direct|achiev)/i.test(s)) {
    return true;
  }
  if (/\b(?:to\s+support|and\s+ensure|in\s+order\s+to|stakeholders|operational\s+reporting|user\s+stories|client\s+follow|responsible\s+for|duties\s+included)\b/i.test(s)) {
    return true;
  }
  if (words.length > 8) return true;
  return false;
}

export function isAuthenticTitle(text) {
  if (!text) return false;
  const s = String(text).trim();
  return /(analyst|developer|engineer|intern|specialist|manager|coordinator|director|assistant|consultant|officer|technician|worker|lead|operator|administrator|supervisor|scientist|designer)/i.test(s);
}

function richParts(text, row) {
  const terms = (row.emphasis || []).filter(Boolean).map((s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return [{ text, bold: row.bold }];
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  return text.split(pattern).filter(Boolean).map((part) => ({ text: part, bold: row.bold || (row.emphasis || []).some((s) => s.toLowerCase() === part.toLowerCase()) }));
}

export function buildHarshibarModel(resume, rawSections) {
  const expSectionInitial = (rawSections || []).find((s) => s.type === "experience");
  const expCount = expSectionInitial?.content?.entries?.length || 0;
  const totalBullets = (expSectionInitial?.content?.entries || []).reduce((sum, e) => sum + (e.bullets || []).length, 0);
  let targetPages = Number(resume?.documentSettings?.resumeLength || 0);
  if (!targetPages || targetPages < 1) {
    targetPages = (expCount > 3 || totalBullets > 12) ? 2 : 1;
  }
  const allowedPages = Math.min(2, Math.max(1, targetPages));
  const sections = structuredClone(rawSections);

  // 1. Sanitize experience entries to remove any orphan 'Company' chunks
  const expSection = sections.find((s) => s.type === "experience");
  if (expSection && expSection.content?.entries?.length) {
    const valid = [];
    expSection.content.entries.forEach((item) => {
      const org = String(item.organization || item.company || "").trim();
      const title = String(item.title || "").trim();
      const dates = String(item.dateRange || item.dates || "").trim();
      const isOrphan = (!title || /^company$/i.test(title)) && (!org || /^company$/i.test(org)) && !dates;
      if (isOrphan) {
        if (valid.length && item.bullets?.length) {
          valid[valid.length - 1].bullets = (valid[valid.length - 1].bullets || []).concat(item.bullets);
        }
        return;
      }
      const nextItem = { ...item };
      if (/^company$/i.test(org)) nextItem.organization = "";
      if (/^company$/i.test(title)) nextItem.title = "";
      valid.push(nextItem);
    });
    expSection.content.entries = valid;
  }

  const renderCurrentSections = (currentSections) => {
    const measure = new jsPDF({ unit: "pt", format: "letter" });
    const pages = [[]];
    let y = 36;
    const add = (text, options = {}) => {
      if (!clean(text) && !options.gap && !options.right) return;
      const size = options.size || 10;
      const height = options.height || 12;
      const indent = options.bullet ? 15 : 0;
      measure.setFont(options.mono ? "courier" : "helvetica", options.italic ? "italic" : options.bold ? "bold" : "normal");
      measure.setFontSize(size);
      const right = clean(options.right);
      const rightWidth = right ? measure.getTextWidth(right) + 16 : 0;
      const lines = options.gap || !clean(text) ? [""] : measure.splitTextToSize(clean(text), (options.emphasis?.length ? 510 : 530) - indent - rightWidth);
      const totalHeight = lines.length * height;
      if (options.bullet && y + totalHeight > 756 && pages.at(-1).length) {
        pages.push([]);
        y = 36;
      }
      const blockId = Math.random().toString(36).slice(2);
      lines.forEach((line, i) => {
        const keep = options.keepNext && i === lines.length - 1 ? 24 : 0;
        if (y + height + keep > 756 && pages.at(-1).length) { pages.push([]); y = 36; }
        pages.at(-1).push({
          type: options.type || "paragraph",
          text: line,
          fullText: clean(text),
          lines: [line],
          size,
          height,
          y,
          x: 36 + indent,
          ...options,
          blockId,
          isFirstLine: i === 0,
          isLastLine: i === lines.length - 1,
          right: i === 0 ? right : "",
          boldRight: Boolean(options.boldRight && i === 0),
          bullet: options.bullet && i === 0,
        });
        y += height;
      });
    };
    const gap = (height) => add("", { gap: true, height, type: "spacer" });
    const profile = resume.profile || {};
    let fullName = clean(profile.fullName);
    if (fullName) {
      fullName = fullName.replace(/\bSh\s+arma\b/gi, "Sharma");
      const target = clean(resume.targetRole || "");
      if (target && fullName.toLowerCase().endsWith(target.toLowerCase())) {
        fullName = fullName.slice(0, -target.length).trim();
      }
      fullName = fullName.replace(/\s+(?:Business\s+Analyst|Business|Developer|Data\s+Analyst|Engineer|Specialist)$/i, "").trim();
    }
    add(fullName, { type: "name", size: 24.88, height: 31, bold: true, center: true });

    const rawPhone = clean(profile.phone);
    const rawEmail = clean(profile.email).replace(/[<>]/g, "");
    const rawLinkedin = cleanContactUrl(profile.linkedin);
    const rawGithub = cleanContactUrl(profile.github);
    const rawPortfolio = cleanContactUrl(profile.portfolio);
    const rawWebsite = cleanContactUrl(profile.website);
    let rawLocation = clean(profile.location).replace(/^[|,\s-]+|[|,\s-]+$/g, "");
    rawLocation = rawLocation.replace(/^linkedin\s*/i, "").replace(/^[|,\s-]+|[|,\s-]+$/g, "");

    const contactItems = [];
    if (rawPhone) contactItems.push({ type: "phone", icon: "☎", label: rawPhone, rawUrl: "" });
    if (rawEmail) contactItems.push({ type: "email", icon: "✉", label: rawEmail, url: `mailto:${rawEmail}`, rawUrl: rawEmail });
    if (rawLinkedin) {
      const isUrl = /linkedin\.com|http/i.test(profile.linkedin);
      const linkUrl = isUrl ? (rawLinkedin.startsWith("http") ? rawLinkedin : `https://${rawLinkedin}`) : `https://linkedin.com/in/${rawLinkedin.replace(/\s+/g, "-").toLowerCase()}`;
      contactItems.push({ type: "linkedin", icon: "", label: "LinkedIn", url: linkUrl, rawUrl: rawLinkedin });
    }
    if (rawGithub) {
      const isUrl = /github\.com|http/i.test(profile.github);
      const linkUrl = isUrl ? (rawGithub.startsWith("http") ? rawGithub : `https://${rawGithub}`) : `https://github.com/${rawGithub.replace(/\s+/g, "").toLowerCase()}`;
      contactItems.push({ type: "github", icon: "", label: "GitHub", url: linkUrl, rawUrl: rawGithub });
    }
    if (rawPortfolio) contactItems.push({ type: "portfolio", icon: "", label: "Portfolio", url: rawPortfolio.startsWith("http") ? rawPortfolio : `https://${rawPortfolio}`, rawUrl: rawPortfolio });
    if (rawWebsite) contactItems.push({ type: "website", icon: "", label: "Website", url: rawWebsite.startsWith("http") ? rawWebsite : `https://${rawWebsite}`, rawUrl: rawWebsite });
    const isLocationCandidateName = fullName && (
      rawLocation.toLowerCase() === fullName.toLowerCase() ||
      rawLocation.toLowerCase().replace(/\s+/g, "") === fullName.toLowerCase().replace(/\s+/g, "")
    );
    if (rawLocation && !isLocationCandidateName) contactItems.push({ type: "location", icon: "", label: rawLocation, rawUrl: "" });

    if (contactItems.length) {
      const contactLineText = contactItems.map((c) => (c.icon ? `${c.icon} ${c.label}` : c.label)).join(" | ");
      add(contactLineText, { type: "contact", size: 9.5, height: 13, center: true, contactItems });
    }
    gap(8);

    const order = ["summary", "experience", "projects", "skills", "education", "certifications"];
    const sorted = [...currentSections].sort((a, b) => {
      const idxA = order.indexOf(a.type);
      const idxB = order.indexOf(b.type);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    const entry = (e, type) => {
      const twoRows = type === "experience" || type === "education";
      const { org, role, loc, date } = cleanEntryFields(e, twoRows, type);
      if (!org && !role && !date && (!e.bullets || !e.bullets.length)) return;

      const validEntryUrl = clean(e.url);
      const isPersonalSocialUrl = /linkedin\.com|github\.com|twitter\.com/i.test(validEntryUrl) ||
        (profile.linkedin && validEntryUrl.includes(cleanContactUrl(profile.linkedin))) ||
        (profile.github && validEntryUrl.includes(cleanContactUrl(profile.github)));
      const entryUrl = isPersonalSocialUrl ? "" : validEntryUrl;

      const isCert = type === "certifications";

      if (org || date) {
        add(org || " ", {
          type: "entry-title",
          size: 11,
          height: 13,
          bold: !isCert,
          right: date,
          boldRight: !isCert,
          keepNext: true,
        });
      }

      const metaParts = [role, stripSocialUrls(clean(e.subtitle)), entryUrl].filter(Boolean);
      const meta = metaParts.join(" | ");
      if (meta || loc) {
        add(meta || " ", {
          type: "entry-meta",
          size: 11,
          height: 13,
          italic: true,
          right: loc,
          boldRight: false,
          keepNext: true,
        });
      }

      if (clean(e.description)) add(clean(e.description), { bold: false });
      (e.bullets || []).forEach((s) => add(s, { type: "bullet", bullet: true, bold: false, emphasis: resume.aiHighlightData?.addedKeywords || [] }));
      gap(6);
    };

    const hasSectionContent = (section) => {
      const c = section.content || {};
      return Boolean(
        clean(c.text) ||
        (c.items && c.items.length) ||
        (c.categories && c.categories.length) ||
        (c.entries && c.entries.length) ||
        (c.paragraphs && c.paragraphs.length) ||
        (c.bullets && c.bullets.length) ||
        (c.blocks && c.blocks.length)
      );
    };

    sorted.filter((s) => s.visible !== false && hasSectionContent(s)).forEach((section, index) => {
      if (index) gap(8);
      const headingText = formatSectionHeading(section.title, section.type);
      add(headingText, { type: "heading", size: 12, height: 21, bold: true, rule: true, keepNext: true });
      const isCert = section.type === "certifications";
      const c = section.content || {};
      if (c.text) add(c.text, { bold: false });
      if (section.type === "skills") {
        if (section.layout === "categorized" && c.categories?.length) c.categories.forEach((cat) => add(`${cat.name}: ${cat.items.join(", ")}`, { bold: false, emphasis: [cat.name + ":"] }));
        else if (c.items?.length) add(c.items.join(", "), { bold: false });
      } else if (isCert && c.items?.length) {
        c.items.forEach((item) => add(item, { bold: false }));
      }
      (c.paragraphs || []).forEach((s) => add(s, { bold: false }));
      (c.bullets || []).forEach((s) => add(s, { type: "bullet", bullet: true, bold: false }));
      (c.entries || []).forEach((e) => entry(e, section.type));
      (c.blocks || []).forEach((b) => {
        if (b.text) add(b.text, { bold: false });
        if (b.entry) entry(b.entry, section.type);
        (b.bullets || []).forEach((s) => add(s, { type: "bullet", bullet: true, bold: false }));
      });
    });

    return { pages, y, contactItems, profile };
  };

  let layout = renderCurrentSections(sections);

  // Progressive trimming loop to strictly satisfy the allowedPages limit (max 1 or 2 pages)
  // WITHOUT ever wiping any role's bullets to 0!
  if (layout.pages.length > allowedPages && expSection?.content?.entries?.length >= 2) {
    const entries = expSection.content.entries;

    if (allowedPages === 2) {
      // Pass 1: Trim older roles (from index N-1 down to 4) to 3 bullets
      for (let i = entries.length - 1; i >= 4; i--) {
        if (entries[i].bullets?.length > 3) entries[i].bullets = entries[i].bullets.slice(0, 3);
      }
      layout = renderCurrentSections(sections);

      // Pass 2: If still overflowing, trim older roles (index >= 4) to 2 bullets
      if (layout.pages.length > allowedPages) {
        for (let i = entries.length - 1; i >= 4; i--) {
          if (entries[i].bullets?.length > 2) entries[i].bullets = entries[i].bullets.slice(0, 2);
        }
        layout = renderCurrentSections(sections);
      }

      // Pass 3: If still overflowing, trim middle roles (entry 2 and 3) to 3 bullets
      if (layout.pages.length > allowedPages) {
        for (let i = Math.min(3, entries.length - 1); i >= 2; i--) {
          if (entries[i].bullets?.length > 3) entries[i].bullets = entries[i].bullets.slice(0, 3);
        }
        layout = renderCurrentSections(sections);
      }

      // Pass 4: If still overflowing, trim top roles (entry 0 and 1) to 4 bullets
      if (layout.pages.length > allowedPages) {
        if (entries[0]?.bullets?.length > 4) entries[0].bullets = entries[0].bullets.slice(0, 4);
        if (entries[1]?.bullets?.length > 4) entries[1].bullets = entries[1].bullets.slice(0, 4);
        layout = renderCurrentSections(sections);
      }

      // Pass 5: If still overflowing, trim older roles (index >= 4) to 1 bullet
      if (layout.pages.length > allowedPages) {
        for (let i = entries.length - 1; i >= 4; i--) {
          if (entries[i].bullets?.length > 1) entries[i].bullets = entries[i].bullets.slice(0, 1);
        }
        layout = renderCurrentSections(sections);
      }

      // Pass 6: If still overflowing, trim middle roles (entry 2 and 3) to 2 bullets
      if (layout.pages.length > allowedPages) {
        for (let i = Math.min(3, entries.length - 1); i >= 2; i--) {
          if (entries[i].bullets?.length > 2) entries[i].bullets = entries[i].bullets.slice(0, 2);
        }
        layout = renderCurrentSections(sections);
      }

      // Pass 7: If still overflowing, trim top roles (entry 0 and 1) to 3 bullets
      if (layout.pages.length > allowedPages) {
        if (entries[0]?.bullets?.length > 3) entries[0].bullets = entries[0].bullets.slice(0, 3);
        if (entries[1]?.bullets?.length > 3) entries[1].bullets = entries[1].bullets.slice(0, 3);
        layout = renderCurrentSections(sections);
      }

      // Pass 8: If still overflowing, trim middle roles to 1 bullet
      if (layout.pages.length > allowedPages) {
        for (let i = Math.min(3, entries.length - 1); i >= 2; i--) {
          if (entries[i].bullets?.length > 1) entries[i].bullets = entries[i].bullets.slice(0, 1);
        }
        layout = renderCurrentSections(sections);
      }

      // Pass 9: If still overflowing, trim top roles to 2 bullets
      if (layout.pages.length > allowedPages) {
        if (entries[0]?.bullets?.length > 2) entries[0].bullets = entries[0].bullets.slice(0, 2);
        if (entries[1]?.bullets?.length > 2) entries[1].bullets = entries[1].bullets.slice(0, 2);
        layout = renderCurrentSections(sections);
      }
    } else {
      // 1-page progressive trimming
      // Pass 1: Trim older roles (idx >= 2) with > 2 bullets down to 2
      for (let i = entries.length - 1; i >= 2; i--) {
        if (entries[i].bullets?.length > 2) entries[i].bullets = entries[i].bullets.slice(0, 2);
      }
      layout = renderCurrentSections(sections);

      // Pass 2: If still overflowing, trim mid role (idx 1) with > 2 bullets down to 2
      if (layout.pages.length > allowedPages && entries[1]?.bullets?.length > 2) {
        entries[1].bullets = entries[1].bullets.slice(0, 2);
        layout = renderCurrentSections(sections);
      }

      // Pass 3: If still overflowing, trim top role with > 3 bullets down to 3
      if (layout.pages.length > allowedPages && entries[0]?.bullets?.length > 3) {
        entries[0].bullets = entries[0].bullets.slice(0, 3);
        layout = renderCurrentSections(sections);
      }

      // Pass 4: If still overflowing, trim older roles (idx >= 2) down to 1 bullet
      if (layout.pages.length > allowedPages) {
        for (let i = entries.length - 1; i >= 2; i--) {
          if (entries[i].bullets?.length > 1) entries[i].bullets = entries[i].bullets.slice(0, 1);
        }
        layout = renderCurrentSections(sections);
      }

      // Pass 5: If still overflowing, trim mid role (idx 1) down to 1 bullet
      if (layout.pages.length > allowedPages && entries[1]?.bullets?.length > 1) {
        entries[1].bullets = entries[1].bullets.slice(0, 1);
        layout = renderCurrentSections(sections);
      }

      // Pass 6: If still overflowing, trim top role down to 2 bullets
      if (layout.pages.length > allowedPages && entries[0]?.bullets?.length > 2) {
        entries[0].bullets = entries[0].bullets.slice(0, 2);
        layout = renderCurrentSections(sections);
      }
    }
  }

  const { pages, y, contactItems, profile } = layout;
  const fit = pages.length <= allowedPages;
  return {
    template: HARSHIBAR_TEMPLATE,
    profile,
    contactItems,
    pages,
    pageCount: pages.length,
    pageSize: "US Letter",
    allowedPages,
    fit,
    status: fit ? "fit" : "overflow",
    fitSuggestions: [],
    utilization: (y - 36) / 720,
    typography: { nameSize: 24.88, headingSize: 12, bodySize: 10, lineHeight: 1.2, marginMm: 12.7 }
  };
}

export function harshibarHtml(model) {
  const renderContact = (r) => {
    if (r.contactItems?.length) {
      return r.contactItems.map((item) => {
        const iconHtml = item.icon ? `<span style="font-family:'Segoe UI Symbol',Arial;margin-right:2pt;">${xml(item.icon)}</span>` : "";
        if (item.type === "linkedin") {
          const liSvg = `<svg style="vertical-align:-1.5pt;margin-right:2.5pt;display:inline-block;" width="11" height="11" viewBox="0 0 24 24" fill="#0a66c2"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z"/></svg>`;
          return `<a href="${xml(item.url)}" target="_blank" rel="noopener noreferrer" style="color:#0a66c2;text-decoration:underline;">${liSvg}${xml(item.label)}</a>`;
        }
        if (item.type === "github") {
          const ghSvg = `<svg style="vertical-align:-1.5pt;margin-right:2.5pt;display:inline-block;" width="11" height="11" viewBox="0 0 24 24" fill="#24292e"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>`;
          return `<a href="${xml(item.url)}" target="_blank" rel="noopener noreferrer" style="color:#24292e;text-decoration:underline;">${ghSvg}${xml(item.label)}</a>`;
        }
        if (item.url) {
          return `${iconHtml}<a href="${xml(item.url)}" target="_blank" rel="noopener noreferrer" style="color:#0a66c2;text-decoration:underline;">${xml(item.label)}</a>`;
        }
        return `${iconHtml}<span>${xml(item.label)}</span>`;
      }).join(` <span style="color:#94a3b8;margin:0 4pt;">|</span> `);
    }
    return richParts(r.text, r).map(p => p.bold ? `<b>${xml(p.text)}</b>` : xml(p.text).replace(/([☎✉↗⌖])/gu, '<span style="font-family:Segoe UI Symbol">$1</span>')).join("");
  };

  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;background:white;color:#141414}article{position:relative;width:612pt;height:792pt;page-break-after:always}article:last-child{page-break-after:auto}.line{position:absolute;margin:0;white-space:pre;font-family:Arial,Helvetica,sans-serif;line-height:1}.right{position:absolute;right:0;font-style:normal;font-size:10pt}.right.bold-date{font-weight:bold;color:#141414;font-size:11pt}.right.meta-loc{font-weight:normal;color:#4d4d4d;font-size:10pt}</style></head><body>${model.pages.map((page) => `<article>${page.filter((r) => !r.gap).map((r) => `<div class="line" style="left:${r.x}pt;top:${r.y}pt;width:${576-r.x}pt;height:${r.height}pt;font-size:${r.size}pt;${r.bold ? "font-weight:bold;" : ""}${r.italic ? "font-style:italic;" : ""}${r.center ? "text-align:center;" : ""}${r.mono ? "font-family:Courier New,monospace;" : ""}">${r.bullet ? '<span style="position:absolute;left:-10pt">•</span>' : ""}${r.type === "contact" ? renderContact(r) : richParts(r.text, r).map(p => p.bold ? `<b>${xml(p.text)}</b>` : xml(p.text).replace(/([☎✉↗⌖])/gu, '<span style="font-family:Segoe UI Symbol">$1</span>')).join("")}${r.right ? `<span class="right ${r.boldRight ? "bold-date" : "meta-loc"}">${xml(r.right)}</span>` : ""}${r.rule ? '<span style="position:absolute;left:0;right:0;top:15pt;border-bottom:2pt solid #d4d4d4"></span>' : ""}</div>`).join("")}</article>`).join("")}</body></html>`;
}

function getHyperlinkId(itemType, resume) {
  if (!resume || !itemType) return "";
  const profile = resume.profile || {};
  const order = ["linkedin", "github", "portfolio", "website"].filter((k) => Boolean(profile[k]));
  const idx = order.indexOf(itemType);
  return idx !== -1 ? `rId${100 + idx}` : "";
}

export function cleanEntryFields(e, twoRows = false, type = "experience") {
  let rawTitle = stripSocialUrls(clean(e.title));
  let rawOrg = stripSocialUrls(clean(e.organization));
  let loc = stripSocialUrls(clean(e.location || ""));
  const date = clean(e.dateRange || e.dates || "");

  // Never allow generic placeholder "Company" to be used as organization or title
  if (/^company$/i.test(rawOrg)) rawOrg = "";
  if (/^company$/i.test(rawTitle)) rawTitle = "";

  if (type === "certifications") {
    let org = rawTitle || rawOrg;
    let role = stripSocialUrls(clean(e.subtitle || (rawTitle ? rawOrg : "")));
    org = org.replace(/^[•●▪*·|—–-]+\s*/, "").replace(/[,\s|;—–-]+$/, "").trim();
    role = role.replace(/^[•●▪*·|—–-]+\s*/, "").replace(/[,\s|;—–-]+$/, "").trim();
    return { org, role, loc, date };
  }

  if (type === "education") {
    const org = rawOrg || rawTitle;
    const role = rawOrg && rawTitle && rawOrg !== rawTitle ? rawTitle : "";
    return { org, role, loc, date };
  }

  // 1. Sanitize any accidental pipe separation in title or organization
  if (rawTitle.includes("|")) {
    const parts = rawTitle.split("|").map((s) => clean(s)).filter(Boolean);
    rawTitle = parts[0];
    const remainder = parts.slice(1).join(" | ");
    if (isProbableLocation(remainder) && !loc) {
      loc = remainder;
    } else if (!isActionSentence(remainder) && !rawOrg) {
      rawOrg = remainder;
    }
  }
  if (rawOrg.includes("|")) {
    const parts = rawOrg.split("|").map((s) => clean(s)).filter(Boolean);
    rawOrg = parts[0];
    const remainder = parts.slice(1).join(" | ");
    if (isProbableLocation(remainder) && !loc) {
      loc = remainder;
    } else if (!isActionSentence(remainder) && !rawTitle) {
      rawTitle = remainder;
    }
  }

  // 2. If rawTitle contains comma separation: "Junior Business Analyst, Tech Mahindra, India"
  if (type === "experience" && rawTitle.includes(",") && isAuthenticTitle(rawTitle)) {
    const commaParts = rawTitle.split(",").map((s) => clean(s)).filter(Boolean);
    if (commaParts.length >= 2 && isAuthenticTitle(commaParts[0])) {
      rawTitle = commaParts[0];
      if (!rawOrg || isActionSentence(rawOrg)) {
        rawOrg = commaParts[1];
      }
      if (!loc && commaParts.length >= 3 && isProbableLocation(commaParts.slice(2).join(", "))) {
        loc = commaParts.slice(2).join(", ");
      }
    }
  }

  // 3. Guard: If rawOrg is an action sentence, discard it as company
  if (type === "experience" && isActionSentence(rawOrg)) {
    if (isAuthenticTitle(rawTitle) || !rawTitle) {
      rawOrg = "";
    } else if (!isActionSentence(rawTitle)) {
      rawOrg = rawTitle;
      rawTitle = "";
    } else {
      rawOrg = "";
    }
  }

  // 4. If rawTitle is an action sentence and rawOrg is a genuine title/company
  if (type === "experience" && isActionSentence(rawTitle) && !isActionSentence(rawOrg)) {
    const temp = rawTitle;
    rawTitle = rawOrg;
    rawOrg = "";
  }

  // Guard location
  if (loc && !isProbableLocation(loc)) {
    loc = "";
  }
  if (loc) {
    loc = loc.replace(/^[|,\s-]+|[|,\s-]+$/g, "");
  }

  // Setup org and role for rendering
  let org = twoRows ? (rawOrg || rawTitle) : (rawTitle || rawOrg);
  let role = twoRows && rawOrg && rawTitle && rawOrg !== rawTitle ? rawTitle : (!twoRows ? rawOrg : "");

  if (type === "experience") {
    if (/^company$/i.test(org)) org = "";
    if (/^company$/i.test(role)) role = "";
  }

  // If org is action sentence and role is authentic, swap
  if (type === "experience" && isActionSentence(org) && (isAuthenticTitle(role) || !isActionSentence(role))) {
    const temp = org;
    org = role;
    role = temp;
  }
  if (type === "experience" && isActionSentence(role)) {
    role = "";
  }

  return { org, role, loc, date };
}

export function harshibarDocumentXml(model, resume = null) {
  const rawRun = (text, r, extra = "") => `<w:r><w:rPr><w:rFonts w:ascii="${r.icon ? "Segoe UI Symbol" : r.mono ? "Courier New" : "Arial"}" w:hAnsi="${r.icon ? "Segoe UI Symbol" : r.mono ? "Courier New" : "Arial"}"/><w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>${r.bold ? "<w:b/><w:bCs/>" : ""}${r.italic ? "<w:i/><w:iCs/>" : ""}${extra}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
  const run = (text, r, extra = "") => String(text).split(/([☎✉↗⌖])/u).filter(Boolean).map(part => rawRun(part, {...r, icon: /^[☎✉↗⌖]$/u.test(part)}, extra)).join("");

  const allRows = (model.pages || []).flat();
  const blocks = [];
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (r.gap) continue;
    if (!clean(r.text) && !r.rule && r.type !== "contact" && !r.right) continue;
    // Single-line special items (heading with bottom rule, name, contact line, entries with right dates/locations)
    if (r.rule || r.type === "heading" || r.type === "name" || r.type === "contact" || r.right) {
      blocks.push({ ...r });
      continue;
    }
    // Multiline items (bullets, paragraphs, skills): group by blockId
    if (r.blockId && blocks.length && blocks.at(-1).blockId === r.blockId) {
      continue;
    }
    blocks.push({ ...r, text: r.fullText || r.text });
  }

  const paragraphs = blocks.map((r, i) => {
    const prev = i > 0 ? blocks[i - 1] : null;
    const isBullet = Boolean(r.bullet || r.type === "bullet");
    const isHeading = r.type === "heading" || r.rule;
    const isName = r.type === "name";
    const isContact = r.type === "contact";
    const isEntryTitle = r.type === "entry-title";
    const isEntryMeta = r.type === "entry-meta";

    const jc = r.center ? "center" : (r.right || isHeading || isEntryTitle || isEntryMeta) ? "left" : "both";

    const isOnePage = Number(model.allowedPages || 1) === 1;

    // Precise professional spacing (in twips, 20 twips = 1 pt)
    let beforeSpacing = 0;
    let afterSpacing = 0;

    if (isHeading) {
      beforeSpacing = i === 0 ? 0 : (isOnePage ? 100 : 180); // 5 pt before heading on 1-page, 9 pt on 2-page
      afterSpacing = isOnePage ? 30 : 60;                    // 1.5 pt after heading on 1-page, 3 pt on 2-page
    } else if (isName) {
      beforeSpacing = 0;
      afterSpacing = isOnePage ? 20 : 40;                    // 1 pt after name on 1-page, 2 pt on 2-page
    } else if (isContact) {
      beforeSpacing = 0;
      afterSpacing = isOnePage ? 60 : 100;                   // 3 pt after contact on 1-page, 5 pt on 2-page
    } else if (isEntryTitle) {
      beforeSpacing = prev?.type === "heading" || prev?.rule ? (isOnePage ? 20 : 40) : (isOnePage ? 60 : 100);
      afterSpacing = isOnePage ? 10 : 15;
    } else if (isEntryMeta) {
      beforeSpacing = 0;
      afterSpacing = isOnePage ? 20 : 40;
    } else if (isBullet) {
      beforeSpacing = 0;
      afterSpacing = isOnePage ? 15 : 25;
    } else {
      beforeSpacing = isOnePage ? 10 : 20;
      afterSpacing = isOnePage ? 20 : 40;
    }

    const keepNextTag = (r.keepNext || isHeading || isEntryTitle || isEntryMeta) ? "<w:keepNext/>" : "";

    if (isContact && r.contactItems?.length) {
      const runs = r.contactItems.map((item, idx) => {
        const sep = idx > 0 ? '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="7F7F7F"/></w:rPr><w:t xml:space="preserve"> | </w:t></w:r>' : "";
        const iconRun = item.icon ? `<w:r><w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">${item.icon} </w:t></w:r>` : "";
        if (item.url) {
          const relId = getHyperlinkId(item.type, resume);
          const tooltip = xml(item.rawUrl || item.url);
          if (relId) {
            return `${sep}${iconRun}<w:hyperlink r:id="${relId}" w:tooltip="${tooltip}"><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${xml(item.label)}</w:t></w:r></w:hyperlink>`;
          }
          return `${sep}${iconRun}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${xml(item.label)}</w:t></w:r>`;
        }
        return `${sep}${iconRun}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">${xml(item.label)}</w:t></w:r>`;
      }).join("");
      return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="${beforeSpacing}" w:after="${afterSpacing}" w:line="${r.height * 20}" w:lineRule="exact"/></w:pPr>${runs}</w:p>`;
    }

    return `<w:p><w:pPr>${keepNextTag}<w:jc w:val="${jc}"/><w:spacing w:before="${beforeSpacing}" w:after="${afterSpacing}" w:line="${r.height * 20}" w:lineRule="exact"/><w:ind w:left="${(r.x - 36) * 20}"${isBullet ? ' w:hanging="200"' : ""}/><w:tabs>${isBullet ? '<w:tab w:val="left" w:pos="300"/>' : ""}<w:tab w:val="right" w:pos="10800"/></w:tabs>${r.rule ? '<w:pBdr><w:bottom w:val="single" w:sz="16" w:space="4" w:color="D4D4D4"/></w:pBdr>' : ""}</w:pPr>${isBullet ? run("•", r) + '<w:r><w:tab/></w:r>' : ""}${richParts(r.text, r).map(part => run(part.text, {...r, bold: part.bold})).join("")}${r.right ? '<w:r><w:tab/></w:r>' + run(r.right, { size: r.boldRight ? 11 : 10, bold: Boolean(r.boldRight) }, r.boldRight ? '<w:b/><w:bCs/>' : '<w:color w:val="4D4D4D"/>') : ""}</w:p>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`;
}

function texEscape(str) {
  return String(str || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

export function buildHarshibarLatex(resume) {
  const profile = resume.profile || {};
  let fullName = clean(profile.fullName);
  if (fullName) {
    fullName = fullName.replace(/\bSh\s+arma\b/gi, "Sharma");
    const target = clean(resume.targetRole || "");
    if (target && fullName.toLowerCase().endsWith(target.toLowerCase())) {
      fullName = fullName.slice(0, -target.length).trim();
    }
    fullName = fullName.replace(/\s+(?:Business\s+Analyst|Business|Developer|Data\s+Analyst|Engineer|Specialist)$/i, "").trim();
  }
  const rawPhone = clean(profile.phone);
  const rawEmail = clean(profile.email);
  const rawLinkedin = cleanContactUrl(profile.linkedin);
  const rawGithub = cleanContactUrl(profile.github);
  const rawPortfolio = cleanContactUrl(profile.portfolio);
  const rawWebsite = cleanContactUrl(profile.website);
  const rawLocation = clean(profile.location).replace(/^[|,\s-]+|[|,\s-]+$/g, "");

  const contacts = [];
  if (rawPhone) contacts.push(`\\faPhone* \\hspace{2pt} \\texttt{${texEscape(rawPhone)}}`);
  if (rawEmail) contacts.push(`\\faEnvelope \\hspace{2pt} \\href{mailto:${texEscape(rawEmail)}}{\\texttt{${texEscape(rawEmail)}}}`);
  if (rawLinkedin) contacts.push(`\\faLinkedin \\hspace{2pt} \\href{https://${texEscape(rawLinkedin)}}{LinkedIn}`);
  if (rawGithub) contacts.push(`\\faGithub \\hspace{2pt} \\href{https://${texEscape(rawGithub)}}{GitHub}`);
  if (rawPortfolio) contacts.push(`\\faGlobe \\hspace{2pt} \\href{https://${texEscape(rawPortfolio)}}{Portfolio}`);
  if (rawWebsite) contacts.push(`\\faGlobe \\hspace{2pt} \\href{https://${texEscape(rawWebsite)}}{Website}`);
  const isLocationCandidateName = fullName && (
    rawLocation.toLowerCase() === fullName.toLowerCase() ||
    rawLocation.toLowerCase().replace(/\s+/g, "") === fullName.toLowerCase().replace(/\s+/g, "")
  );
  if (rawLocation && !isLocationCandidateName) contacts.push(`\\faMapMarker* \\hspace{2pt} \\texttt{${texEscape(rawLocation)}}`);

  const order = ["summary", "experience", "projects", "skills", "education", "certifications"];
  const sections = (resume.sections || []).filter((s) => s.visible !== false);
  const sorted = [...sections].sort((a, b) => {
    const idxA = order.indexOf(a.type);
    const idxB = order.indexOf(b.type);
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
  });

  const sectionBlocks = sorted.map((section) => {
    const heading = texEscape(formatSectionHeading(section.title, section.type));
    const c = section.content || {};

    if (section.type === "summary") {
      const text = clean(c.text || (c.paragraphs || []).join(" "));
      if (!text) return "";
      return `\\section{${heading}}\n${texEscape(text)}`;
    }

    if (section.type === "skills") {
      let skillBody = "";
      if (section.layout === "categorized" && c.categories?.length) {
        skillBody = c.categories.map((cat) => `\\textbf{${texEscape(cat.name)}: } ${texEscape(cat.items.join(", "))}`).join(" \\\\\n");
      } else if (c.items?.length) {
        skillBody = texEscape(c.items.join(", "));
      }
      if (!skillBody) return "";
      return `\\section{${heading}}\n\\begin{itemize}[leftmargin=0.15in, label={}]\n  \\item\\small{${skillBody}}\n\\end{itemize}`;
    }

    const entries = c.entries || [];
    if (!entries.length && !c.paragraphs?.length && !c.bullets?.length) return "";

    const entryCode = entries.map((e) => {
      const twoRows = section.type === "experience" || section.type === "education";
      const { org, role, loc, date } = cleanEntryFields(e, twoRows, section.type);
      const bulletsCode = (e.bullets || []).filter(Boolean).map((b) => `      \\resumeItem{${texEscape(b)}}`).join("\n");

      if (section.type === "certifications") {
        return `    \\resumeProjectHeading\n      {${texEscape(org)}${role ? ` $|$ \\emph{${texEscape(role)}}` : ""}}{\\small ${texEscape(date)}}\n    \\resumeItemListStart\n${bulletsCode}\n    \\resumeItemListEnd`;
      }

      if (twoRows) {
        return `    \\resumeSubheading\n      {${texEscape(org)}}{\\textbf{${texEscape(date)}}}\n      {${texEscape(role)}}{${texEscape(loc)}}\n    \\resumeItemListStart\n${bulletsCode}\n    \\resumeItemListEnd`;
      }

      return `    \\resumeProjectHeading\n      {\\textbf{${texEscape(org)}}${role ? ` $|$ \\emph{${texEscape(role)}}` : ""}}{\\textbf{${texEscape(date)}}}\n    \\resumeItemListStart\n${bulletsCode}\n    \\resumeItemListEnd`;
    }).join("\n\n");

    return `\\section{${heading}}\n\\resumeSubHeadingListStart\n${entryCode}\n\\resumeSubHeadingListEnd`;
  }).filter(Boolean).join("\n\n");

  return `%-------------------------
% Resume in LaTeX (Overleaf)
% Based on Harshibar / Jake's Resume
% Format: Summary => Experience => Projects => Skills => Education => Certifications
%------------------------

\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome5}
\\usepackage[scale=0.90,lf]{FiraMono}

\\definecolor{light-grey}{gray}{0.83}
\\definecolor{dark-grey}{gray}{0.3}
\\definecolor{text-grey}{gray}{.08}

\\usepackage{tgheros}
\\renewcommand*\\familydefault{\\sfdefault}
\\usepackage[T1]{fontenc}

\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{0in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{
  \\bfseries\\vspace{2pt}\\raggedright\\large
}{}{0em}{}[\\color{light-grey}{\\titlerule[2pt]}\\vspace{-4pt}]

\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-1pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-1pt}\\item
    \\begin{tabular*}{\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & {\\color{dark-grey}\\small #2}\\vspace{1pt}\\\\
      \\textit{#3} & {\\color{dark-grey}\\small #4}\\\\
    \\end{tabular*}\\vspace{-4pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\item
    \\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
      #1 & {\\color{dark-grey}\\small #2}\\\\
    \\end{tabular*}\\vspace{-4pt}
}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{0pt}}

\\color{text-grey}

\\begin{document}

\\begin{center}
    {\\textbf{\\Huge ${texEscape(profile.fullName || "Resume")}}} \\\\ \\vspace{5pt}
    \\small ${contacts.join(" \\hspace{3pt} $|$ \\hspace{3pt} ")}
\\end{center}

${sectionBlocks}

\\end{document}
`;
}
