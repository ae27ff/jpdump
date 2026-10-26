const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {loadJPEG} = require('./jpeg-helpers');
const {segment} = require('./metadata-helpers');
const {loadScript} = require('./script-helpers');

function dht(descriptor, counts, values){
    return Buffer.from([descriptor, ...Array.from({length:16}, (_, i) => counts[i + 1] || 0), ...values]);
}
function entropy(bits){
    bits += '1'.repeat((8 - bits.length % 8) % 8);
    const bytes = [];
    for(let i=0;i<bits.length;i+=8){const value=parseInt(bits.slice(i,i+8),2);bytes.push(value);if(value===255)bytes.push(0);}
    return Buffer.from(bytes);
}
function prefix(width=1, progressive=false, dc=dht(0,{1:1},[2]), ac=dht(16,{1:1,2:1},[0x11,0])){
    return Buffer.concat([Buffer.from([255,216]), segment(219,Buffer.from([0,...Array(64).fill(1)])),
        segment(progressive?194:192,Buffer.from([8,0,1,width>>8,width&255,1,1,0x11,0])),segment(196,Buffer.concat([dc,ac]))]);
}
function sos(ss=0,se=63,approx=0){return segment(218,Buffer.from([1,1,0,ss,se,approx]));}
function baseline(width=1, body=entropy('0100110'), restart=0){
    return Buffer.concat([prefix(width),...(restart?[segment(221,Buffer.from([0,restart]))]:[]),sos(),body,Buffer.from([255,217])]);
}
function progressive(){
    return Buffer.concat([prefix(1,true,dht(0,{1:1},[1]),dht(16,{1:1,2:1},[0xf0,0])),
        sos(0,0,1),entropy('01'),segment(196,dht(16,{1:1},[0])),sos(1,63),entropy('0'),sos(0,0,16),entropy('1'),Buffer.from([255,217])]);
}
function application(bytes=baseline(), sequence=false){
    const elements = {}, blobs = [], clicks = [];
    const element = () => ({hidden:false,setAttribute(){},removeAttribute(){},querySelector:() => ({}),querySelectorAll:() => [],click(){clicks.push({href:this.href,download:this.download});}});
    const context = loadJPEG({setTimeout,Blob,navigator:{},
        document:{getElementById:id => elements[id] || (elements[id]=element()),createElement:element,body:{appendChild(){},removeChild(){}}},
        window:{URL:{createObjectURL(blob){blobs.push(blob);return 'blob:symbols-'+blobs.length;}}},
        ResultView:{escapeHTML:String},Icons:{get:() => ''}});
    for(const file of ['js/jpeg/JPEGDecoder.js','js/jpeg/JPEGFileModel.js','js/ui/ContentView.js','js/ui/Inspector.js']) loadScript(context,file);
    context.ImageController = {data:bytes.toString('latin1')};
    const info=context.JPEGSequence.parse(context.ImageController.data,{sequence});
    const inspector=context.Inspector,decoder=context.JPEGDecoder;
    inspector.model=context.JPEGFileModel.build(info,context.ImageController.data);
    inspector.root={querySelectorAll:()=>[]};inspector.file={name:'test.jpg'};
    const scans=inspector.model.rows.filter(row=>row.header && row.header.type==='da');
    inspector.selected=scans[0] && scans[0].id;
    return {context,inspector,decoder,scans,elements,blobs,clicks};
}

test('Scan export emits exact DC/AC symbol bytes while consuming amplitude bits',async()=>{
    const bytes=baseline(),before=Buffer.from(bytes),{context,decoder,scans}=application(bytes);
    assert.deepEqual(Array.from(await decoder.scanSymbols(context.ImageController.data,scans[0].header.nextp)),[2,0x11,0]);
    assert.deepEqual(bytes,before);
});

test('Restart markers and FF00 stuffing do not become output symbols',async()=>{
    const restarted=application(baseline(16,Buffer.concat([entropy('0100110'),Buffer.from([255,208]),entropy('0100110')]),1));
    assert.deepEqual(Array.from(await restarted.decoder.scanSymbols(restarted.context.ImageController.data,restarted.scans[0].header.nextp)),[2,17,0,2,17,0]);
    const bits=[2047,-2047,2047,-2047,2047].map(n=>'0'+(n>0?'1':'0').repeat(11)+'0').join('');
    const body=entropy(bits);assert.ok(body.includes(Buffer.from([255,0])));
    const bytes=Buffer.concat([prefix(40,false,dht(0,{1:1},[11]),dht(16,{1:1},[0])),sos(),body,Buffer.from([255,217])]);
    const app=application(bytes);
    assert.deepEqual(Array.from(await app.decoder.scanSymbols(app.context.ImageController.data,app.scans[0].header.nextp)),[11,0,11,0,11,0,11,0,11,0]);
});

test('Progressive export uses scan-specific tables and omits DC refinement bits',async()=>{
    const {context,decoder,scans}=application(progressive());
    for(const [index,expected] of [[0,[1]],[1,[0]],[2,[]]]){
        assert.deepEqual(Array.from(await decoder.scanSymbols(context.ImageController.data,scans[index].header.nextp)),expected);
    }
    // Later damage does not prevent exporting a complete earlier scan.
    const cut=context.ImageController.data.substring(0,scans[1].start+2);
    assert.deepEqual(Array.from(await decoder.scanSymbols(cut,scans[0].header.nextp)),[1]);
});

test('Invalid codes, padding, missing tables, truncation, limits and cancellation reject export',async()=>{
    const app=application(),source=app.context.ImageController.data,offset=app.scans[0].header.nextp;
    for(const [data,expected] of [[source.substring(0,offset),/Invalid scan offset/],
        [source.substring(0,offset)+'\xff\xd9',/Marker encountered/],
        [source.substring(0,offset)+'\x4c\xff\xd9',/padding/],
        [source.substring(0,offset)+'\x4d\0\xff\xd9',/marker boundary/]]){
        await assert.rejects(app.decoder.scanSymbols(data,offset),expected);
    }
    await assert.rejects(app.decoder.scanSymbols(source,offset,{maxBytes:2}),/output limit/);
    await assert.rejects(app.decoder.scanSymbols(source,offset,{cancelled:()=>true}),/Cancelled/);
    await assert.rejects(app.decoder.scanSymbols(source,offset+1),/not decoded/);
    const missing=baseline();missing[missing.indexOf(Buffer.from([255,218]))+6]=0x11;
    await assert.rejects(app.decoder.scanSymbols(missing.toString('latin1'),offset),/table is missing/);
    const progressiveApp=application(progressive());
    const progressiveSource=progressiveApp.context.ImageController.data,firstOffset=progressiveApp.scans[0].header.nextp;
    const damaged=progressiveSource.substring(0,firstOffset)+'\xff\xd9'+progressiveSource.substring(firstOffset+1);
    await assert.rejects(progressiveApp.decoder.scanSymbols(damaged,progressiveApp.scans[2].header.nextp+1),/Marker encountered/);
});

test('Real progressive AC refinement, restart and subsampling scans export successfully',async()=>{
    const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'));
    for(const name of ['progressive-gray-17x13','progressive-restart-420-17x13']){
        const fixture=fixtures.find(f=>f.name===name),app=application(Buffer.from(fixture.jpeg,'base64'));
        for(const scan of app.scans) await app.decoder.scanSymbols(app.context.ImageController.data,scan.header.nextp);
    }
});

test('Inspector exports lazily from SOS or data rows and scopes sequence offsets to their image',async()=>{
    const first=baseline(),second=progressive(),app=application(Buffer.concat([first,second]),true);
    const {inspector,elements,blobs,clicks}=app;
    inspector.selected=app.scans[2].id;inspector.renderContent();
    assert.equal(elements['jr-download-symbols'].hidden,false);assert.equal(blobs.length,0);
    const plan=inspector.scanExport(inspector.current());assert.equal(plan.start,first.length);
    await inspector.downloadScanSymbols();
    assert.deepEqual(Array.from(new Uint8Array(await blobs[0].arrayBuffer())),[0]);
    assert.equal(clicks[0].download,'test.jpg-scan-'+app.scans[2].start+'-huffman-values.bin');
    const data=inspector.model.rows.find(row=>row.group==='image' && row.start===app.scans[2].header.nextp);
    inspector.selected=data.id;inspector.renderContent();await inspector.downloadScanSymbols();
    assert.equal(blobs.length,1);assert.equal(clicks.length,2);
    inspector.selected=inspector.model.rows[0].id;inspector.renderContent();assert.equal(elements['jr-download-symbols'].hidden,true);
    for(const type of ['c3','c9','ca','f7']){
        const frame=inspector.model.rows.find(row=>row.header && row.header.type==='c0').header;
        const original=frame.type;frame.type=type;
        assert.equal(inspector.scanExport(app.scans[0]),null);frame.type=original;
    }
});

test('Failed and superseded downloads produce no partial or stale files',async()=>{
    const app=application(),{inspector,decoder,context,blobs,clicks,elements}=app;
    inspector.renderContent();
    decoder.scanSymbols=async()=>{throw new Error('Invalid Huffman code');};
    await inspector.downloadScanSymbols();assert.equal(blobs.length,0);
    assert.match(elements['jr-content-note'].textContent,/Invalid Huffman code/);
    assert.equal(elements['jr-download-symbols'].disabled,false);
    let resolve;decoder.scanSymbols=()=>new Promise(done=>{resolve=done;});
    const pending=inspector.downloadScanSymbols();++context.ContentView.requestId;
    resolve(new Uint8Array([1]));await pending;
    assert.equal(blobs.length,0);assert.equal(clicks.length,0);
});
