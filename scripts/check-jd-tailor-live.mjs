import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { legacyResumeToCanonical, buildDocxFromCanonical, canonicalToPlainText, getPaginatedDocumentModel, expectedVisibleStrings } from '../lib/ai-resume.js';
import { validateDocxBytes } from '../lib/zip-utils.js';

const resume = legacyResumeToCanonical({ name: 'Alex Taylor', phone: '+61 400 000 000', email: 'alex@example.test', location: 'Melbourne VIC', targetRole: 'Customer Care Representative', summary: 'Customer adviser with retail service experience.', skills: 'Customer service, Microsoft Excel, complaint handling, cash handling, teamwork', experience: [{ title: 'Customer Adviser', company: 'Example Retail', location: 'Melbourne VIC', dates: 'Jan 2023 - Present', bullets: 'helped 20 customers daily with product questions, returns and sales.\nrecorded complaints in Microsoft Excel and escalated complex issues to supervisor.\nprocessed cash and card payments and maintained accurate transaction records.\nworked with the team to resolve customer enquiries and keep service records organised.' }], education: [{ degree: 'Bachelor of Arts', school: 'Example University', dates: '2019 - 2022' }] });
const jobDescription = 'Customer Care Representative: Respond to customer enquiries, resolve complaints, process transactions, maintain accurate records with Microsoft Excel, and collaborate with colleagues. Clear communication and customer service experience required. ROLE PURPOSE & OBJECTIVE\nSIZE OF THE ROLE\nFINANCIAL SIZE';
const out = new URL('../qa-artifacts/jd-live/', import.meta.url);
await mkdir(out, { recursive: true });
const report = [];
for (const pages of [1, 2]) {
  const response = await fetch('http://127.0.0.1:3001/api/resume/tailor-jd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume, jobTitle: resume.targetRole, jobDescription, targetPages: pages }) });
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.engine, 'gemini');
  assert.deepEqual(result.resume.profile, resume.profile);
  const jobs = result.resume.sections.find(s => s.type === 'experience').content.entries;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].organization, 'Example Retail');
  const text = canonicalToPlainText(result.resume);
  assert.doesNotMatch(text, /Apex|Pinnacle|ROLE PURPOSE|FINANCIAL SIZE|98%|99%/);
  const bytes = await buildDocxFromCanonical(result.resume).arrayBuffer();
  assert.equal(validateDocxBytes(bytes).ok, true);
  const validationForm = new FormData();
  validationForm.append('file', new File([bytes], 'resume.docx'));
  validationForm.append('expected', JSON.stringify(expectedVisibleStrings(result.resume)));
  const validationResponse = await fetch('http://127.0.0.1:3001/api/resume/validate-docx', { method: 'POST', body: validationForm });
  assert.equal((await validationResponse.json()).ok, true, 'Word field coverage validation');
  const pageModel = getPaginatedDocumentModel(result.resume);
  assert.equal(pageModel.fit, true);
  await writeFile(new URL(`australian-resume-${pages}-page-target.docx`, out), Buffer.from(bytes));
  await writeFile(new URL(`result-${pages}.json`, out), JSON.stringify(result, null, 2));
  await writeFile(new URL(`resume-${pages}.txt`, out), text);
  report.push({ targetPages: pages, actualPages: pageModel.pageCount, engine: result.engine, model: result.model, readiness: result.afterScore, jobMatch: result.afterMatchScore, docxValid: true });
  console.log(report.at(-1));
}
for (const body of [{ jobTitle: '' }, { jobTitle: 123 }, { jobTitle: 'Developer', targetPages: 3 }]) {
  const response = await fetch('http://127.0.0.1:3001/api/resume/tailor-jd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 400);
}
await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
