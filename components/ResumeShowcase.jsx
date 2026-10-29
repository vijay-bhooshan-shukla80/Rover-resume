"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { showcaseResumes as resumes } from "@/lib/showcase-resumes";

export function ResumeShowcase() {
  const carouselRef = useRef(null);
  const interactionRef = useRef({ dragging: false, manualUntil: 0 });
  const [autoPlay, setAutoPlay] = useState(true);
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
    if (!autoPlay) return;
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
  }, [autoPlay]);

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
        <p className="example-identity-note">Resume content supplied for these examples. Names and contact details are fictional.</p>
      </div>
      <div className="examples-carousel">
        <button className="example-arrow previous" type="button" onClick={() => scrollExamples(-1)} aria-label="Previous resume examples"><Chevron left /></button>
        <div className="examples-track" ref={carouselRef} tabIndex={0} aria-label="Scroll resume examples"
          onPointerDown={() => { interactionRef.current.dragging = true; }}
          onWheel={() => { interactionRef.current.manualUntil = Date.now() + 600; }}
          onKeyDown={() => { interactionRef.current.manualUntil = Date.now() + 600; }}>
          {track.map((resume, index) => (
            <div className="example-card" key={`${resume.name}-${index}`} aria-hidden={index >= orderedResumes.length ? true : undefined}><div className="example-card-title"><span aria-hidden="true">▤</span>{resume.name}</div><ResumeDocument resume={resume} /><div className="example-caption"><span>{resume.name}</span></div></div>
          ))}
        </div>
        <button className="example-arrow next" type="button" onClick={() => scrollExamples(1)} aria-label="Next resume examples"><Chevron /></button>
      </div>
      <button className="carousel-autoplay" type="button" aria-pressed={!autoPlay} onClick={() => setAutoPlay((current) => !current)}>
        <span aria-hidden="true">{autoPlay ? "Ⅱ" : "▷"}</span>{autoPlay ? "Pause auto-slide" : "Resume auto-slide"}
      </button>
    </section>
  );
}

function Chevron({ left = false }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={left ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}

function ResumeDocument({ resume }) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(0.35);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => setScale(viewport.clientWidth / 794);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="example-document-viewport" ref={viewportRef}>
      <article className="showcase-page" style={{ fontFamily: resume.documentFont, fontSize: resume.bodySize, transform: `scale(${scale})` }} aria-label={`${resume.name} resume with fictional contact details`}>
        <header className="showcase-identity"><h3>{resume.fullName}</h3><p>{resume.contact}</p></header>
        {resume.sections.map((section) => (
          <section className="showcase-doc-section" key={section.title}>
            <h4>{section.title}</h4>
            {section.text ? <p>{section.text}</p> : null}
            {section.entries?.map((entry) => (
              <div className="showcase-doc-entry" key={`${entry.title}|${entry.subtitle || ""}|${entry.dates || ""}`}>
                <div className="showcase-doc-row"><strong>{entry.title}</strong>{entry.dates ? <span>{entry.dates}</span> : null}</div>
                {entry.subtitle || entry.location ? <div className="showcase-doc-row"><span>{entry.subtitle}</span><span>{entry.location}</span></div> : null}
                {entry.bullets?.length ? <ul>{entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
