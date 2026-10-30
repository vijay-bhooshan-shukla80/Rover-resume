import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeContentRequirements, optimizeResumeContent, resolveContentTarget, sourceEmploymentRecords } from '../lib/resume-content.js';

const entry = (title, organization = '', dateRange = '', bullets = []) => ({ title, organization, dateRange, location: '', description: '', subtitle: '', url: '', bullets });
const resume = ({ role='', summary='', skills=[], jobs=[], projects=[] }={}) => ({ profile:{fullName:'Jordan Example',email:'jordan@example.test'}, targetRole:role, documentSettings:{pageSize:'A4',resumeLength:1,typographyPreset:'default'}, sections:[
 {type:'summary',title:'PROFESSIONAL SUMMARY',content:{text:summary}},
 {type:'skills',title:'SKILLS',content:{items:skills}},
 {type:'experience',title:'EXPERIENCE',content:{entries:jobs}},
 {type:'projects',title:'PROJECTS',content:{entries:projects}},
] });
const developerSource=`Jordan Example
PROFESSIONAL SUMMARY
QA Engineer with 1 year of experience.
SKILLS
Python, SQL, Pandas, NumPy, Git, Selenium
EXPERIENCE
Python Programming Intern | Sample Labs
- Completed remote Python programming tasks and debugging exercises.
PROJECTS
Two Player Game | 2025
- Developed a game using Python and Pygame, implementing keyboard controls, shooting mechanics, collision detection and health tracking.
- Organised reusable components using Object-Oriented Programming.
EDUCATION
BTech | Example University`;

test('target role alignment replaces unrelated QA identity and unsupported years without upgrading employment',()=>{
 const input=resume({role:'Full Stack Developer',summary:'Motivated QA Engineer with 1 year of experience.',skills:['Python','SQL'],jobs:[entry('Python Programming Intern','Sample Labs')],projects:[entry('Two Player Game','','2025',['Developed a game.'])]});
 const before=structuredClone(input);
 const result=optimizeResumeContent(input,developerSource,{targetRole:'Full Stack Developer',jobDescription:'Python and SQL development. Django and Docker required.'});
 assert.match(result.resume.sections[0].content.text,/pursuing Full Stack Developer/);
 assert.doesNotMatch(result.resume.sections[0].content.text,/QA Engineer|1 year|Django|Docker/);
 assert.equal(result.resume.sections[2].content.entries[0].title,'Python Programming Intern');
 assert.ok(result.audit.warnings.some(w=>w.code==='missing_employment_dates'));
 assert.deepEqual(input,before);
 assert.deepEqual(result.resume.documentSettings,before.documentSettings);
 assert.deepEqual(result.resume.sections.map(s=>s.title),before.sections.map(s=>s.title));
});

test('JD-derived role and supported skills are dynamic across analytics, service and technical jobs',()=>{
 for(const role of ['Data Analyst','Customer Success Manager','Backend Developer','Regulatory Reporting Associate']){
  const source='Skills\nSQL, Python, Customer Service, Microsoft Excel\nExperience\nAssociate | Sample Firm | Jan 2023 - Dec 2024\n- Maintained SQL reports and supported customer service.';
  const result=optimizeResumeContent(resume({summary:'An unrelated profile.',skills:['Docker','Python'],jobs:[entry('Associate','Sample Firm')]}),source,{jobDescription:`Position: ${role}\nSQL, Python and Customer Service required. Docker preferred.`});
  assert.equal(result.resume.targetRole,role);
  assert.ok(result.resume.sections[0].content.text.includes(role));
  assert.ok(!result.resume.sections[1].content.items.includes('Docker'));
  assert.equal(result.resume.sections[2].content.entries[0].dateRange,'Jan 2023 - Dec 2024');
  assert.ok(result.audit.unsupportedRequirements.some(r=>r.term==='Docker'));
 }
 assert.equal(resolveContentTarget('', 'We are looking for a Cloud Reliability Analyst with reporting experience.'),'Cloud Reliability Analyst');
});

test('keyword matching rejects substring aliases and separates listed skills from demonstrated work',()=>{
 const source='Skills\nPython, SQL\nExperience\nReporting Associate | Sample Firm | 2020 - 2022\n- Maintained SQL reports and project support records.';
 const analysis=analyzeContentRequirements(source,'Developer','Python, TypeScript and SQL required.');
 assert.ok(analysis.unsupportedRequirements.some(r=>r.term==='TypeScript'));
 assert.ok(!analysis.supportedKeywords.includes('TypeScript'));
 const result=optimizeResumeContent(resume({jobs:[entry('Reporting Associate','Sample Firm')]}),source,{targetRole:'Developer',jobDescription:'Python and SQL required.'});
 assert.ok(result.audit.skillsListedOnly.includes('Python'));
 assert.ok(!result.resume.sections[2].content.entries[0].bullets.some(b=>b.includes('Python')));
});

test('dates are recovered from their own records; missing dates stay empty and overlapping months are counted once',()=>{
 const source='EXPERIENCE\nDeveloper | Alpha | Jan 2023 - Present\n- Built SQL reports.\nDeveloper | Beta | Jan 2024 - Present\n- Maintained JavaScript interfaces.\nIntern | Gamma\n- Debugged Python code.\nEDUCATION\nBSc | Sample College | 2018 - 2022';
 const input=resume({summary:'Developer with 5 years of experience.',jobs:[entry('Developer','Alpha'),entry('Developer','Beta'),entry('Intern','Gamma')]});
 const result=optimizeResumeContent(input,source,{targetRole:'Developer',jobDescription:'SQL and JavaScript development.',now:new Date('2026-10-30T00:00:00Z')});
 const jobs=result.resume.sections[2].content.entries;
 assert.equal(jobs[0].dateRange,'Jan 2023 - Present');
 assert.equal(jobs[1].dateRange,'Jan 2024 - Present');
 assert.equal(jobs[2].dateRange,'');
 assert.equal(result.audit.verifiedEmploymentMonths,45);
 assert.doesNotMatch(result.resume.sections[0].content.text,/5 years/);
 assert.ok(result.audit.warnings.some(w=>w.code==='missing_employment_dates'&&w.entry==='Intern'));
});

test('source titles and omitted jobs are restored rather than inventing promotions',()=>{
 const source='EXPERIENCE\nSales Associate | Retail One | Jan 2022 - Dec 2023\n- Served customers and maintained inventory.\nService Intern | Retail Two | Feb 2021 - Jun 2021\n- Logged customer enquiries.\nEDUCATION\nBA';
 const result=optimizeResumeContent(resume({jobs:[entry('Sales Manager','Retail One')]}),source,{targetRole:'Sales Executive',jobDescription:'Customer service and Inventory Management.'});
 assert.deepEqual(result.resume.sections[2].content.entries.map(e=>e.title),['Sales Associate','Service Intern']);
 assert.equal(sourceEmploymentRecords(source).length,2);
});

test('project evidence restores technical features and rejects a JD-only stack',()=>{
 const input=resume({projects:[entry('Two Player Game','','2025',['Developed a Django game using Docker.'])]});
 const result=optimizeResumeContent(input,developerSource,{targetRole:'Python Developer',jobDescription:'Python and Django required.'});
 const bullets=result.resume.sections[3].content.entries[0].bullets.join(' ');
 assert.match(bullets,/Python and Pygame/);
 assert.match(bullets,/collision detection and health tracking/);
 assert.match(bullets,/Object-Oriented Programming/);
 assert.doesNotMatch(bullets,/Django|Docker/);
});

test('undocumented project technologies are flagged without inventing frameworks or links',()=>{
 const source='PROJECTS\nBooking Website | 2024\n- Collected customer reservation details through booking forms.\nEDUCATION\nBA';
 const result=optimizeResumeContent(resume({projects:[entry('Booking Website','','2024',['Collected reservation details.'])]}),source,{targetRole:'Frontend Developer',jobDescription:'React.js and JavaScript required.'});
 assert.equal(result.resume.sections[3].content.entries[0].url,'');
 assert.ok(result.audit.warnings.some(w=>w.code==='project_technology_unspecified'));
 assert.doesNotMatch(result.resume.sections[3].content.entries[0].bullets.join(' '),/React|JavaScript/);
});

test('verified achievements survive weak rewrites and projected savings remain qualified',()=>{
 const source='EXPERIENCE\nAnalyst | Sample Charity | Mar 2024 - Jun 2024\n- Automated reporting using Power Automate, delivering estimated savings of $35,000 over 5 years.\n- Improved review efficiency by 20% and saved 200 hours annually.\nEDUCATION\nBSc';
 const input=resume({jobs:[entry('Analyst','Sample Charity','','Saved $35,000 over 5 years.'.split('|'))]});
 const result=optimizeResumeContent(input,source,{targetRole:'Business Analyst',jobDescription:'Reporting Automation and Power Automate required.'});
 const text=result.resume.sections[2].content.entries[0].bullets.join(' ');
 assert.match(text,/estimated savings of \$35,000/);
 assert.match(text,/20%/);assert.match(text,/200 hours/);
 assert.doesNotMatch(text,/50%|1000 hours/);
});

test('invented impact numbers are replaced by the original contribution',()=>{
 const source='EXPERIENCE\nAnalyst | Sample Firm | Jan 2023 - Dec 2023\n- Improved reporting accuracy by 20%.\nEDUCATION\nBSc';
 const result=optimizeResumeContent(resume({jobs:[entry('Analyst','Sample Firm','',['Improved reporting accuracy by 120%.'])]}),source,{targetRole:'Analyst',jobDescription:'Reporting accuracy.'});
 assert.match(result.resume.sections[2].content.entries[0].bullets.join(' '),/20%/);
 assert.doesNotMatch(result.resume.sections[2].content.entries[0].bullets.join(' '),/120%/);
});

test('repeated roles at the same employer retain separate verified date ranges',()=>{
 const source='EXPERIENCE\nAnalyst | Sample Firm | Jan 2020 - Dec 2020\n- Maintained Excel reports.\nAnalyst | Sample Firm | Jan 2022 - Dec 2022\n- Built SQL reports.\nEDUCATION\nBSc';
 const result=optimizeResumeContent(resume({jobs:[entry('Analyst','Sample Firm')]}),source,{targetRole:'Analyst',jobDescription:'SQL and Excel reporting.'});
 const jobs=result.resume.sections[2].content.entries;
 assert.equal(jobs.length,2);
 assert.deepEqual(jobs.map(e=>e.dateRange),['Jan 2020 - Dec 2020','Jan 2022 - Dec 2022']);
 assert.ok(jobs[0].bullets.join(' ').includes('Excel'));
 assert.ok(jobs[1].bullets.join(' ').includes('SQL'));
});

test('project links come from that project source block only',()=>{
 const source='PROJECTS\nReporting Portal | 2024\n- Built a JavaScript reporting interface.\nhttps://github.com/example/reporting-portal\nEDUCATION\nBSc';
 const result=optimizeResumeContent(resume({projects:[entry('Reporting Portal')]}),source,{targetRole:'Frontend Developer',jobDescription:'JavaScript interfaces.'});
 assert.equal(result.resume.sections[3].content.entries[0].url,'https://github.com/example/reporting-portal');
});

test('previously unknown tools are extracted from the actual JD rather than a fixed role template',()=>{
 const source='Skills\nJavaScript\nProjects\nPortal\n- Built a JavaScript interface.\nEducation\nBSc';
 const result=optimizeResumeContent(resume({projects:[entry('Portal','','',['Built the interface using Hono and Bun.'])]}),source,{targetRole:'Web Developer',jobDescription:'Required technologies: Hono, Bun, JavaScript'});
 assert.ok(result.audit.unsupportedRequirements.some(r=>r.term==='Hono'));
 assert.ok(result.audit.unsupportedRequirements.some(r=>r.term==='Bun'));
 assert.doesNotMatch(result.resume.sections[3].content.entries[0].bullets.join(' '),/Hono|Bun/);
});

test('a target management identity is framed as a transition when no managerial history exists',()=>{
 const source='EXPERIENCE\nCustomer Adviser | Sample Retail | Jan 2023 - Dec 2024\n- Assisted customers and resolved service issues.\nSKILLS\nCustomer Service';
 const result=optimizeResumeContent(resume({summary:'Customer Success Manager delivering service excellence.',jobs:[entry('Customer Adviser','Sample Retail','Jan 2023 - Dec 2024')]}),source,{targetRole:'Customer Success Manager',jobDescription:'Customer Service required.'});
 assert.match(result.resume.sections[0].content.text,/pursuing Customer Success Manager opportunities/);
 assert.equal(result.resume.sections[2].content.entries[0].title,'Customer Adviser');
});

test('an undocumented historical title is not invented from a target position',()=>{
 const source='Sample Retail\n2023 - Present\nServed customers and maintained stock.';
 const result=optimizeResumeContent(resume({jobs:[entry('Store Manager','Sample Retail','2023 - Present')]}),source,{targetRole:'Store Manager',jobDescription:'Customer Service required.'});
 assert.equal(result.resume.sections[2].content.entries[0].title,'');
 assert.ok(result.audit.warnings.some(w=>w.code==='unverified_historical_title'));
});

test('source contributions use professional action language without false impact or repeated keyword padding',()=>{
 const source='EXPERIENCE\nCustomer Adviser | Sample Retail | Jan 2023 - Present\nI handle customers and solve issues and help in sale. helped 20 customers daily.\nSKILLS\nCustomer Service';
 const result=optimizeResumeContent(resume({jobs:[entry('Customer Adviser','Sample Retail','Jan 2023 - Present',['I handle customers and solve issues and help in sale. helped 20 customers daily.'])]}),source,{targetRole:'Customer Success Manager',jobDescription:'Customer Service required.'});
 const bullet=result.resume.sections[2].content.entries[0].bullets.join(' ');
 assert.doesNotMatch(bullet,/\bI handle|help in sale|\bhelped/i);
 assert.match(bullet,/Assisted 20 customers/);
 assert.equal((result.resume.sections[0].content.text.match(/Customer Service/g)||[]).length,1);
});

test('verified mandatory JD skills rank before preferred and unrelated source skills',()=>{
 const source='SKILLS\nJavaScript, SQL, Git\nEXPERIENCE\nDeveloper | Sample Firm | Jan 2023 - Dec 2024\n- Built JavaScript interfaces and SQL reports.';
 const result=optimizeResumeContent(resume({skills:['Git','JavaScript','SQL'],jobs:[entry('Developer','Sample Firm','Jan 2023 - Dec 2024')]}),source,{targetRole:'Developer',jobDescription:'SQL required. JavaScript preferred.'});
 assert.deepEqual(result.resume.sections[1].content.items,['SQL','JavaScript','Git']);
});

test('a correctly titled summary still cannot acquire JD-only frameworks',()=>{
 const source='SKILLS\nPython, SQL\nEXPERIENCE\nFull Stack Developer | Sample Firm | Jan 2023 - Dec 2024\n- Built Python services and SQL reports.';
 const result=optimizeResumeContent(resume({summary:'Full Stack Developer experienced in Django and Kubernetes.',jobs:[entry('Full Stack Developer','Sample Firm','Jan 2023 - Dec 2024')]}),source,{targetRole:'Full Stack Developer',jobDescription:'Django and Kubernetes required. Python and SQL.'});
 assert.match(result.resume.sections[0].content.text,/Full Stack Developer/);
 assert.doesNotMatch(result.resume.sections[0].content.text,/Django|Kubernetes/);
});

test('technical expertise headings cannot leak skills into a project technology claim',()=>{
 const source='PROJECTS\nPortal\n- Built a JavaScript interface.\nTECHNICAL EXPERTISE\nJavaScript, SQL';
 const result=optimizeResumeContent(resume({projects:[entry('Portal','','',['Built a JavaScript interface with SQL.'])]}),source,{targetRole:'Frontend Developer',jobDescription:'JavaScript and SQL required.'});
 const text=result.resume.sections[3].content.entries[0].bullets.join(' ');
 assert.doesNotMatch(text,/SQL|TECHNICAL EXPERTISE/);
 assert.match(text,/JavaScript/);
});

test('standard Excel aliases are not repeated in summary or skills',()=>{
 const source='SKILLS\nMS Excel, Microsoft Excel\nEXPERIENCE\nAnalyst | Sample Firm | Jan 2023 - Dec 2024\n- Maintained Excel reports.';
 const result=optimizeResumeContent(resume({skills:['Excel','Microsoft Excel'],jobs:[entry('Analyst','Sample Firm')]}),source,{targetRole:'Business Analyst',jobDescription:'Excel and Microsoft Excel required.'});
 assert.deepEqual(result.resume.sections[1].content.items,['Microsoft Excel']);
 assert.equal((result.resume.sections[0].content.text.match(/Excel/g)||[]).length,1);
});

test('employer names and contact URLs do not establish software proficiency',()=>{
 const source='Jordan Example\npython@example.test\nhttps://github.com/javascript-example\nEXPERIENCE\nHR Coordinator | Salesforce | Jan 2023 - Dec 2024\n- Coordinated employee onboarding and maintained personnel records.';
 const result=optimizeResumeContent(resume({summary:'HR Coordinator skilled in Salesforce and Python.',skills:['Salesforce','Python','JavaScript'],jobs:[entry('HR Coordinator','Salesforce','Jan 2023 - Dec 2024')]}),source,{targetRole:'HR Coordinator',jobDescription:'Salesforce, Python and JavaScript required.'});
 assert.deepEqual(result.resume.sections[1].content.items,[]);
 assert.doesNotMatch(result.resume.sections[0].content.text,/skilled in Salesforce|Python|JavaScript/);
 assert.ok(result.audit.unsupportedRequirements.some(r=>r.term==='Salesforce'));
});
