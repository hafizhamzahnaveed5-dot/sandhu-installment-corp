/**
 * chart.js — Dependency-free SVG charts for the Premium Dark Fintech dashboard.
 * 
 * Supported chart types:
 *   - LineChart: time-series revenue/collection chart
 *   - BarChart: comparison bars
 *   - DonutChart: percentage/completion arcs
 * 
 * All dimensions and colors use CSS variables where possible.
 * No external dependencies — pure SVG + DOM.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Line chart with gradient fill and dot markers.
 * @param {HTMLElement} container
 * @param {Array<{label:string, amount:number}>} data
 * @param {object} options
 */
export function LineChart(container, data, options = {}) {
  const W = options.width  || container.clientWidth  || 600;
  const H = options.height || options.chartHeight    || 220;
  const PAD = { top: 20, right: 16, bottom: 40, left: 60 };

  const values = data.map(d => d.amount);
  const maxVal = Math.max(...values) * 1.15 || 1;
  const minVal = 0;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const xStep = chartW / Math.max(data.length - 1, 1);
  const yScale = v => PAD.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
  const xAt = i => PAD.left + i * xStep;

  // Build SVG
  const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });

  // Defs: gradient fill
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: `line-grad-${container.id || 'chart'}`, x1:'0', y1:'0', x2:'0', y2:'1' });
  const s1 = svgEl('stop', { offset:'0%',   'stop-color': 'rgba(59,130,246,0.35)' });
  const s2 = svgEl('stop', { offset:'100%', 'stop-color': 'rgba(59,130,246,0)' });
  grad.appendChild(s1); grad.appendChild(s2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Grid lines
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const y = PAD.top + (chartH / gridCount) * i;
    const line = svgEl('line', {
      x1: PAD.left, y1: y, x2: W - PAD.right, y2: y,
      stroke: 'rgba(255,255,255,0.06)', 'stroke-width': '1'
    });
    svg.appendChild(line);

    // Y-axis label
    const val = maxVal - (maxVal / gridCount) * i;
    const label = svgEl('text', {
      x: PAD.left - 8, y: y + 4,
      'text-anchor': 'end',
      fill: 'var(--color-text-tertiary)',
      'font-size': '11',
    });
    label.textContent = val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val.toFixed(0);
    svg.appendChild(label);
  }

  // Build path points
  const points = data.map((d, i) => [xAt(i), yScale(d.amount)]);
  const pathD = points.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(' ');
  const areaD = pathD + ` L ${points[points.length-1][0]},${PAD.top + chartH} L ${PAD.left},${PAD.top + chartH} Z`;

  // Area fill
  const area = svgEl('path', {
    d: areaD,
    fill: `url(#line-grad-${container.id || 'chart'})`,
  });
  svg.appendChild(area);

  // Line stroke
  const line = svgEl('path', {
    d: pathD,
    fill: 'none',
    stroke: 'var(--color-accent-blue)',
    'stroke-width': '2.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  svg.appendChild(line);

  // Dots + tooltip groups
  points.forEach(([x, y], i) => {
    const g = svgEl('g', { style: 'cursor:pointer' });

    // Hit area
    const hit = svgEl('circle', { cx: x, cy: y, r: '16', fill: 'transparent' });
    // Outer ring (shows on hover via CSS)
    const ring = svgEl('circle', { cx: x, cy: y, r: '6', fill: 'rgba(59,130,246,0.2)', opacity: '0', class: 'dot-ring' });
    // Inner dot
    const dot  = svgEl('circle', { cx: x, cy: y, r: '4', fill: 'var(--color-accent-blue)', stroke: 'var(--color-bg-elevated)', 'stroke-width': '2' });

    g.appendChild(hit); g.appendChild(ring); g.appendChild(dot);

    // Tooltip
    const tip = document.createElement('div');
    tip.style.cssText = `
      position:absolute; pointer-events:none; opacity:0; transition:opacity 0.15s;
      background:var(--color-bg-elevated); border:1px solid var(--color-border-strong);
      border-radius:var(--radius-sm); padding:6px 10px; font-size:12px;
      color:var(--color-text-primary); white-space:nowrap; z-index:10;
      box-shadow:var(--shadow-md);
    `;
    tip.innerHTML = `<strong>${data[i].label}</strong><br>PKR ${data[i].amount.toLocaleString('en-PK')}`;

    g.addEventListener('mouseenter', e => {
      ring.setAttribute('opacity', '1');
      tip.style.opacity = '1';
      const rect = container.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const scaleX = svgRect.width / W;
      tip.style.left = `${x * scaleX - 40}px`;
      tip.style.top  = `${y * (svgRect.height / H) - 60}px`;
    });
    g.addEventListener('mouseleave', () => {
      ring.setAttribute('opacity', '0');
      tip.style.opacity = '0';
    });

    svg.appendChild(g);
    container.style.position = 'relative';
    container.appendChild(tip);
  });

  // X-axis labels
  data.forEach((d, i) => {
    const label = svgEl('text', {
      x: xAt(i), y: H - 8,
      'text-anchor': 'middle',
      fill: 'var(--color-text-tertiary)',
      'font-size': '11',
    });
    label.textContent = d.label;
    svg.appendChild(label);
  });

  container.innerHTML = '';
  container.appendChild(svg);
}

/**
 * Bar chart
 * @param {HTMLElement} container
 * @param {Array<{label:string, amount:number, color?:string}>} data
 */
export function BarChart(container, data, options = {}) {
  const W = options.width || container.clientWidth || 400;
  const H = options.height || 200;
  const PAD = { top: 16, right: 16, bottom: 36, left: 60 };
  const GAP = 6;

  const values = data.map(d => d.amount);
  const maxVal = Math.max(...values) * 1.15 || 1;
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = (chartW - (data.length - 1) * GAP) / data.length;

  const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (chartH / 4) * i;
    svg.appendChild(svgEl('line', {
      x1: PAD.left, y1: y, x2: W - PAD.right, y2: y,
      stroke: 'rgba(255,255,255,0.06)', 'stroke-width': '1'
    }));
    const val = maxVal - (maxVal / 4) * i;
    const lbl = svgEl('text', {
      x: PAD.left - 8, y: y + 4,
      'text-anchor': 'end', fill: 'var(--color-text-tertiary)', 'font-size': '11',
    });
    lbl.textContent = val >= 1000 ? `${(val/1000).toFixed(0)}K` : val.toFixed(0);
    svg.appendChild(lbl);
  }

  data.forEach((d, i) => {
    const x = PAD.left + i * (barW + GAP);
    const barH = (d.amount / maxVal) * chartH;
    const y = PAD.top + chartH - barH;
    const color = d.color || 'var(--color-accent-blue)';

    const bar = svgEl('rect', {
      x, y: PAD.top + chartH,
      width: barW, height: 0,
      fill: color, rx: '4', ry: '4',
      opacity: '0.85',
    });
    svg.appendChild(bar);

    // Animate bar up
    requestAnimationFrame(() => {
      bar.setAttribute('y', y);
      bar.setAttribute('height', barH);
      bar.style.transition = `y 0.6s cubic-bezier(0.4,0,0.2,1) ${i * 50}ms, height 0.6s cubic-bezier(0.4,0,0.2,1) ${i * 50}ms`;
    });

    const lbl = svgEl('text', {
      x: x + barW / 2, y: H - 6,
      'text-anchor': 'middle', fill: 'var(--color-text-tertiary)', 'font-size': '11',
    });
    lbl.textContent = d.label;
    svg.appendChild(lbl);
  });

  container.innerHTML = '';
  container.appendChild(svg);
}

/**
 * Donut chart for completion percentage.
 * @param {HTMLElement} container
 * @param {number} percent — 0 to 100
 * @param {string} color — CSS color string
 */
export function DonutChart(container, percent, color = 'var(--color-accent-blue)') {
  const size = 80;
  const strokeW = 8;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;

  container.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}"
        fill="none" stroke="var(--color-bg-secondary)" stroke-width="${strokeW}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}"
        fill="none" stroke="${color}" stroke-width="${strokeW}"
        stroke-linecap="round"
        stroke-dasharray="${dash} ${circ - dash}"
        stroke-dashoffset="0"
        style="transition: stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:600;color:var(--color-text-primary)">${Math.round(percent)}%</div>
  `;
  container.style.position = 'relative';
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
}
