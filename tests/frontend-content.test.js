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
        innerHTML: '', style: {}, children: [], href: '', classList: { add() {}, toggle() {} },
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
        accordion_create(title, body) { const root=element(); root.body=body; root.innerHTML=typeof body==='string' ? body : ''; root.children=[element(),element()]; return root; }
    });
    for (const file of ['jpeg_util.js','frontend.js']) vm.runInContext(fs.readFileSync(path.join(projectRoot,file),'utf8'),context);
    return { context, elements, urls, revoked, encoded };
}

test('Closing the data overlay does not navigate the page', () => {
    const html=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
    assert.match(html,/onclick="hideDataOverlay\(\);return false"/);
});

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

test('Invalid and truncated files show recovered information and visible warnings', () => {
    const ui=loadFrontend(), bytes=jpeg();
    const truncated=loadJPEG().processJPEG(bytes.subarray(0,bytes.length-2).toString('latin1'));
    ui.context.displayResults(truncated);
    assert.ok(ui.elements.image.children[0].innerHTML.includes('recovered data shown'));
    assert.ok(ui.elements.image.children[0].innerHTML.includes('file&nbsp;may&nbsp;be&nbsp;truncated'));
    assert.ok(ui.elements.image.children[1].children.length>0);
    assert.ok(ui.context.displayHeaderInfo({...truncated.headers.at(-1),truncated:true}).includes('Truncated; available bytes shown'));
    assert.ok(ui.context.displayHeaderInfo({...truncated.headers.at(-1),recovered:true}).includes('sequence unverified'));
    assert.ok(ui.context.displayImageInfo({valid:false,unparsed:true,hasextraneous:true,extraneous:'left',warnings:['<untrusted>']}).includes('&lt;untrusted&gt;'));
});

test('Truncated APP1 still exposes the bounded EXIF reader in the results', () => {
    const {exifSegment}=require('./exif-helpers');
    const bytes=Buffer.concat([Buffer.from([255,216]),exifSegment().subarray(0,-2)]);
    const context=loadJPEG(), info=context.processJPEG(bytes.toString('latin1'));
    const app1=info.headers.at(-1);
    assert.equal(app1.truncated,true);
    assert.equal(app1.extendedtype,'EXIF');
    const ui=loadFrontend(); let calls=0;
    ui.context.getPreviewEXIF=()=>{calls++;};
    ui.context.displayResults(info);
    assert.equal(calls,1);
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
    assert.equal(ui.elements['data-overlay-content'].value,'');
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

test('Replacing results revokes downloads and releases old previews and byte references', () => {
    const ui = loadFrontend();
    for (let i=0;i<5;i++) {
        ui.context.displayResults({headers:[],valid:true});
        const generation=ui.context.g_ResultRequestId;
        ui.context.getContentURL('file-'+i);
        const link=element();
        link.setAttribute('download','output.bin');
        ui.context.showContent(0,false,generation);
        ui.context.downloadContent(0,link,generation);
        assert.equal(ui.urls.size,1);
        assert.equal(ui.context.g_ContentData.length,1);
    }
    ui.context.displayResults({headers:[],valid:true});
    assert.equal(ui.urls.size,0);
    assert.equal(ui.revoked.length,5);
    assert.equal(ui.context.g_DownloadURLs.length,0);
    assert.equal(ui.context.g_ContentData.length,0);
    assert.equal(ui.elements['data-overlay-content'].value,'');
    assert.equal(ui.elements['data-overlay'].style.display,'none');
});

test('Current downloads remain usable until replacement, including repeated clicks', () => {
    const ui = loadFrontend();
    ui.context.getContentURL('file');
    const oldLink=element();
    oldLink.setAttribute('download','output.bin');
    ui.context.downloadContent(0,oldLink,0);
    const url=oldLink.href;
    assert.equal(ui.context.downloadContent(0,oldLink,0),true);
    assert.ok(ui.urls.has(url));
    assert.equal(ui.revoked.length,0);
    ui.context.displayResults({headers:[],valid:true});
    assert.equal(ui.context.downloadContent(0,oldLink,0),false);
    assert.equal(ui.urls.size,0);
    assert.deepEqual(ui.revoked,[url]);
});

test('EXIF byte arrays cannot corrupt the surrounding header rendering loop', () => {
    const ui=loadFrontend();
    vm.runInContext(fs.readFileSync(path.join(projectRoot,'accordion.js'),'utf8'),ui.context);
    ui.context.EXIF={readFromBinaryFile:() => ({UserComment:[]})};
    const info=loadJPEG().processJPEG(jpeg().toString('latin1'));
    info.headers[1].hasextendeddata=true;
    info.headers[1].extendedtype='EXIF';
    ui.context.displayResults(info);
    assert.equal(ui.elements.image.children[1].children[1].children.length,info.headers.length);
    assert.equal(ui.elements.image.children[1].children[0].type,'button');
    assert.equal(ui.context.i,undefined);
    assert.equal(ui.context.array2string([0,128,255]),'\0\x80\xff');
    assert.equal(ui.context.hexdump('abc',16),'61 62 63 ');
    assert.equal(ui.context.p,undefined);
});

test('Utility loading preserves native literal replaceAll and converts bytes across chunk boundaries', () => {
    const ui=loadFrontend();
    assert.equal(vm.runInContext("'a.a'.replaceAll('.', '-')",ui.context),'a-a');
    const bytes=Uint8Array.from({length:70000},(_,index)=>index%256);
    assert.equal(ui.context.array2string(bytes),Buffer.from(bytes).toString('latin1'));
});

test('Object metadata is escaped and handles a hasOwnProperty field safely', () => {
    const ui=loadFrontend();
    const html=ui.context.displayObjectInfo({hasOwnProperty:'value',label:'<img src=x onerror=alert(1)>'});
    assert.ok(html.includes('hasOwnProperty'));
    assert.ok(html.includes('&lt;img'));
    assert.equal(html.includes('<img'),false);
});

test('Dimensions remain visible for codecs the browser cannot preview', () => {
    const ui=loadFrontend();
    assert.ok(ui.context.displayImageInfo({valid:true,dimensions:{width:65536,height:1}}).includes('65536x1'));
    const html=ui.context.displayScanComponentInfo({id:1,dctn:1,actn:2},'jpeg-ls');
    assert.ok(html.includes('Mapping Table #'));
    assert.ok(html.includes('18'));
    assert.equal(html.includes('AC Table'),false);
});

test('Nested accordions use natural height and still collapse individually', () => {
    const ui=loadFrontend();
    vm.runInContext(fs.readFileSync(path.join(projectRoot,'accordion.js'),'utf8'),ui.context);
    const child=ui.context.accordion_create('EXIF','Large metadata');
    const parent=ui.context.accordion_create('Headers',[child]);
    for (const entry of [parent,child]) entry.children[0].nextElementSibling=entry.children[1];
    parent.children[0].onclick(); child.children[0].onclick();
    assert.equal(parent.children[1].style.maxHeight,'none');
    assert.equal(child.children[1].style.maxHeight,'none');
    child.children[0].onclick();
    assert.equal(child.children[1].style.maxHeight,'');
    assert.equal(parent.children[1].style.maxHeight,'none');
    parent.children[0].onclick();
    assert.equal(parent.children[1].style.maxHeight,'');
});
