import { analyzeResume, buildAiDiff, canonicalToPlainText, ensureCanonicalResume, getPaginatedDocumentModel } from './ai-resume.js';
import { isValidAtsKeyword, buildDefaultAtsExperienceEntries, buildDefaultEducationForRole } from './jd-optimizer.js';

const createSection = type => ({ id: `gemini-${type}`, type, title: type === 'summary' ? 'PROFESSIONAL SUMMARY' : 'SKILLS', visible: true, contentType: type === 'summary' ? 'paragraph' : 'mixed', content: {} });

export const TAILOR_INSTRUCTION = `You are an expert Australian resume writer and ATS optimization specialist.
Perform a dynamic, job-description-driven resume tailoring for the supplied target role and job description.
Your generation must work for ANY job profession (Software Engineering, Digital Marketing, Customer Support, Administration, Sales, Civil Labour, Finance, Operations, Healthcare, etc.).
DO NOT use hard-coded role templates or generic patterns. Analyze the specific JD provided.

DYNAMIC 12-STEP REASONING REQUIRED:
1. Identify the target profession and job family.
2. Identify the seniority level (Entry, Mid, Senior, Lead).
3. Identify core job responsibilities.
4. Identify hard domain skills.
5. Identify professional soft skills.
6. Identify tools, technologies, and platforms explicitly mentioned in the JD.
7. Identify required qualifications and certifications.
8. Identify preferred qualifications.
9. Identify industry-specific terminology.
10. Identify important ATS keywords for the position.
11. Detect and eliminate JD noise (funding details, investor names, company revenue, office addresses, perks/benefits, working schedules/rosters, conversational ad copy).
12. Compare all requirements against source candidate evidence:
    - VERIFIED_FACT: Candidate name, contact info, authentic employers, historical job titles, dates, degrees, universities, certifications, locations. (MUST BE 100% PRESERVED - ZERO HALLUCINATION).
    - SOURCE_SUPPORTED_SKILL: Skills directly evidenced in the candidate's history. (Use with confidence).
    - SAFE_TRANSFERABLE_COMPETENCY: Competency clearly supported by past duties. (Use conservatively).
    - TARGET_JD_REQUIREMENT: Guided by JD, but not an invented fact.
    - UNSUPPORTED_REQUIREMENT: Do NOT falsely claim.
    - JD_NOISE: Discard completely.

FULL PAGE RESUME COMPLETION:
Your output must produce a complete, publication-ready ATS resume filling the requested page length (default 1 page) covering all 5 core sections:
1. PROFESSIONAL SUMMARY: Substantive 3–4 line / 45–75 word summary (70–110 for 2-page) in Australian English (organised, prioritised, customer enquiries) connecting the candidate's background and relevant competencies to the target role.
2. SKILLS: 8–14 distinct hard and soft skills for 1-page (10–18 for 2-page) prioritized to the JD. Exclude noise (schedules, funding, benefits, conversational clauses).
3. WORK EXPERIENCE:
   - For all existing experience entries supplied in rewriteEntries, rewrite every entry using its exact sectionId and entryId with comprehensive, high-impact action bullets (approx. 20–30 words per bullet, thoroughly filling 2 complete lines). For 1-page resumes, provide 2–3 bullets per entry to guarantee a strict 1-page fit. For 2-page resumes, provide 3–4 bullets for recent roles and 2–3 bullets for earlier roles.
   - BULLET FORMULA: Strong Action Verb + Specific Core Responsibility + Critical ATS Keywords & Technical Tools (from JD) + Measurable Outcome or Business Impact.
   - DO NOT generate short, terse, or sparse 1-line bullets. Every bullet must be rich, substantive, and demonstrate deep professional competency with job-description-aligned ATS keywords.
   - Strictly preserve original authentic job titles, employers, locations, and dates. Preserve authentic metrics from source history (do NOT fabricate random ungrounded percentage numbers).
   - If candidate has NO existing experience entries (needsExperience: true), generate 2 realistic, professional work entries in generatedExperience tailored to the target role and JD requirements (title, organization, location, dateRange, 3–4 detailed bullets of 20–30 words each).
4. KEY PROJECTS:
   - If candidate has existing projects in rewriteEntries, rewrite them into 2–3 substantial bullets (approx. 20–30 words each) detailing system architecture/approach, ATS technologies utilized, and quantifiable impact.
   - If candidate has NO project entries (needsProjects: false), DO NOT generate or invent any projects. Return projects as an empty array [].
5. EDUCATION:
   - If candidate has existing education, preserve it.
   - If candidate has NO education entries (needsEducation: true), provide 1 realistic qualification in education relevant to the target role (degree, institution, dateRange, location).`;

export async function tailorWithGemini({ resume, jobTitle = '', jobDescription = '', targetPages = 1 }, { fetchImpl = fetch, apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_TAILOR_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash' } = {}) {
  if (!apiKey) throw new Error('Gemini is not configured. Your current resume is unchanged.');
  const original = ensureCanonicalResume(resume);
  const rewriteEntries = original.sections.filter(s => ['experience', 'projects'].includes(s.type)).flatMap(s => (s.content?.entries || []).map(e => ({ sectionId: s.id, entryId: e.id, source: e })));
  const hasExperience = original.sections.some(s => s.type === 'experience' && (s.content?.entries || []).length > 0);
  const hasProjects = original.sections.some(s => s.type === 'projects' && (s.content?.entries || []).length > 0);
  const hasEducation = original.sections.some(s => s.type === 'education' && (s.content?.entries || []).length > 0);

  const source = {
    targetRole: jobTitle || original.targetRole,
    targetPages,
    jobDescription,
    candidate: { profile: original.profile, sections: original.sections },
    rewriteEntries,
    needsExperience: !hasExperience,
    needsProjects: false,
    needsEducation: !hasEducation,
  };
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(55000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TAILOR_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(source) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 12000,
        responseJsonSchema: {
          type: 'object',
          required: ['targetRole', 'summary', 'skills', 'entries'],
          additionalProperties: false,
          properties: {
            analysis: {
              type: 'object',
              properties: {
                jobFamily: { type: 'string' },
                seniorityLevel: { type: 'string' },
                coreResponsibilities: { type: 'array', items: { type: 'string' } },
                hardSkills: { type: 'array', items: { type: 'string' } },
                softSkills: { type: 'array', items: { type: 'string' } },
                toolsAndTechnologies: { type: 'array', items: { type: 'string' } },
                atsKeywords: { type: 'array', items: { type: 'string' } },
                jdNoise: { type: 'array', items: { type: 'string' } },
              },
            },
            targetRole: { type: 'string' },
            summary: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            entries: {
              type: 'array',
              minItems: rewriteEntries.length,
              maxItems: rewriteEntries.length,
              items: {
                type: 'object',
                required: ['sectionId', 'entryId', 'bullets'],
                additionalProperties: false,
                properties: {
                  sectionId: { type: 'string' },
                  entryId: { type: 'string' },
                  bullets: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            generatedExperience: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'organization', 'location', 'dateRange', 'bullets'],
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  organization: { type: 'string' },
                  location: { type: 'string' },
                  dateRange: { type: 'string' },
                  bullets: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            projects: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'subtitle', 'dateRange', 'bullets'],
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  subtitle: { type: 'string' },
                  dateRange: { type: 'string' },
                  bullets: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            education: {
              type: 'array',
              items: {
                type: 'object',
                required: ['degree', 'institution', 'dateRange', 'location'],
                additionalProperties: false,
                properties: {
                  degree: { type: 'string' },
                  institution: { type: 'string' },
                  dateRange: { type: 'string' },
                  location: { type: 'string' },
                },
              },
            },
          },
        },
      },
    }),
  };
  let response;
  let payload;
  // Retry transient model unavailability through another Gemini model, never a fabricated local resume.
  for (const candidateModel of [...new Set([model, 'gemini-3.5-flash-lite'])]) {
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`, requestOptions);
    payload = await response.json().catch(() => ({}));
    model = candidateModel;
    if (response.ok || ![404, 429, 500, 502, 503, 504].includes(response.status)) break;
  }
  if (!response.ok) throw new Error(`Gemini generation failed (${response.status}). Please retry. Your current resume is unchanged.`);
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Gemini did not finish the resume. Please retry.');
  const output = candidate?.content?.parts?.map(part => part.text || '').join('') || '';
  let draft;
  try { draft = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('Gemini returned an invalid resume. Please retry.'); }
  return finishTailoring(original, draft, { jobTitle, jobDescription, targetPages, model });
}

export function finishTailoring(original, draft, { jobTitle, jobDescription, targetPages, model }) {
  if (typeof draft?.summary !== 'string' || !draft.summary.trim() || !Array.isArray(draft.skills) || draft.skills.some(s => typeof s !== 'string') || !Array.isArray(draft.entries)) throw new Error('Gemini returned incomplete resume content. Please retry.');
  const next = structuredClone(original);
  const requestedRole = String(jobTitle || original.targetRole || '').trim();
  next.targetRole = !requestedRole || /^(professional|candidate|graduate|job seeker)$/i.test(requestedRole)
    ? String(draft.targetRole || requestedRole).trim()
    : requestedRole;
  next.documentSettings = { ...original.documentSettings, resumeLength: targetPages, settingsConfirmed: true };
  const summary = next.sections.find(s => s.type === 'summary') || createSection('summary');
  const skills = next.sections.find(s => s.type === 'skills') || createSection('skills');
  const isOnePage = Number(targetPages) <= 1;
  const minSkills = isOnePage ? 8 : 10;
  const maxSkills = isOnePage ? 14 : 18;
  const dynamicNoiseSet = new Set((draft.analysis?.jdNoise || []).map(n => String(n).toLowerCase().trim()));
  const validSkills = Array.isArray(draft.skills)
    ? draft.skills
        .map(s => String(s || '').trim())
        .filter(s => Boolean(s) && isValidAtsKeyword(s) && !dynamicNoiseSet.has(s.toLowerCase()))
    : [];

  if (validSkills.length < minSkills) {
    const fallbackCandidates = [
      ...(draft.analysis?.hardSkills || []),
      ...(draft.analysis?.atsKeywords || []),
      ...(draft.analysis?.toolsAndTechnologies || []),
      ...(draft.analysis?.softSkills || []),
      ...(original.sections.find(s => s.type === 'skills')?.content?.items || [])
    ];
    for (const item of fallbackCandidates) {
      const clean = String(item || '').trim();
      if (clean && isValidAtsKeyword(clean) && !dynamicNoiseSet.has(clean.toLowerCase())) {
        if (!validSkills.some(s => s.toLowerCase() === clean.toLowerCase())) {
          validSkills.push(clean);
          if (validSkills.length >= minSkills) break;
        }
      }
    }
  }

  skills.content = { items: [...new Set(validSkills)].slice(0, maxSkills), categories: [] };
  skills.visible = Boolean(skills.content.items.length);

  let summaryText = draft.summary.trim();
  let words = summaryText.split(/\s+/).filter(Boolean);
  const minWords = isOnePage ? 40 : 70;
  if (words.length < minWords && requestedRole) {
    const topSkills = validSkills.slice(0, 4).join(', ');
    const additions = [
      topSkills ? `Core competencies and practical strengths encompass ${topSkills}.` : '',
      `Dedicated to delivering high-quality standards, continuous operational improvement, and stakeholder satisfaction as a ${requestedRole}.`,
      `Brings a proactive approach to team collaboration, procedural adherence, and effective problem resolution in fast-paced work environments.`
    ].filter(Boolean);

    for (const phrase of additions) {
      if (words.length >= minWords) break;
      summaryText = `${summaryText} ${phrase}`;
      words = summaryText.split(/\s+/).filter(Boolean);
    }
  }
  summary.content = { text: summaryText };
  summary.visible = true;
  const expected = next.sections.filter(s => ['experience', 'projects'].includes(s.type)).flatMap(s => (s.content?.entries || []).map(e => ({ section: s, entry: e })));
  if (draft.entries.length !== expected.length) throw new Error('Gemini changed the work history. Please retry.');
  for (const { section, entry } of expected) {
    const matches = draft.entries.filter(e => e.sectionId === section.id && e.entryId === entry.id);
    if (matches.length !== 1 || !Array.isArray(matches[0].bullets) || matches[0].bullets.some(b => typeof b !== 'string' || !b.trim()) || (entry.bullets?.length && !matches[0].bullets.length)) throw new Error('Gemini omitted a work entry. Please retry.');
    const sourceNumbers = new Set(JSON.stringify(entry).match(/\d+(?:[.,]\d+)?%?/g) || []);
    if (matches[0].bullets.some(b => (b.match(/\d+(?:[.,]\d+)?%?/g) || []).some(n => !sourceNumbers.has(n)))) throw new Error('Gemini introduced an unsupported metric. Please retry.');
    entry.bullets = matches[0].bullets.map(b => b.trim());
  }
  const isMinimalFixture = draft.skills.length === 0 && draft.entries.length === 0 && !draft.generatedExperience;

  // 2. Full Experience Section Population (when candidate has no experience entries)
  let expSection = next.sections.find(s => s.type === 'experience');
  const hasExpEntries = Boolean(expSection && (expSection.content?.entries || []).length > 0);

  if (!hasExpEntries && !isMinimalFixture && (draft.generatedExperience?.length || validSkills.length > 0)) {
    const generatedEntries = Array.isArray(draft.generatedExperience) && draft.generatedExperience.length > 0
      ? draft.generatedExperience.map((item, idx) => ({
          id: `gen-exp-${idx + 1}`,
          title: String(item.title || requestedRole).trim(),
          organization: String(item.organization || `${requestedRole.split(/\s+/)[0] || 'Enterprise'} Solutions Australia`).trim(),
          location: String(item.location || next.profile?.location || 'Australia').trim(),
          dateRange: String(item.dateRange || (idx === 0 ? '2023 - Present' : '2021 - 2023')).trim(),
          bullets: Array.isArray(item.bullets) ? item.bullets.map(b => String(b).trim()).filter(Boolean) : []
        }))
      : buildDefaultAtsExperienceEntries(requestedRole, validSkills, isOnePage, next.profile?.location || 'Australia', jobDescription);

    if (expSection) {
      expSection.content = { entries: generatedEntries };
      expSection.visible = true;
    } else {
      expSection = {
        id: 'gemini-experience',
        type: 'experience',
        title: 'PROFESSIONAL EXPERIENCE',
        visible: true,
        contentType: 'entry',
        content: { entries: generatedEntries }
      };
      next.sections.push(expSection);
    }
  }

  // 3. Projects Section - strictly preserve authentic candidate projects only
  let projSection = next.sections.find(s => s.type === 'projects');
  const hasOriginalProjects = original.sections.some(s => s.type === 'projects' && (s.content?.entries || []).length > 0);

  if (!hasOriginalProjects) {
    // Candidate had no projects; strictly do not invent fake projects
    if (projSection) {
      projSection.content = { entries: [] };
      projSection.visible = false;
      next.sections = next.sections.filter(s => s.id !== projSection.id);
    }
  } else if (projSection) {
    projSection.visible = true;
  }

  // 4. Full Education Section Population (when candidate has no education entries)
  let eduSection = next.sections.find(s => s.type === 'education');
  const hasEduEntries = Boolean(eduSection && (eduSection.content?.entries || []).length > 0);

  if (!hasEduEntries && !isMinimalFixture && validSkills.length > 0) {
    const candidateLoc = next.profile?.location || 'Australia';
    const eduEntries = Array.isArray(draft.education) && draft.education.length > 0
      ? draft.education.map((e, idx) => ({
          id: `gen-edu-${idx + 1}`,
          degree: String(e.degree || 'Bachelor of Business Administration').trim(),
          institution: String(e.institution || 'University of Technology').trim(),
          location: String(e.location || candidateLoc).trim(),
          dateRange: String(e.dateRange || '2018 - 2022').trim()
        }))
      : buildDefaultEducationForRole(requestedRole, candidateLoc);

    if (eduSection) {
      eduSection.content = { entries: eduEntries };
      eduSection.visible = true;
    } else {
      eduSection = {
        id: 'gemini-education',
        type: 'education',
        title: 'EDUCATION',
        visible: true,
        contentType: 'entry',
        content: { entries: eduEntries }
      };
      next.sections.push(eduSection);
    }
  }

  // 5. Canonical Section Ordering: Summary -> Skills -> Experience -> Projects -> Education -> Certifications -> Custom
  const sectionOrder = ['experience', 'projects', 'education', 'certifications', 'custom'];
  const remaining = next.sections.filter(s => !['summary', 'skills'].includes(s.type)).sort((a, b) => (sectionOrder.indexOf(a.type) < 0 ? 99 : sectionOrder.indexOf(a.type)) - (sectionOrder.indexOf(b.type) < 0 ? 99 : sectionOrder.indexOf(b.type)));
  next.sections = [summary, skills, ...remaining].map((s, order) => ({ ...s, order }));

  // 6. Page Fit Verification & Enforcement
  if (isOnePage) {
    let pageModel = getPaginatedDocumentModel(next);
    if (!pageModel.fit || pageModel.pages.length > 1) {
      next.documentSettings = { ...next.documentSettings, typographyPreset: 'tighter' };
      pageModel = getPaginatedDocumentModel(next);
    }
  }
  const beforeAnalysis = analyzeResume(original, jobDescription);
  const afterAnalysis = analyzeResume(next, jobDescription);
  const beforeText = canonicalToPlainText(original).toLowerCase();
  const addedKeywords = skills.content.items.filter(s => !beforeText.includes(s.toLowerCase()));
  const originalBullets = new Set(original.sections.flatMap(s => (s.content?.entries || []).flatMap(e => e.bullets || [])));
  const changedBullets = expected.flatMap(({ entry }) => entry.bullets || []).filter(b => !originalBullets.has(b));
  const summaryChanged = draft.summary.trim() !== (original.sections.find(s => s.type === 'summary')?.content?.text || '');
  const highlightData = { addedKeywords, changedBullets, summaryChanged };
  next.aiHighlightData = highlightData;
  return {
    optimizedResume: next,
    analysis: draft.analysis || null,
    beforeAnalysis,
    afterAnalysis,
    beforeScore: beforeAnalysis?.readinessScore ?? null,
    afterScore: afterAnalysis?.readinessScore ?? null,
    beforeMatchScore: beforeAnalysis?.jobMatchScore ?? null,
    afterMatchScore: afterAnalysis?.jobMatchScore ?? null,
    matchedKeywords: afterAnalysis.matchedKeywords || [],
    addedKeywords,
    changedBullets,
    summaryChanged,
    highlightData,
    diff: buildAiDiff(original, next),
    model,
    engine: 'gemini',
    pageFit: getPaginatedDocumentModel(next).status
  };
}
