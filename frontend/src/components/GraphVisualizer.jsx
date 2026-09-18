import { useEffect, useRef, useState, useCallback } from 'react';

const TYPE_COLORS = {
  Organization: '#38bdf8', // Cyan
  Director: '#a855f7', // Purple
  ShellAccount: '#f59e0b', // Amber/Orange
  Transaction: '#10b981', // Emerald Green
  RiskAlert: '#ef4444', // Crimson Red
  Jurisdiction: '#ec4899', // Pink
  Default: '#64748b', // Slate
};

export default function GraphVisualizer({ backendUrl }) {
  const canvasRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Physics simulation state stored in ref for 60fps canvas loop
  const simulationRef = useRef({
    nodes: [],
    links: [],
    animId: null,
  });

  const draggedNodeRef = useRef(null);

  // Refs mirror interactive state so the 60fps physics loop is not torn down
  // on every pan/zoom/filter/selection change (only graphData restarts it).
  const transformRef = useRef(transform);
  const searchRef = useRef(searchFilter);
  const selectedRef = useRef(selectedNode);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  useEffect(() => {
    searchRef.current = searchFilter;
  }, [searchFilter]);
  useEffect(() => {
    selectedRef.current = selectedNode;
  }, [selectedNode]);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/graph/visualize?limit=50`);
      const data = await res.json();
      setGraphData(data);
      setIsMock(Boolean(data.isMock));
    } catch (err) {
      console.warn('Failed to fetch graph from backend, using internal demo fallback:', err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    // Defer so fetchGraph's synchronous setLoading(true) is not a setState-in-effect
    const initialTimer = setTimeout(fetchGraph, 0);
    return () => clearTimeout(initialTimer);
  }, [fetchGraph]);

  // CognitiveStudio dispatches 'graph:refresh' after a successful ECL pipeline run
  useEffect(() => {
    const handleRefresh = () => fetchGraph();
    window.addEventListener('graph:refresh', handleRefresh);
    return () => window.removeEventListener('graph:refresh', handleRefresh);
  }, [fetchGraph]);

  // Initialize node positions & simple force physics
  useEffect(() => {
    if (!graphData.nodes || !graphData.nodes.length) return;

    const width = 800;
    const height = 550;

    const nodes = graphData.nodes.map((n, i) => {
      const angle = (i / graphData.nodes.length) * 2 * Math.PI;
      const radius = 160 + (i % 3) * 60;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: n.type === 'Organization' || n.type === 'RiskAlert' ? 22 : 18,
      };
    });

    const links = (graphData.links || []).map((l) => ({ ...l }));

    simulationRef.current.nodes = nodes;
    simulationRef.current.links = links;

    // Run simple force relaxation
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let step = 0;
    const render = () => {
      try {
        // Self-heal: a single NaN position silently draws nothing (no exception),
        // which left the canvas permanently blank after physics settled.
        nodes.forEach((n) => {
          if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
            n.x = width / 2 + (Math.random() - 0.5) * 120;
            n.y = height / 2 + (Math.random() - 0.5) * 120;
          }
        });

        if (step < 200) {
          // Node repulsion
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const dx = nodes[j].x - nodes[i].x;
              const dy = nodes[j].y - nodes[i].y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              if (dist < 180) {
                const force = (180 - dist) / 180;
                const fx = (dx / dist) * force * 1.5;
                const fy = (dy / dist) * force * 1.5;
                if (draggedNodeRef.current !== nodes[i]) {
                  nodes[i].x -= fx;
                  nodes[i].y -= fy;
                }
                if (draggedNodeRef.current !== nodes[j]) {
                  nodes[j].x += fx;
                  nodes[j].y += fy;
                }
              }
            }
          }

          // Link attraction
          links.forEach((l) => {
            const source = nodes.find((n) => n.id === l.source);
            const target = nodes.find((n) => n.id === l.target);
            if (source && target) {
              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = (dist - 110) * 0.02;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              if (draggedNodeRef.current !== source) {
                source.x += fx;
                source.y += fy;
              }
              if (draggedNodeRef.current !== target) {
                target.x -= fx;
                target.y -= fy;
              }
            }
          });
          step++;
        }

        // Draw canvas
        const view = transformRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(view.x, view.y);
        ctx.scale(view.k, view.k);

        // Draw Links
        links.forEach((l) => {
          const source = nodes.find((n) => n.id === l.source);
          const target = nodes.find((n) => n.id === l.target);
          if (!source || !target) return;

          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle =
            l.type === 'FLAGGED_TRANSACTION'
              ? 'rgba(239, 68, 68, 0.7)'
              : 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = l.type === 'FLAGGED_TRANSACTION' ? 2 : 1.2;
          ctx.stroke();

          // Edge label
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
          ctx.font = '9px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(l.label || l.type, midX, midY - 4);
        });

        // Draw Nodes
        const activeSearch = searchRef.current;
        const activeSelection = selectedRef.current;
        nodes.forEach((n) => {
          const isMatch =
            !activeSearch ||
            n.label.toLowerCase().includes(activeSearch.toLowerCase()) ||
            n.type.toLowerCase().includes(activeSearch.toLowerCase());
          const color = TYPE_COLORS[n.type] || TYPE_COLORS.Default;
          const radius = n.radius || 18;

          // Glow
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + (n === activeSelection ? 6 : 2), 0, Math.PI * 2);
          ctx.fillStyle = isMatch ? color : 'rgba(100, 116, 139, 0.2)';
          ctx.globalAlpha = isMatch ? 0.25 : 0.05;
          ctx.fill();
          ctx.globalAlpha = 1.0;

          // Circle
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = n === activeSelection ? '#ffffff' : isMatch ? color : '#334155';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#0f172a';
          ctx.stroke();

          // Label
          ctx.fillStyle = isMatch ? '#f8fafc' : '#64748b';
          ctx.font = '11px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + radius + 14);

          // Type badge text
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.font = '8px Outfit, sans-serif';
          ctx.fillText(n.type.substring(0, 4).toUpperCase(), n.x, n.y + 3);
        });

        ctx.restore();
      } catch (err) {
        console.warn('[GraphVisualizer] frame draw error:', err);
      } finally {
        // Always reschedule — a thrown frame must never kill the animation loop
        simulationRef.current.animId = requestAnimationFrame(render);
      }
    };

    simulationRef.current.animId = requestAnimationFrame(render);
    const sim = simulationRef.current;

    return () => {
      if (sim && sim.animId) {
        cancelAnimationFrame(sim.animId);
      }
    };
  }, [graphData]);

  // Canvas Mouse Interactions (Pan & Node Selection)
  // The canvas stretches via CSS (width/height 100%), so screen coords must be
  // mapped into the internal 880x550 drawing space before hit-testing.
  const canvasToGraphCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX - transform.x) / transform.k,
      y: ((e.clientY - rect.top) * scaleY - transform.y) / transform.k,
    };
  };

  const handleMouseDown = (e) => {
    const { x: mouseX, y: mouseY } = canvasToGraphCoords(e);

    const clicked = simulationRef.current.nodes.find((n) => {
      const dx = n.x - mouseX;
      const dy = n.y - mouseY;
      return Math.sqrt(dx * dx + dy * dy) <= (n.radius || 18);
    });

    if (clicked) {
      setSelectedNode(clicked);
      draggedNodeRef.current = clicked;
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e) => {
    if (draggedNodeRef.current) {
      const { x, y } = canvasToGraphCoords(e);
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
    } else if (isDragging) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    draggedNodeRef.current = null;
  };

  // Zoom needs a non-passive native listener — React's synthetic onWheel is passive
  // and would let the page scroll instead of zooming the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setTransform((prev) => ({
        ...prev,
        k: Math.max(0.4, Math.min(3.0, prev.k * zoomFactor)),
      }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="graph-visualizer-container">
      <div className="graph-header">
        <div className="graph-title-block">
          <h3>🕸️ Neo4j Knowledge Graph Visualizer</h3>
          <span className={`status-pill ${isMock ? 'pill-warning' : 'pill-success'}`}>
            {isMock ? 'Demo Simulated Graph' : '🟢 Live Neo4j AuraDB'}
          </span>
          <span className="stats-pill">
            {graphData.nodes ? graphData.nodes.length : 0} Nodes •{' '}
            {graphData.links ? graphData.links.length : 0} Edges
          </span>
        </div>

        <div className="graph-actions">
          <input
            type="text"
            placeholder="Filter nodes (e.g. Panama, Shell)..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="graph-search-input"
          />
          <button onClick={fetchGraph} disabled={loading} className="btn-action">
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
          <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} className="btn-action">
            🎯 Reset View
          </button>
        </div>
      </div>

      <div className="graph-legend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: color }} />
            <span className="legend-label">{type}</span>
          </div>
        ))}
      </div>

      <div className="graph-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={880}
          height={550}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="interactive-canvas"
        />

        {selectedNode && (
          <div className="node-details-card">
            <div className="card-header">
              <span
                className="type-badge"
                style={{ backgroundColor: TYPE_COLORS[selectedNode.type] || '#64748b' }}
              >
                {selectedNode.type}
              </span>
              <button onClick={() => setSelectedNode(null)} className="close-btn">
                ×
              </button>
            </div>
            <h4>{selectedNode.label}</h4>
            <div className="props-list">
              {Object.entries(selectedNode.properties || {}).map(([key, val]) => (
                <div key={key} className="prop-row">
                  <span className="prop-key">{key}:</span>
                  <span className="prop-val">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
