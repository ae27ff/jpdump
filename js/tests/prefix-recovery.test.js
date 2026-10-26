const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadJPEG,jpeg,segment}=require('./jpeg-helpers');
const {loadScript}=require('./script-helpers');
const context=loadJPEG({setTimeout});
for(const file of ['js/jpeg/JPEGFileModel.js','js/jpeg/JPEGDecoder.js'])loadScript(context,file);
const {JPEGParser:parser,JPEGFileModel:model,JPEGDecoder:decoder}=context;
const text=bytes=>bytes.toString('latin1');
const donor=source=>decoder.headers(text(source));

function partition(bytes){
    const data=text(bytes),info=parser.parse(data),result=model.build(info,data);
    let end=0;
    for(const row of result.rows){assert.equal(row.start,end);assert.ok(row.end>row.start);end=row.end;}
    assert.equal(end,bytes.length);
    assert.equal(result.groups.reduce((sum,g)=>sum+g.size,0),bytes.length);
    return result;
}

test('Inspect exposes surviving headers after a missing SOI and keeps prefix bytes exact',()=>{
    const prefix=Buffer.from('cut header fragment'),bytes=Buffer.concat([prefix,jpeg().subarray(2)]),result=partition(bytes);
    assert.equal(result.info.prefixMissing,true);assert.equal(result.info.prefixRecovered,true);
    assert.equal(result.info.valid,false);assert.equal(result.recoverable,true);assert.equal(result.recognized,false);
    assert.equal(result.rows[0].group,'unparsed');assert.equal(result.rows[0].size,prefix.length);
    assert.equal(result.rows[1].code,'DQT');assert.equal(result.rows[1].start,prefix.length);
    assert.equal(result.rows.some(r=>r.code==='SOI'),false);
    assert.ok(result.rows.some(r=>r.code==='SOF0'));assert.ok(result.rows.some(r=>r.group==='image'));
    assert.equal(result.ghosts[0].leading,true);assert.equal(result.ghosts[0].size,null);
    assert.equal(result.images[0].start,0);assert.equal(result.images[0].end,bytes.length);
    assert.equal(text(bytes.subarray(0,result.rows[0].end)),text(prefix));
});

test('A later intact JPEG has absolute ranges and a prefix warning scoped to the first image',()=>{
    const prefix=Buffer.from('unknown'),frame=jpeg(),bytes=Buffer.concat([prefix,frame,frame]);
    const info=parser.parse(text(bytes),{sequence:true}),result=model.build(info,text(bytes));
    assert.equal(info.images.length,2);assert.equal(info.images[0].start,prefix.length);
    assert.equal(info.images[1].start,prefix.length+frame.length);
    assert.match(info.warnings[0],/0–6/);
    assert.equal(result.rows[0].group,'unparsed');assert.equal(result.rows[1].start,prefix.length);
    assert.equal(info.prefixRange[1],prefix.length);
});

test('Every leading cut preserves the exact file partition without fabricating stored markers',()=>{
    const bytes=jpeg(segment(225,Buffer.from('metadata fragment with fake \xff\xda marker','latin1')));
    for(let cut=0;cut<bytes.length;cut++){
        const suffix=bytes.subarray(cut),result=partition(suffix);
        for(const row of result.rows)if(row.header)assert.equal(suffix[row.start],255);
    }
    for(const bytes of [Buffer.from('noise\xff\xda\0\x08\x01\x01\0\0\x3f\0','latin1'),segment(219,Buffer.alloc(65)),Buffer.from('noise')]){
        const result=partition(bytes);assert.equal(result.recoverable,false);assert.ok(result.rows.every(r=>r.group==='unparsed'||r.header&&!r.header.valid));
    }
});

test('Recover mode automatically restores a missing SOI while strict decoding rejects it',async()=>{
    const prefix=Buffer.from('fragment'),bytes=Buffer.concat([prefix,jpeg().subarray(2)]),source=text(bytes),before=Buffer.from(bytes);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/beginning with SOI/);
    const state=await decoder.decode(source),bitmap=await decoder.bitmap(state);
    assert.equal(state.decoded,1);assert.equal(state.width,1);assert.equal(state.height,1);
    assert.ok(bitmap.mask.every(n=>n===2));assert.equal(state.recovery.missingSOI,true);
    assert.equal(state.recovery.assumedFrame,false);assert.equal(state.recovery.discarded[0].end,prefix.length);
    assert.equal(state.recovery.automatic,true);
    assert.equal(decoder.sourceOffset(state,state.offset),bytes.indexOf(Buffer.from([255,218]))+10);
    assert.deepEqual(bytes,before);
    await assert.rejects(decoder.decode(source,{recoverHeaders:true,mode:'strict'}),/Strict decoding/);
});

test('Automatic prefix recovery never borrows a missing frame without explicit opt-in',async()=>{
    const bytes=jpeg(),tables=donor(bytes),source=text(bytes.subarray(bytes.indexOf(Buffer.from([255,196]))));
    await assert.rejects(decoder.decode(source,{mode:'recover',donor:tables,assumedFrame:tables}),/frame header is missing/);
    const recovered=await decoder.decode(source,{mode:'recover',recoverHeaders:true,donor:tables,assumedFrame:tables});
    assert.equal(recovered.recovery.assumedFrame,true);assert.equal(recovered.recovery.automatic,false);
});

test('Cuts through tables and frame headers recover from a donor without overriding surviving geometry',async()=>{
    const bytes=jpeg(),tables=donor(bytes),dht=bytes.indexOf(Buffer.from([255,196]));
    const source=text(bytes.subarray(dht));
    await assert.rejects(decoder.decode(source,{recoverHeaders:true}),/frame header is missing/);
    const state=await decoder.decode(source,{recoverHeaders:true,donor:tables,assumedFrame:tables});
    assert.equal(state.recovery.assumedFrame,true);assert.equal(state.width,1);
    assert.match(state.log.join(' '),/Assumed.*frame header/);assert.match(state.log.join(' '),/Assumed missing quantization/);
    assert.ok((await decoder.bitmap(state)).mask.every(n=>n===2));
    const partial=await decoder.decode(text(bytes.subarray(20)),{recoverHeaders:true,donor:tables,assumedFrame:{...tables,width:19}});
    assert.equal(partial.width,1);assert.equal(partial.recovery.assumedFrame,false);
    const noFrame=Buffer.concat([bytes.subarray(0,bytes.indexOf(Buffer.from([255,192]))),bytes.subarray(dht)]);
    const repaired=await decoder.decode(text(noFrame),{recoverHeaders:true,donor:tables,assumedFrame:tables});
    assert.equal(repaired.recovery.missingSOI,false);assert.equal(repaired.recovery.assumedFrame,true);
});

test('Assumed frames are validated and source offsets never refer to fabricated bytes',()=>{
    const bytes=jpeg(),dht=bytes.indexOf(Buffer.from([255,196])),source=text(bytes.subarray(dht)),tables=donor(bytes);
    for(const frame of [{...tables,width:70000},{...tables,height:0},{...tables,components:[{id:1,h:0,v:1,q:0}]},{...tables,components:[{id:1,h:1,v:1,q:9}]}])
        assert.throws(()=>decoder.headers(source,{recoverHeaders:true,donor:tables,assumedFrame:frame}),/Invalid assumed frame/);
    const state=decoder.headers(source,{recoverHeaders:true,donor:tables,assumedFrame:tables});
    for(let p=0;p<state.decodeData.length;p++){
        const original=decoder.sourceOffset(state,p);
        if(original!==null)assert.equal(state.decodeData.charCodeAt(p),source.charCodeAt(original),'source offset '+p);
    }
    assert.equal(decoder.sourceOffset(state,0),null);assert.equal(decoder.sourceOffset(state,state.decodeData.length),source.length);
});

test('A scan-only suffix can use donor coding headers including a missing restart interval',async()=>{
    const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'));
    const bytes=Buffer.from(fixtures.find(f=>f.name==='restart-444-17x13').jpeg,'base64'),sos=bytes.indexOf(Buffer.from([255,218]));
    const tables=donor(bytes),state=await decoder.decode(text(bytes.subarray(sos)),{recoverHeaders:true,donor:tables,assumedFrame:tables});
    assert.equal(state.events.length,0);assert.equal(state.restart,tables.restart);
    assert.ok(state.recovery.inserted.some(h=>h.marker==='DRI'));
    assert.ok((await decoder.bitmap(state)).mask.every(n=>n===2));
});

test('Baseline and progressive reference images survive missing prefixes with original coefficients',async()=>{
    const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'));
    for(const name of ['ycbcr-420-17x13','progressive-420-17x13','progressive-restart-444-17x13']){
        const fixture=fixtures.find(f=>f.name===name),bytes=Buffer.from(fixture.jpeg,'base64');
        const expected=await decoder.decode(text(bytes),{mode:'strict'});
        for(const cut of [2,bytes.indexOf(Buffer.from([255,196]))]){
            const tables=donor(bytes),actual=await decoder.decode(text(bytes.subarray(cut)),{recoverHeaders:cut!==2,donor:tables,assumedFrame:tables});
            assert.equal(actual.events.length,0,name);assert.equal(actual.width,fixture.width);
            for(let c=0;c<actual.components.length;c++)assert.deepEqual(Array.from(actual.components[c].coefficients),Array.from(expected.components[c].coefficients),name);
            assert.ok((await decoder.bitmap(actual)).mask.every(n=>n===2));
        }
        const healthy=await decoder.decode(text(bytes),{recoverHeaders:true});
        assert.equal(healthy.recovery,undefined);assert.ok((await decoder.bitmap(healthy)).mask.every(n=>n===1));
    }
});
