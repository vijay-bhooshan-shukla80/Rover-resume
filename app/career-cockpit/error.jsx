"use client";

import { useEffect } from "react";

const STORAGE_KEYS = ["ai_resume_maker_v2", "ai_resume_maker_v1"];

export default function CareerCockpitError({ error, reset }) {
  useEffect(() => {
    if (error) {
      console.error("[career-cockpit] runtime error", error);
    }
  }, [error]);

  function clearSavedDraft() {
    try {
      STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {}
    reset();
    window.location.reload();
  }

  return (
    <main className="builder-shell">
      <section className="builder-hero">
        <p className="eyebrow">Resume Workspace Recovery</p>
        <h1>Saved browser data caused the workspace to stop loading.</h1>
        <p className="hero-copy">
          Clear the saved local draft and reload the page. This does not affect server-side account data.
        </p>
        <div className="hero-actions">
          <button className="primary-btn" type="button" onClick={clearSavedDraft}>Clear Saved Draft And Reload</button>
          <button className="ghost-btn" type="button" onClick={() => reset()}>Try Again</button>
        </div>
        {error?.message ? <p className="notice">{error.message}</p> : null}
      </section>
    </main>
  );
}
