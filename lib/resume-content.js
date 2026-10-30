// Evidence-based content rules for Upload / Convert. No rendering or styles.
import { ATS_KEYWORD_DICTIONARY, extractKeywordsFromJd } from './jd-optimizer.js';
import { extractSourceSkills, ResumeImportError } from './resume-import.js';
import { cleanBullet, cleanProfessionalProse, uniqueContent, uniqueSkills } from './resume-quality.js';
import { jsPDF } from 'jspdf';

export function summaryLineCount(text, pageSize = 'A4') {
  const pdf = new jsPDF({unit:'pt'});
  pdf.setFont('helvetica','normal');pdf.setFontSize(9.8);
  const width=(pageSize==='US Letter'?612:595.28)-2*14.5*72/25.4;
  return pdf.splitTextToSize(String(text||''),width).length;
}

// Extend only from already validated entry evidence. No filler or forced breaks.
function extendSummary(text, resume) {
  let result=String(text||'').trim();
  const candidates=resume.sections.filter(s=>['experience','projects'].includes(s.type))
    .flatMap(s=>s.content.entries.flatMap(e=>e.bullets||[]));
  for(const candidate of candidates){
    if(summaryLineCount(result,resume.documentSettings?.pageSize)>=5)break;
    const sentence=cleanBullet(candidate);
    if(!sentence||containsContentTerm(result,sentence))continue;
    result=cleanProfessionalProse(`${result} ${sentence}`);
  }
  return result;
}

const key = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim().replace(/\s+/g, ' ');
const dateKey = value => key(value).replace(/\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g, '$1');
const canonicalTerm = value => /^(?:(?:MS|Microsoft)\s+)?Excel$/i.test(value) ? 'Microsoft Excel' : value;
const functionalAliases={
  'customer service':['customer support','customer adviser','handle customers','handling customer enquiries'],
  'problem solving':['solve issues','solved issues','problem-solving'],
  'customer relationship management':['CRM'],
};
const aliases = term => [term, ...(term.endsWith('.js') ? [term.slice(0, -3), term.replace('.js', 'js')] : []), ...(/^Microsoft Excel$/i.test(term) ? ['MS Excel', 'Excel'] : []), ...(functionalAliases[key(term)]||[])];
export const containsContentTerm = (text, term) => aliases(term).some(alias => (` ${key(text)} `).includes(` ${key(alias)} `));
const dateRangePattern = /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:19|20)\d{2}\s*[-–—]\s*(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:19|20)\d{2}|Present|Current|Ongoing)\b/i;
const heading = /^(?:(?:professional|work|employment|career|selected|key|technical|core)\s+)?(?:summary|profile|skills?(?:\s*(?:&|and)\s*(?:competencies|attributes))?|competencies|expertise|areas of expertise|personal attributes|experience|history|projects?|education(?:\s*&\s*training)?|academic background|certifications?|qualifications|references?|mentorship|hobbies(?:\s*&\s*interests)?)\s*:?(?:\s*)$/i;
const tools = [...ATS_KEYWORD_DICTIONARY, 'HTML', 'CSS', 'Selenium', 'Pytest', 'Postman', 'Pandas', 'NumPy', 'Polars', 'Pygame', 'Power BI', 'Microsoft Excel', 'Excel', 'Tableau', 'SAS', 'R', 'HubSpot', 'Trello', 'Loomly', 'FastAPI', 'Django', 'LangChain', 'LangGraph', 'AutoGen', 'CrewAI', 'Object-Oriented Programming'];
const technologies = [...ATS_KEYWORD_DICTIONARY.slice(0, ATS_KEYWORD_DICTIONARY.indexOf('Agile')), ...tools.slice(ATS_KEYWORD_DICTIONARY.length)];
const metrics = text => [...String(text).matchAll(/[$₹£€]\s*\d[\d,.]*|\d[\d,.]*\s*%|\d[\d,.]*\s*\+?\s*(?:team\s+)?(?:hours?|users?|clients?|staff|members|customers)\b/gi)].map(m => m[0]);
const metricKey = value => key(value).replace(/\s/g, '');
const unique = values => [...new Map(values.filter(Boolean).map(v => [key(v), v])).values()];
const labelledRequirements = jd => [...jd.matchAll(/(?:skills?|technologies|tools|frameworks|platforms|stack)\s*:\s*([^\n]+)/gi)]
  .flatMap(m=>m[1].split(/[,;]|\s+and\s+/i)).map(s=>s.trim().replace(/[.;]+$/,'')).filter(s=>s&&s.length<=48&&s.split(/\s+/).length<=4);
const entriesOf = (resume, type) => resume.sections.filter(s => s.type === type).flatMap(s => s.content.entries || []);
function candidateSkillEvidence(source) {
  const jobs=sourceEmploymentRecords(source);
  return source.split(/\r?\n/).filter(line=> !/@|https?:\/\//i.test(line)
    && !/^\s*(?:company|employer|name|email|phone|location|address|contact)\s*:/i.test(line)
    && !jobs.some(job=>key(line).startsWith(key(job.title))&&containsContentTerm(line,job.organization))).join('\n')+'\n'+extractSourceSkills(source).join('\n');
}

export function resolveContentTarget(targetRole = '', jobDescription = '') {
  const explicit = jobDescription.match(/(?:^|\n)\s*(?:job\s+title|position(?:\s+title)?|target\s+role|role\s+title)\s*:\s*([^\n|]+)/i)?.[1]?.trim();
  if (explicit && explicit.length <= 100) return explicit.replace(/[.;]+$/, '');
  if (targetRole.trim()) return targetRole.trim();
  const first = jobDescription.split('\n').map(s => s.trim()).find(Boolean) || '';
  if (first && first.length <= 80 && !/^(?:about|we |our |requirements|responsibilities|company|looking for)/i.test(first) && !/[.!?]/.test(first)) return first;
  return jobDescription.match(/(?:looking for|seeking|hiring)\s+(?:an?\s+)?(.{3,80}?)(?=\s+(?:who|with|to|for our)\b|[.,\n]|$)/i)?.[1]?.trim() || '';
}

export function analyzeContentRequirements(source, targetRole, jobDescription) {
  const role = resolveContentTarget(targetRole, jobDescription);
  const extracted = extractKeywordsFromJd(jobDescription, role).keywords;
  const candidates = unique([...tools.filter(t => containsContentTerm(jobDescription, t)), ...labelledRequirements(jobDescription), ...extracted].map(canonicalTerm))
    .filter(t => containsContentTerm(jobDescription, t) && key(t) !== key(role) && !/^(?:full|part|time|years?|experience|position|role|team|work|office)$/i.test(t));
  const skillEvidence=candidateSkillEvidence(source);
  const requirements = candidates.map(term => ({ term, supported: containsContentTerm(skillEvidence, term), importance: jobDescription.split(/[\n.;]/).some(line => /required|must|mandatory|essential/i.test(line) && containsContentTerm(line, term)) ? 'required' : 'relevant' }));
  requirements.sort((a,b)=>Number(b.importance==='required')-Number(a.importance==='required'));
  return { targetRole: role, supportedKeywords: requirements.filter(r => r.supported).map(r => r.term), unsupportedRequirements: requirements.filter(r => !r.supported), requirements };
}

// Use only a source block belonging to this exact entry, never a global skills
// list as evidence that a technology was used for a particular employer/project.
export function sourceRecordFor(entry, source, allEntries = []) {
  const lines = source.split(/\r?\n/).map(s => s.trim());
  const title = key(entry.title), organization = key(entry.organization);
  const matches = lines.map((line, index) => ({ line, index })).filter(({ index }) => title && key(lines.slice(index,index+2).join(' ')).startsWith(title));
  const candidates = matches.filter(({ index }) => !organization || containsContentTerm(lines.slice(index, index + 2).join(' '), entry.organization));
  const anchor = (entry.dateRange ? candidates.find(({index}) => dateKey(lines.slice(index,index+2).join(' ')).includes(dateKey(entry.dateRange))) : null) || (candidates.length === 1 ? candidates[0] : null);
  if (!anchor) return { text: '', dateRange: '', titleVerified: false };
  let end = anchor.index + 1;
  for (; end < lines.length; end++) {
    if (heading.test(lines[end])) break;
    if (allEntries.some(other => other !== entry && other.title && key(lines[end]).startsWith(key(other.title)) && (!other.organization || containsContentTerm(lines.slice(end, end + 2).join(' '), other.organization)))) break;
  }
  const text = lines.slice(anchor.index, end).join('\n');
  const header = lines.slice(anchor.index, Math.min(end, anchor.index + 3)).join('\n');
  return { text, dateRange: header.match(dateRangePattern)?.[0] || '', titleVerified: true };
}

export function sourceEmploymentRecords(source) {
  let inExperience = false;
  const records = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(?:(?:professional|work|employment|career)\s+)?(?:experience|history)\s*:?$/i.test(line)) { inExperience = true; continue; }
    if (inExperience && heading.test(line)) { inExperience = false; continue; }
    if (!inExperience || !line.includes('|') || /^[•*-]/.test(line)) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) continue;
    const dateRange = line.match(dateRangePattern)?.[0] || '';
    records.push({ title: parts[0], organization: parts[1].replace(dateRange, '').trim(), location: (parts[2] || '').replace(dateRange, '').trim(), dateRange, subtitle: '', description: '', bullets: [], url: '' });
  }
  for (const record of records) record.bullets = sourceBullets(sourceRecordFor(record, source, records).text);
  return records;
}

function sourceBullets(record) {
  const lines = record.split('\n').slice(1);
  const bullets = [];
  for (const line of lines) {
    if (!line || dateRangePattern.test(line) || /^https?:/i.test(line)) continue;
    if (/^[•▪*-]\s*/.test(line)) bullets.push(line.replace(/^[•▪*-]\s*/, ''));
    else if (bullets.length && !/\|/.test(line)) bullets[bullets.length - 1] += ` ${line}`;
    else if (!/\|/.test(line)) bullets.push(line);
  }
  return unique(bullets.map(cleanBullet));
}

function verifiedMonths(records, now) {
  const months = new Set();
  for (const record of records) {
    if (!record.dateRange) continue;
    const [start, end] = record.dateRange.split(/\s*[-–—]\s*/);
    // Year-only dates cannot establish exact experience duration.
    if (!/[a-z]/i.test(start) || (!/present|current|ongoing/i.test(end) && !/[a-z]/i.test(end))) continue;
    const from = new Date(`${start} 1`), to = /present|current|ongoing/i.test(end) ? now : new Date(`${end} 1`);
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || from > to) continue;
    for (let m = from.getFullYear() * 12 + from.getMonth(); m < to.getFullYear() * 12 + to.getMonth(); m++) months.add(m);
  }
  return months.size;
}

function truthfulSummary(resume, role, supported, demonstrated) {
  const actualRole = entriesOf(resume, 'experience').some(e => key(e.title) === key(role));
  const opening = actualRole ? `${role} with experience` : `${role} candidate transitioning into the role, with a background`;
  const strengths = supported.slice(0, 5);
  const skills = resume.sections.find(s => s.type === 'skills')?.content.items || [];
  const focus = strengths.length ? strengths : skills.slice(0, 4);
  const work = focus.filter(t => containsContentTerm(demonstrated, t));
  const listed = focus.filter(t => !containsContentTerm(demonstrated, t));
  const projects = entriesOf(resume, 'projects').slice(0, 2);
  const employers=unique(entriesOf(resume,'experience').map(e=>e.organization)).slice(0,2);
  const education=entriesOf(resume,'education')[0];
  return cleanProfessionalProse(`${opening}${work.length ? ` in ${work.join(', ')}` : ' in the documented responsibilities and projects'}. ${listed.length ? `Technical and professional skills include ${listed.join(', ')}. ` : ''}${employers.length ? `Experience includes work with ${employers.join(' and ')}. ` : ''}${projects.length ? `Project work includes ${projects.map(p => p.title).join(' and ')}. ` : ''}${education?.title ? `Education includes ${education.title}.` : ''}`);
}

function polishContribution(value) {
  return cleanBullet(String(value).replace(/^(?:I|we)\s+/i,'')
    .replace(/\bhandle customers\b/gi,'assist customers').replace(/\bsolve issues\b/gi,'resolve issues')
    .replace(/\bhelp in sale\b/gi,'support sales').replace(/\bhelped\b/gi,'assisted')
    .replace(/\b(?:seamlessly|successfully|effectively)\b/gi,'')
    .replace(/([.!?]\s+)([a-z])/g,(_m,prefix,letter)=>prefix+letter.toUpperCase()));
}

export function optimizeResumeContent(input, source, { targetRole = '', jobDescription = '', now = new Date() } = {}) {
  const resume = structuredClone(input);
  const analysis = analyzeContentRequirements(source, targetRole || resume.targetRole, jobDescription);
  const role = analysis.targetRole;
  if (role) resume.targetRole = role;
  const audit = { targetRole: role, supportedKeywords: analysis.supportedKeywords, unsupportedRequirements: analysis.unsupportedRequirements, warnings: [], changes: [] };
  const scopedTechnologies=unique([...technologies,...labelledRequirements(jobDescription).filter(t=>!ATS_KEYWORD_DICTIONARY.some(known=>key(known)===key(t)))]);
  const documentedJobs = sourceEmploymentRecords(source);
  const experienceSection = resume.sections.find(s => s.type === 'experience');
  if (experienceSection) {
    const ambiguous = new Set();
    for (const entry of experienceSection.content.entries) {
      const candidates = documentedJobs.filter(job => containsContentTerm(job.organization, entry.organization) || containsContentTerm(entry.organization, job.organization));
      const original = candidates.find(job => key(job.title) === key(entry.title) && entry.dateRange && dateKey(job.dateRange) === dateKey(entry.dateRange)) || (candidates.length === 1 ? candidates[0] : null);
      if (original && key(entry.title) !== key(original.title)) { entry.title = original.title; audit.changes.push({ code: 'restored_historical_title', entry: original.title }); }
      if (original && !entry.dateRange && original.dateRange) { entry.dateRange=original.dateRange; audit.changes.push({code:'restored_source_dates',entry:entry.title}); }
      if (!original && candidates.length > 1 && !entry.dateRange) ambiguous.add(entry);
    }
    experienceSection.content.entries=experienceSection.content.entries.filter(e=>!ambiguous.has(e));
    for (const original of documentedJobs) if (!experienceSection.content.entries.some(e => key(e.title) === key(original.title) && dateKey(e.dateRange)===dateKey(original.dateRange) && (containsContentTerm(original.organization, e.organization) || containsContentTerm(e.organization, original.organization)))) {
      experienceSection.content.entries.push(structuredClone(original));
      audit.changes.push({ code: 'restored_source_employment', entry: original.title });
    }
  }
  const experience = entriesOf(resume, 'experience'), projects = entriesOf(resume, 'projects');
  const records = new Map([...experience, ...projects].map(entry => [entry, sourceRecordFor(entry, source, [...experience, ...projects])]));
  const demonstrated = [...records].map(([entry,record])=>`${projects.includes(entry)?entry.title:''}\n${sourceBullets(record.text).join('\n')}`).join('\n');
  const skillEvidence=candidateSkillEvidence(source);
  for (const [entry, record] of records) {
    entry.bullets=(entry.bullets||[]).map(polishContribution);
    const type = experience.includes(entry) ? 'experience' : 'project';
    if (!record.titleVerified) {
      audit.warnings.push({ code: 'source_record_unclear', entry: entry.title, message: 'Verify the original title and source record; no historical details were inferred.' });
      if(type==='experience'&&!containsContentTerm(source,entry.title)) {
        audit.warnings.push({code:'unverified_historical_title',entry:entry.title,message:'Historical title is not documented and was left unspecified.'});
        entry.title='';
      }
      if(type==='experience'&&!entry.dateRange)audit.warnings.push({code:'missing_employment_dates',entry:entry.organization,message:'Employment dates are not provided; candidate confirmation required.'});
      continue;
    }
    if (!entry.dateRange && record.dateRange) { entry.dateRange = record.dateRange; audit.changes.push({ code: 'restored_source_dates', entry: entry.title }); }
    if (type === 'experience' && !entry.dateRange) audit.warnings.push({ code: 'missing_employment_dates', entry: entry.title, message: 'Employment dates are not provided; candidate confirmation required.' });
    const originalBullets = sourceBullets(record.text);
    const originalBody = originalBullets.join('\n');
    const entryEvidence = `${type === 'project' ? entry.title : ''}\n${originalBody}`;
    const invalid = scopedTechnologies.filter(t => containsContentTerm((entry.bullets || []).join(' '), t) && !containsContentTerm(entryEvidence, t));
    if (invalid.length) {
      if (originalBullets.length) entry.bullets = originalBullets;
      else throw new ResumeImportError(`Unsupported entry technologies: ${invalid.join(', ')}.`);
      audit.changes.push({ code: 'removed_unsupported_entry_technologies', entry: entry.title, terms: invalid });
    }
    const sourceMetrics = new Set(metrics(originalBody).map(metricKey));
    if (metrics(entry.bullets.join(' ')).some(m=>!sourceMetrics.has(metricKey(m)))) {
      entry.bullets = originalBullets;
      audit.changes.push({code:'removed_unsupported_entry_metrics',entry:entry.title});
    }
    for (const original of originalBullets) {
      const anchors = metrics(original);
      const body = entry.bullets.join('\n');
      const presentMetrics = new Set(metrics(body).map(metricKey));
      const missingMetric = anchors.some(a => !presentMetrics.has(metricKey(a)));
      const lostQualifier = anchors.length && /estimated|projected|potential/i.test(original) && !/estimated|projected|potential/i.test(body);
      const importantDetails = type === 'project' && original.split(/\s+/).length >= 8 && (
        technologies.some(t => containsContentTerm(original, t) && !containsContentTerm(body, t)) ||
        /\b(?:collision detection|health tracking|keyboard|reservation|booking|authentication|data cleaning|dashboard|reporting|API)\b/i.test(original) && key(original).split(' ').filter(w => w.length > 4 && !containsContentTerm(body, w)).length >= 3);
      if (missingMetric || lostQualifier || importantDetails) {
        if (lostQualifier) entry.bullets = entry.bullets.filter(b => !anchors.some(a => metricKey(b).includes(metricKey(a))));
        const weak = entry.bullets.findIndex(b=>b.split(/\s+/).length<10 && (importantDetails || missingMetric && key(b).split(' ').filter(w=>w.length>4&&!/^(?:assisted|supported|handled|built|developed|managed|maintained)$/.test(w)).every(w=>containsContentTerm(original,w))));
        if (weak >= 0) entry.bullets[weak]=original;
        else entry.bullets.push(original);
        audit.changes.push({ code: missingMetric || lostQualifier ? 'preserved_source_achievement' : 'restored_project_details', entry: entry.title });
      }
    }
    entry.bullets = uniqueContent(entry.bullets.map(polishContribution));
    if (type === 'project') {
      const tech = technologies.filter(t => containsContentTerm(originalBody, t));
      if (!tech.length) audit.warnings.push({ code: 'project_technology_unspecified', entry: entry.title, message: 'Project technologies are not documented; no stack was invented.' });
      const links = unique(record.text.match(/https?:\/\/[^\s<>"()]+/g) || []);
      if (!entry.url && links.length) {
        entry.url=links[0];
        if(links.length>1)entry.description=unique([entry.description,...links.slice(1)]).join('\n');
      }
    }
  }
  const skillsSection = resume.sections.find(s => s.type === 'skills');
  if (skillsSection) {
    const sourceSkills = extractSourceSkills(source);
    skillsSection.content.items = unique([...(skillsSection.content.items || []), ...sourceSkills].map(canonicalTerm))
      .filter(skill => containsContentTerm(skillEvidence, skill) || sourceSkills.some(s => containsContentTerm(s, skill)));
    for (const term of analysis.supportedKeywords) if (!skillsSection.content.items.some(s => containsContentTerm(s, term))) skillsSection.content.items.push(term);
    const rank = skill => { const index=analysis.supportedKeywords.findIndex(t=>containsContentTerm(skill,t));return index<0?analysis.supportedKeywords.length:index; };
    skillsSection.content.items = uniqueSkills(skillsSection.content.items);
    skillsSection.content.items.sort((a,b)=>rank(a)-rank(b));
  }
  const summary = resume.sections.find(s => s.type === 'summary');
  if (summary && role) {
    const text = summary.content.text || '';
    const months = verifiedMonths(experience.map(e => records.get(e)), now);
    const roleKey = value => key(value).replace(/\b(?:senior|junior|lead|principal)\s+/g, '').trim();
    const roleMonths = verifiedMonths(experience.filter(e=>roleKey(e.title)===roleKey(role)).map(e=>records.get(e)),now);
    const claims = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*\+?\s*years?\s+(?:of\s+)?experience\b/gi)];
    const unsupportedDuration = claims.some(m => Number(m[1]) * 12 > roleMonths);
    const firstSentence = text.split(/[!?]|\.(?:\s|$)/)[0];
    const unrelatedOpening = experience.some(e => key(e.title) !== key(role) && containsContentTerm(firstSentence, e.title));
    const unsupportedIdentity = !experience.some(e=>roleKey(e.title)===roleKey(role)) && containsContentTerm(firstSentence,role) && !/\b(?:candidate|pursuing|transition|transitioning|targeting|seeking|aspiring|opportunities|towards?)\b/i.test(firstSentence);
    const unsupportedSummaryTools=scopedTechnologies.filter(t=>containsContentTerm(text,t)&&!containsContentTerm(skillEvidence,t));
    if (!containsContentTerm(firstSentence, role) || unsupportedDuration || unrelatedOpening || unsupportedIdentity || unsupportedSummaryTools.length) {
      summary.content.text = truthfulSummary(resume, role, analysis.supportedKeywords, demonstrated);
      audit.changes.push({ code: 'aligned_summary', reason: unsupportedDuration ? 'unsupported_duration' : 'target_role_alignment' });
    }
    if(unsupportedSummaryTools.length)audit.changes.push({code:'removed_unsupported_summary_technologies',terms:unsupportedSummaryTools});
    if (unsupportedDuration) audit.warnings.push({ code: 'unsupported_experience_duration', message: 'A source summary duration was not supported by dated employment records and was omitted.' });
    summary.content.text=extendSummary(summary.content.text,resume);
    if(summaryLineCount(summary.content.text,resume.documentSettings?.pageSize)<5)
      audit.warnings.push({code:'summary_evidence_limited',message:'Insufficient verified detail for a five-line summary; no information was invented.'});
    audit.verifiedEmploymentMonths = months;
    audit.verifiedRoleMonths = roleMonths;
  }
  audit.employmentEvidence=experience.map(e=>({title:e.title,employer:e.organization,dateRange:e.dateRange,type:/intern/i.test(e.title)?'internship':/freelance/i.test(e.title)?'freelance':'employment',sourceVerified:records.get(e).titleVerified}));
  projects.sort((a, b) => analysis.supportedKeywords.filter(t => containsContentTerm(records.get(b).text, t)).length - analysis.supportedKeywords.filter(t => containsContentTerm(records.get(a).text, t)).length);
  // Only entry emphasis changes; section order and all layout properties stay intact.
  let projectIndex = 0;
  for (const section of resume.sections.filter(s => s.type === 'projects')) section.content.entries = section.content.entries.map(() => projects[projectIndex++]);
  audit.skillsListedOnly = (skillsSection?.content.items || []).filter(skill => !containsContentTerm(demonstrated, skill));
  return { resume, audit };
}
