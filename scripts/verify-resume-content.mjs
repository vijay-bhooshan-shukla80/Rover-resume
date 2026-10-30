// Reusable synthetic regression and document-parity check. --live also tests Gemini.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {technical,service,fresher,senior} from '../tests/fixtures/import-candidates.mjs';
import {parseResumeWithGemini} from '../lib/gemini-resume-import.js';
import {optimizeResumeContent} from '../lib/resume-content.js';
import {createDefaultWorkingResume,buildDocxFromCanonical,getPaginatedDocumentModel} from '../lib/ai-resume.js';
import {unzipEntries,validateDocxBytes} from '../lib/zip-utils.js';
import {convertWordToPdf} from '../lib/local-word-pdf.js';
const out=new URL('../qa-artifacts/content-five-issues/',import.meta.url);await mkdir(out,{recursive:true});
const entry=(title,organization,dateRange,bullets=[])=>({title,organization,dateRange,location:'',subtitle:'',description:'',url:'',bullets});
const cases=[
 {id:'developer',source:technical,role:'Full Stack Developer',jd:'Position: Full Stack Developer\nRequired skills: JavaScript, React.js, SQL, Git. Django and Docker preferred.',jobs:[entry('Software Developer','Northwind Apps','Jan 2023 - Present',['Built React.js dashboards.','Maintained SQL reports for 20 users.']),entry('Junior Developer','Blue River Systems','2021 - 2022',['Fixed JavaScript bugs and documented releases using Git.'])],projects:[entry('Reporting Portal','','2022',['Built reporting tools.'])],skills:['JavaScript','SQL','React.js','Git'],wrongSummary:'Motivated QA Engineer with 1 year of experience.'},
 {id:'service',source:service,role:'Customer Success Manager',jd:'Position: Customer Success Manager\nCustomer Service, Problem Solving, Microsoft Excel and Customer Retention. Salesforce preferred.',jobs:[entry('Customer Adviser','Northwind Retail','',['Assisted customers.'])],projects:[],skills:['Microsoft Excel'],wrongSummary:'Retail Sales Associate providing generic store assistance.'},
 {id:'analyst-fresher',source:fresher,role:'Data Analyst',jd:'Position: Data Analyst\nSQL and Data Analysis required. Python and Tableau preferred.',jobs:[],projects:[entry('Library Catalogue','','2024',['Built an application.'])],skills:['JavaScript','SQL'],wrongSummary:'Frontend Developer with 3 years of commercial experience.'},
 {id:'business-analyst',source:senior,role:'Business Analyst',jd:'Position: Business Analyst\nMicrosoft Excel, inventory reporting, Project Management and stakeholder communication. SQL preferred.',jobs:[entry('Operations Manager','Northwind Retail','Jan 2023 - Present',['Coordinated scheduling for 12 staff.','Maintained Microsoft Excel inventory reports.']),entry('Team Supervisor','Northwind Retail','2020 - 2022',['Coordinated service shifts.']),entry('Service Coordinator','Blue River Stores','2017 - 2019',['Maintained inventory reports.']),entry('Customer Adviser','Fabrikam Shops','2014 - 2016',['Handled customer enquiries.']),entry('Sales Assistant','Contoso Retail','2011 - 2013',['Supported stock checks.'])],projects:[],skills:['Microsoft Excel','Inventory Reporting'],wrongSummary:'Operations Manager with 20 years of experience.'},
];
const report=[];
for(const fixture of cases){
 console.log('START '+fixture.id);
 const before=createDefaultWorkingResume();
 before.profile={...before.profile,fullName:'Avery Jordan',email:'avery@example.test',phone:'+1 202 555 0100',location:'Delhi'};
 before.targetRole=fixture.role;before.rawImport={provider:'gemini',rawText:fixture.source};before.documentSettings.settingsConfirmed=true;
 before.sections.find(s=>s.type==='summary').content.text=fixture.wrongSummary;
 before.sections.find(s=>s.type==='skills').content.items=fixture.skills;
 before.sections.find(s=>s.type==='experience').content.entries=fixture.jobs;
 before.sections.find(s=>s.type==='projects').content.entries=fixture.projects;
 const result=process.argv.includes('--live')
  ? await parseResumeWithGemini({rawText:fixture.source,targetRole:fixture.role,jobDescription:fixture.jd})
  : (()=>{const r=optimizeResumeContent(before,fixture.source,{targetRole:fixture.role,jobDescription:fixture.jd});return {resume:r.resume,contentAudit:r.audit};})();
 const after=result.resume;after.documentSettings=structuredClone(before.documentSettings);
 await writeFile(new URL(`${fixture.id}-after.json`,out),JSON.stringify(after,null,2));
 const audit=result.contentAudit;
 assert.ok(after.sections.find(s=>s.type==='summary').content.text.includes(fixture.role));
 assert.ok(!/\b(?:1|3|20) years? of (?:commercial )?experience\b/.test(after.sections.find(s=>s.type==='summary').content.text));
 const zips={};
 for(const [version,resume] of [['before',before],['after',after]]){
  const bytes=new Uint8Array(await buildDocxFromCanonical(resume).arrayBuffer());assert.ok(validateDocxBytes(bytes).ok);
  await writeFile(new URL(`${fixture.id}-${version}.docx`,out),bytes);zips[version]=unzipEntries(bytes);
  await writeFile(new URL(`${fixture.id}-${version}.pdf`,out),await convertWordToPdf(bytes));
 }
 const parity={};
 for(const part of ['word/styles.xml','word/fontTable.xml','word/numbering.xml'])parity[part]=Buffer.from(zips.before.get(part)).equals(Buffer.from(zips.after.get(part)));
 const beforeModel=getPaginatedDocumentModel(before),afterModel=getPaginatedDocumentModel(after);
 const item={id:fixture.id,role:fixture.role,live:Boolean(process.argv.includes('--live')),summaryBefore:fixture.wrongSummary,summaryAfter:after.sections.find(s=>s.type==='summary').content.text,styleParity:parity,typographyBefore:beforeModel.typography,typographyAfter:afterModel.typography,contentAudit:audit};
 await writeFile(new URL(`${fixture.id}-audit.json`,out),JSON.stringify(item,null,2));
 report.push(item);console.log(JSON.stringify({id:fixture.id,summaryAligned:true,styleParity:parity,warnings:audit.warnings.map(w=>w.code)}));
}
const baseline=JSON.parse(await readFile(new URL('formatting-baseline.json',out),'utf8'));
for(const [file,hash] of Object.entries(baseline))assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex').toUpperCase(),hash,`Protected formatting file changed: ${file}`);
await writeFile(new URL('verification.json',out),JSON.stringify({live:process.argv.includes('--live'),protectedFormattingFilesUnchanged:true,cases:report},null,2));
console.log('PASS: all protected UI/rendering files are byte-for-byte unchanged.');
