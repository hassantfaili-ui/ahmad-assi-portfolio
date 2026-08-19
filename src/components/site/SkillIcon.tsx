/**
 * A drawn mark for each piece of software Ahmad works in.
 *
 * These are not the vendors' logos. Brand marks are coloured, trademarked, and
 * would drag nine different house styles into a page that is deliberately black
 * and white. Each glyph instead draws what the tool is for: a bezier with its
 * handles for Illustrator, a dimension string for AutoCAD, a surface patch for
 * Rhino. One line weight, one grid, so the set reads as a set.
 *
 * Anything without a glyph falls back to its initials, so adding a tool to the
 * resume never leaves a hole.
 */

import type { ReactElement } from 'react';

export interface SkillIconProps {
  name: string;
}

/* Keyed by the name with everything but letters and digits stripped, so
   "D5 Render" and "ArcGIS Pro" find their drawing. Held in one map rather than
   a run of conditionals and a second hand written list of the same keys, which
   is what the fallback used to have to be kept in step with. */
const GLYPHS: Record<string, ReactElement> = {
  /* SketchUp: an axonometric box, drawn with the overshooting edges the tool is known for */
  sketchup: (
    <>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z" />
      <path d="M4 8l8 4.5L20 8" />
      <path d="M12 12.5v8" />
      <path d="M20.8 7.5 22.4 6.6M3.2 7.5 1.6 6.6M12 2.6V1" />
    </>
  ),

  /* D5 Render: a lit sphere, the terminator and a key light */
  d5render: (
    <>
      <circle cx="12" cy="13.5" r="6.5" />
      <path d="M12 7a4.4 6.5 0 0 0 0 13" />
      <path d="M19.8 5.2 17.4 7.6M22 9.2l-2.6.8M17.6 2.4l-.8 2.6" />
    </>
  ),

  /* Illustrator: a bezier with its anchor points and one control handle */
  illustrator: (
    <>
      <path d="M3.5 18C7 7 17 7 20.5 18" />
      <path d="M3.5 18 8 9.5" />
      <circle cx="8" cy="9.5" r="1.4" />
      <rect x="2.2" y="16.7" width="2.6" height="2.6" />
      <rect x="19.2" y="16.7" width="2.6" height="2.6" />
    </>
  ),

  /* Photoshop: a tonal curve against its linear reference */
  photoshop: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M3.5 20.5 20.5 3.5" strokeDasharray="1.5 2" opacity="0.45" />
      <path d="M3.5 20.5C8 19 9.5 8 20.5 3.5" />
      <circle cx="9.4" cy="15.2" r="1.15" />
      <circle cx="15" cy="7.6" r="1.15" />
    </>
  ),

  /* InDesign: a two page spread with its text block and baselines */
  indesign: (
    <>
      <path d="M11 5.2 3.5 4v16l7.5 1.2M13 5.2 20.5 4v16L13 21.2" />
      <path d="M12 5.2v16" />
      <path d="M5.6 8.2h3.2M5.6 11h3.2M5.6 13.8h3.2M15.2 8.2h3.2M15.2 11h3.2M15.2 13.8h3.2" />
    </>
  ),

  /* AutoCAD: a dimension string with extension lines and ticks */
  autocad: (
    <>
      <path d="M4.5 5v14M19.5 5v14" />
      <path d="M4.5 12h15" />
      <path d="M6.8 10.2 4.5 12l2.3 1.8M17.2 10.2 19.5 12l-2.3 1.8" />
      <path d="M8 17.5h8" strokeDasharray="1.5 2" opacity="0.45" />
    </>
  ),

  /* Rhino: a surface patch with its isoparms */
  rhino: (
    <>
      <path d="M3 13.2C7 7.4 13 16.4 21 9.6" />
      <path d="M3 17.8C7 12 13 21 21 14.2" />
      <path d="M3 13.2v4.6M21 9.6v4.6M8.6 11.5v4.6M14.7 15.4v4.6" />
      <circle cx="3" cy="13.2" r="1.1" />
      <circle cx="21" cy="9.6" r="1.1" />
    </>
  ),

  /* Revit: a section through a building, levels marked */
  revit: (
    <>
      <path d="M6.5 4.5h13v15h-13z" />
      <path d="M6.5 9.5h13M6.5 14.5h13" />
      <path d="M3 9.5h3.5M3 14.5h3.5M3 19.5h3.5" />
      <circle cx="2.4" cy="9.5" r="0.9" />
      <path d="M10 14.5v5" />
    </>
  ),

  /* ArcGIS Pro: contours with a spot height */
  arcgispro: (
    <>
      <path d="M2.5 18.5c3-5 6-6.5 9-4.5s5.5.5 10-4" />
      <path d="M2.5 14c2.6-4.2 5.4-5.6 8-3.9" />
      <path d="M4.5 9.6c1.9-2.6 3.8-3.4 5.6-2.6" />
      <path d="m16.5 4.5 2.4 4.2h-4.8z" />
    </>
  ),
};

/** Initials for the fallback: "ArcGIS Pro" becomes AP, "Rhino" becomes RH. */
function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : name.slice(0, 2)
  ).toUpperCase();
}

export default function SkillIcon({ name }: SkillIconProps) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const glyph = GLYPHS[key];

  return (
    <svg
      className="skill-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Anything added to the resume later */}
      {glyph ?? (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" />
          <text
            x="12"
            y="12"
            textAnchor="middle"
            dominantBaseline="central"
            stroke="none"
            fill="currentColor"
            fontSize="7.5"
            fontFamily="var(--data)"
            letterSpacing="0.4"
          >
            {initialsFor(name)}
          </text>
        </>
      )}
    </svg>
  );
}
