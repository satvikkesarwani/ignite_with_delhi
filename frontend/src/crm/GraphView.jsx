import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Maximize2, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { api } from './api';
import { ProfileDrawer } from './ProfileDrawer';
import { cn } from '@/lib/utils';

const ENDPOINT = '/api/crm/graph/overview';

/**
 * Node styling per backend group. Colours are CRM tokens only (resolved from CSS
 * variables at draw time, so the light theme works too). Shape carries meaning as well
 * as colour: muted Project and College would otherwise be indistinguishable.
 */
const GROUPS = {
  Winner: { token: '--accent', shape: 'ring', label: 'Winner' },
  Person: { token: '--text', shape: 'circle', label: 'Person' },
  Prize: { token: '--accent', shape: 'diamond', label: 'Prize project' },
  Project: { token: '--muted', shape: 'circle', label: 'Project' },
  Hackathon: { token: '--positive', shape: 'square', label: 'Hackathon' },
  Skill: { token: '--danger', shape: 'triangle', label: 'Skill' },
  College: { token: '--faint', shape: 'hollow', label: 'College' },
};
const GROUP_ORDER = ['Winner', 'Person', 'Prize', 'Project', 'Hackathon', 'Skill', 'College'];

// Preferred persona chips (the ones that make an interesting subgraph); anything else is in the Database view.
const PERSONA_CHIPS = [
  'Serial Winner',
  'Rising Star',
  'Mentor Material',
  'Consistent Builder',
  'Dormant High-Potential',
];
const DENSITY = [24, 40, 60];

const LINK_DISTANCE = {
  STUDIED_AT: 96,
  ATTENDED: 120,
  BUILT: 60,
  HAS_SKILL: 100,
  TEAMMATE_OF: 150,
};

function drawShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'square' || shape === 'hollow') {
    ctx.rect(x - r, y - r, r * 2, r * 2);
  } else if (shape === 'diamond') {
    const d = r * 1.35;
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.closePath();
  } else if (shape === 'triangle') {
    const d = r * 1.3;
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y + d * 0.8);
    ctx.lineTo(x - d, y + d * 0.8);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** Build simulation nodes/links from the API payload, reusing positions from the previous layout. */
function buildSim(data, prevPos) {
  const deg = new Map();
  for (const l of data.links) {
    deg.set(l.source, (deg.get(l.source) || 0) + 1);
    deg.set(l.target, (deg.get(l.target) || 0) + 1);
  }
  const byId = new Map();
  const nodes = data.nodes.map((n, i) => {
    const d = deg.get(n.id) || 0;
    const prev = prevPos.get(n.id);
    const angle = i * 2.399963; // golden angle spiral: deterministic, no clumping
    const rad = 14 * Math.sqrt(i + 1);
    const person = n.type === 'Person';
    const sim = {
      ...n,
      deg: d,
      r: Math.min(15, (person ? 4.5 : 2.6) + Math.sqrt(d) * (person ? 1.5 : 1.35)),
      x: prev ? prev.x : Math.cos(angle) * rad,
      y: prev ? prev.y : Math.sin(angle) * rad,
      vx: 0,
      vy: 0,
      fixed: false,
    };
    byId.set(n.id, sim);
    return sim;
  });
  const links = [];
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const l of data.links) {
    const s = byId.get(l.source);
    const t = byId.get(l.target);
    if (!s || !t) continue;
    links.push({
      s,
      t,
      type: l.type,
      dist: LINK_DISTANCE[l.type] || 70,
      k: 1 / Math.min(s.deg, t.deg),
    });
    adj.get(s.id).add(t.id);
    adj.get(t.id).add(s.id);
  }
  return { nodes, links, adj, byId, alpha: 1 };
}

function tick(sim) {
  const { nodes, links } = sim;
  const a = sim.alpha;
  const n = nodes.length;
  // charge: every pair repels, weighted by size; capped range keeps clusters from flying apart
  for (let i = 0; i < n; i++) {
    const p = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const q = nodes[j];
      let dx = q.x - p.x;
      let dy = q.y - p.y;
      let d2 = dx * dx + dy * dy;
      if (d2 > 160000) continue;
      if (d2 < 1) {
        dx = (Math.random() - 0.5) * 2;
        dy = (Math.random() - 0.5) * 2;
        d2 = 1;
      }
      const f = (-320 * a) / Math.max(d2, 60);
      p.vx += dx * f * (q.r / 6);
      p.vy += dy * f * (q.r / 6);
      q.vx -= dx * f * (p.r / 6);
      q.vy -= dy * f * (p.r / 6);
    }
  }
  for (const l of links) {
    const dx = l.t.x + l.t.vx - l.s.x - l.s.vx || 1e-6;
    const dy = l.t.y + l.t.vy - l.s.y - l.s.vy || 1e-6;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = ((d - l.dist) / d) * a * (0.15 + 0.85 * l.k);
    const share = l.t.deg / (l.s.deg + l.t.deg);
    l.s.vx += dx * f * share;
    l.s.vy += dy * f * share;
    l.t.vx -= dx * f * (1 - share);
    l.t.vy -= dy * f * (1 - share);
  }
  for (const p of nodes) {
    p.vx -= p.x * 0.0008 * a; // weak in x, strong in y: the panel is wide, so the layout becomes an ellipse
    p.vy -= p.y * 0.03 * a;
  }
  // collision pass so labels and shapes never stack
  for (let i = 0; i < n; i++) {
    const p = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const q = nodes[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const min = p.r + q.r + 2.5;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        p.x -= dx * push;
        p.y -= dy * push;
        q.x += dx * push;
        q.y += dy * push;
      }
    }
  }
  for (const p of nodes) {
    if (p.fixed) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    p.vx *= 0.6;
    p.vy *= 0.6;
    p.x += p.vx;
    p.y += p.vy;
  }
  sim.alpha += (0 - sim.alpha) * 0.0228;
}

/**
 * Fit the layout into the panel. The force layout is roughly round but the panel is wide, so
 * x is stretched (positions only, shapes stay round) by up to 2.6x to use the space.
 */
function fitTransform(nodes, w, h, pad = 40) {
  if (!nodes.length || !w || !h) return { x: w / 2, y: h / 2, k: 1, sx: 1 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x);
    y1 = Math.max(y1, n.y);
  }
  const bw = x1 - x0 || 1;
  const bh = y1 - y0 || 1;
  const sx = Math.min(2.6, Math.max(1, (w - pad * 2) / (h - pad * 2) / (bw / bh)));
  const k = Math.min(2.2, Math.min((w - pad * 2) / (bw * sx), (h - pad * 2) / bh));
  return { k, sx, x: w / 2 - ((x0 + x1) / 2) * sx * k, y: h / 2 - ((y0 + y1) / 2) * k };
}

// ------------------------------------------------------------------ canvas

function GraphCanvas({ data, selectedId, onSelect, onOpenPerson, fitSignal, zoomSignal }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const stateRef = useRef({
    sim: null,
    view: { x: 0, y: 0, k: 1 },
    size: { w: 0, h: 0 },
    hoverId: null,
    selectedId: null,
    dirty: true,
    userMoved: false,
    sx: 1,
    palette: null,
    prevPos: new Map(),
  });
  const [hover, setHover] = useState(null);

  // keep latest callbacks without re-running the effects that own the loop
  const cbRef = useRef({ onSelect, onOpenPerson });
  useEffect(() => {
    cbRef.current = { onSelect, onOpenPerson };
  });

  useEffect(() => {
    stateRef.current.selectedId = selectedId;
    stateRef.current.dirty = true;
  }, [selectedId]);

  const readPalette = useCallback(() => {
    const cs = getComputedStyle(wrapRef.current);
    const v = (name) => cs.getPropertyValue(name).trim();
    stateRef.current.palette = {
      bg: v('--bg'),
      text: v('--text'),
      muted: v('--muted'),
      faint: v('--faint'),
      border: v('--faint'),
      accent: v('--accent'),
      groups: Object.fromEntries(Object.entries(GROUPS).map(([g, s]) => [g, v(s.token)])),
    };
  }, []);

  const fit = useCallback((animate = false) => {
    const st = stateRef.current;
    if (!st.sim) return;
    const f = fitTransform(st.sim.nodes, st.size.w, st.size.h - 44); // 44px reserved for the legend
    st.sx = f.sx;
    st.view = { k: f.k, x: f.x, y: f.y };
    st.userMoved = false;
    st.dirty = true;
    void animate;
  }, []);

  // (re)build the simulation whenever the payload changes
  useEffect(() => {
    const st = stateRef.current;
    if (st.sim) for (const n of st.sim.nodes) st.prevPos.set(n.id, { x: n.x, y: n.y });
    const sim = buildSim(data, st.prevPos);
    st.sim = sim;
    for (let i = 0; i < 160; i++) tick(sim); // pre-settle so the first paint is already a graph
    if (!st.userMoved || !st.prevPos.size) fit();
    st.dirty = true;
  }, [data, fit]);

  useEffect(() => {
    fit();
  }, [fitSignal, fit]);

  useEffect(() => {
    if (!zoomSignal.dir) return;
    const st = stateRef.current;
    const { w, h } = st.size;
    const nk = Math.min(4, Math.max(0.3, st.view.k * (zoomSignal.dir > 0 ? 1.3 : 1 / 1.3)));
    const ratio = nk / st.view.k;
    st.view = {
      k: nk,
      x: w / 2 - (w / 2 - st.view.x) * ratio,
      y: h / 2 - (h / 2 - st.view.y) * ratio,
    };
    st.userMoved = true;
    st.dirty = true;
  }, [zoomSignal]);

  // draw + physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');
    const st = stateRef.current;
    let raf = 0;
    readPalette();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const first = st.size.w === 0;
      st.size = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (first || !st.userMoved) fit();
      st.dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const draw = () => {
      const { sim, view, size, palette: P, sx } = st;
      ctx.clearRect(0, 0, size.w, size.h);
      if (!sim) return;
      const focus = st.selectedId || st.hoverId;
      const near = focus ? sim.adj.get(focus) : null;
      const isLit = (id) => !focus || id === focus || near.has(id);

      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.k, view.k);

      // links: quiet by default, ochre when they touch the focused node
      ctx.lineWidth = 0.8 / Math.sqrt(view.k);
      for (const pass of [false, true]) {
        for (const l of sim.links) {
          const hot = Boolean(focus) && (l.s.id === focus || l.t.id === focus);
          if (hot !== pass) continue;
          ctx.beginPath();
          ctx.moveTo(l.s.x * sx, l.s.y);
          ctx.lineTo(l.t.x * sx, l.t.y);
          if (hot) {
            ctx.strokeStyle = P.accent;
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 1.5 / Math.sqrt(view.k);
          } else {
            ctx.strokeStyle = P.border;
            ctx.globalAlpha = focus ? 0.07 : l.type === 'TEAMMATE_OF' ? 0.6 : 0.3;
            ctx.lineWidth = (l.type === 'TEAMMATE_OF' ? 1.1 : 0.8) / Math.sqrt(view.k);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // nodes, biggest last so hubs sit on top of leaf nodes
      const order = [...sim.nodes].sort((a, b) => a.r - b.r);
      for (const n of order) {
        const g = GROUPS[n.group] || GROUPS.Project;
        const color = P.groups[n.group] || P.muted;
        ctx.globalAlpha = isLit(n.id) ? 1 : 0.16;
        if (g.shape === 'hollow') {
          drawShape(ctx, g.shape, n.x * sx, n.y, n.r);
          ctx.fillStyle = P.bg;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4 / Math.sqrt(view.k);
          ctx.stroke();
        } else {
          drawShape(ctx, g.shape, n.x * sx, n.y, n.r);
          ctx.fillStyle = color;
          ctx.fill();
          if (g.shape === 'ring') {
            ctx.beginPath();
            ctx.arc(n.x * sx, n.y, n.r + 2.6, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 / Math.sqrt(view.k);
            ctx.stroke();
          }
        }
        if (n.id === focus) {
          ctx.beginPath();
          ctx.arc(n.x * sx, n.y, n.r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = P.text;
          ctx.lineWidth = 1.2 / Math.sqrt(view.k);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // labels: people always, other hubs when zoomed or lit; halo in bg colour keeps them legible over edges
      const fs = (px) => px / Math.sqrt(Math.max(view.k, 0.6));
      for (const n of sim.nodes) {
        const lit = isLit(n.id);
        const person = n.type === 'Person';
        const show =
          n.id === focus ||
          (lit && focus && n.type !== 'Skill') ||
          person ||
          (!focus && (n.type === 'College' || (n.type === 'Skill' && n.deg >= 3)));
        if (!show) continue;
        if (!lit) continue;
        ctx.font = person
          ? `500 ${fs(11)}px 'IBM Plex Sans', system-ui, sans-serif`
          : `400 ${fs(10.5)}px 'IBM Plex Mono', ui-monospace, monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const tx = n.x * sx + n.r + 4;
        ctx.lineWidth = 3;
        ctx.strokeStyle = P.bg;
        ctx.lineJoin = 'round';
        ctx.strokeText(n.label, tx, n.y);
        ctx.fillStyle = person || n.id === focus ? P.text : P.muted;
        ctx.fillText(n.label, tx, n.y);
      }
      ctx.restore();
    };

    const loop = () => {
      const sim = st.sim;
      if (sim && sim.alpha > 0.012) {
        tick(sim);
        tick(sim);
        st.dirty = true;
        if (sim.alpha <= 0.02 && !st.userMoved) fit(); // final refit once settled
      }
      if (st.dirty) {
        st.dirty = false;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fit, readPalette]);

  // -------------------------------------------------------------- pointer
  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const { view } = stateRef.current;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { px, py, x: (px - view.x) / view.k, y: (py - view.y) / view.k };
  };

  const hit = (wx, wy) => {
    const { sim, view, sx } = stateRef.current;
    if (!sim) return null;
    let best = null;
    let bestD = Infinity;
    const slop = 3 / view.k;
    for (const n of sim.nodes) {
      const d = Math.hypot(n.x * sx - wx, n.y - wy);
      if (d <= n.r + slop && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  const drag = useRef(null);

  const onPointerDown = (e) => {
    const st = stateRef.current;
    const w = toWorld(e);
    const node = hit(w.x, w.y);
    drag.current = {
      node,
      moved: false,
      sx: e.clientX,
      sy: e.clientY,
      vx: st.view.x,
      vy: st.view.y,
    };
    canvasRef.current.setPointerCapture(e.pointerId);
    if (node) node.fixed = true;
  };

  const onPointerMove = (e) => {
    const st = stateRef.current;
    const d = drag.current;
    const w = toWorld(e);
    if (d) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) {
        if (d.node) {
          d.node.x = w.x / st.sx;
          d.node.y = w.y;
          st.sim.alpha = Math.max(st.sim.alpha, 0.25);
        } else {
          st.view = { ...st.view, x: d.vx + dx, y: d.vy + dy };
          st.userMoved = true;
        }
        st.dirty = true;
      }
      return;
    }
    const node = hit(w.x, w.y);
    const id = node ? node.id : null;
    if (tipRef.current) {
      const tip = tipRef.current;
      const { w: cw, h: ch } = st.size;
      const tx = w.px + 14 + tip.offsetWidth > cw ? w.px - 14 - tip.offsetWidth : w.px + 14;
      const ty = w.py + 14 + tip.offsetHeight > ch ? w.py - 14 - tip.offsetHeight : w.py + 14;
      tip.style.transform = `translate(${tx}px, ${Math.max(4, ty)}px)`;
    }
    if (id !== st.hoverId) {
      st.hoverId = id;
      st.dirty = true;
      canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
      setHover(node);
    }
  };

  const onPointerUp = (e) => {
    const st = stateRef.current;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.node) d.node.fixed = false;
    if (!d.moved) {
      const w = toWorld(e);
      const node = hit(w.x, w.y);
      cbRef.current.onSelect(node ? node.id : null);
      if (node?.type === 'Person') cbRef.current.onOpenPerson(node.id);
    }
    st.dirty = true;
  };

  const onPointerLeave = () => {
    const st = stateRef.current;
    if (drag.current) return;
    st.hoverId = null;
    st.dirty = true;
    setHover(null);
  };

  // wheel must be non-passive to preventDefault page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const st = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const nk = Math.min(4, Math.max(0.3, st.view.k * Math.exp(-e.deltaY * 0.0012)));
      const ratio = nk / st.view.k;
      st.view = { k: nk, x: px - (px - st.view.x) * ratio, y: py - (py - st.view.y) * ratio };
      st.userMoved = true;
      st.dirty = true;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const props = hover
    ? Object.entries(hover.properties || {}).filter(([, v]) => v !== null && v !== '')
    : [];

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
      <div
        ref={tipRef}
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-10 w-max max-w-[260px] border border-border-strong bg-surface px-3 py-2 transition-opacity duration-75',
          hover ? 'opacity-100' : 'opacity-0'
        )}
      >
        {hover && (
          <>
            <div className="text-[12.5px] font-medium leading-tight text-text">{hover.label}</div>
            <div className="crm-num mt-0.5 text-[10px] uppercase tracking-[0.12em] text-accent">
              {hover.type}
              {hover.group !== hover.type && ` · ${hover.group}`}
              <span className="text-faint"> · {hover.deg} links</span>
            </div>
            {props.length > 0 && (
              <dl className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
                {props.slice(0, 5).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[11px] leading-snug">
                    <dt className="crm-num shrink-0 text-faint">{k}</dt>
                    <dd className="text-muted">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ chrome

function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'crm-num flex h-6 items-center gap-1.5 border px-2 text-[11px] transition-colors duration-100',
        active
          ? 'border-accent bg-surface-2 text-accent'
          : 'border-border text-muted hover:border-border-strong hover:text-text'
      )}
    >
      {children}
      {count !== undefined && (
        <span className={active ? 'text-accent/70' : 'text-faint'}>{count}</span>
      )}
    </button>
  );
}

function LegendGlyph({ group }) {
  const g = GROUPS[group];
  const c = `var(${g.token})`;
  const common = { fill: c, stroke: c };
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" className="shrink-0" aria-hidden>
      {g.shape === 'ring' && (
        <>
          <circle r="3" {...common} />
          <circle r="5.6" fill="none" stroke={c} strokeWidth="1" />
        </>
      )}
      {g.shape === 'circle' && <circle r="4" {...common} />}
      {g.shape === 'diamond' && <path d="M0-5.4 5.4 0 0 5.4-5.4 0Z" {...common} />}
      {g.shape === 'square' && <rect x="-3.6" y="-3.6" width="7.2" height="7.2" {...common} />}
      {g.shape === 'triangle' && <path d="M0-5 5 4h-10Z" {...common} />}
      {g.shape === 'hollow' && (
        <rect x="-3.6" y="-3.6" width="7.2" height="7.2" fill="none" stroke={c} strokeWidth="1.4" />
      )}
    </svg>
  );
}

function Legend({ counts }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-bg/90 px-3 py-2">
      {GROUP_ORDER.filter((g) => counts[g]).map((g) => (
        <span key={g} className="flex items-center gap-1.5 text-[11px] text-muted">
          <LegendGlyph group={g} />
          {GROUPS[g].label}
          <span className="crm-num text-faint">{counts[g]}</span>
        </span>
      ))}
    </div>
  );
}

function GraphSkeleton() {
  // deterministic faux constellation so the loading state already reads as "a graph is coming"
  const pts = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => {
        const a = i * 2.399963;
        const r = 30 + 9.2 * Math.sqrt(i) * 3.4;
        return {
          x: 50 + Math.cos(a) * r * 0.17,
          y: 50 + Math.sin(a) * r * 0.13,
          s: 1.4 + (i % 5) * 0.6,
        };
      }),
    []
  );
  return (
    <div className="absolute inset-0" role="status" aria-label="Loading graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {pts.slice(1).map((p, i) => (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={pts[Math.floor(i / 2)].x}
            y2={pts[Math.floor(i / 2)].y}
            className="crm-skeleton"
            stroke="var(--border-strong)"
            strokeWidth="0.15"
            style={{ background: 'none' }}
          />
        ))}
      </svg>
      {pts.map((p, i) => (
        <span
          key={i}
          className="crm-skeleton absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s * 5, height: p.s * 5 }}
        />
      ))}
      <div className="crm-num absolute bottom-3 left-3 text-[11px] text-faint">
        loading {ENDPOINT} …
      </div>
    </div>
  );
}

function ErrorPanel({ error, onRetry }) {
  return (
    <div className="absolute inset-0 flex items-center justify-start p-10">
      <div className="max-w-[460px] border border-danger/60 bg-surface p-5">
        <div className="flex items-center gap-2 text-danger">
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span className="crm-num text-[11px] font-medium uppercase tracking-[0.14em]">
            Graph unavailable
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-text">
          <span className="crm-num text-accent">GET {ENDPOINT}</span> failed
          {error?.status ? ` with status ${error.status}` : ''}.
        </p>
        <p className="crm-num mt-1 break-words text-[11.5px] text-muted">{error?.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex h-7 items-center gap-1.5 border border-border-strong px-3 text-[12px] text-text hover:border-accent hover:text-accent"
        >
          <RefreshCw size={12} strokeWidth={1.5} /> Retry
        </button>
      </div>
    </div>
  );
}

function DetailPanel({ node, neighbours, onClose, onPick, onOpenPerson }) {
  const groups = {};
  for (const n of neighbours) (groups[n.type] ||= []).push(n);
  const props = Object.entries(node.properties || {}).filter(([, v]) => v !== null && v !== '');
  return (
    <aside className="absolute right-3 top-3 z-10 max-h-[calc(100%-24px)] w-[248px] overflow-y-auto border border-border-strong bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <div className="font-serif text-[15px] font-semibold leading-tight text-text">
            {node.label}
          </div>
          <div className="crm-num mt-0.5 text-[10px] uppercase tracking-[0.12em] text-accent">
            {node.type} · {neighbours.length} links
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear selection"
          className="text-faint hover:text-text"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      {props.length > 0 && (
        <dl className="space-y-0.5 border-b border-border px-3 py-2">
          {props.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[11px] leading-snug">
              <dt className="crm-num w-[68px] shrink-0 text-faint">{k}</dt>
              <dd className="text-muted">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {node.type === 'Person' && (
        <button
          type="button"
          onClick={() => onOpenPerson(node.id)}
          className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-[12px] text-text hover:bg-surface-2 hover:text-accent"
        >
          Open profile <ArrowUpRight size={13} strokeWidth={1.5} />
        </button>
      )}
      <div className="px-3 py-2">
        {Object.entries(groups).map(([type, list]) => (
          <div key={type} className="mb-2 last:mb-0">
            <div className="crm-num text-[10px] uppercase tracking-[0.12em] text-faint">
              {type} · {list.length}
            </div>
            <ul className="mt-0.5">
              {list.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onPick(n.id)}
                    className="w-full truncate py-px text-left text-[11.5px] text-muted hover:text-accent"
                  >
                    {n.label}
                  </button>
                </li>
              ))}
              {list.length > 8 && (
                <li className="crm-num text-[10.5px] text-faint">+{list.length - 8} more</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ view

export function GraphView() {
  const [facets, setFacets] = useState({ personas: [], colleges: [] });
  const [persona, setPersona] = useState('');
  const [college, setCollege] = useState('');
  const [limit, setLimit] = useState(24);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState(null);
  const [doneKey, setDoneKey] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState({ dir: 0, n: 0 });

  // Filter options come from the same facets the Database view uses.
  useEffect(() => {
    const ctrl = new AbortController();
    api('/api/crm/candidates?limit=1', { signal: ctrl.signal })
      .then((r) => r.facets && setFacets(r.facets))
      .catch(() => {}); // chips are optional; the graph fetch reports real errors
    return () => ctrl.abort();
  }, []);

  // loading is derived (request key not yet answered), so no setState runs synchronously in the effect
  const reqKey = `${persona}|${college}|${limit}|${reload}`;
  const loading = doneKey !== reqKey;

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ limit: String(limit) });
    if (persona) params.set('persona', persona);
    if (college) params.set('college', college);
    api(`${ENDPOINT}?${params}`, { signal: ctrl.signal })
      .then((r) => {
        setData(r);
        setError(null);
        setDoneKey(reqKey);
      })
      .catch((e) => {
        if (e.name === 'AbortError' || e.cause?.name === 'AbortError') return;
        setError(e);
        setDoneKey(reqKey);
      });
    return () => ctrl.abort();
  }, [persona, college, limit, reload, reqKey]);

  const personaChips = useMemo(() => {
    const byName = new Map((facets.personas || []).map((p) => [p.value, p.count]));
    const picked = PERSONA_CHIPS.filter((p) => byName.has(p));
    const names = picked.length ? picked : (facets.personas || []).slice(0, 6).map((p) => p.value);
    return names.map((value) => ({ value, count: byName.get(value) }));
  }, [facets]);
  const collegeChips = useMemo(() => (facets.colleges || []).slice(0, 8), [facets]);

  const nodeById = useMemo(() => new Map((data?.nodes || []).map((n) => [n.id, n])), [data]);
  const groupCounts = useMemo(() => {
    const c = {};
    for (const n of data?.nodes || []) c[n.group] = (c[n.group] || 0) + 1;
    return c;
  }, [data]);

  const selected = (selectedId && nodeById.get(selectedId)) || null;
  const neighbours = useMemo(() => {
    if (!selected || !data) return [];
    const out = [];
    for (const l of data.links) {
      const other =
        l.source === selected.id ? l.target : l.target === selected.id ? l.source : null;
      if (other && nodeById.has(other)) out.push(nodeById.get(other));
    }
    return out;
  }, [selected, data, nodeById]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !drawerId) setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerId]);

  const stats = data?.stats;
  const failed = Boolean(error) && !loading;
  const empty = data && !loading && !error && data.nodes.length === 0;
  const clearFilters = () => {
    setPersona('');
    setCollege('');
  };

  return (
    <div>
      {/* toolbar: stats line, then filter rows on a shared label column */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="crm-num flex items-baseline gap-3 text-[12px]" aria-live="polite">
          {stats ? (
            <>
              <span className="text-text">
                {stats.nodes} nodes · {stats.links} links
              </span>
              <span className="text-faint">{stats.people} people</span>
              {data.source && data.source !== 'graph' && (
                <span className="border border-danger/60 px-1.5 text-[10.5px] uppercase tracking-[0.1em] text-danger">
                  {data.source === 'none' ? 'no match' : `${data.source} · degraded`}
                </span>
              )}
              {loading && <span className="text-accent">updating…</span>}
            </>
          ) : failed ? (
            <span className="text-danger">graph unavailable</span>
          ) : (
            <span className="crm-skeleton inline-block h-4 w-44" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="crm-num text-[10.5px] uppercase tracking-[0.12em] text-faint">
            people
          </span>
          <div className="flex">
            {DENSITY.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                aria-pressed={limit === n}
                className={cn(
                  'crm-num h-6 w-9 border border-border text-[11px] -ml-px first:ml-0',
                  limit === n
                    ? 'relative border-accent bg-surface-2 text-accent'
                    : 'text-muted hover:text-text'
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-2">
        <span className="crm-num text-[10.5px] uppercase tracking-[0.12em] text-faint">
          persona
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!persona} onClick={() => setPersona('')}>
            All
          </Chip>
          {personaChips.map((p) => (
            <Chip
              key={p.value}
              active={persona === p.value}
              count={p.count}
              onClick={() => setPersona(persona === p.value ? '' : p.value)}
            >
              {p.value}
            </Chip>
          ))}
        </div>
        <span className="crm-num text-[10.5px] uppercase tracking-[0.12em] text-faint">
          college
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!college} onClick={() => setCollege('')}>
            All
          </Chip>
          {collegeChips.map((c) => (
            <Chip
              key={c.value}
              active={college === c.value}
              count={c.count}
              onClick={() => setCollege(college === c.value ? '' : c.value)}
            >
              {c.value}
            </Chip>
          ))}
        </div>
      </div>

      {/* canvas panel: fills the content area; dot-grid ground gives the graph a surface */}
      <div
        className="relative mt-4 border border-border bg-surface/40"
        style={{
          height: 'max(460px, calc(100vh - 336px))',
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        {data && !failed && !empty && (
          <>
            <div
              className={cn(
                'absolute inset-0 transition-opacity duration-150',
                loading && 'opacity-50'
              )}
            >
              <GraphCanvas
                data={data}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onOpenPerson={setDrawerId}
                fitSignal={fitSignal}
                zoomSignal={zoomSignal}
              />
            </div>
            <Legend counts={groupCounts} />
            <div className="absolute bottom-3 right-3 z-10 flex flex-col border border-border bg-bg/90">
              {[
                {
                  icon: Plus,
                  label: 'Zoom in',
                  run: () => setZoomSignal((z) => ({ dir: 1, n: z.n + 1 })),
                },
                {
                  icon: Minus,
                  label: 'Zoom out',
                  run: () => setZoomSignal((z) => ({ dir: -1, n: z.n + 1 })),
                },
                { icon: Maximize2, label: 'Fit to view', run: () => setFitSignal((s) => s + 1) },
              ].map(({ icon: Icon, label, run }) => (
                <button
                  key={label}
                  type="button"
                  onClick={run}
                  aria-label={label}
                  title={label}
                  className="grid size-7 place-items-center border-b border-border text-muted last:border-b-0 hover:text-accent"
                >
                  <Icon size={13} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            {selected && (
              <DetailPanel
                node={selected}
                neighbours={neighbours}
                onClose={() => setSelectedId(null)}
                onPick={setSelectedId}
                onOpenPerson={setDrawerId}
              />
            )}
          </>
        )}
        {!data && loading && <GraphSkeleton />}
        {failed && <ErrorPanel error={error} onRetry={() => setReload((n) => n + 1)} />}
        {empty && (
          <div className="absolute inset-0 flex items-center p-10">
            <div className="max-w-[380px]">
              <div className="font-serif text-[18px] font-semibold text-text">
                No people match this slice.
              </div>
              <p className="mt-1.5 text-[13px] text-muted">
                {persona || college
                  ? 'Try a broader persona or college.'
                  : `${ENDPOINT} returned an empty graph.`}
              </p>
              {(persona || college) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 h-7 border border-border-strong px-3 text-[12px] text-text hover:border-accent hover:text-accent"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
        {data && !failed && !empty && (
          <div className="crm-num pointer-events-none absolute left-3 top-3 z-10 text-[10.5px] text-faint">
            drag to pan · scroll to zoom · click to trace
          </div>
        )}
      </div>

      <ProfileDrawer userId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}

export default GraphView;
