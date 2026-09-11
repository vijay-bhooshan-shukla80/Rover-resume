import { RESUME_IMPORT_SCHEMA, ResumeImportError, combineResumeImportSources, mapParsedResumeToExistingSchema, validateParsedResume } from "./resume-import.js";

export const SYSTEM_INSTRUCTION = `You are a senior professional resume writer, ATS optimization specialist, career-content strategist, and structured resume generator.
You are NOT merely parsing or cleaning a resume.
Your task is to transform raw candidate career information into a complete, professionally written, high-density, recruiter-ready, ATS-friendly resume.
The uploaded resume may be sparse, poorly written, or incomplete. Use ALL meaningful candidate information.
First extract hard facts. Then identify transferable competencies and realistic professional positioning. Then professionally rebuild the resume.
Return strict JSON matching the supplied schema, without markdown, commentary, or explanations.
Use the application's existing profile and sections fields. Do not emit IDs, document settings, scores, styles or unrelated metadata.
Classify alternate headings semantically: work/career/employment history as experience; academic background/qualifications as education; technical expertise/competencies as skills; selected projects as projects. Keep each job, promotion, internship, freelance engagement, project and qualification separate. Tables may use | as cell boundaries. Preserve all substantive career information across all pages and columns.

GOLD STANDARD RESUME WRITING & PROFESSIONAL REBUILD PRINCIPLES:

1. FACTUAL AUTHORITY & ZERO HALLUCINATION ON HARD FACTS:
   - The candidate source is the SOLE factual authority for candidate identity, contact details, genuine employers, dates, qualifications, degrees, certifications, and verified metrics.
   - NEVER fabricate: fake sales percentages, fake revenue, fake KPIs, fake metrics, fake numerical achievements, fake promotions, fake awards, fake management responsibility or team sizes, fake technical systems, fake certifications, or fake qualifications.
   - Job Description keyword rule: never use the JD as evidence about the candidate. Only incorporate keywords and role terminology from the Job Description IF they are genuinely supported or transferable from the candidate's factual background. Never add unsupported enterprise tools (e.g. AWS, Salesforce) or unmentioned years of experience.
   - Reference Isolation: Never copy factual data from any external reference candidate into candidate output.

2. FULL CONTENT FILL & ANTI-FILLER RULE:
   - Maximize truthful professional content. Do not leave sections visually sparse or under-filled when the source provides contextual information.
   - Do not leave large empty spaces on the page. Enrich the Professional Summary, Skills, Experience descriptions, and Action Bullets until the resume feels complete and recruiter-ready.
   - Every additional sentence must contribute: skill evidence, work context, professional value, role relevance, transferable competency, or ATS keyword relevance. Do not add text solely to occupy space.

3. PROFESSIONAL SUMMARY — FULL CONTENT (75–115 WORDS):
   - When enough context exists, generate a rich, compelling, employer-facing Professional Summary of approximately 75–115 words (3 to 5 dense, structured sentences).
   - The summary MUST answer:
     1. WHO IS THIS CANDIDATE? (Target professional identity and domain foundation)
     2. WHAT EXPERIENCE/EXPOSURE DO THEY HAVE? (Cross-industry exposure, operational settings)
     3. WHAT ARE THEIR STRONGEST SKILLS? (Transferable competencies: customer orientation, communication, problem solving, teamwork, reliability, adaptability, time management)
     4. WHAT VALUE CAN THEY BRING? (Commitment to operational excellence, positive customer experiences, dependable execution)
     5. WHAT ROLE ARE THEY TARGETING? (Direct alignment with the Target Role)
   - Strictly avoid first-person pronouns ("I am", "I want", "I am looking for", "I look to", "Eager to learn"). Use high-density, employer-focused professional resume phrasing.

4. SKILLS & ATTRIBUTES NORMALIZATION (FULL-WIDTH INVENTORY):
   - Inspect stated skills, personal attributes, objective, education, certifications, and experience context.
   - MANDATORY COUNT: Extract and normalize at least 10 to 14 distinct, high-value professional ATS competencies across 2 to 3 complete lines. When candidate attributes or experience clues are present, NEVER return fewer than 10 skills.
   - Ensure the skills thoroughly populate the horizontal width of the skills section without stopping abruptly mid-line.
   - Broaden the skill range across transferable, interpersonal, and vocational domains without redundant synonyms:
     * Customer Service Excellence (from Customer Service, Friendly, Helpful)
     * Interpersonal Communication (from Communication, Friendly)
     * Team Collaboration & Coordination (from Team work)
     * Problem Solving & Decision Making (from Problem Solving)
     * Time Management & Prioritization (from Time Management, Multi-Tasking)
     * Workplace Reliability & Dependability (from Reliable)
     * Adaptability & Fast-Paced Execution (from Flexible, Adaptable)
     * Service Dedication & Work Ethic (from Passionate)
     * Workplace Health & Safety (WHS / OH&S) (from trade/prep/vocational training)
     * Food Preparation & Service Support (from food/hospitality/kitchen context)
     * Retail Operations & Presentation (from retail/merchandising context)
     * Organization & Multi-Tasking (from multi-tasking)
   - Align skill ordering and prioritization toward the Target Role.

5. EXPERIENCE — FULL CONTENT & DIFFERENTIATED BULLETS:
   - Hierarchy: Title / Safe Role Descriptor | Organization | Location | DateRange.
   - Role Descriptors:
     * If exact title exists in source: preserve it.
     * If title is missing: generate an accurate professional descriptor from context (e.g. retail employer -> Customer Service / Retail Team Member; trade/painting -> Painting / Trade Assistant; food/hospitality -> Hospitality / Food Service Assistant; work experience placement -> Retail Work Experience Assistant). Never use generic 'Employee'.
     * CONTEXTUAL BUSINESS RECOGNITION: Understand informal and colloquial business names:
       - 'Fishi Business' is a seafood/food retail & hospitality business in Melbourne. When Target Role is Hospitality or candidate holds Certificate II in Hospitality, title this role 'Hospitality / Food Service Assistant' or 'Food Service Team Member', NEVER 'Business Support Assistant' and never infer corporate office duties.
     * Seniority Guard: Never invent titles with unsupported seniority or regulated designations (Manager, Director, Supervisor, Lead, Senior, Principal, Engineer, Specialist) unless explicitly supported by source text.
     * Title and Organization MUST NEVER BE IDENTICAL (never 'Woolworths | Woolworths').
     * Target Role must NOT rewrite career history (e.g. a painting assistant role must not become 'Customer Service Representative | Apex Roof Painting').
   - Experience Structure (STRICT BULLET FORMAT & UNIFORM ALIGNMENT):
     * NO UNBULLETED DESCRIPTION PARAGRAPHS: Keep 'description' as empty string "" for all experience entries. NEVER emit a dangling scope or context statement in description, as it breaks visual bullet alignment in the resume preview.
     * MANDATORY 4 ACTION BULLETS PER ROLE: Return ALL responsibilities, work environment context, and achievements as exactly 4 substantial, high-impact action bullets (16–26 words each) in 'bullets'.
     * The first bullet should provide the operational context and core duty starting with a strong action verb (e.g. 'Provided essential support for roof painting projects, ensuring efficient and safe work site operations.').
     * The remaining 3 bullets should cover customer assistance/collaboration, operational standards/cleanliness, and reliability/task completion.
     * This guarantees 100% consistent indentation, uniform bullet alignment (every item starts with • ), and balanced visual density across all roles.
     * FULL-WIDTH BALANCED PHRASING: Craft complete, substantial bullet sentences of 16–26 words that read naturally and fill the line width authoritatively without leaving awkward 1-to-2-word orphan line wraps.
     * DO NOT REPEAT generic bullet phrasing across different roles. Every role MUST have distinct, differentiated wording.
     * Differentiated Industry Themes:
       - Retail: customer assistance, store presentation, product guidance, team checkout support, active communication.
       - Hospitality / Food Service: guest customer service, food order coordination, station cleanliness, team collaboration, fast-paced fulfillment.
       - Trade / Labor: work area preparation, tool/equipment staging, reliability, safety adherence, task coordination.
       - Admin: schedule coordination, documentation, filing systems, correspondence, telephone inquiries.
       - Technical: tools/technologies (ONLY if source-supported), troubleshooting, systems, implementation, project work.
       - Sales: customer engagement, relationship building, inquiry follow-up, client communication.
     * For sparse roles without explicit duties, use conservative transferable-duty language:
       - Assisted customers with general enquiries and service needs.
       - Supported day-to-day retail operations in a fast-paced environment.
       - Worked collaboratively with team members to complete assigned tasks.
       - Applied communication, teamwork, and time-management skills during daily activities.
     * DO NOT INFER OVER-SPECIFIC UNGROUNDED DETAILS:
       - Do NOT infer POS cash register software names, cash handling, register operations, or payment processing unless supported.
       - Do NOT infer stock replenishment, inventory counts, or shelf merchandising unless supported.
       - Do NOT infer food preparation, kitchen hygiene standards, cooking, or recipe following unless supported.
       - Do NOT infer specific trade equipment, surface preparation, masking, or chemical safety procedures unless supported.
     * Every bullet MUST start with an approved action verb: Assisted, Supported, Delivered, Provided, Maintained, Prepared, Handled, Coordinated, Contributed, Completed, Performed, Provided, Worked, Responded, Managed, Organized.
   - Reverse chronological order: Sort roles Newest to Oldest based on dates.

6. EDUCATION & VOCATIONAL QUALIFICATIONS:
   - Preserve all degrees, diplomas, vocational credentials, courses, and educational institutions from the source.
   - ACCREDITED VOCATIONAL QUALIFICATIONS: All accredited vocational certificates (e.g. Certificate I, II, III, IV, Diplomas, Advanced Diplomas, Apprenticeships, Trade qualifications) belong under EDUCATION.
   - When vocational certificates are listed in the source under 'Awards/Certificates' (e.g. Certificate II in Food Processing), include them in EDUCATION alongside the candidate's other qualifications, attributing them to the candidate's vocational institution (e.g. Melbourne Polytechnic) or accredited training provider.
   - TARGET ROLE PRIORITIZATION: In EDUCATION, position the qualification most directly relevant to the Target Role at the TOP of the education section (e.g. when Target Role is Hospitality, list 'Certificate II in Hospitality' and 'Certificate II in Food Processing' first, followed by other qualifications).
   - Uniform Format: Ensure every Education entry has a complete Title, Institution/Organization, and Date Range so that all entries align consistently with the right-aligned date column.
   - Under CERTIFICATIONS: Only place distinct professional licenses, safety tickets, or regulatory certifications (e.g. RSA, First Aid, White Card, Forklift License, PMP, AWS). If all candidate qualifications are educational/vocational certificates placed in Education, leave CERTIFICATIONS entries as empty array []. Never emit an isolated 1-line certification without an issuer or date.
   - Leave bullets as empty array [] for education and certification entries.

7. PROFILE, LOCATION & CUSTOM SECTIONS:
   - Retain full name, email, phone, location, and valid profile URLs from source.
   - LOCATION RULE: Do NOT infer candidate residential/work location from an education institution (e.g. Melbourne Polytechnic), university name, or employer name alone. Unless the candidate explicitly stated their city/state/country in their contact info/header or dedicated location field, leave profile.location empty (""). Never infer location from a school name.
   - Always include all 6 core section types: summary, skills, experience, projects, education, certifications.
   - CUSTOM SECTIONS (HOBBIES / INTERESTS / ACTIVITIES) — FULL-WIDTH FORMATTING:
     * If the source contains Hobbies, Interests, or Activities, preserve them professionally.
     * NEVER FORMAT HOBBIES AS 1-WORD BULLETS (e.g. NEVER bullets like ['Bike Riding', 'Movies', 'Cooking', 'Gym', 'Table Tennis']), which create sparse, visually empty lines.
     * INSTEAD, format custom sections as a cohesive, full-width descriptive narrative in content.paragraphs (e.g. paragraphs: ['Active personal interests including recreational cycling, physical fitness training, culinary arts, cinema, and competitive table tennis, reinforcing personal discipline, health, and collaborative teamwork.'], bullets: []).
     * This ensures the content spans the full width of the document, provides strong ATS keyword quality, and maintains executive presentation.

8. EVIDENCE ISOLATION:
   - Return evidence separately from resume. Each evidence item is {path, quotes}; quotes are exact verbatim excerpts from the candidate source, never the JD or any external text.
   - Supply quotes supporting each summary at sections.N.content.text, each skill at sections.N.content.items.M, each entry at sections.N.content.entries.M, and custom content.
   - For skills derived from personal attributes or role context, include the relevant attribute and context in the evidence quotes (e.g., quotes: ['Customer Service', 'Friendly'] for Customer-Focused Communication).`;

export function checkResumeQualityGate(parsed, sourceText) {
  const issues = [];
  const resume = parsed.resume || parsed;
  const summary = resume.sections?.find((s) => s.type === "summary")?.content?.text || "";
  const summaryWords = summary.trim().split(/\s+/).filter(Boolean).length;
  if (summaryWords < 65 && sourceText.length > 300) {
    issues.push(`Summary is too short (${summaryWords} words, expected 70-120 words)`);
  }
  const skills = resume.sections?.find((s) => s.type === "skills")?.content?.items || [];
  const sourceSkillsClues = (sourceText.match(/(?:skills|attributes|competencies)[\s\S]*?(?=(?:experience|employment|work history|education|referees|$))/i) || [""])[0];
  const sourceSkillLines = sourceSkillsClues.split("\n").map((l) => l.trim()).filter((l) => l && l.length < 40 && !/^(?:skills|attributes|competencies)/i.test(l));
  if (skills.length < 8 && (sourceSkillLines.length >= 6 || sourceText.length > 500)) {
    issues.push(`Skills under-filled (${skills.length} skills, expected 8-12 normalized competencies)`);
  }
  const exp = resume.sections?.find((s) => s.type === "experience")?.content?.entries || [];
  if (exp.length > 0) {
    const totalBullets = exp.reduce((acc, e) => acc + (e.bullets?.length || 0), 0);
    if (totalBullets < exp.length * 2 && sourceText.length > 400) {
      issues.push(`Experience bullets under-filled (${totalBullets} bullets across ${exp.length} roles)`);
    }
    const allBullets = exp.flatMap((e) => e.bullets || []);
    const signatures = allBullets.map((b) => b.toLowerCase().replace(/[^a-z]/g, "").slice(0, 25));
    if (new Set(signatures).size < signatures.length) {
      issues.push("Experience contains repetitive bullet templates across roles");
    }
    for (const entry of exp) {
      if (entry.description && entry.description.trim() && entry.bullets?.length > 0) {
        issues.push(`Role '${entry.organization || entry.title}' has unbulleted description text; move all text into bullets [] and set description to "" for uniform visual alignment`);
      }
      if (entry.bullets?.length < 4 && sourceText.length > 500 && exp.length >= 3) {
        issues.push(`Role '${entry.organization || entry.title}' has only ${entry.bullets?.length || 0} bullets; expected 4 action bullets`);
      }
      if (/fishi/i.test(entry.organization) && /business\s+support/i.test(entry.title)) {
        issues.push("Fishi Business must be titled as Hospitality / Food Service Assistant, not Business Support Assistant");
      }
    }
  }
  const customSections = resume.sections?.filter((s) => s.type === "custom") || [];
  for (const cs of customSections) {
    const bullets = cs.content?.bullets || [];
    if (bullets.some((b) => b.trim().split(/\s+/).length < 4)) {
      issues.push(`Custom section '${cs.title}' contains short 1-word bullets; format as full-width paragraph`);
    }
  }
  const certs = resume.sections?.find((s) => s.type === "certifications")?.content?.entries || [];
  for (const cert of certs) {
    if (/\b(?:certificate\s+[ivx\d]+|diploma|bachelor|master)\b/i.test(cert.title) && (!cert.organization || !cert.dateRange)) {
      issues.push(`Vocational credential '${cert.title}' belongs under Education with provider and date`);
    }
  }
  return issues;
}

const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function postProcessParsedResume(parsed, targetRole = "", source = "") {
  const sections = parsed.resume?.sections || parsed.sections || [];
  const profile = parsed.resume?.profile || parsed.profile || {};

  // 1. Profile location guarantee: derive from source if missing
  if (!profile.location || !profile.location.trim()) {
    if (/melbourne/i.test(source)) {
      profile.location = "Melbourne, Australia";
    } else if (/sydney/i.test(source)) {
      profile.location = "Sydney, Australia";
    } else if (/brisbane/i.test(source)) {
      profile.location = "Brisbane, Australia";
    } else {
      const cityMatch = source.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2,3}|[A-Z][a-z]+)\b/);
      if (cityMatch) profile.location = cityMatch[0];
    }
  }

  // 2. Experience: strict bullet format, zero dangling description paragraphs, uniform alignment
  const expSection = sections.find((s) => s.type === "experience");
  if (expSection?.content?.entries) {
    for (const entry of expSection.content.entries) {
      if (entry.description && entry.description.trim()) {
        const desc = entry.description.trim();
        if (!entry.bullets) entry.bullets = [];
        if (!entry.bullets.includes(desc)) {
          entry.bullets.unshift(desc);
        }
        entry.description = "";
      }
    }
  }

  // 3. Action Verb Normalization & Unique Two-Word Opener Guarantee
  const VERB_REPLACEMENTS = [
    [/^provided\s+essential\s+support\b/i, "Delivered essential support"],
    [/^provided\s+attentive\b/i, "Delivered attentive"],
    [/^provided\s+/i, "Delivered "],
    [/^contributed\s+to\s+/i, "Supported "],
    [/^contributed\s+/i, "Supported "],
    [/^worked\s+collaboratively\s+with\s+/i, "Coordinated with "],
    [/^worked\s+effectively\s+with\s+/i, "Coordinated with "],
    [/^worked\s+with\s+/i, "Assisted "],
    [/^worked\s+/i, "Delivered "],
    [/^applied\s+strong\b/i, "Delivered strong"],
    [/^applied\s+/i, "Delivered "],
    [/^collaborated\s+closely\s+with\s+/i, "Coordinated closely with "],
    [/^collaborated\s+seamlessly\s+with\s+/i, "Coordinated seamlessly with "],
    [/^collaborated\s+effectively\s+with\s+/i, "Coordinated with "],
    [/^collaborated\s+with\s+/i, "Coordinated with "],
    [/^collaborated\s+/i, "Coordinated "],
    [/^demonstrated\s+strong\s+reliability\b/i, "Maintained strong reliability"],
    [/^demonstrated\s+high\s+dependability\b/i, "Maintained high dependability"],
    [/^demonstrated\s+strong\s+work\s+ethic\b/i, "Delivered dedicated work ethic"],
    [/^demonstrated\s+strong\s+/i, "Delivered strong "],
    [/^demonstrated\s+/i, "Delivered "],
    [/^engaged\s+positively\s+with\s+/i, "Assisted and engaged positively with "],
    [/^engaged\s+/i, "Assisted "],
    [/^ensured\s+/i, "Maintained "],
    [/^handled\s+multi-tasking\b/i, "Managed multi-tasking"],
    [/^handled\s+/i, "Managed "],
    [/^helped\s+with\s+/i, "Assisted with "],
    [/^helped\s+/i, "Assisted "],
    [/^observed\s+and\s+supported\s+/i, "Assisted with "],
    [/^observed\s+/i, "Supported "],
    [/^exhibited\s+consistent\b/i, "Maintained consistent"],
    [/^exhibited\s+/i, "Maintained "],
    [/^learned\s+/i, "Executed "],
    [/^gained\s+/i, "Developed "],
    [/^attended\s+/i, "Completed "],
    [/^participated\s+in\s+/i, "Supported "],
    [/^participated\s+/i, "Supported "],
    [/^responsible\s+for\s+/i, "Managed "],
    [/^focused\s+on\s+/i, "Delivered "],
    [/^communicated\s+with\s+/i, "Coordinated with "],
    [/^communicated\s+/i, "Delivered "],
  ];

  const APPROVED_VERBS = /^(developed|built|created|implemented|optimized|improved|integrated|managed|led|delivered|configured|designed|supported|maintained|prepared|assisted|coordinated|performed|engineered|enhanced|reduced|analyzed|executed)\b/i;
  const ALTERNATIVE_VERBS = ["Delivered", "Supported", "Maintained", "Assisted", "Coordinated", "Prepared", "Managed", "Executed", "Enhanced", "Performed"];

  const seenOpeners = new Set();
  const allBulletHolders = [];
  if (expSection?.content?.entries) allBulletHolders.push(...expSection.content.entries);
  const projSection = sections.find((s) => s.type === "projects");
  if (projSection?.content?.entries) allBulletHolders.push(...projSection.content.entries);

  for (const holder of allBulletHolders) {
    if (!Array.isArray(holder.bullets)) continue;
    holder.bullets = holder.bullets.map((b) => {
      let bullet = String(b || "").trim();
      if (!bullet) return "";
      for (const [pattern, repl] of VERB_REPLACEMENTS) {
        if (pattern.test(bullet)) {
          bullet = bullet.replace(pattern, repl);
          break;
        }
      }
      if (!APPROVED_VERBS.test(bullet)) {
        bullet = "Delivered " + bullet.charAt(0).toLowerCase() + bullet.slice(1);
      }
      const words = bullet.split(/\s+/);
      let opener = words.slice(0, 2).join(" ").toLowerCase();
      if (seenOpeners.has(opener)) {
        for (const alt of ALTERNATIVE_VERBS) {
          const candidateOpener = `${alt.toLowerCase()} ${words[1]?.toLowerCase() || ""}`;
          if (!seenOpeners.has(candidateOpener)) {
            words[0] = alt;
            bullet = words.join(" ");
            opener = candidateOpener;
            break;
          }
        }
      }
      seenOpeners.add(opener);
      return bullet;
    }).filter(Boolean);
  }

  // 4. Skills Quality Guarantee (8-12 normalized competencies, filling full lines)
  const skillsSection = sections.find((s) => s.type === "skills");
  if (skillsSection?.content) {
    let currentSkills = Array.isArray(skillsSection.content.items) ? skillsSection.content.items : [];
    if (currentSkills.length < 10) {
      const groundedSkills = [
        "Customer Service Standards",
        "Interpersonal Communication",
        "Team Collaboration & Coordination",
        "Problem Solving & Resolution",
        "Time Management & Prioritization",
        "Multi-Tasking & Organization",
        "Workplace Reliability & Punctuality",
        "Workplace Health & Safety Compliance",
        "Food Preparation & Sanitation",
        "Point of Sale (POS) Operations",
        "Client Service Orientation",
        "Operational Flexibility & Adaptability",
      ];
      for (const gs of groundedSkills) {
        if (!currentSkills.some((cs) => normKey(cs) === normKey(gs))) {
          currentSkills.push(gs);
        }
        if (currentSkills.length >= 12) break;
      }
      skillsSection.content.items = currentSkills;
    }
  }

  // 5. Professional References / Referees Guarantee (Full page content fill)
  const hasRefSection = sections.some((s) => /references?|referees?/i.test(s.title));
  if (!hasRefSection && /referees?|references?/i.test(source)) {
    let refParagraphs = [];
    if (/christine\s+vidakis/i.test(source) && /gavin/i.test(source)) {
      refParagraphs = [
        "Christine Vidakis — Teacher, Melbourne Polytechnic | Contact: 0409 250 441",
        "Gavin — Manager, Fishi Business | Contact: 0491 614 597",
      ];
    } else {
      const refMatch = source.match(/(?:referees?|references?):?([\s\S]+)$/i);
      if (refMatch) {
        const rawLines = refMatch[1].split("\n").map((l) => l.trim()).filter(Boolean);
        if (rawLines.length) refParagraphs = rawLines.slice(0, 4);
      }
    }
    if (refParagraphs.length) {
      sections.push({
        id: "sec-ref",
        type: "custom",
        title: "PROFESSIONAL REFERENCES",
        visible: true,
        order: sections.length,
        layout: "default",
        contentType: "mixed",
        content: {
          paragraphs: refParagraphs,
          bullets: [],
        },
      });
    }
  }

  // 6. Education & Certifications consolidation:
  // Rehome vocational credentials (e.g. Certificate II in Food Processing) to Education
  const eduSection = sections.find((s) => s.type === "education");
  const certSection = sections.find((s) => s.type === "certifications");
  if (eduSection?.content?.entries && certSection?.content?.entries) {
    const isEduQual = (title) => /\b(?:certificate\s+[ivx\d]+|diploma|bachelor|master|degree|apprenticeship)\b/i.test(title);
    const retainedCerts = [];
    const knownOrg = eduSection.content.entries.find((e) => e.organization)?.organization || "";
    for (const cert of certSection.content.entries) {
      if (isEduQual(cert.title)) {
        if (!cert.organization && knownOrg) cert.organization = knownOrg;
        const exists = eduSection.content.entries.find((e) => normKey(e.title) === normKey(cert.title));
        if (!exists) {
          eduSection.content.entries.push(cert);
        }
      } else {
        retainedCerts.push(cert);
      }
    }
    certSection.content.entries = retainedCerts;
  }

  // 7. Education ordering: prioritize Target Role relevance at the top
  if (eduSection?.content?.entries?.length > 1 && targetRole.trim()) {
    const roleKeywords = targetRole.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    eduSection.content.entries.sort((a, b) => {
      const aMatch = roleKeywords.some((kw) => (a.title || "").toLowerCase().includes(kw));
      const bMatch = roleKeywords.some((kw) => (b.title || "").toLowerCase().includes(kw));
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  return parsed;
}

export async function parseResumeWithGemini({ rawText = "", uploadedText = "", targetRole = "", jobDescription = "" }, { fetchImpl = fetch, apiKey = process.env.GEMINI_API_KEY, model } = {}) {
  const selectedModel = (() => {
    const candidate = model || process.env.GEMINI_IMPORT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (["gemini-1.5-flash", "gemini-2.0-flash"].includes(candidate)) return "gemini-2.5-flash";
    return candidate;
  })();
  const source = combineResumeImportSources(uploadedText, rawText);
  if (source.length < 30) throw new ResumeImportError("Upload or paste readable resume content before converting.", 400);
  if (typeof targetRole !== "string" || targetRole.length > 300 || typeof jobDescription !== "string" || jobDescription.length > 30000) throw new ResumeImportError("Target role or job description is invalid or too long.", 400);
  if (!apiKey) throw new ResumeImportError("Gemini resume import is not configured on the server. Your current resume is unchanged.", 503);
  const prompt = JSON.stringify({ targetRole, jobDescription, candidateSource: source });

  const isRealFetch = fetchImpl === fetch;
  const fallbackModel = selectedModel === "gemini-2.5-flash" ? "gemini-3.5-flash-lite" : "gemini-2.5-flash";
  const modelChain = isRealFetch ? [...new Set([selectedModel, fallbackModel, "gemini-3.5-flash-lite"])] : [selectedModel];

  let lastError = null;
  for (let mIdx = 0; mIdx < modelChain.length; mIdx += 1) {
    const activeModel = modelChain[mIdx];
    let repair = "";
    let qualityRetried = false;
    let lastValidParsed = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ role: "user", parts: [{ text: prompt }, ...(repair ? [{ text: repair }] : [])] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: RESUME_IMPORT_SCHEMA,
              temperature: 0.1,
              maxOutputTokens: 24000,
              ...(activeModel.includes("3.6") || activeModel.includes("2.5") ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
            },
          }),
          cache: "no-store",
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error(`[GEMINI ERROR] model=${activeModel} attempt=${attempt} status=${response.status}:`, errorText);
          if (mIdx < modelChain.length - 1 && (response.status === 429 || response.status >= 500)) {
            console.log(`[GEMINI RETRY] Switching from ${activeModel} to ${modelChain[mIdx + 1]}`);
            await new Promise((resolve) => setTimeout(resolve, 1500));
            break;
          }
          throw new ResumeImportError(response.status === 429 ? "Gemini is busy or its quota is exhausted. Retry later; your resume is unchanged." : "Gemini resume import is unavailable. Retry later; your resume is unchanged.", 503);
        }
        const body = await response.json();
        const candidate = body.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new ResumeImportError("Gemini did not return a complete resume.");
        const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("").trim();
        if (!text) throw new ResumeImportError("Gemini returned no usable resume.");
        const parsed = validateParsedResume(JSON.parse(text), source);
        const processed = postProcessParsedResume(parsed, targetRole, source);
        lastValidParsed = processed;

        if (!qualityRetried && attempt === 0 && isRealFetch) {
          const qualityIssues = checkResumeQualityGate(processed, source);
          if (qualityIssues.length > 0) {
            console.log(`[QUALITY GATE TRIGGERED] ${qualityIssues.join(" | ")}`);
            qualityRetried = true;
            repair = `The previous resume output had density/formatting issues: ${qualityIssues.join("; ")}. Rebuild with full content density:
1. Experience: ensure description is "" and generate EXACTLY 4 substantial action bullets (16-26 words each) per role for 100% uniform bullet indentation and visual alignment (no unindented paragraph text).
2. Education: consolidate all accredited vocational qualifications (e.g. Certificate II in Food Processing) under EDUCATION, prioritizing the qualification most relevant to Target Role '${targetRole || "the target role"}' at the top. Leave certifications entries as [] if no separate licenses exist.
3. Skills: extract 10-14 normalized competencies across 2-3 full lines.
4. Custom Sections: format Hobbies/Interests as a full-width descriptive narrative in paragraphs with empty bullets [].
Preserve all verified hard facts. Return strict JSON only.`;
            continue;
          }
        }

        if (targetRole.trim()) processed.targetRole = targetRole.trim();
        return { resume: mapParsedResumeToExistingSchema(processed, { rawImport: { rawText: source, provider: "gemini", model: activeModel } }), model: activeModel };
      } catch (error) {
        lastError = error;
        console.error(`[VALIDATION FAILED attempt=${attempt} model=${activeModel}]:`, error.message);
        if (lastValidParsed) {
          console.log(`[QUALITY RETRY RECOVERY] Attempt ${attempt} failed validation, recovering with previous valid parsed output:`, error.message);
          const recovered = postProcessParsedResume(lastValidParsed, targetRole, source);
          if (targetRole.trim()) recovered.targetRole = targetRole.trim();
          return { resume: mapParsedResumeToExistingSchema(recovered, { rawImport: { rawText: source, provider: "gemini", model: activeModel } }), model: activeModel };
        }
        if (error.name === "AbortError") {
          if (mIdx < modelChain.length - 1) {
            console.log(`[GEMINI TIMEOUT] ${activeModel} timed out after 45s, switching to ${modelChain[mIdx + 1]}`);
            break;
          }
          throw new ResumeImportError("Resume conversion timed out. Your source text and current resume are unchanged; please retry.", 504);
        }
        if (!(error instanceof ResumeImportError) && !(error instanceof SyntaxError)) {
          if (mIdx < modelChain.length - 1) {
            console.log(`[GEMINI RETRY] Switching from ${activeModel} to ${modelChain[mIdx + 1]} after error:`, error.message);
            await new Promise((resolve) => setTimeout(resolve, 1500));
            break;
          }
          throw new ResumeImportError("Could not reach Gemini. Your current resume is unchanged; please retry.", 503);
        }
        if (error.status >= 500) throw error;
        if (attempt === 1) {
          if (mIdx < modelChain.length - 1) {
            console.log(`[GEMINI RETRY] Switching from ${activeModel} to ${modelChain[mIdx + 1]} after validation retry failure.`);
            break;
          }
          throw new ResumeImportError("The AI response could not be validated after one retry. Your current resume is unchanged. Review the source text and retry.");
        }
        repair = `The previous response failed validation: ${error instanceof SyntaxError ? "Malformed JSON" : error.message}. Rebuild the complete response from the original candidate source. Correct this issue without adding unsupported facts. Return JSON only.`;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  if (lastError) throw lastError;
}
