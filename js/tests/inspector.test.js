const {loadScript}=require('./script-helpers');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {projectRoot, jpeg, segment} = require('./metadata-helpers');
const {parseJPEG} = require('./jpeg-helpers');

const context = vm.createContext({});
for(const file of ['js/jpeg/JPEGTable.js','js/jpeg/JPEGFileModel.js']) loadScript(context,file);
const buildModel=context.JPEGFileModel.build, readTables=context.JPEGTable.read;
function modelFor(bytes) { return buildModel(parseJPEG(bytes), bytes.toString('latin1')); }
function assertPartition(bytes, model) {
    let end = 0;
    for (const row of model.rows) {
        assert.equal(row.start, end, 'regions must not overlap or leave gaps');
        assert.ok(row.end > row.start && row.end <= bytes.length);
        assert.ok(row.contentStart >= row.start && row.contentEnd <= row.end);
        assert.equal(row.size, row.end - row.start);
        end = row.end;
    }
    assert.equal(end, bytes.length);
    assert.equal(model.groups.reduce((sum, group) => sum + group.size, 0), bytes.length);
}

test('The inspector separates marker headers, stored scan bytes, end marker and exact trailer', () => {
    const bytes = Buffer.concat([jpeg(segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'))), Buffer.from([0,255,128])]);
    const model = modelFor(bytes);
    assertPartition(bytes, model);
    assert.equal(model.confirmedEnd, true);
    const app0 = model.rows.find(row => row.code === 'APP0');
    assert.equal(app0.size, 18);
    assert.equal(app0.contentEnd - app0.contentStart, 14);
    const sos = model.rows.find(row => row.code === 'SOS');
    assert.equal(sos.size, parseInt(sos.header.len, 10) + sos.header.markerwidth);
    const image = model.rows.find(row => row.group === 'image');
    assert.deepEqual(bytes.subarray(image.start,image.end), Buffer.from([0x3f]));
    const extra = model.rows.at(-1);
    assert.equal(extra.group, 'extra');
    assert.deepEqual(bytes.subarray(extra.start,extra.end), Buffer.from([0,255,128]));
});

test('Stored scan ranges preserve FF00 stuffing and restart markers occupy separate rows', () => {
    const base = jpeg(segment(0xdd, Buffer.from([0,1])));
    const bytes = Buffer.concat([base.subarray(0,-2),Buffer.from([255,0,255,208,63]),base.subarray(-2)]);
    const model = modelFor(bytes);
    assert.equal(model.info.valid,true);
    assertPartition(bytes,model);
    const scans = model.rows.filter(row=>row.group==='image');
    assert.equal(scans.length,2);
    assert.equal(model.interleaved,true);
    assert.deepEqual(bytes.subarray(scans[0].start,scans[0].end),Buffer.from([63,255,0]));
    assert.equal(model.rows.find(row=>row.code==='RST0').size,2);
    assert.equal(model.groups.find(group=>group.id==='image').contiguous,false);
});

test('JPEG-LS and raw JPEG 2000 retain their format names and every stored byte', () => {
    for (const [fixture,format] of [['t8nde0.jls','JPEG-LS'],['openjpeg-3x2.j2k','JPEG 2000 codestream']]) {
        const bytes=Buffer.concat([fs.readFileSync(path.join(__dirname,'fixtures',fixture)),Buffer.from('tail')]);
        const model=modelFor(bytes);
        assert.equal(model.info.valid,true);
        assert.equal(model.format,format);
        assertPartition(bytes,model);
        assert.equal(model.rows.at(-1).group,'extra');
        assert.equal(model.rows.at(-1).size,4);
        assert.ok(model.dimensions.width>0 && model.dimensions.height>0);
        assert.ok(model.rows.some(row=>row.group==='image'));
    }
});

test('Empty, arbitrary, truncated and recovered inputs are not falsely labeled as safe trailers', () => {
    const base=jpeg();
    const malformed=Buffer.concat([base.subarray(0,2),segment(0xdb,Buffer.from([0,1])),base.subarray(2),Buffer.from('tail')]);
    for (const bytes of [Buffer.alloc(0),Buffer.from('<script>not an image</script>'),base.subarray(0,-1),malformed]) {
        const model=modelFor(bytes);
        assertPartition(bytes,model);
        assert.equal(model.confirmedEnd,false);
        assert.equal(model.rows.some(row=>row.group==='extra'),false);
    }
    assert.equal(modelFor(Buffer.from('not an image')).format,'Unrecognized format');
});

test('All truncation points and marker fill bytes produce a lossless file partition', () => {
    const base=jpeg(segment(0xfe,Buffer.from('comment')));
    for(let length=0;length<=base.length;length++) assertPartition(base.subarray(0,length),modelFor(base.subarray(0,length)));
    const padded=Buffer.concat([Buffer.from([255]),base]);
    assertPartition(padded,modelFor(padded));
    assert.equal(modelFor(padded).rows[0].size,3);
});

test('Ghost tails preserve stored byte totals and distinguish declared loss from unknown scan length', () => {
    const base=jpeg();
    const complete=modelFor(base);
    assert.equal(complete.ghosts.length,0);
    for(const removed of [1,2,3]) {
        const bytes=base.subarray(0,-removed), model=modelFor(bytes);
        assertPartition(bytes,model);
        assert.equal(model.size,bytes.length);
        const image=model.ghosts.find(region=>region.group==='image');
        assert.equal(image.name,'Encoded image');
        assert.equal(image.size,null,'SOS does not declare the encoded scan length');
        assert.match(image.hint,/may be zero/);
        const end=model.ghosts.at(-1);
        assert.equal(end.name,'End of Image');
        assert.equal(end.expected,true);
        assert.equal(end.size,2,'two-byte expected marker, not a claimed missing-byte count');
    }
    const bytes=jpeg(segment(0xfe,Buffer.from('comment'))).subarray(0,8);
    const partial=modelFor(bytes);
    assertPartition(bytes,partial);
    assert.equal(partial.ghosts[0].name,'Headers');
    assert.equal(partial.ghosts[0].size,5);
    assert.match(partial.ghosts[0].hint,/COM/);
    const shortLength=modelFor(Buffer.from([255,216,255,254,0]));
    assert.equal(shortLength.ghosts[0].group,'headers');
    assert.equal(shortLength.ghosts[0].size,null);
    const sosOffset=base.indexOf(Buffer.from([255,218]));
    const shortSOS=modelFor(base.subarray(0,sosOffset+5));
    assert.deepEqual(Array.from(shortSOS.ghosts,region=>region.group),['headers','image','eoi']);
    assert.equal(shortSOS.ghosts[0].size,5);
});

test('Ghosts respect JPEG-LS/JPEG 2000 labels and do not infer past unparsed corruption or a present end marker', () => {
    for(const fixture of ['t8nde0.jls','openjpeg-3x2.j2k']) {
        const bytes=fs.readFileSync(path.join(__dirname,'fixtures',fixture));
        assert.equal(modelFor(bytes).ghosts.length,0);
        const model=modelFor(bytes.subarray(0,-3));
        assertPartition(bytes.subarray(0,-3),model);
        assert.equal(model.ghosts.at(-1).name,model.j2k ? 'End of Codestream' : 'End of Image');
        assert.equal(model.ghosts.find(region=>region.group==='image').name,model.j2k ? 'Coded image data' : 'Encoded image');
        if(model.j2k) assert.equal(model.ghosts[0].size,1);
    }
    for(const bytes of [Buffer.alloc(0),Buffer.from('not an image'),Buffer.from([255,216,255,254,0,1,65])])
        assert.equal(modelFor(bytes).ghosts.length,0);
    const malformed=jpeg(segment(0xdb,Buffer.from([0,1])));
    assert.equal(modelFor(malformed).info.valid,false);
    assert.equal(modelFor(malformed).ghosts.length,0);
});

test('Ghost chart regions expose uncertainty on focus and click without selecting nonexistent file bytes', () => {
    const elements={};
    function element(){
        return {dataset:{},children:[],classList:{toggle(){}},setAttribute(name,value){this[name]=value;},
            appendChild(child){this.children.push(child);}};
    }
    for(const id of ['jr-map','jr-region-hint']) elements[id]=element();
    const subtitle={};
    const ui=vm.createContext({document:{getElementById:id=>elements[id],createElement:element},
        ResultView:{escapeHTML:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')}});
    loadScript(ui,'js/ui/Inspector.js');
    const inspector=ui.Inspector;
    inspector.root={querySelector:()=>subtitle,querySelectorAll:()=>[]};
    inspector.model=modelFor(jpeg().subarray(0,-2));
    inspector.renderGraph();
    const buttons=elements['jr-map'].children, ghosts=buttons.filter(button=>button.className.includes('jr-region-ghost'));
    assert.equal(ghosts.length,2);
    assert.match(ghosts[0].innerHTML,/<strong>Encoded image<\/strong><span>Length unknown<\/span>/);
    assert.match(ghosts[1].innerHTML,/<strong>EOI<\/strong><span>Expected<\/span>/);
    assert.match(subtitle.textContent,/dashed regions/);
    ghosts[0].onfocus();
    assert.match(elements['jr-region-hint'].textContent,/may be zero/);
    ghosts[1].onclick();
    assert.match(elements['jr-region-hint'].textContent,/EOI was not found/);
    assert.equal(inspector.selected,null);
    assert.ok(ghosts.every(button=>button['aria-label']===button.title));
});

test('Real quantization and Huffman tables are decoded without inventing truncated values', () => {
    const info=parseJPEG(jpeg());
    const quant=readTables(info.headers.find(header=>header.type==='db'));
    assert.equal(quant[0].precision,8);
    assert.equal(quant[0].values.length,64);
    assert.equal(quant[0].values[0],1);
    const huffman=readTables(info.headers.find(header=>header.type==='c4'));
    assert.equal(huffman.length,2);
    assert.equal(huffman[0].coding,'DC');
    assert.equal(huffman[1].coding,'AC');
    assert.equal(readTables({type:'db',content:'\0\x01'}),null);
    assert.equal(readTables({type:'c4',content:'\0\x01'}),null);
});

test('Version 2 is reflected in the release file and browser asset cache keys', () => {
    const version=fs.readFileSync(path.join(projectRoot,'VERSION'),'utf8').trim();
    assert.equal(version,'2.0.0');
    const html=fs.readFileSync(path.join(projectRoot,'index.html'),'utf8');
    assert.ok(html.includes('name="application-version" content="'+version+'"'));
    assert.ok(html.includes('js/ui/ImageController.js?v='+version));
    assert.ok(html.includes('js/ui/Inspector.js?v='+version));
    assert.ok(html.includes('style.css?v='+version));
    assert.equal(html.includes('Example file'),false);
});
