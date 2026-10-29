"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showcaseContent } from "@/lib/showcase-content";

import { showcaseResumes as resumes } from "@/lib/showcase-resumes";

export function ResumeShowcase() {
  const carouselRef = useRef(null);
  const interactionRef = useRef({ dragging: false, manualUntil: 0 });
  const [selectedResume, setSelectedResume] = useState(null);
  const orderedResumes = resumes;
  const track = [...orderedResumes, ...orderedResumes, ...orderedResumes];
  const moveCarousel = useCallback((direction) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const card = carousel.querySelector(".example-card");
    const step = (card?.getBoundingClientRect().width || 300) + 16;
    const cycleWidth = step * resumes.length;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let position = carousel.scrollLeft;
    if (direction < 0 && position <= 2) {
      position += cycleWidth;
      carousel.scrollTo({ left: position, behavior: "instant" });
    } else if (position >= cycleWidth) {
      position -= cycleWidth;
      carousel.scrollTo({ left: position, behavior: "instant" });
    }
    carousel.scrollTo({ left: position + direction * step, behavior: reduceMotion ? "instant" : "smooth" });
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (selectedResume) return;
    const carousel = carouselRef.current;
    if (!carousel) return;
    let frame;
    let lastTime;
    let position = carousel.scrollLeft;
    let cycleWidth = 0;
    function measure() {
      const cards = carousel.querySelectorAll(".example-card");
      if (cards[resumes.length]) {
        cycleWidth = cards[resumes.length].getBoundingClientRect().left - cards[0].getBoundingClientRect().left;
      }
      position = carousel.scrollLeft;
    }
    function releasePointer() {
      interactionRef.current.dragging = false;
    }
    function animate(time) {
      const elapsed = lastTime === undefined ? 0 : Math.min(time - lastTime, 64);
      lastTime = time;
      const interaction = interactionRef.current;
      // Respect keyboard/browser scroll-to-view so moving cards remain clickable.
      if (Math.abs(carousel.scrollLeft - position) > 3) position = carousel.scrollLeft;
      if (motion.matches || document.hidden || interaction.dragging || Date.now() < interaction.manualUntil) {
        position = carousel.scrollLeft;
      } else if (cycleWidth > 0) {
        // Keep fractional pixels so slow motion remains smooth on high-refresh displays.
        position = (position + elapsed * 0.042) % cycleWidth;
        carousel.scrollTo({ left: position, behavior: "instant" });
      }
      frame = window.requestAnimationFrame(animate);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(carousel);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
    };
  }, [selectedResume]);

  function scrollExamples(direction) {
    interactionRef.current.manualUntil = Date.now() + 600;
    moveCarousel(direction);
  }

  return (
    <section className="showcase-section landing-examples real-resume-examples" id="resume-examples" aria-label="ATS resume examples">
      <div className="section-head showcase-head">
        <p className="eyebrow">Professional resume examples</p>
        <h2>Live ATS Resume <span>Examples</span></h2>
        <p>Clean, professional resumes across different roles. See how an ATS-optimized resume looks.</p>
      </div>
      <div className="examples-carousel">
        <button className="example-arrow previous" type="button" onClick={() => scrollExamples(-1)} aria-label="Previous resume examples"><Chevron left /></button>
        <div className="examples-track" ref={carouselRef} tabIndex={0} aria-label="Scroll resume examples"
          onPointerDown={() => { interactionRef.current.dragging = true; }}
          onPointerUp={() => { interactionRef.current.dragging = false; }}
          onPointerCancel={() => { interactionRef.current.dragging = false; }}
          onWheel={() => { interactionRef.current.manualUntil = Date.now() + 600; }}
          onKeyDown={() => { interactionRef.current.manualUntil = Date.now() + 600; }}>
          {track.map((resume, index) => (
            <div className="example-card" key={`${resume.name}-${index}`} aria-hidden={index >= orderedResumes.length ? true : undefined}><div className="example-card-title"><span aria-hidden="true">▤</span>{resume.name}</div><ResumeDocument resume={resume} duplicate={index >= orderedResumes.length} onOpen={() => setSelectedResume(resume)} /><div className="example-caption"><span>{resume.name}</span></div></div>
          ))}
        </div>
        <button className="example-arrow next" type="button" onClick={() => scrollExamples(1)} aria-label="Next resume examples"><Chevron /></button>
      </div>
      {selectedResume ? <ResumeReader resume={selectedResume} onClose={() => setSelectedResume(null)} /> : null}
    </section>
  );
}

function Chevron({ left = false }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={left ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}

function ResumeIdentity({ resume }) {
  const [location, phone, email] = resume.contact.split("|").map((part) => part.trim());
  return <header className="sample-resume-identity">
    <strong>{resume.fullName}</strong>
    <div>{phone} | <span>{email}</span> | {location}</div>
  </header>;
}

function SampleResume({ resume, style }) {
  return <article className="showcase-text-resume" style={style} aria-label={`${resume.fullName} sample resume`}>
    <ResumeIdentity resume={resume} />
    {showcaseContent[resume.id].map((section) => <section className="sample-resume-section" key={section.title}>
      <h4>{section.title}</h4>
      {section.text ? <p>{section.text}</p> : null}
      {section.entries?.map((entry) => <div className="sample-resume-entry" key={`${entry.role}-${entry.date}`}>
        <div className="sample-resume-entry-heading"><strong>{entry.role}</strong><span>{entry.date}</span></div>
        {entry.subtitle ? <div className="sample-resume-entry-heading"><span>{entry.subtitle}</span><span>{entry.location}</span></div> : null}
        {entry.bullets ? <ul>{entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
      </div>)}
    </section>)}
  </article>;
}

function ResumeDocument({ resume, duplicate, onOpen }) {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const frame = frameRef.current;
    const document = frame.querySelector(".showcase-text-resume");
    function fitDocument() {
      setScale(Math.min((frame.clientWidth - 2) / document.offsetWidth, (frame.clientHeight - 2) / document.offsetHeight, 1));
    }
    const observer = new ResizeObserver(fitDocument);
    observer.observe(frame);
    observer.observe(document);
    fitDocument();
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <button type="button" className="example-open-preview" onClick={onOpen} tabIndex={duplicate ? -1 : 0}>View full resume <span aria-hidden="true">↗</span></button>
      <div ref={frameRef} role="button" className="sample-resume-open" tabIndex={duplicate ? -1 : 0} aria-label={`Read full ${resume.name} resume`} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}><SampleResume resume={resume} style={{ width: 794, fontSize: 14, padding: 28, zoom: scale }} /></div>
    </>
  );
}

function ResumeReader({ resume, onClose }) {
  const dialogRef = useRef(null);
  const [zoom, setZoom] = useState(1.25);
  useEffect(() => {
    const dialog = dialogRef.current;
    const oldOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
    };
  }, []);

  return <dialog ref={dialogRef} className="example-reader-dialog" aria-labelledby="example-reader-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="example-reader-toolbar">
      <div><h3 id="example-reader-title">{resume.name}</h3><p>Sample resume · Zoom to read every detail</p></div>
      <div className="example-reader-controls">
        <button type="button" onClick={() => setZoom((current) => Math.max(0.75, current - 0.25))} disabled={zoom <= 0.75} aria-label="Zoom out">−</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((current) => Math.min(2.5, current + 0.25))} disabled={zoom >= 2.5} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(1)}>100%</button>
        <a href={resume.image} target="_blank" rel="noopener noreferrer">Open original ↗</a>
        <button type="button" autoFocus onClick={onClose} aria-label="Close resume preview">✕</button>
      </div>
    </header>
    <div className="example-reader-scroll">
      <SampleResume resume={resume} style={{ width: 794 * zoom, fontSize: 14 * zoom, padding: 34 * zoom }} />
    </div>
  </dialog>;
}
