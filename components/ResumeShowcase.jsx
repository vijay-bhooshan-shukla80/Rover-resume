"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { showcaseResumes as resumes } from "@/lib/showcase-resumes";

export function ResumeShowcase() {
  const carouselRef = useRef(null);
  const interactionRef = useRef({ dragging: false, manualUntil: 0 });
  const [autoPlay, setAutoPlay] = useState(true);
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
    if (!autoPlay || selectedResume) return;
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
  }, [autoPlay, selectedResume]);

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
        <p className="example-identity-note">Original resume images. Names and contact details in the card headers are fictional.</p>
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
      <button className="carousel-autoplay" type="button" aria-pressed={!autoPlay} onClick={() => { interactionRef.current.dragging = false; setAutoPlay((current) => !current); }}>
        <span aria-hidden="true">{autoPlay ? "Ⅱ" : "▷"}</span>{autoPlay ? "Pause auto-slide" : "Resume auto-slide"}
      </button>
      {selectedResume ? <ResumeReader resume={selectedResume} onClose={() => setSelectedResume(null)} /> : null}
    </section>
  );
}

function Chevron({ left = false }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={left ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}

function ResumeIdentity({ resume }) {
  const [location, phone, email] = resume.contact.split("|").map((part) => part.trim());
  return <div className="example-dummy-profile">
    <strong>{resume.fullName}</strong>
    <dl className="example-contact-details">
      <div><dt>Location</dt><dd>{location}</dd></div>
      <div><dt>Phone</dt><dd>{phone}</dd></div>
      <div><dt>Email</dt><dd>{email}</dd></div>
    </dl>
  </div>;
}

function ResumeDocument({ resume, duplicate, onOpen }) {
  return (
    <>
      <ResumeIdentity resume={resume} />
      <button type="button" className="example-open-preview" onClick={onOpen} tabIndex={duplicate ? -1 : 0}>View full resume <span aria-hidden="true">↗</span></button>
      <button type="button" className="example-original-frame" onClick={onOpen} tabIndex={duplicate ? -1 : 0} aria-label={`Read full ${resume.name} resume`} style={{ aspectRatio: `${resume.width} / ${resume.height}` }}>
        <Image className="example-original-image" src={resume.image} alt={`Original supplied ${resume.name} resume, with unchanged text and formatting`} width={resume.width} height={resume.height} unoptimized />
      </button>
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
      <div><h3 id="example-reader-title">{resume.name}</h3><p>Original resume · Zoom to read every detail</p></div>
      <div className="example-reader-controls">
        <button type="button" onClick={() => setZoom((current) => Math.max(0.75, current - 0.25))} disabled={zoom <= 0.75} aria-label="Zoom out">−</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((current) => Math.min(2.5, current + 0.25))} disabled={zoom >= 2.5} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(1)}>100%</button>
        <a href={resume.image} target="_blank" rel="noopener noreferrer">Open original ↗</a>
        <button type="button" autoFocus onClick={onClose} aria-label="Close resume preview">✕</button>
      </div>
    </header>
    <div className="example-reader-profile"><ResumeIdentity resume={resume} /></div>
    <div className="example-reader-scroll">
      <Image className="example-reader-image" src={resume.image} alt={`Full original ${resume.name} resume`} width={resume.width} height={resume.height} style={{ width: resume.width * zoom, height: "auto" }} unoptimized />
    </div>
  </dialog>;
}
