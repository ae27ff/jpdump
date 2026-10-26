const test = require('node:test');
const assert = require('node:assert/strict');
const {loadJPEG} = require('./jpeg-helpers');
const {loadScript} = require('./script-helpers');
const {jpeg, segment, NativeDOMParser} = require('./metadata-helpers');
const {exifSegment} = require('./exif-helpers');

function workspace(bytes, overrides = {}){
    const context = loadJPEG({Blob, ...overrides});
    for(const file of ['JPEGMetadata','EXIFTags','TIFFReader','IPTCReader','XMPReader','XMLConverter','EXIF'])
        loadScript(context,'js/metadata/' + file + '.js');
    loadScript(context,'js/ui/ResultView.js');
    loadScript(context,'js/analysis/FileAnalysis.js');
    loadScript(context,'js/jpeg/JPEGFileModel.js');
    loadScript(context,'js/ui/Workspaces.js');
    const data = bytes.toString('latin1'), app = context.Workspaces;
    context.ImageController = {data};
    app.info = context.JPEGParser.parse(data,{sequence:true});
    context.Inspector = {file:{name:'sample<&>.jpg'},model:context.JPEGFileModel.build(app.info,data)};
    return {app, context};
}

test('Retrieve metadata includes basic details, repeated packets, comments, JFIF and every image',()=>{
    const jfif = segment(0xe0,Buffer.from([74,70,73,70,0,1,2,1,0,72,0,72,0,0]));
    const secondExif = exifSegment();secondExif[28] = 66;
    const {app} = workspace(Buffer.concat([jpeg(jfif, exifSegment(), secondExif, segment(254,Buffer.from('<b>comment</b>'))),jpeg(exifSegment())]));
    const rows = app.metadataRows();
    const value = (source, name) => rows.find(row=>row[0]===source && row[1]===name)?.[2];
    assert.equal(value('File','Images / streams'),'2');
    assert.equal(value('Image 1','Dimensions'),'1 × 1');
    assert.equal(value('Image 1','Precision'),'8 bits per sample');
    assert.equal(value('Image 1 · JFIF 1','X density'),'72');
    assert.equal(value('Image 1 · EXIF 1','Make'),'A');
    assert.equal(value('Image 1 · EXIF 2','Make'),'B');
    assert.equal(value('Image 2 · EXIF 1','Make'),'A');
    assert.equal(value('Image 1 · Comment 1','Text'),'<b>comment</b>');
    const out = {appendChild(){}};app.el=()=>({checked:false});app.download=()=>({});app.metadata(out);
    assert.match(out.innerHTML,/sample&lt;&amp;&gt;\.jpg/);
    assert.match(out.innerHTML,/&lt;b&gt;comment&lt;\/b&gt;/);
    assert.doesNotMatch(out.innerHTML,/<b>comment/);
});

test('Metadata CSV saves all table rows, escapes CSV values and releases its download URL',async()=>{
    const blobs = [], revoked = [], links = [];
    const {app,context} = workspace(Buffer.concat([jpeg(exifSegment(),exifSegment()),jpeg(exifSegment())]),{
        document:{createElement(tag){assert.equal(tag,'a');return {tagName:'A'};}},
        URL:{createObjectURL(blob){blobs.push(blob);return 'blob:metadata';},revokeObjectURL(url){revoked.push(url);}}
    });
    context.Inspector.file.name = '雪, "sample".jpg';
    const rows = app.metadataRows();
    rows.push(['Image 2 · XMP 1','Title','雪, "café"\r\nsecond line\nthird line']);
    rows.push(['Image 2 · XMP 1','Empty','']);
    app.metadataRows=()=>rows;
    app.el=()=>({checked:false});app.view='analyze';
    app.metadata({appendChild(link){links.push(link);}});
    assert.equal(links.length,1);
    assert.equal(links[0].textContent,'Export metadata CSV');
    assert.equal(links[0].download,'雪, "sample".jpg-metadata.csv');
    assert.equal(links[0].href,'blob:metadata');
    assert.equal(blobs[0].type,'text/csv;charset=utf-8');
    const csv = await blobs[0].text();
    assert.ok(csv.startsWith('"Source","Detail","Value"\r\n'));
    assert.ok(csv.includes('"File","Name","雪, ""sample"".jpg"\r\n'));
    for(const source of ['Image 1 · EXIF 1','Image 1 · EXIF 2','Image 2 · EXIF 1'])
        assert.ok(csv.includes('"'+source+'","Make","A"\r\n'));
    assert.ok(csv.endsWith('"Image 2 · XMP 1","Title","雪, ""café""\r\nsecond line\nthird line"\r\n"Image 2 · XMP 1","Empty",""\r\n'));
    assert.equal(app.urls.length,1);
    app.release('analyze');
    assert.deepEqual(revoked,['blob:metadata']);
    assert.equal(app.urls.length,0);
});

test('Unreadable or unsupported metadata keeps basic details and later readable fields',()=>{
    const malformed = segment(0xe1,Buffer.from('Exif\0\0bad'));
    const {app} = workspace(jpeg(malformed,segment(0xe2,Buffer.from('unknown')),exifSegment()));
    const text = JSON.stringify(app.metadataRows());
    assert.match(text,/No readable metadata fields/);
    assert.match(text,/No structured decoder/);
    assert.match(text,/EXIF 2","Make","A/);
    const plain = workspace(jpeg()).app.metadataRows();
    assert.ok(plain.some(row=>row[1]==='Dimensions' && row[2]==='1 × 1'));
});

test('See Locations retains the observations report and binds Inspect links',()=>{
    const {app} = workspace(jpeg(segment(254,Buffer.from('comment'))));
    const out = {};app.el=id=>id==='ja-metadata-locations'?{checked:true}:null;
    app.integer=()=>16384;
    let bound=false;app.bindOffsets=()=>{bound=true;};
    app.metadata(out);
    assert.match(out.innerHTML,/Comment segment/);
    assert.match(out.innerHTML,/data-offset="2"/);
    assert.equal(bound,true);
});

test('Retrieve metadata decodes IPTC and nested UTF-8 XMP fields', {skip:process.platform!=='win32'},()=>{
    const caption=Buffer.from('Caption');
    const dataset=Buffer.concat([Buffer.from([28,2,120,0,caption.length]),caption]);
    const resource=Buffer.from([56,66,73,77,4,4,0,0,0,0,0,dataset.length]);
    const iptc=segment(0xed,Buffer.concat([Buffer.from('Photoshop 3.0\0'),resource,dataset]));
    const xmp=segment(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><title>雪 &amp; café</title></x:xmpmeta>'));
    const {app} = workspace(jpeg(iptc,xmp),{DOMParser:NativeDOMParser,TextDecoder});
    const rows=app.metadataRows();
    assert.ok(rows.some(row=>row[0]==='Image 1 · IPTC 1' && row[1]==='caption' && row[2]==='Caption'));
    assert.ok(rows.some(row=>row[0]==='Image 1 · XMP 1' && row[1].includes('title') && row[2]==='雪 & café'));
});
