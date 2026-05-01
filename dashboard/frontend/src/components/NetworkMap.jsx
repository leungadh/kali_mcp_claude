import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const NODES = [
  { id: 'kali', label: 'Kali Linux',  ip: '18.142.222.240', color: '#ef4444' },
  { id: 'dvwa', label: 'DVWA Target', ip: '10.0.2.100',     color: '#f97316' },
];
const LINKS = [{ source: 'kali', target: 'dvwa' }];

export function NetworkMap({ isActive = false }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width  = svgRef.current.clientWidth  || 400;
    const height = svgRef.current.clientHeight || 240;

    svg.append('defs').append('marker')
      .attr('id', 'arrowhead').attr('viewBox', '0 -5 10 10')
      .attr('refX', 28).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#00ff41');

    const simulation = d3.forceSimulation(NODES)
      .force('link', d3.forceLink(LINKS).id((d) => d.id).distance(180))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const linkSel = svg.append('g').selectAll('line').data(LINKS).join('line')
      .attr('stroke', '#00ff41').attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)')
      .attr('stroke-dasharray', isActive ? '8 4' : 'none')
      .attr('class', isActive ? 'link-active' : '');

    const nodeSel = svg.append('g').selectAll('g').data(NODES).join('g');
    nodeSel.append('circle').attr('r', 22).attr('fill', (d) => d.color)
      .attr('stroke', '#00ff41').attr('stroke-width', 1.5);
    nodeSel.append('text').text((d) => d.label).attr('y', 36)
      .attr('text-anchor', 'middle').attr('fill', '#d1d5db')
      .attr('font-size', '11px').attr('font-family', 'monospace');
    nodeSel.append('text').text((d) => d.ip).attr('y', 50)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280')
      .attr('font-size', '10px').attr('font-family', 'monospace');

    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [isActive]);

  return (
    <div style={{ background: '#111', borderRadius: '8px', padding: '8px', height: '100%' }}>
      <p style={{ color: '#6b7280', fontSize: '11px', margin: '0 0 4px 4px' }}>Network Map</p>
      <svg ref={svgRef} width="100%" height="calc(100% - 20px)" style={{ display: 'block' }}>
        {isActive && (
          <style>{`
            .link-active { animation: dash 0.8s linear infinite; }
            @keyframes dash { to { stroke-dashoffset: -24; } }
          `}</style>
        )}
      </svg>
    </div>
  );
}
