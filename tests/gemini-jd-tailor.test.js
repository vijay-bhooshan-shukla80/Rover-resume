import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyResumeToCanonical, buildDocxFromCanonical, analyzeResume } from '../lib/ai-resume.js';
import { finishTailoring, tailorWithGemini } from '../lib/gemini-jd-tailor.js';
import { validateDocxBytes } from '../lib/zip-utils.js';

const options = { jobTitle: 'Customer Care Representative', jobDescription: 'Customer service, complaint resolution, Salesforce', targetPages: 1, model: 'test' };
function fixture() {
  const resume = legacyResumeToCanonical({ name: 'Alex Taylor', phone: '+61 400 000 000', email: 'alex@example.test', location: 'Melbourne VIC', skills: 'Customer service, Microsoft Excel', experience: [{ title: 'Customer Adviser', company: 'Example Retail', dates: '2023 - Present', bullets: 'helped 20 customers daily and recorded complaints in Microsoft Excel' }], education: [{ degree: 'BA', school: 'Example University', dates: '2019 - 2022' }] });
  const section = resume.sections.find(s => s.type === 'experience');
  const draft = { summary: 'Customer adviser experienced in resolving customer enquiries and maintaining accurate service records using Microsoft Excel.', skills: ['Customer service', 'Microsoft Excel'], entries: [{ sectionId: section.id, entryId: section.content.entries[0].id, bullets: ['Assisted 20 customers daily, resolving enquiries and recording complaints in Microsoft Excel.'] }] };
  return { resume, draft };
}
test('Gemini rewrite preserves identity, employers, education and original resume; exports existing Word format', async () => {
  const { resume, draft } = fixture();
  const before = structuredClone(resume);
  const result = finishTailoring(resume, draft, options);
  assert.deepEqual(resume, before);
  assert.deepEqual(result.optimizedResume.profile, resume.profile);
  const job = result.optimizedResume.sections.find(s => s.type === 'experience').content.entries[0];
  assert.equal(job.organization, 'Example Retail');
  assert.equal(job.title, 'Customer Adviser');
  assert.equal(job.dateRange, '2023 - Present');
  assert.deepEqual(result.optimizedResume.sections.find(s => s.type === 'education').content, resume.sections.find(s => s.type === 'education').content);
  assert.equal(result.afterAnalysis.readinessScore, analyzeResume(result.optimizedResume, options.jobDescription).readinessScore);
  const docx = validateDocxBytes(await buildDocxFromCanonical(result.optimizedResume).arrayBuffer());
  assert.equal(docx.ok, true);
  assert.match(docx.text, /Assisted 20 customers/);
});
test('rejects invented experience, missing jobs and unsupported metrics', () => {
  for (const alter of [d => d.entries.push({ entryId: 'fake', bullets: ['Invented'] }), d => { d.entries = []; }, d => { d.entries[0].bullets = ['Improved satisfaction by 98%.']; }]) {
    const { resume, draft } = fixture();
    alter(draft);
    assert.throws(() => finishTailoring(resume, draft, options));
  }
});
test('contact-only generation has no fabricated work history or qualifications', () => {
  const resume = legacyResumeToCanonical({ name: 'Alex Taylor', email: 'alex@example.test' });
  const result = finishTailoring(resume, { summary: 'Seeking a Customer Care Representative position in Australia.', skills: [], entries: [] }, options);
  assert.equal(result.optimizedResume.sections.some(s => s.type === 'experience'), false);
  assert.ok(result.afterAnalysis.readinessScore < 95);
});
test('replaces a generic target with a JD-specific role while preserving explicit user titles', () => {
  const { resume, draft } = fixture();
  draft.targetRole = 'Technical Support Associate';
  assert.equal(finishTailoring(resume, draft, { ...options, jobTitle: 'Professional' }).optimizedResume.targetRole, 'Technical Support Associate');
  assert.equal(finishTailoring(resume, draft, options).optimizedResume.targetRole, options.jobTitle);
});
test('calls Gemini with source as data and fails honestly on service errors', async () => {
  const { resume, draft } = fixture();
  let calls = 0;
  const result = await tailorWithGemini({ resume, ...options }, { apiKey: 'test', model: 'test-model', fetchImpl: async (url, init) => {
    calls++;
    assert.match(url, /test-model:generateContent$/);
    const body = JSON.parse(init.body);
    assert.match(body.systemInstruction.parts[0].text, /Australian/);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).candidate.profile.fullName, 'Alex Taylor');
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(draft) }] } }] }) };
  } });
  assert.equal(calls, 1);
  assert.equal(result.engine, 'gemini');
  await assert.rejects(tailorWithGemini({ resume, ...options }, { apiKey: '' }), /not configured/);
  await assert.rejects(tailorWithGemini({ resume, ...options }, { apiKey: 'test', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), /429/);
});
