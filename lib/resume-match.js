// Server-only heuristic. Missing qualifications lower the score; they never become facts.
import { analyzeContentRequirements, containsContentTerm, optimizeResumeContent } from './resume-content.js';
import { validateParsedResume } from './resume-import.js';
import { jsPDF } from 'jspdf';

// Measure printed width, not character count: W and i occupy different widths.
export function bulletDensity(resume) {
  const pdf=new jsPDF({unit:'pt'});pdf.setFont('helvetica','normal');pdf.setFontSize(10.5);
  const width=(resume.documentSettings?.pageSize==='US Letter'?612:595.28)-2*14.5*72/25.4-9;
  const entries=resume.sections.flatMap((s,si)=>['experience','projects'].includes(s.type)?s.content.entries.map((e,ei)=>({id:`${si}:${ei}`,title:e.title,bullets:e.bullets.map(text=>({text,lines:Number((pdf.getTextWidth(text)/width).toFixed(2))}))})):[]);
  const values=entries.flatMap(e=>e.bullets);
  return {entries,error:values.length?values.reduce((n,b)=>n+Math.max(0,Math.abs(b.lines-1.5)-0.15),0)/values.length:0,target:'1.35–1.65 lines of measured text, normally two printed lines with a half-full final line. Preserve evidence; never pad a sparse fact.'};
}

export function prepareJobDescription(value, limit = 16000) {
  const text = String(value || '').normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (text.length <= limit) return text;
  let priority = false;
  const lines = text.split('\n').flatMap(line=>line.length>limit ? (line.match(/.{1,500}(?:\s|$)|\S{1,500}/gu)||[]) : [line]).map((line, index) => {
    if (/requirements|qualifications|responsibilities|required|essential|preferred|what you|skills/i.test(line)) priority = true;
    if (/benefits|about us|equal opportunity|how to apply/i.test(line)) priority = false;
    return { line, index, rank: index < 3 ? 3 : priority ? 2 : 1 };
  });
  let remaining = limit;
  return lines.sort((a,b)=>b.rank-a.rank || a.index-b.index).filter(item => {
    if (item.line.length + 1 > remaining) return false;
    remaining -= item.line.length + 1; return true;
  }).sort((a,b)=>a.index-b.index).map(item=>item.line).join('\n');
}

export function buildKeywordMap(source, role, jd) {
  const analysis = analyzeContentRequirements(source, role, jd);
  let mode = 'relevant';
  const lines = jd.split('\n').map(text => {
    if (/preferred|nice.to.have|bonus|desirable/i.test(text)) mode = 'preferred';
    else if (/required|requirements|must.have|mandatory|essential|qualifications/i.test(text)) mode = 'required';
    else if (/responsibilities|about us|benefits/i.test(text)) mode = 'relevant';
    return { text, mode };
  });
  const headings=/^(?:(?:required|preferred|mandatory|essential|key|core|technical|soft|hard)\s+)?(?:skills?|qualifications?|requirements?|responsibilities|preferred|bonus|about us|benefits)$/i;
  return analysis.requirements.filter(item=>!headings.test(item.term.trim())).map(item => {
    const occurrences = lines.filter(line=>containsContentTerm(line.text,item.term));
    const importance = occurrences.some(line=>line.mode==='required') ? 'required' : occurrences.length && occurrences.every(line=>line.mode==='preferred') ? 'preferred' : item.importance;
    const frequency = Math.max(1, jd.toLowerCase().split(item.term.toLowerCase()).length-1);
    const aliases={'seo':['Search Engine Optimization'],'search engine optimization':['SEO'],'crm':['Customer Relationship Management'],'customer relationship management':['CRM'],'javascript':['Java Script'],'microsoft excel':['MS Excel','Excel']};
    const synonyms=aliases[item.term.toLowerCase()]||[];
    return { keyword:item.term, importance, present_in_resume:item.supported||synonyms.some(s=>containsContentTerm(source,s)), synonyms, frequency,
      weight:(importance==='required'?3:importance==='preferred'?1:2)*(1+Math.min(frequency-1,3)*0.15) };
  });
}

const words = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#%]+/gu,' ').trim();
const fraction = (values, predicate) => values.length ? values.filter(predicate).length/values.length : 0;
const bodyText = resume => resume.sections.map(s=>s.content.text || s.content.items?.join(' ') || s.content.entries?.map(e=>[e.title,e.organization,e.description,...e.bullets].join(' ')).join(' ') || '').join('\n');
const bulletsOf = resume => resume.sections.filter(s=>['experience','projects'].includes(s.type)).flatMap(s=>s.content.entries.flatMap(e=>e.bullets));
const action = /^(?:managed?|manages|coordinat\w+|resolv\w+|support\w+|develop\w+|improv\w+|deliver\w+|maintain\w+|collaborat\w+|achiev\w+|built|build\w*|design\w+|analy[sz]\w+|assist\w+|implement\w+|creat\w+|automat\w+|test\w+|monitor\w+|process\w+|handl\w+|respond\w+|reduc\w+|increas\w+|generat\w+|led|lead\w*|conduct\w+|review\w+|prepar\w+|report\w+|wrote|write\w*|complet\w+|optim\w+|organiz\w+|organis\w+|train\w+|serv\w+)\b/i;

export function scoreResumeMatch(resume, source, role, jd) {
  const map=buildKeywordMap(source,role,jd), text=bodyText(resume);
  const summary=resume.sections.find(s=>s.type==='summary')?.content.text || '';
  const skills=resume.sections.find(s=>s.type==='skills')?.content.items || [];
  const bullets=bulletsOf(resume);
  const weight=map.reduce((n,k)=>n+k.weight,0);
  const covered=map.filter(k=>k.present_in_resume&&containsContentTerm(text,k.keyword));
  const required=map.filter(k=>k.importance==='required');
  const keyword=weight?40*covered.reduce((n,k)=>n+k.weight,0)/weight:0;
  const supported=map.filter(k=>k.present_in_resume);
  const missingKeywords=map.filter(k=>!covered.includes(k)).map(k=>k.keyword);
  const categories={
    keywords:keyword,
    summary:role&&containsContentTerm(summary.split(/[.!?]/)[0],role)?6+(summary.split(/\s+/).length>=35?2:0)+(supported.some(k=>containsContentTerm(summary,k.keyword))?2:0):0,
    skills:skills.length?4*fraction(skills,s=>containsContentTerm(source,s))+6*fraction(supported,k=>skills.some(s=>containsContentTerm(s,k.keyword))):0,
    experience:8*fraction(bullets,b=>action.test(b))
      +4*fraction(bullets,b=>b.split(/\s+/).length>=8&&b.length<=260&&!/\b(?:I|my|we|our)\b/.test(b))
      +4*fraction(bullets,b=>supported.some(k=>containsContentTerm(b,k.keyword)))
      +4*fraction(bullets,b=>/\d|\b(?:to|through|using|support\w*|enabl\w*|resolv\w*)\b/i.test(b)),
    parsing:10*(Number(Boolean(resume.profile?.fullName))+Number(Boolean(resume.profile?.email||resume.profile?.phone))+Number(Boolean(summary))+Number(resume.sections.every(s=>Boolean(s.title)))+Number(!/[\u0000-\u0008\ufffd]/.test(text)))/5,
    cleanliness:10*(1-fraction(bullets,(b,i)=>!b.trim()||/Delivered\s+(?:deliver|achiev|resolv|serv|produc)/i.test(b)||bullets.findIndex(x=>words(x)===words(b))!==i)),
  };
  // Dates missing from the source are not filled to earn points.
  const jobs=resume.sections.filter(s=>s.type==='experience').flatMap(s=>s.content.entries);
  if(jobs.some(e=>!e.dateRange))categories.cleanliness=Math.max(0,categories.cleanliness-2);
  return {label:'Estimated ATS/JD Match Score',score:Math.round(Object.values(categories).reduce((a,b)=>a+b,0)),categories,
    missingKeywords,unsupportedRequirements:map.filter(k=>!k.present_in_resume).map(k=>k.keyword),
    requiredCoverage:required.length?Math.round(100*fraction(required,k=>covered.includes(k))):null,
    keywordMap:map,weakest:Object.entries(categories).sort((a,b)=>a[1]/({keywords:40,summary:10,skills:10,experience:20,parsing:10,cleanliness:10}[a[0]])-b[1]/({keywords:40,summary:10,skills:10,experience:20,parsing:10,cleanliness:10}[b[0]])).slice(0,2).map(([key])=>key)};
}

function facts(resume) {
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
  return JSON.stringify(stable({profile:resume.profile,sections:resume.sections.map(s=>({type:s.type,title:s.title,
    content:['summary','skills','experience','projects'].includes(s.type)?undefined:s.content,
    entries:s.content.entries?.map(({bullets,description,...entry})=>entry)}))}));
}

export function validateRefinement(payload, baseline, source, role) {
  const validated=validateParsedResume(payload,source,{targetRole:role});
  if(facts(validated)!==facts(baseline))throw new Error('Refinement changed protected candidate facts or section structure');
  const before=bodyText(baseline).match(/\b\d+(?:[.,]\d+)*(?:%|\+)?/g)||[];
  const after=bodyText(validated).match(/\b\d+(?:[.,]\d+)*(?:%|\+)?/g)||[];
  if(before.some(n=>!after.includes(n))||after.some(n=>!before.includes(n)))throw new Error('Refinement changed numerical evidence');
  return validated;
}

export async function refineResumeMatch(initial, source, role, jd, request, maxIterations=2) {
  let best=optimizeResumeContent(initial,source,{targetRole:role,jobDescription:jd}).resume;
  const keywords=buildKeywordMap(source,role,jd).filter(k=>k.present_in_resume);
  const rank=text=>keywords.reduce((sum,k)=>sum+(containsContentTerm(text,k.keyword)?k.weight:0),0);
  for(const section of best.sections){
    if(['experience','projects'].includes(section.type))for(const entry of section.content.entries)entry.bullets.sort((a,b)=>rank(b)-rank(a));
    if(section.type==='skills')section.content.items.sort((a,b)=>rank(b)-rank(a));
    if(section.type==='experience'){
      const date=entry=>{const start=entry.dateRange?.split(/\s*[-–—]\s*/)[0];const parsed=Date.parse(start);return Number.isFinite(parsed)?parsed:null;};
      // Unknown dates retain their slots; known roles are newest first.
      const dated=section.content.entries.filter(e=>date(e)!==null).sort((a,b)=>date(b)-date(a));
      let index=0;section.content.entries=section.content.entries.map(e=>date(e)===null?e:dated[index++]);
    }
  }
  let report=scoreResumeMatch(best,source,role,jd);
  let density=bulletDensity(best);
  const before=report.score;
  for(let iteration=0;iteration<Math.min(2,maxIterations)&&(report.score<95||density.error>0.08);iteration++) {
    try {
      const payload=await request({resume:best,weakest:report.weakest,keywordMap:report.keywordMap,bulletDensity:density});
      const validated=validateRefinement(payload,best,source,role);
      const next=optimizeResumeContent(validated,source,{targetRole:role,jobDescription:jd}).resume;
      const nextReport=scoreResumeMatch(next,source,role,jd);
      const nextDensity=bulletDensity(next);
      if(nextReport.score>report.score || nextReport.score===report.score&&nextDensity.error<density.error){best=next;report=nextReport;density=nextDensity;}
    } catch { /* Failed optional refinements must retain the best validated result. */ }
  }
  return {resume:best,report,before};
}
