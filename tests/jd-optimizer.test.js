import test from "node:test";
import assert from "node:assert/strict";
import {
  extractKeywordsFromJd,
  tailorResumeToJobDescription,
  ATS_KEYWORD_DICTIONARY,
} from "../lib/jd-optimizer.js";
import { legacyResumeToCanonical, analyzeResume, parseImportedResume, getPaginatedDocumentModel } from "../lib/ai-resume.js";

function sampleCustomerResume() {
  return legacyResumeToCanonical({
    name: "Mark Dylan Cubric",
    phone: "0425 767 278",
    email: "markcubric10@gmail.com",
    location: "Melbourne",
    targetRole: "Customer Service Representative",
    summary: "Dedicated Customer Service Representative offering strong communication, problem-solving, and interpersonal skills.",
    skills: "Customer Service, communication, problem solving, team work, time management",
    experience: [
      {
        title: "Customer Service Team Member",
        company: "Woolworths",
        dates: "Feb 2023 - May 2025",
        bullets: "Delivered friendly customer service and assisted shoppers promptly.\nMaintained organized product displays and executed stock management duties."
      }
    ],
    education: [{ school: "Melbourne High School", degree: "High School Diploma", dates: "2018 - 2022" }]
  });
}

function sampleDeveloperResume() {
  return legacyResumeToCanonical({
    name: "Alex Morgan",
    phone: "+1 555 123 4567",
    email: "alex@example.com",
    location: "Sydney, NSW",
    targetRole: "Frontend Developer",
    summary: "Frontend developer with experience in modern web frameworks.",
    skills: "JavaScript, HTML5, CSS3, React.js",
    experience: [
      {
        title: "Frontend Developer",
        company: "Tech Wave",
        dates: "2023 - Present",
        bullets: "Built interactive web components using React.js.\nCollaborated with product designers to implement responsive layouts."
      }
    ],
    education: [{ school: "University of Sydney", degree: "Bachelor of Science", dates: "2019 - 2023" }]
  });
}

test("extractKeywordsFromJd extracts technical terms, skills, and target role", () => {
  const jd = `
Job Title: Senior React Engineer
We are seeking an experienced developer with:
- React.js, Next.js, TypeScript, and Tailwind CSS
- Node.js, REST APIs, and GraphQL backend integrations
- Docker containerization and AWS cloud deployments
- Agile and Scrum sprint collaboration
  `;

  const result = extractKeywordsFromJd(jd, "Senior React Engineer");
  assert.ok(result.keywords.length >= 6);
  assert.equal(result.detectedRole, "Senior React Engineer");
  const joined = result.keywords.join(" ").toLowerCase();
  assert.ok(joined.includes("react"));
  assert.ok(joined.includes("next"));
  assert.ok(joined.includes("typescript"));
  assert.ok(joined.includes("docker"));
});

test("tailorResumeToJobDescription guarantees ATS Readiness Score >= 95 and Job Match Score >= 95", () => {
  const baseResume = sampleDeveloperResume();
  const jd = `
Senior Full Stack Engineer
Requirements:
- React.js, Next.js, TypeScript, Node.js
- REST APIs, GraphQL, PostgreSQL
- Docker, AWS cloud deployments
- Agile methodologies, Jest unit testing
  `;

  const tailored = tailorResumeToJobDescription({
    resume: baseResume,
    jobTitle: "Senior Full Stack Engineer",
    jobDescription: jd,
    targetPages: 2,
  });

  assert.ok(tailored.afterAnalysis.readinessScore >= 95, `Readiness score was ${tailored.afterAnalysis.readinessScore}`);
  assert.ok(tailored.afterAnalysis.jobMatchScore >= 95, `Job match score was ${tailored.afterAnalysis.jobMatchScore}`);
  assert.equal(tailored.optimizedResume.targetRole, "Senior Full Stack Engineer");
  assert.ok(tailored.matchedKeywords.length >= 5);
  assert.ok(tailored.diff.length > 0);
});

test("tailorResumeToJobDescription optimizes Customer Support resume with 95+ scores", () => {
  const baseResume = sampleCustomerResume();
  const jd = `
Position: Customer Support Team Lead
Key Responsibilities:
- Manage customer queries using Zendesk and CRM tools
- Provide Conflict Resolution and Stakeholder Management
- Maintain high Quality Assurance and WHS compliance
- Exhibit exceptional Communication and Team Collaboration
  `;

  const tailored = tailorResumeToJobDescription({
    resume: baseResume,
    jobTitle: "Customer Support Team Lead",
    jobDescription: jd,
    targetPages: 1,
  });

  assert.ok(tailored.afterAnalysis.readinessScore >= 95, `Readiness was ${tailored.afterAnalysis.readinessScore}`);
  assert.ok(tailored.afterAnalysis.jobMatchScore >= 95, `Job Match was ${tailored.afterAnalysis.jobMatchScore}`);
  assert.equal(tailored.optimizedResume.targetRole, "Customer Support Team Lead");
});

test("tailorResumeToJobDescription preserves authentic profile data without dummy text and tracks changed bullets", () => {
  const baseResume = sampleCustomerResume();
  baseResume.profile.fullName = "Mark Dylan Cubric";
  baseResume.profile.email = "markcubric10@gmail.com";
  baseResume.profile.phone = "0425 767 276";

  const jd = "Customer Service Specialist needed for retail customer satisfaction and CRM management.";
  const tailored = tailorResumeToJobDescription({
    resume: baseResume,
    jobTitle: "Customer Service Specialist",
    jobDescription: jd,
    targetPages: 1,
  });

  assert.equal(tailored.optimizedResume.profile.fullName, "Mark Dylan Cubric");
  assert.equal(tailored.optimizedResume.profile.email, "markcubric10@gmail.com");
  assert.equal(tailored.optimizedResume.profile.phone, "0425 767 276");
  assert.notEqual(tailored.optimizedResume.profile.fullName, "Professional Candidate");
  assert.notEqual(tailored.optimizedResume.profile.email, "candidate@example.com");

  assert.ok(Array.isArray(tailored.changedBullets));
  assert.ok(tailored.changedBullets.length > 0);
  assert.ok(tailored.highlightData);
  assert.ok(tailored.optimizedResume.aiHighlightData);
});

test("handles minimal resume with only personal details and raw JD with headers", () => {
  const userText = `Aditya Singh
+61 422 279 428 | 9jobsapplicationservice@gmail.co | https://www.linkedin.com/in/simran-kaur-437a013b9/ | Australia

Eduction : Master of Computer Application - Integral University

Certificate : Microsoft Azure`;

  const parsed = parseImportedResume(userText, { targetRole: "Customer Care Representative" });
  assert.equal(parsed.profile.fullName, "Aditya Singh");
  assert.equal(parsed.profile.location, "Australia");
  assert.equal(parsed.profile.phone, "+61 422 279 428");

  const eduSection = parsed.sections.find((s) => s.type === "education");
  assert.ok(eduSection);
  assert.equal(eduSection.content.entries[0].organization, "Integral University");
  assert.equal(eduSection.content.entries[0].title, "Master of Computer Application");

  const certSection = parsed.sections.find((s) => s.type === "certifications");
  assert.ok(certSection);
  assert.equal(certSection.content.entries[0].title, "Microsoft Azure");

  const jdText = `About the job
POSITION DESCRIPTION

JOB TITLE : Customer Care Representative

GRADE : AM-III
DEPARTMENT : Branch Banking
LOCATION : Branch
REPORTING INTO : ROLL PURPOSE & OBJECTIVE
FINANCIAL ROLE
NON-FINANCIAL ROLE
Branch, Aadhaar enrollment`;

  const tailored = tailorResumeToJobDescription({
    resume: parsed,
    jobTitle: "Customer Care Representative",
    jobDescription: jdText,
    targetPages: 1,
  });

  assert.ok(tailored.afterAnalysis.readinessScore >= 95, `Readiness was ${tailored.afterAnalysis.readinessScore}`);
  assert.ok(tailored.afterAnalysis.jobMatchScore >= 95, `Job match was ${tailored.afterAnalysis.jobMatchScore}`);

  const expSection = tailored.optimizedResume.sections.find((s) => s.type === "experience");
  assert.ok(expSection);
  assert.ok(expSection.content.entries.length >= 2);
  assert.doesNotMatch(expSection.content.entries[0].title, /Aditya Singh|9jobsapplicationservice/i);
  assert.doesNotMatch(expSection.content.entries[0].organization, /Aditya Singh|9jobsapplicationservice|\+61/i);

  const skillSection = tailored.optimizedResume.sections.find((s) => s.type === "skills");
  const allSkills = (skillSection.content.items || []).join(" ");
  assert.doesNotMatch(allSkills, /GRADE\s*:\s*AM-III|POSITION DESCRIPTION|ABOUT THE JOB|ROLL PURPOSE/i);

  const model = getPaginatedDocumentModel(tailored.optimizedResume);
  assert.equal(model.pages.length, 1);
  assert.equal(model.status, "fit");
});

