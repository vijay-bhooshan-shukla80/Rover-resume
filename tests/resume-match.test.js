import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareJobDescription, buildKeywordMap, scoreResumeMatch, refineResumeMatch, validateRefinement } from '../lib/resume-match.js';
import { validateParsedResume } from '../lib/resume-import.js';
import { bulletDensity } from '../lib/resume-match.js';
import { uniqueSkills } from '../lib/resume-quality.js';

const entry=(title,organization,bullets)=>({title,organization,subtitle:'',location:'',dateRange:'Jan 2022 - Dec 2024',description:'',bullets,url:''});
const pairs=[
  {role:'Customer Service Adviser',skills:['Customer Service','CRM'],bullets:['Resolved customer service queries using CRM and maintained accurate customer records.','Supported customer service operations and assisted 20 customers daily.']},
  {role:'Marketing Specialist',skills:['Google Analytics','SEO'],bullets:['Analyzed Google Analytics reports to inform SEO content planning and campaign decisions.','Improved SEO reporting and maintained campaign records for 12 clients.']},
  {role:'Software Developer',skills:['Python','SQL'],bullets:['Developed Python services and SQL reports to support internal operations and reporting.','Maintained SQL queries and Python scripts supporting 8 internal reports.']},
];
function fixture(pair){
 const summary=`${pair.role} with experience in ${pair.skills.join(' and ')}. ${pair.bullets.join(' ')} Maintained records and supported operations at Sample Company.`;
 const source=`Alex Example\nalex@example.test\nPROFESSIONAL SUMMARY\n${summary}\nSKILLS\n${pair.skills.join(', ')}\nEXPERIENCE\n${pair.role} | Sample Company | Jan 2022 - Dec 2024\n${pair.bullets.map(b=>'- '+b).join('\n')}`;
 const resume={profile:{fullName:'Alex Example',email:'alex@example.test',phone:'',location:'',linkedin:'',github:'',portfolio:'',website:''},targetRole:pair.role,sections:[
  {type:'summary',title:'PROFESSIONAL SUMMARY',content:{text:summary}},
  {type:'skills',title:'SKILLS',content:{items:pair.skills}},
  {type:'experience',title:'EXPERIENCE',content:{entries:[entry(pair.role,'Sample Company',pair.bullets)]}},
  ...['projects','education','certifications'].map(type=>({type,title:type.toUpperCase(),content:{entries:[]}}))
 ]};
 const evidence=[{path:'sections.0.content.text',quotes:[source]},...pair.skills.map((_,i)=>({path:`sections.1.content.items.${i}`,quotes:[source]})),{path:'sections.2.content.entries.0',quotes:[source]}];
 return {source,resume,evidence,jd:`Position: ${pair.role}\nRequired skills:\n${pair.skills.join(', ')}\nPreferred:\nDocker`};
}

test('requirement headings, frequency and unsupported preferred tools stay distinct',()=>{
 const f=fixture(pairs[2]);const map=buildKeywordMap(f.source,pairs[2].role,f.jd+'\nPython');
 assert.equal(map.find(k=>k.keyword==='SQL').importance,'required');
 assert.equal(map.find(k=>k.keyword==='Docker').importance,'preferred');
 assert.equal(map.find(k=>k.keyword==='Docker').present_in_resume,false);
 assert.ok(map.find(k=>k.keyword==='Python').frequency>=2);
});
test('smart JD truncation keeps late requirements, Unicode and avoids control characters',()=>{
 const jd='Position: Développeur\nAbout us\n'+('Company background.\n'.repeat(4000))+'Requirements\nPython and SQL required\n';
 const text=prepareJobDescription(jd,1000);assert.ok(text.length<=1000);assert.match(text,/Python and SQL required/);assert.match(text,/Développeur/);
 assert.equal(prepareJobDescription('工具\u0000'),'工具');
});
test('missing JD is unscored keyword evidence, never an automatic 40 points',()=>{
 const f=fixture(pairs[2]);assert.equal(scoreResumeMatch(f.resume,f.source,pairs[2].role,'').categories.keywords,0);
});
test('exact target intent is allowed without granting unsupported technology proficiency',()=>{
 const f=fixture(pairs[0]);
 f.resume.sections[0].content.text='Python Developer candidate transitioning into the role. '+f.resume.sections[0].content.text;
 assert.doesNotThrow(()=>validateParsedResume({resume:f.resume,evidence:f.evidence},f.source,{targetRole:'Python Developer'}));
 f.resume.sections[0].content.text+=' Developed Python services using Django.';
 assert.throws(()=>validateParsedResume({resume:f.resume,evidence:f.evidence},f.source,{targetRole:'Python Developer'}));
});
test('schema validation and immutable facts reject fabricated employers, dates, tools and metrics',()=>{
 const f=fixture(pairs[2]);
 for(const mutate of [r=>r.profile.extra='oops',r=>r.sections[2].content.entries[0].organization='Invented Ltd',r=>r.sections[2].content.entries[0].dateRange='Jan 2010 - Dec 2024',r=>r.sections[2].content.entries[0].bullets.push('Built Docker infrastructure increasing revenue by 80%.'),r=>r.sections[1].content.items.push('Kubernetes')]){
  const changed=structuredClone(f.resume);mutate(changed);
  assert.throws(()=>validateRefinement({resume:changed,evidence:f.evidence},f.resume,f.source,pairs[2].role));
 }
});
for(const pair of pairs)test(`${pair.role}: factual sample scoring and bounded refinement`,async()=>{
 const f=fixture(pair),weak=structuredClone(f.resume);
 weak.sections[0].content.text=`${pair.role} with experience.`;
 weak.sections[2].content.entries[0].bullets=['Supported operations.',pair.bullets[1]];
 const before=scoreResumeMatch(weak,f.source,pair.role,f.jd);
 let calls=0;
 const result=await refineResumeMatch(weak,f.source,pair.role,f.jd,async()=>{calls++;return {resume:f.resume,evidence:f.evidence};});
 assert.ok(calls<=2);assert.ok(result.report.score>before.score);
 assert.deepEqual(result.resume.profile,f.resume.profile);
 assert.equal(result.resume.sections[2].content.entries[0].dateRange,'Jan 2022 - Dec 2024');
 assert.ok(result.report.unsupportedRequirements.includes('Docker'));
 assert.ok(result.report.categories.keywords<40);
 console.log('SAMPLE_MATCH',JSON.stringify({role:pair.role,before:before.score,after:result.report.score,calls}));
});
test('provider failure and lower quality retain best result with at most two calls',async()=>{
 const f=fixture(pairs[2]);let calls=0;
 const result=await refineResumeMatch(f.resume,f.source,pairs[2].role,f.jd,async()=>{calls++;throw new Error('quota');});
 assert.ok(calls<=2);assert.deepEqual(result.resume.profile,f.resume.profile);
 assert.ok(result.report.score>=result.before);
});
test('bullet fitting uses printed width and duplicate skill aliases collapse',()=>{
 const f=fixture(pairs[2]);
 f.resume.sections[2].content.entries[0].bullets=['W'.repeat(100)];
 const wide=bulletDensity(f.resume).entries[0].bullets[0].lines;
 f.resume.sections[2].content.entries[0].bullets=['i'.repeat(100)];
 assert.ok(wide>bulletDensity(f.resume).entries[0].bullets[0].lines*2);
 assert.deepEqual(uniqueSkills(['Excel','MS Excel','Microsoft Excel','React','React.js','SQL']),['Microsoft Excel','React.js','SQL']);
});
test('high scoring short bullets still request a bounded layout refinement',async()=>{
 const f=fixture(pairs[0]);let calls=0;
 await refineResumeMatch(f.resume,f.source,pairs[0].role,f.jd.replace('Preferred:\nDocker',''),async context=>{
  calls++;assert.ok(context.bulletDensity.entries.length);assert.match(context.bulletDensity.target,/1.35/);throw new Error('Unavailable');
 });
 assert.equal(calls,2);
});
