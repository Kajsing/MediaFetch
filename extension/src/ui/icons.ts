// Original, local line icons. No remote assets or runtime icon dependency.
const paths = {
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 17v4h14v-4'],
  settings: ['M4 6h16M4 12h16M4 18h16', 'M8 3v6M16 9v6M10 15v6'],
  link: ['m10 14 4-4', 'M8 16H6a4 4 0 0 1-3-7l4-4a4 4 0 0 1 6 0', 'M16 8h2a4 4 0 0 1 3 7l-4 4a4 4 0 0 1-6 0'],
  file: ['M6 3h8l4 4v14H6Z', 'M14 3v5h4', 'm10 11 4 3-4 3Z'],
  folder: ['M3 6h7l2 3h9v11H3Z'],
  check: ['m5 12 4 4L19 6'],
  alert: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v6M12 16v1'],
  clear: ['M4 5h16M4 11h7M4 17h7', 'm15 13 6 6m0-6-6 6'],
} as const;

export function icon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const data of paths[name]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', data); svg.append(path);
  }
  return svg;
}
