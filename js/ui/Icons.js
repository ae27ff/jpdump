/**
 * SVG paths used by the inspector controls.
 */
class Icons{
    static get(name){
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (Icons.paths[name] || Icons.paths.scan) + '</svg>';
    }
}

Icons.paths={
    compare: '<path d="M3 3h7v18H3zm11 0h7v18h-7M10 12h4"/>',
    scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    // Binary glyphs share a 7-unit grid and a 5.2-unit visible height, including strokes.
    logo: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><g stroke-width="1.2" stroke-linecap="square" stroke-linejoin="miter"><path d="M15.5 6.5v4M8.5 13.5v4"/><rect x="6.5" y="6.5" width="4" height="4"/><rect x="13.5" y="13.5" width="4" height="4"/></g>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 4-6 4 5"/>',
    'code-xml': '<path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/>',
    wrench: '<path d="m14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>', 'chevron-left': '<path d="m15 6-6 6 6 6"/>', 'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    'folder-open': '<path d="M3 8V5h6l3 3h8v3M3 8v12h16l3-9H6L3 20"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    'circle-alert': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',
    'arrow-right': '<path d="M3 12h18m-6-6 6 6-6 6"/>',
    'file-code-2': '<path d="M14 2H4v20h16V8zM14 2v6h6m-11 5-3 3 3 3m6-6 3 3-3 3"/>',
    'text-cursor-input': '<path d="M4 5h16M12 5v15M8 20h8"/>',
    lightbulb: '<path d="M8 16a7 7 0 1 1 8 0v3H8zm1 6h6"/>',
    'chart-pie': '<path d="M12 3v9h9A9 9 0 1 1 12 3zm3-1v7h7a9 9 0 0 0-7-7z"/>',
    binary: '<rect x="3" y="3" width="6" height="7" rx="2"/><rect x="15" y="14" width="6" height="7" rx="2"/><path d="M16 3h3v7M3 14h3v7"/>'
};
