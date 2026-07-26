/**
 * Procedural architectural line work.
 *
 * These stand in for Ahmad's real drawings and photographs until he supplies
 * them. They are deterministic: the same seed always produces the same drawing,
 * so builds are reproducible and nothing shifts between deploys.
 *
 * Every stroke uses a theme token, so the same drawing reads as pencil on bond
 * and as white line work on a blueline print without a second asset.
 */

export type DrawingKind =
  | 'plan'
  | 'section'
  | 'elevation'
  | 'axonometric'
  | 'site'
  | 'photo';

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 800;
const H = 600;

/* pen weights, named the way a drafting set names them */
const PEN = {
  poche: 'stroke="var(--ink)" stroke-width="6" fill="none"',
  heavy: 'stroke="var(--ink)" stroke-width="2.4" fill="none"',
  med: 'stroke="var(--ink-2)" stroke-width="1.3" fill="none"',
  thin: 'stroke="var(--line)" stroke-width="0.7" fill="none"',
  accent: 'stroke="var(--accent)" stroke-width="1.6" fill="none"',
};

const LETTER = 'font-family="IBM Plex Mono, monospace" fill="var(--ink-3)"';

function defs(id: string) {
  return `<defs>
    <pattern id="h-${id}" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--line)" stroke-width="0.9"/>
    </pattern>
    <pattern id="g-${id}" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0H0v20" fill="none" stroke="var(--line-2)" stroke-width="0.5"/>
    </pattern>
  </defs>`;
}

/** Dimension string: ticks at both ends, the measurement set into the line. */
function dim(x1: number, y: number, x2: number, label: string) {
  return `<g>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ${PEN.thin}/>
    <line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" ${PEN.thin}/>
    <line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" ${PEN.thin}/>
    <text x="${(x1 + x2) / 2}" y="${y - 7}" ${LETTER} font-size="12" letter-spacing="1.4" text-anchor="middle">${label}</text>
  </g>`;
}

function bubble(x: number, y: number, label: string) {
  return `<g>
    <circle cx="${x}" cy="${y}" r="11" ${PEN.thin}/>
    <text x="${x}" y="${y + 4}" ${LETTER} font-size="11" text-anchor="middle">${label}</text>
  </g>`;
}

function north(x: number, y: number) {
  return `<g>
    <circle cx="${x}" cy="${y}" r="18" ${PEN.thin}/>
    <path d="M${x} ${y - 15}L${x + 6} ${y + 6}L${x} ${y + 1}L${x - 6} ${y + 6}Z" fill="var(--ink-2)"/>
    <text x="${x}" y="${y - 22}" ${LETTER} font-size="11" text-anchor="middle">N</text>
  </g>`;
}

/* ---------------------------------------------------------------- plan --- */

type Box = { x: number; y: number; w: number; h: number };

/** Recursively split a rectangle: produces plans that read as plausible. */
function subdivide(box: Box, depth: number, r: () => number, out: Box[]) {
  const min = 78;
  if (depth === 0 || (box.w < min * 2 && box.h < min * 2)) {
    out.push(box);
    return;
  }
  const vertical = box.w > box.h ? r() > 0.22 : r() > 0.78;
  const t = 0.34 + r() * 0.32;
  if (vertical) {
    const cut = Math.round(box.w * t);
    if (cut < min || box.w - cut < min) return out.push(box);
    subdivide({ ...box, w: cut }, depth - 1, r, out);
    subdivide({ ...box, x: box.x + cut, w: box.w - cut }, depth - 1, r, out);
  } else {
    const cut = Math.round(box.h * t);
    if (cut < min || box.h - cut < min) return out.push(box);
    subdivide({ ...box, h: cut }, depth - 1, r, out);
    subdivide({ ...box, y: box.y + cut, h: box.h - cut }, depth - 1, r, out);
  }
}

function plan(id: string, r: () => number) {
  const box = { x: 118, y: 92, w: 560, h: 396 };
  const rooms: Box[] = [];
  subdivide(box, 4, r, rooms);

  const walls = rooms
    .map(
      (b) =>
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" stroke="var(--ink-2)" stroke-width="3.4" fill="none"/>`,
    )
    .join('');

  // hatch one room and give another a floor grid, the way a plan distinguishes use
  const a = rooms[Math.floor(r() * rooms.length)];
  const b = rooms[Math.floor(r() * rooms.length)];
  const fills =
    (a ? `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="url(#h-${id})"/>` : '') +
    (b && b !== a
      ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#g-${id})"/>`
      : '');

  // door swings on a few partitions
  const doors = rooms
    .slice(0, 4)
    .map((room) => {
      const s = 34;
      const x = room.x + 18;
      const y = room.y + room.h;
      return `<path d="M${x} ${y}v-${s}" ${PEN.med}/><path d="M${x} ${y - s}A${s} ${s} 0 0 1 ${x + s} ${y}" ${PEN.thin}/>`;
    })
    .join('');

  const cols = ['A', 'B', 'C', 'D']
    .map((l, i) => bubble(box.x + 60 + i * ((box.w - 120) / 3), 60, l))
    .join('');
  const rowNums = ['1', '2', '3']
    .map((l, i) => bubble(84, box.y + 60 + i * ((box.h - 120) / 2), l))
    .join('');

  return `${defs(id)}
    ${fills}
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ${PEN.poche}/>
    ${walls}${doors}${cols}${rowNums}
    ${dim(box.x, 536, box.x + box.w, '24 000')}
    ${north(700, 552)}`;
}

/* ------------------------------------------------------------- section --- */

function section(id: string, r: () => number) {
  const levels = 3 + Math.floor(r() * 2);
  const gh = 92;
  const base = 470;
  const x = 130;
  const w = 540;

  let out = '';
  for (let i = 0; i < levels; i++) {
    const y = base - i * gh;
    out += `<rect x="${x}" y="${y - 9}" width="${w}" height="9" fill="var(--ink-2)"/>`;
    out += `<line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y - gh + 9}" ${PEN.med}/>`;
    out += `<line x1="${x + w}" y1="${y - 9}" x2="${x + w}" y2="${y - gh + 9}" ${PEN.med}/>`;
    // level marker with an elevation, as a section is annotated
    out += `<g><line x1="${x - 46}" y1="${y - 9}" x2="${x}" y2="${y - 9}" ${PEN.thin}/>
      <circle cx="${x - 52}" cy="${y - 9}" r="5" ${PEN.thin}/>
      <text x="${x - 62}" y="${y - 5}" ${LETTER} font-size="11" text-anchor="end">+${(i * 3.4).toFixed(2)}</text></g>`;
    // an interior partition per level, placed by seed
    const p = x + 90 + Math.floor(r() * (w - 200));
    out += `<line x1="${p}" y1="${y - 9}" x2="${p}" y2="${y - gh + 9}" ${PEN.thin}/>`;
  }

  // stair: a zigzag through the section, which is what a section is for
  let stair = '';
  const sx = x + w - 150;
  for (let i = 0; i < levels - 1; i++) {
    const y = base - i * gh;
    stair += `<path d="M${sx} ${y - 9}l${110} -${gh}" ${PEN.med}/>`;
  }

  const roofY = base - levels * gh;
  return `${defs(id)}
    <rect x="${x}" y="${roofY + gh - 9}" width="${w}" height="${levels * gh}" fill="none"/>
    ${out}${stair}
    <path d="M${x - 14} ${roofY + gh - 9}h${w + 28}" ${PEN.heavy}/>
    <line x1="60" y1="${base}" x2="740" y2="${base}" ${PEN.poche}/>
    <rect x="60" y="${base + 3}" width="680" height="46" fill="url(#h-${id})"/>
    ${dim(x, roofY + gh - 28, x + w, '18 400')}`;
}

/* ----------------------------------------------------------- elevation --- */

function elevation(id: string, r: () => number) {
  const x = 120;
  const w = 560;
  const base = 470;
  const h = 300 + Math.floor(r() * 60);
  const top = base - h;
  const cols = 5 + Math.floor(r() * 3);
  const rows = 3 + Math.floor(r() * 2);
  const cw = w / cols;
  const rh = h / rows;

  let win = '';
  for (let c = 0; c < cols; c++) {
    for (let ro = 0; ro < rows; ro++) {
      const p = r();
      if (p < 0.16) continue;
      const wx = x + c * cw + cw * 0.2;
      const wy = top + ro * rh + rh * 0.22;
      const ww = cw * 0.6;
      const wh = rh * 0.56;
      const solid = p > 0.74;
      win += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" ${
        solid ? 'fill="var(--ink-2)" stroke="none"' : PEN.med
      }/>`;
      if (!solid) {
        win += `<line x1="${wx + ww / 2}" y1="${wy}" x2="${wx + ww / 2}" y2="${wy + wh}" ${PEN.thin}/>`;
      }
    }
  }

  return `${defs(id)}
    <rect x="${x}" y="${top}" width="${w}" height="${h}" ${PEN.heavy}/>
    <line x1="${x - 12}" y1="${top - 10}" x2="${x + w + 12}" y2="${top - 10}" ${PEN.poche}/>
    ${win}
    <line x1="50" y1="${base}" x2="750" y2="${base}" ${PEN.poche}/>
    <rect x="50" y="${base + 3}" width="700" height="40" fill="url(#h-${id})"/>
    ${dim(x, top - 30, x + w, '24 000')}
    <text x="${x + w + 22}" y="${top + h / 2}" ${LETTER} font-size="12" letter-spacing="1.6">SOUTH</text>`;
}

/* --------------------------------------------------------- axonometric --- */

function axonometric(id: string, r: () => number) {
  // 30 degree axonometric projection
  const k = 0.52;
  const ox = 390;
  const oy = 430;
  const p = (x: number, y: number, z: number): [number, number] => [
    ox + (x - y) * 0.866 * k * 2,
    oy - (x + y) * k - z * k * 2,
  ];
  const poly = (pts: [number, number][], fill: string, w = 2.2) =>
    `<polygon points="${pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}" fill="${fill}" stroke="var(--ink)" stroke-width="${w}" stroke-linejoin="round"/>`;

  const count = 3 + Math.floor(r() * 2);
  const boxes = [];
  let cx = 0;
  for (let i = 0; i < count; i++) {
    const w = 96 + Math.floor(r() * 76);
    const d = 88 + Math.floor(r() * 78);
    boxes.push({
      x: cx,
      y: Math.floor(r() * 70),
      w,
      d,
      h: 66 + Math.floor(r() * 128),
    });
    cx += w - Math.floor(r() * 22);
  }

  // ground plane, drawn first so the massing sits on it
  let ground = '';
  for (let i = 0; i <= 8; i++) {
    const a = p(-60 + i * 64, -60, 0);
    const b = p(-60 + i * 64, 340, 0);
    const c = p(-60, -60 + i * 50, 0);
    const e = p(460, -60 + i * 50, 0);
    ground += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" ${PEN.thin}/>`;
    ground += `<line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" ${PEN.thin}/>`;
  }

  let out = '';
  for (const b of boxes) {
    const { x, y, w, d, h } = b;
    // cast shadow: sun from the left, so the massing reads as solid
    out += poly(
      [p(x, y + d, 0), p(x + w, y + d, 0), p(x + w + h * 0.5, y + d + h * 0.5, 0), p(x + h * 0.5, y + d + h * 0.5, 0)],
      'var(--hatch)',
      0.7,
    );
    const left = [p(x, y + d, 0), p(x, y + d, h), p(x, y, h), p(x, y, 0)] as [number, number][];
    const front = [p(x, y + d, 0), p(x + w, y + d, 0), p(x + w, y + d, h), p(x, y + d, h)] as [
      number,
      number,
    ][];
    const top = [p(x, y, h), p(x + w, y, h), p(x + w, y + d, h), p(x, y + d, h)] as [
      number,
      number,
    ][];
    out += poly(left, `url(#h-${id})`);
    out += poly(front, 'var(--sheet-2)');
    out += poly(top, 'var(--sheet)');

    // storey lines on the front face, which is what gives it scale
    const storeys = Math.max(1, Math.round(h / 42));
    for (let s = 1; s < storeys; s++) {
      const z = (h / storeys) * s;
      const a = p(x, y + d, z);
      const e = p(x + w, y + d, z);
      out += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" ${PEN.thin}/>`;
    }
    // one deep opening per volume
    if (r() > 0.35) {
      const o1 = p(x + w * 0.28, y + d, h * 0.16);
      const o2 = p(x + w * 0.72, y + d, h * 0.16);
      const o3 = p(x + w * 0.72, y + d, h * 0.62);
      const o4 = p(x + w * 0.28, y + d, h * 0.62);
      out += poly([o1, o2, o3, o4], 'var(--ink-2)', 1.2);
    }
  }

  return `${defs(id)}${ground}${out}
    <text x="58" y="556" ${LETTER} font-size="12" letter-spacing="1.6">AXONOMETRIC</text>`;
}

/* ------------------------------------------------------------- site --- */

function site(id: string, r: () => number) {
  let contours = '';
  for (let i = 0; i < 9; i++) {
    const amp = 26 + r() * 30;
    const off = 70 + i * 52;
    const pts: string[] = [];
    for (let x = 40; x <= 760; x += 24) {
      const y = off + Math.sin((x / 150) * (1 + i * 0.06)) * amp * 0.5 + Math.cos(x / 90) * 8;
      pts.push(`${x},${Math.round(y)}`);
    }
    contours += `<polyline points="${pts.join(' ')}" ${i % 4 === 0 ? PEN.med : PEN.thin}/>`;
    if (i % 4 === 0) {
      contours += `<text x="770" y="${off + 4}" ${LETTER} font-size="10" text-anchor="end">${
        120 + i * 5
      }</text>`;
    }
  }

  const fx = 250 + Math.floor(r() * 120);
  const fy = 250 + Math.floor(r() * 80);
  const footprint = `<path d="M${fx} ${fy}h180v70h-70v80h-110Z" fill="var(--ink)" stroke="none"/>`;
  const approach = `<path d="M${fx - 150} ${fy + 210}q120 -40 ${150} -${100}" ${PEN.accent} stroke-dasharray="7 6"/>`;

  return `${defs(id)}${contours}${footprint}${approach}
    ${north(716, 556)}
    <g><line x1="56" y1="556" x2="176" y2="556" ${PEN.heavy}/>
      <line x1="56" y1="550" x2="56" y2="562" ${PEN.heavy}/>
      <line x1="116" y1="550" x2="116" y2="562" ${PEN.thin}/>
      <line x1="176" y1="550" x2="176" y2="562" ${PEN.heavy}/>
      <text x="56" y="544" ${LETTER} font-size="10">0</text>
      <text x="176" y="544" ${LETTER} font-size="10" text-anchor="end">50 M</text></g>`;
}

/* ------------------------------------------------------------ interior --- */
/**
 * Stands in for a photograph or render: a one point interior perspective.
 * A room, not a vanishing point exercise, so it has walls with openings,
 * a lit aperture, and a figure to give it scale.
 */
function photo(id: string, r: () => number) {
  const vx = 250 + Math.floor(r() * 300);
  const vy = 230 + Math.floor(r() * 105);
  // which wall carries the openings, and whether the room has a mezzanine
  const mirror = r() > 0.5;
  const mezzanine = r() > 0.52;

  // the back wall: the room's far end
  const bw = 170 + Math.floor(r() * 215);
  const bh = 128 + Math.floor(r() * 122);
  const bx1 = vx - bw / 2;
  const bx2 = vx + bw / 2;
  const by1 = vy - bh / 2;
  const by2 = vy + bh / 2;

  const quad = (pts: number[][], fill: string, w = 1.3) =>
    `<polygon points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="${fill}" stroke="var(--ink-2)" stroke-width="${w}"/>`;

  // room surfaces
  const ceiling = quad([[0, 0], [bx1, by1], [bx2, by1], [800, 0]], 'var(--sheet)');
  const floorPlane = quad([[0, 600], [bx1, by2], [bx2, by2], [800, 600]], 'var(--sheet-2)');
  const leftWall = quad([[0, 0], [bx1, by1], [bx1, by2], [0, 600]], `url(#h-${id})`);
  const rightWall = quad([[800, 0], [bx2, by1], [bx2, by2], [800, 600]], 'var(--sheet)');

  // floorboards receding toward the vanishing point
  let boards = '';
  const bays = 5 + Math.floor(r() * 4);
  for (let i = 0; i <= bays; i++) {
    const fx = (800 / bays) * i;
    const tx = bx1 + (bw / bays) * i;
    boards += `<line x1="${fx}" y1="600" x2="${tx.toFixed(1)}" y2="${by2}" ${PEN.thin}/>`;
  }
  for (let i = 1; i <= 7; i++) {
    const t = 1 - Math.pow(0.66, i);
    const y = 600 + (by2 - 600) * t;
    boards += `<line x1="${(0 + (bx1 - 0) * t).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(
      800 +
      (bx2 - 800) * t
    ).toFixed(1)}" y2="${y.toFixed(1)}" ${PEN.thin}/>`;
  }

  // openings marching down one side wall, spaced in perspective
  let bays2 = '';
  const n = 2 + Math.floor(r() * 3);
  const wx = mirror ? 800 : 0;
  const wxb = mirror ? bx2 : bx1;
  const decay = 0.54 + r() * 0.16;
  const hiTop = 0.1 + r() * 0.18;
  const hiBot = hiTop + 0.4 + r() * 0.24;
  for (let i = 0; i < n; i++) {
    const t0 = 1 - Math.pow(decay, i + 1);
    const t1 = 1 - Math.pow(decay, i + 1.7);
    const x0 = wx + (wxb - wx) * t0;
    const x1 = wx + (wxb - wx) * t1;
    const yTop0 = by1 * t0;
    const yTop1 = by1 * t1;
    const yBot0 = 600 + (by2 - 600) * t0;
    const yBot1 = 600 + (by2 - 600) * t1;
    const top = yTop0 + (yBot0 - yTop0) * hiTop;
    const bot = yTop0 + (yBot0 - yTop0) * hiBot;
    const top1 = yTop1 + (yBot1 - yTop1) * hiTop;
    const bot1 = yTop1 + (yBot1 - yTop1) * hiBot;
    bays2 += quad(
      [[x0, top], [x1, top1], [x1, bot1], [x0, bot]],
      i % 2 === 0 ? 'var(--sheet)' : 'var(--ink-2)',
      1.1,
    );
  }

  // A soffit across the back of the room on some plans: one horizontal that
  // reads as ceiling depth rather than as a floating plane.
  const soffit = mezzanine
    ? `<line x1="${bx1}" y1="${(by1 + bh * 0.26).toFixed(1)}" x2="${bx2}" y2="${(
        by1 +
        bh * 0.26
      ).toFixed(1)}" ${PEN.med}/>`
    : '';

  // the aperture in the back wall, and the light it throws across the floor
  const aw = bw * (0.26 + r() * 0.32);
  const ah = bh * (0.5 + r() * 0.28);
  const ax = bx1 + (bw - aw) * (0.12 + r() * 0.76);
  const ay = by2 - ah;
  const aperture = `<rect x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${aw.toFixed(
    1,
  )}" height="${ah.toFixed(1)}" fill="url(#g-${id})" ${PEN.heavy.replace('fill="none"', '')}/>`;
  const light = `<polygon points="${ax.toFixed(1)},${by2} ${(ax + aw).toFixed(1)},${by2} ${(
    vx +
    aw * 1.9
  ).toFixed(1)},600 ${(vx - aw * 2.1).toFixed(1)},600" fill="var(--hatch)" stroke="none"/>`;

  // scale figure, standing on the floor at mid depth
  const ft = 0.42 + r() * 0.2;
  const fgx = vx + (r() > 0.5 ? 1 : -1) * (bw * (0.5 + r() * 0.5));
  const fgy = 600 + (by2 - 600) * ft;
  const fh = (600 - fgy) * 0.42 + 34;
  const figure = `<g fill="var(--ink)" stroke="none">
    <circle cx="${fgx.toFixed(1)}" cy="${(fgy - fh).toFixed(1)}" r="${(fh * 0.1).toFixed(1)}"/>
    <path d="M${(fgx - fh * 0.11).toFixed(1)} ${(fgy - fh * 0.86).toFixed(1)}h${(fh * 0.22).toFixed(
      1,
    )}l${(fh * 0.03).toFixed(1)} ${(fh * 0.86).toFixed(1)}h-${(fh * 0.28).toFixed(1)}Z"/>
  </g>`;

  return `${defs(id)}
    ${ceiling}${floorPlane}${leftWall}${rightWall}
    ${boards}${light}${bays2}${soffit}
    <rect x="${bx1}" y="${by1}" width="${bw}" height="${bh}" ${PEN.med}/>
    ${aperture}${figure}
    <line x1="0" y1="${vy}" x2="800" y2="${vy}" ${PEN.thin} stroke-dasharray="3 9"/>
    <circle cx="${vx}" cy="${vy}" r="3" fill="var(--accent)" stroke="none"/>`;
}

const MAKERS: Record<DrawingKind, (id: string, r: () => number) => string> = {
  plan,
  section,
  elevation,
  axonometric,
  site,
  photo,
};

export function drawingSvg(kind: DrawingKind, seed = 1): { body: string; viewBox: string } {
  const id = `${kind}${seed}`;
  const make = MAKERS[kind] ?? photo;
  return { body: make(id, rng(seed * 2654435761)), viewBox: `0 0 ${W} ${H}` };
}
