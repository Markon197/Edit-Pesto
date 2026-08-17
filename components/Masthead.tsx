"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { VERSION_LABEL } from "@/lib/version";
import { fetchJson } from "@/lib/fetchJson";

export default function Masthead() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  // Sync with whatever the blocking init script (layout.tsx) already set on
  // <html> before hydration, so there's no flash and no mismatch.
  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  // One ping per page load, for the stats page's visit count. Masthead is
  // rendered fresh by each page (not a persistent layout), so this fires
  // once per navigation — including switching tabs — not once per browser
  // session. Never lets a logging hiccup show up as a user-facing error.
  useEffect(() => {
    fetchJson("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("pestobot-theme", next);
    } catch {
      // localStorage can throw in some privacy modes — theme still applies
      // for this page view, it just won't be remembered next visit.
    }
    setIsDark(next === "dark");
  }

  return (
    <>
      <div className="masthead-bar">
        <div className="masthead">
          <div className="masthead-left">
            <div className="brand">
              <svg className="logo-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
                <line x1="16" y1="10" x2="16" y2="5" stroke="#201d16" strokeWidth="1.3" />
                <path
                  className="antenna-leaf"
                  d="M16 2.3c1.9 0 3.4 1.2 3.4 2.7 0 .9-1.5 1.4-3.4 1.4s-3.4-.5-3.4-1.4c0-1.5 1.5-2.7 3.4-2.7z"
                  fill="#4c6b23"
                />
                <rect x="6" y="10" width="20" height="16" rx="6" fill="#fffdf8" stroke="#201d16" strokeWidth="1.3" />
                <circle cx="5" cy="17.5" r="2" fill="#fffdf8" stroke="#201d16" strokeWidth="1.1" />
                <circle cx="27" cy="17.5" r="2" fill="#fffdf8" stroke="#201d16" strokeWidth="1.1" />
                <circle cx="12.5" cy="18.5" r="1.6" fill="#201d16" />
                <circle cx="19.5" cy="18.5" r="1.6" fill="#201d16" />
                <rect x="12" y="22" width="8" height="2" rx="1" fill="#4c6b23" opacity="0.85" />
              </svg>
              {isDark && (
                <span className="nut-free-badge" aria-hidden="true">
                  Nut Free
                </span>
              )}
              <div className="wordmark">
                Pesto<span>Bot</span>
              </div>
              <span className="version-badge">{VERSION_LABEL}</span>
            </div>
          </div>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? "☀ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>
      <div className="tabs-bar">
        <nav className="tabs">
          <Link href="/" className={`tab${pathname === "/" ? " active" : ""}`}>
            Edit
          </Link>
          <Link href="/calendar" className={`tab${pathname === "/calendar" ? " active" : ""}`}>
            Calendar
          </Link>
        </nav>
      </div>
    </>
  );
}
