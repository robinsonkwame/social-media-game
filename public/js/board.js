// The candy-village board: tiles, roads, signs, key, and the raised game
// pieces. Shared by the host's projected screen and every phone.
import { CFG, SEGS, START, seg, buildPath } from './rules.js';
import { term } from './ui.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initial = t => (t.isPlayer ? '★' : (t.name.replace(/^@/, '')[0] || '?').toUpperCase());

const SPACE_COLOR = { Deal: "var(--mint)", Feed: "#f6e9f1", Event: "var(--accent)", Talent: "var(--lilac)", Payday: "var(--gold)", Fork: "#ffffff", Finish: "var(--gold)", Start: "#ffffff" };
const PRIZE_SHORT = '$' + (CFG.prize >= 1e6 ? `${CFG.prize / 1e6}M` : `${CFG.prize / 1000}K`);
const SPACE_GLYPH = { Deal: "D", Feed: "F", Event: "E", Talent: "T", Payday: "$", Fork: "Y", Finish: PRIZE_SHORT, Start: "GO" };
// which glossary card each space type opens
const SPACE_TERM = { Deal: 'dealSpace', Feed: 'feed', Event: 'eventSpace', Talent: 'talent', Payday: 'payday', Fork: 'fork', Finish: 'finish' };
const KEY_ROWS = [["Deal", "Deal"], ["Feed", "Feed"], ["Event", "Event"], ["Talent", "Talent"], ["Payday", "Payday"], ["Fork", "Fork"], ["Finish", `Finish: ${PRIZE_SHORT}`]];
// a solid sign so road names read from across the room
function boardSign(x, y, text, size, fill, ink, rot = 0) {
  const w = text.length * size * 0.66 + size * 1.4, hgt = size * 1.6;
  return `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - w / 2}" y="${y - hgt / 2}" width="${w}" height="${hgt}" rx="${hgt / 2.4}" fill="${fill}" stroke="#1f0d24" stroke-width=".35"/>` +
    `<text x="${x}" y="${y + size * 0.36}" text-anchor="middle" font-size="${size}" font-family="Bagel Fat One, system-ui" fill="${ink}" letter-spacing=".05">${text}</text></g>`;
}

function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function drawBoardInto(svg, legend) {
  const P = n => SEGS[n].pts;
  const last = n => P(n)[P(n).length - 1];
  const routes = [
    { pts: [[START.x, START.y], ...P("trunk1")], cls: "trunk" },
    { pts: [last("trunk1"), ...P("f1q"), P("trunk2")[0]], cls: "quiet" },
    { pts: [last("trunk1"), ...P("f1v"), P("trunk2")[0]], cls: "viral" },
    { pts: P("trunk2"), cls: "trunk" },
    { pts: [last("trunk2"), ...P("f2q"), P("trunk3")[0]], cls: "quiet" },
    { pts: [last("trunk2"), ...P("f2v"), P("trunk3")[0]], cls: "viral" },
    { pts: P("trunk3"), cls: "trunk" },
  ];
  let h = `<image href="img/candy-village-background.jpg" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice"/>`;
  h += `<rect x="0" y="0" width="100" height="100" fill="rgba(255,240,248,.12)"/>`;
  for (const r of routes) {
    const d = smoothPath(r.pts);
    h += `<path d="${d}" fill="none" stroke="rgba(60,20,50,.35)" stroke-width="4.2" stroke-linecap="round"/>`;
    if (r.cls === "viral") {
      h += `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>`;
      h += `<path d="${d}" fill="none" stroke="#e3367a" stroke-width="3.2" stroke-dasharray="1.4 1.4"/>`;
    } else {
      h += `<path d="${d}" fill="none" stroke="${r.cls === "quiet" ? "#bfeee2" : "#ffe3f0"}" stroke-width="3.2" stroke-linecap="round"/>`;
    }
  }
  const tiles = [START, ...["trunk1", "f1q", "f1v", "trunk2", "f2q", "f2v", "trunk3"].flatMap(seg)];
  for (const s of tiles) {
    const r = s.type === "Finish" ? 4.4 : (s.type === "Start" ? 3.6 : 2.6);
    const fill = SPACE_COLOR[s.type];
    h += `<g class="tile"><circle cx="${s.x}" cy="${s.y}" r="${r}" fill="${fill}" stroke="rgba(60,20,50,.55)" stroke-width=".45"/>`;
    const g = SPACE_GLYPH[s.type];
    if (g) h += `<text x="${s.x}" y="${s.y + (s.type === "Finish" ? 0.9 : 0.8)}" text-anchor="middle" font-size="${s.type === "Finish" ? (g.length > 3 ? 1.9 : 2.6) : (g.length > 1 ? 1.6 : 2.4)}" font-family="Bagel Fat One, system-ui" fill="${s.type === "Feed" || s.type === "Fork" || s.type === "Start" ? "#5b2f55" : "#ffffff"}">${g}</text>`;
    h += `</g>`;
  }
  // road signs: fork 1 big, fork 2 smaller
  h += boardSign(77, 4.6, "QUIET ROAD", 3.2, "#bfeee2", "#0f4d40", -3);
  h += boardSign(51, 37, "VIRAL ROAD", 3.2, "#e3367a", "#ffffff", 4);
  h += boardSign(4.2, 74, "QUIET", 2.3, "#bfeee2", "#0f4d40", -90);
  h += boardSign(35, 70.5, "VIRAL", 2.3, "#e3367a", "#ffffff", 6);
  // on-board key
  const kx = 1.5, ky = 9, rowH = 2.9;
  h += `<g><rect x="${kx}" y="${ky}" width="19" height="${4 + KEY_ROWS.length * rowH}" rx="1.6" fill="rgba(255,255,255,.94)" stroke="#1f0d24" stroke-width=".3"/>`;
  h += `<text x="${kx + 1.4}" y="${ky + 2.9}" font-size="2" font-family="Bagel Fat One, system-ui" fill="#1f0d24">KEY</text>`;
  KEY_ROWS.forEach(([type, label], i) => {
    const cy = ky + 5.4 + i * rowH, glyph = SPACE_GLYPH[type];
    const dark = type === "Feed" || type === "Fork";
    h += `<g class="key-row" data-term="${SPACE_TERM[type]}" role="button" tabindex="0" aria-label="What is ${type}?"><rect x="${kx + 0.6}" y="${cy - 1.4}" width="17.8" height="2.8" fill="transparent"/>`;
    h += `<circle cx="${kx + 2.6}" cy="${cy}" r="1.25" fill="${SPACE_COLOR[type]}" stroke="rgba(60,20,50,.55)" stroke-width=".3"/>`;
    h += `<text x="${kx + 2.6}" y="${cy + 0.5}" text-anchor="middle" font-size="${glyph.length > 3 ? 0.8 : glyph.length > 1 ? 1.1 : 1.4}" font-family="Bagel Fat One, system-ui" fill="${dark ? "#5b2f55" : "#ffffff"}">${glyph}</text>`;
    h += `<text x="${kx + 4.6}" y="${cy + 0.65}" font-size="1.8" font-family="Nunito Sans, system-ui" font-weight="800" fill="#1f0d24" text-decoration="underline">${label}</text></g>`;
  });
  h += `</g>`;
  h += `<defs><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".45"/></filter></defs>`;
  h += `<g id="pieces"></g>`;
  svg.innerHTML = h;
  if (legend) legend.innerHTML = [["Deal", "D · Deal: brands can offer to anyone"], ["Event", "E · Event: a true story fires"], ["Talent", "T · Talent"], ["Payday", "$ · Payday: attention × trust × $100"], ["Feed", "F · Feed"], ["Fork", "Y · Fork: pick a road"], ["Finish", `${PRIZE_SHORT} · Finish: the prize`]]
    .map(([t, l]) => `<span><i style="background:${SPACE_COLOR[t]}"></i>${term(SPACE_TERM[t], l)}</span>`).join("") +
    `<span><i style="background:repeating-linear-gradient(45deg,#e3367a 0 3px,#fff 3px 6px)"></i>${term('viralRoad', 'Viral road: shorter, more events, +1 risk')}</span>` +
    `<span><i style="border-radius:3px;background:#2f8fd6"></i>${term('brand', 'Square piece = brand')}</span><span><i style="background:#23a58a"></i>${term('influencer', 'Round piece = influencer')}</span>` +
    `<span><i style="background:#ffd23f;border-color:#ffffff"></i>Tall piece with a gold flashing rim = you</span>`;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f));
  return `rgb(${c.join(",")})`;
}
function drawPiecesInto(g, teams, meSlug, displayPos) {
  if (!g) return;
  const groups = {};
  for (const t of teams) {
    t.isPlayer = t.slug === meSlug;
    const sp = buildPath(t.c1, t.c2)[Math.min(displayPos[t.slug] ?? t.pos, buildPath(t.c1, t.c2).length - 1)];
    (groups[sp.key] = groups[sp.key] || []).push([t, sp]);
  }
  // draw back-to-front so nearer (lower) pieces overlap farther ones
  const items = [];
  for (const list of Object.values(groups)) {
    list.forEach(([t, sp], i) => {
      const n = list.length, ang = (i / n) * Math.PI * 2 - Math.PI / 2, off = n > 1 ? 2.4 : 0;
      const x = sp.x + Math.cos(ang) * off, y = sp.y + Math.sin(ang) * off;
      // height: you stand tallest; pieces sharing a space get staggered heights so none hides another
      const h = (t.isPlayer ? 4.2 : 2.4) + (n > 1 && !t.isPlayer ? (i % 3) * 0.9 : 0);
      items.push({ t, x, y, h });
    });
  }
  items.sort((a, b) => a.y - b.y || (a.t.isPlayer ? 1 : -1));
  let html = "";
  for (const { t, x, y, h } of items) {
    const top = y - h, side = shade(t.color, 0.62), dark = shade(t.color, 0.45);
    const d = ((t.joinedAt || 0) % 997 / 997 * 2.6).toFixed(2);
    const face = (dy, fill, cls) => t.role === "brand"
      ? `<rect class="${cls}" x="${x - 2}" y="${top - 2 + dy}" width="4" height="4" rx="1" fill="${fill}"/>`
      : `<circle class="${cls}" cx="${x}" cy="${top + dy}" r="2.1" fill="${fill}"/>`;
    html += `<g class="piece ${t.isPlayer ? "me" : ""}" style="--d:-${d}s"><title>${esc(t.isPlayer ? t.name + " (you)" : t.name)}</title>
      <ellipse cx="${x + 0.5}" cy="${y + 0.6}" rx="${t.isPlayer ? 2.8 : 2.4}" ry="1" fill="rgba(25,0,25,.5)" filter="url(#soft)"/>
      ${t.isPlayer ? `<circle class="halo" cx="${x}" cy="${y}" r="3" fill="none" stroke="#ffd23f" stroke-width=".6"/>` : ""}
      <g class="lift">
        <rect x="${x - 0.6}" y="${top}" width="1.2" height="${h}" rx=".5" fill="${dark}"/>
        ${face(0.8, side, "")}
        ${face(0, t.color, "rim")}
        <ellipse cx="${x - 0.7}" cy="${top - 0.9}" rx=".9" ry=".45" fill="rgba(255,255,255,.55)"/>
        <text x="${x}" y="${top + 0.8}" text-anchor="middle" font-size="2" font-family="Nunito Sans, system-ui" font-weight="800" fill="#ffffff">${esc(initial(t))}</text>
        ${t.isPlayer ? `<g transform="translate(${x} ${top - 3.6})"><rect x="-2.6" y="-1.3" width="5.2" height="2.3" rx="1.1" fill="#ffd23f" stroke="#1f0d24" stroke-width=".25"/><text y=".5" text-anchor="middle" font-size="1.5" font-family="Nunito Sans, system-ui" font-weight="800" fill="#1f0d24">YOU</text></g>` : ""}
      </g></g>`;
  }
  g.innerHTML = html;
}


// A board bound to an <svg>. update() draws pieces where they are now;
// when a host step moved pieces (game.step changed), the move plays out hop by
// hop along each team's trail first.
export function createBoard(svg, legend, { hopMs = 150 } = {}) {
  drawBoardInto(svg, legend);
  const group = () => svg.querySelector('#pieces');
  const shown = {};       // slug -> display position
  let lastStep = null, animating = Promise.resolve();
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    update(game, meSlug) {
      const teams = Object.values(game.teams);
      const trails = game.trails || {};
      const first = lastStep === null;
      const moved = !first && game.step !== lastStep;
      lastStep = game.step;
      animating = animating.then(async () => {
        if (moved && !reduced()) {
          const longest = Math.max(0, ...Object.values(trails).map(t => t.length));
          for (let i = 0; i < longest; i++) {
            for (const [slug, trail] of Object.entries(trails)) if (i < trail.length) shown[slug] = trail[i];
            drawPiecesInto(group(), teams, meSlug, shown);
            await new Promise(r => setTimeout(r, hopMs));
          }
        }
        for (const t of teams) shown[t.slug] = t.pos;
        for (const s of Object.keys(shown)) if (!game.teams[s]) delete shown[s];
        drawPiecesInto(group(), teams, meSlug, shown);
      });
      return animating;
    },
  };
}
