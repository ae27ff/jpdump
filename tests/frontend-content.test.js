const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { projectRoot } = require('./metadata-helpers');
const { loadJPEG, jpeg } = require('./jpeg-helpers');

function element() {
    const attributes = {};
    return {
        innerHTML: '', style: {}, children: [], href: '',
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { attributes[name] = String(value); },
        getAttribute(name) { return attributes[name] || null; },
        get outerHTML() {
            return '<a href="' + this.href + '" ' + Object.entries(attributes).map(([key,value]) => key + '="' + value + '"').join(' ') + '>' + this.innerHTML + '</a>';
        }
    };
}

function loadFrontend(navigator = {}) {
    const elements = {}, urls = new Map(), revoked = [], encoded = [];
    let urlCount = 0;
    const context = vm.createContext({
        Blob, navigator, btoa: data => { encoded.push(data); return btoa(data); },
        console: { log() {} }, branding: { init() {} },
        window: { addEventListener() {}, URL: {
            createObjectURL(blob) { const url = 'blob:test-' + ++urlCount; urls.set(url,blob); return url; },
            revokeObjectURL(url) { revoked.push(url); urls.delete(url); }
        } },
        document: { createElement: element, getElementById: id => elements[id] ||= element() },
        accordion_create(title, body) { const root=element(); root.innerHTML=typeof body==='string' ? body : ''; root.children=[element(),element()]; return root; }
    });
    for (const file of ['jpeg_util.js','frontend.js']) vm.runInContext(fs.readFileSync(path.join(projectRoot,file),'utf8'),context);
    return { context, elements, urls, revoked, encoded };
}

test('Rendering a large JPEG does not encode segment data or create download Blobs', () => {
    const ui = loadFrontend();
    const base = jpeg();
    const bytes = Buffer.concat([base.subarray(0,-2), Buffer.alloc(2*1024*1024,0x3f), base.subarray(-2)]);
    const info = loadJPEG().processJPEG(bytes.toString('latin1'));
    assert.equal(info.valid,true);
    ui.context.displayResults(info);
    const rendered = ui.elements.image.children[1];
    // Build the header HTML separately too, to measure the actual links.
    const scan = info.headers.find(header => header.type==='da');
    assert.ok(ui.context.displayHeaderInfo(scan).length < 1500);
    assert.ok(ui.context.displayScanInfo(scan.extendeddata).length < 1500);
    assert.ok(rendered);
    assert.equal(ui.encoded.length,0);
    assert.equal(ui.urls.size,0);
});

test('Text and hex previews are bounded while showing the complete byte count', () => {
    const ui = loadFrontend();
    const content = 'A'.repeat(2*1024*1024);
    ui.context.getContentURL(content);
    ui.context.showContent(0,false,0);
    assert.equal(ui.elements['data-overlay-content'].value.length,65536);
    assert.ok(ui.elements['data-overlay-length'].innerHTML.includes('2097152'));
    assert.ok(ui.elements['data-overlay-length'].innerHTML.includes('Download Raw'));
    ui.context.showContent(0,true,0);
    assert.equal(ui.elements['data-overlay-content'].value.length,65536*3+4096*2);
    assert.equal(ui.encoded.length,0);
});

test('Raw downloads create one Blob on demand and retain every input byte', async () => {
    const ui = loadFrontend();
    const content = '\0\xff\x80'+'A'.repeat(100000);
    ui.context.getContentURL(content);
    const link = element();
    link.setAttribute('download','output.bin');
    assert.equal(ui.context.downloadContent(0,link,0),true);
    assert.equal(ui.context.downloadContent(0,link,0),true);
    assert.equal(ui.urls.size,1);
    const blob = ui.urls.get(link.href);
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from(content,'latin1'));
});

test('Links from replaced results cannot preview or download new content', () => {
    const ui = loadFrontend();
    ui.context.getContentURL('old');
    ui.context.displayResults({ headers: [], valid: true });
    ui.context.getContentURL('new');
    assert.equal(ui.context.showContent(0,false,0),false);
    assert.equal(ui.context.downloadContent(0,element(),0),false);
    assert.equal(ui.urls.size,0);
    assert.equal(ui.elements['data-overlay-content'],undefined);
    assert.equal(ui.context.g_ContentData[0],'new');
});

test('IE raw downloads avoid base64 and preserve binary bytes', async () => {
    const saved = [];
    const ui = loadFrontend({ msSaveBlob: (blob,name) => saved.push({blob,name}) });
    ui.context.getContentURL('\0\xff\x80');
    const link = element();
    link.setAttribute('download','output.bin');
    assert.equal(ui.context.downloadContent(0,link,0),false);
    assert.equal(saved[0].name,'output.bin');
    assert.deepEqual(Buffer.from(await saved[0].blob.arrayBuffer()),Buffer.from([0,255,128]));
    assert.equal(ui.encoded.length,0);
    assert.equal(ui.urls.size,0);
});
