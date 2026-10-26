const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {loadScript} = require('./script-helpers');
const {jpeg,segment} = require('./metadata-helpers');
const context = vm.createContext({setTimeout});
for(const file of ['js/util/BinaryUtils.js','js/jpeg/JPEGFrame.js','js/jpeg/JPEGScan.js','js/jpeg/JPEGTable.js','js/jpeg/JPEGDecoder.js','js/analysis/FileAnalysis.js']) loadScript(context,file);
const {JPEGDecoder:decoder,FileAnalysis:analysis}=context;

function gray(width, height, scan, interval=0){
    const base=jpeg(), sof=base.indexOf(Buffer.from([255,192])), sos=base.indexOf(Buffer.from([255,218]));
    const prefix=Buffer.from(base.subarray(0,sos)); prefix.writeUInt16BE(height,sof+5);prefix.writeUInt16BE(width,sof+7);
    return Buffer.concat([prefix,...(interval?[segment(221,Buffer.from([interval>>8,interval&255]))]:[]),base.subarray(sos,sos+10),Buffer.from(scan),Buffer.from([255,217])]).toString('latin1');
}

test('Baseline decoding reconstructs the stored raster and a correct 24-bit BMP',async()=>{
    const source=gray(9,8,[15]); // two zero DC/EOB blocks, then one padding bits
    const state=await decoder.decode(source,{mode:'strict'}),bitmap=await decoder.bitmap(state);
    assert.equal(state.width,9);assert.equal(state.height,8);assert.equal(state.decoded,2);
    assert.ok(bitmap.mask.every(n=>n===1));
    assert.ok(bitmap.pixels.every((n,i)=>n===(i%4===3?255:128)));
    const bmp=Buffer.from(decoder.bmp(bitmap));
    assert.equal(bmp.toString('ascii',0,2),'BM');assert.equal(bmp.readUInt32LE(2),54+28*8);
    assert.equal(bmp.readInt32LE(18),9);assert.equal(bmp.readInt32LE(22),8);assert.equal(bmp.readUInt16LE(28),24);
    assert.deepEqual(Array.from(bmp.subarray(54,57)),[128,128,128]);
});

test('Missing EOI is recorded in recovery and rejected in strict mode without changing bytes',async()=>{
    const bytes=jpeg().subarray(0,-2),before=Buffer.from(bytes),source=bytes.toString('latin1');
    const state=await decoder.decode(source,{mode:'recover'});
    assert.equal(state.decoded,1);assert.match(state.log.join(' '),/missing or damaged end/);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/end marker/);
    assert.deepEqual(bytes,before);
});

test('Truncation retains complete blocks and marks the undecoded remainder',async()=>{
    // The byte can encode four complete blocks; the declared image needs five.
    const source=gray(40,8,[0]);
    const state=await decoder.decode(source),bitmap=await decoder.bitmap(state,{fill:'neutral'});
    assert.equal(state.decoded,4);
    assert.deepEqual(Array.from(state.components[0].available),[1,1,1,1,0]);
    assert.equal(Array.from(bitmap.mask).filter(n=>n===0).length,64);
    assert.equal(state.events.length,1);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/Marker encountered/);
});

test('Restart recovery preserves the prefix, skips damage and resumes once at the next boundary',async()=>{
    const source=gray(24,8,[63,255,208,247,255,209,63],1);
    const state=await decoder.decode(source),bitmap=await decoder.bitmap(state);
    assert.equal(state.decoded,2);
    assert.deepEqual(Array.from(state.components[0].available),[1,0,2]);
    assert.equal(bitmap.mask[0],1);assert.equal(bitmap.mask[8],0);assert.equal(bitmap.mask[16],2);
    assert.match(state.events[0].message,/resumed at RST1/);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/Marker encountered/);
});

test('Valid restart intervals decode normally, including modulo-eight rollover',async()=>{
    const scan=[];
    for(let i=0;i<11;i++){scan.push(63);if(i<10)scan.push(255,208+i%8);}
    const state=await decoder.decode(gray(88,8,scan,1),{mode:'strict'});
    assert.equal(state.decoded,11);assert.equal(state.events.length,0);
    assert.ok(state.components[0].available.every(n=>n===1));
});

test('Component-only recovery retains completed luma even when another component is damaged',async()=>{
    const base=jpeg(),sof=base.indexOf(Buffer.from([255,192])),dht=base.indexOf(Buffer.from([255,196])),sos=base.indexOf(Buffer.from([255,218]));
    const frame=segment(192,Buffer.from([8,0,8,0,8,3,1,17,0,2,17,0,3,17,0]));
    const scan=segment(218,Buffer.from([3,1,0,2,0,3,0,0,63,0]));
    const source=Buffer.concat([base.subarray(0,sof),frame,base.subarray(dht,sos),scan,Buffer.from([16,255,217])]).toString('latin1');
    const state=await decoder.decode(source),color=await decoder.bitmap(state),luma=await decoder.bitmap(state,{component:0});
    assert.equal(state.components[0].available[0],1);assert.equal(state.components[1].available[0],0);
    assert.ok(color.mask.every(n=>n===0));assert.ok(luma.mask.every(n=>n===1));
    assert.ok(luma.pixels.every((n,i)=>n===(i%4===3?255:128)));
});

test('Missing coding tables require explicit donor assumptions and mark resulting pixels uncertain',async()=>{
    const base=jpeg(),dqt=base.indexOf(Buffer.from([255,219])),end=dqt+2+base.readUInt16BE(dqt+2);
    const source=Buffer.concat([base.subarray(0,dqt),base.subarray(end)]).toString('latin1');
    await assert.rejects(decoder.decode(source),/table is missing/);
    const donor=decoder.headers(base.toString('latin1'));
    const state=await decoder.decode(source,{donor}),bitmap=await decoder.bitmap(state);
    assert.equal(state.assumed,true);assert.ok(bitmap.mask.every(n=>n===2));assert.match(state.log[0],/Assumed/);
    await assert.rejects(decoder.decode(source,{mode:'strict',donor}),/Strict decoding/);
});

test('Unsupported coding, oversized rasters, invalid components and cancellation fail explicitly',async()=>{
    const bytes=jpeg(),sof=bytes.indexOf(Buffer.from([255,192]));
    const unsupported=Buffer.from(bytes);unsupported[sof+1]=195;
    await assert.rejects(decoder.decode(unsupported.toString('latin1')),/Lossless, arithmetic/);
    const progressive=Buffer.from(bytes);progressive[sof+1]=194;
    await assert.rejects(decoder.decode(progressive.toString('latin1')),/progressive scan parameters/);
    await assert.rejects(decoder.decode(gray(65535,65535,[63])),/pixel reconstruction limit/);
    await assert.rejects(decoder.decode(bytes.toString('latin1'),{cancelled:()=>true}),/Cancelled/);
    const state=await decoder.decode(bytes.toString('latin1'));
    await assert.rejects(decoder.bitmap(state,{component:1}),/not present/);
});

test('Every truncation of the small fixture terminates with a result or descriptive error',async()=>{
    const bytes=jpeg();
    for(let i=0;i<=bytes.length;i++){
        try{const state=await decoder.decode(bytes.subarray(0,i).toString('latin1'));assert.ok(state.width>0);}
        catch(error){assert.ok(error instanceof Error || typeof error.message==='string');}
    }
});

test('Separable IDCT agrees with the direct mathematical transform',()=>{
    const coefficients=Int16Array.from({length:64},(_,i)=>i%7===0?i-20:0),q=Float64Array.from({length:64},(_,i)=>i%5+1),plane=new Uint8Array(64);
    decoder.idct(coefficients,0,q,plane,0,8);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        let sum=0;
        for(let v=0;v<8;v++)for(let u=0;u<8;u++)sum+=(u?1:Math.SQRT1_2)*(v?1:Math.SQRT1_2)*coefficients[v*8+u]*q[v*8+u]*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*v*Math.PI/16);
        assert.equal(plane[y*8+x],Math.max(0,Math.min(255,Math.round(128+sum/4))));
    }
});

test('Reference JPEGs agree with independent libjpeg decoding for grayscale, RGB and YCbCr',async()=>{
    const file=path.join(__dirname,'fixtures','reconstruction-reference.json');
    const fixtures=JSON.parse(fs.readFileSync(file,'utf8'));
    for(const fixture of fixtures){
        const source=Buffer.from(fixture.jpeg,'base64').toString('latin1'),state=await decoder.decode(source,{mode:'strict'}),bitmap=await decoder.bitmap(state),expected=Buffer.from(fixture.rgb,'base64');
        assert.equal(bitmap.width,fixture.width,fixture.name);assert.equal(bitmap.height,fixture.height,fixture.name);
        let maximum=0,total=0;
        for(let i=0;i<expected.length;i++){const actual=bitmap.pixels[Math.floor(i/3)*4+i%3],delta=Math.abs(actual-expected[i]);maximum=Math.max(maximum,delta);total+=delta;}
        assert.ok(maximum<=fixture.maxError,fixture.name+': max error '+maximum);
        assert.ok(total/expected.length<=fixture.meanError,fixture.name+': mean error '+total/expected.length);
        for(let c=0;c<state.components.length;c++){
            const single=await decoder.bitmap(state,{component:c});assert.ok(single.mask.every(n=>n===1));
            for(let i=0;i<single.pixels.length;i+=4)assert.equal(single.pixels[i],single.pixels[i+1]);
        }
        if(fixture.baselineJPEG){
            const baseline=await decoder.decode(Buffer.from(fixture.baselineJPEG,'base64').toString('latin1'),{mode:'strict'});
            for(let c=0;c<state.components.length;c++){
                const actual=state.components[c],expected=baseline.components[c];
                // Non-interleaved AC scans omit dummy blocks at the padded edges.
                for(let y=0;y<actual.actualRows;y++)for(let x=0;x<actual.actualCols;x++){
                    const start=(y*actual.cols+x)*64;
                    assert.deepEqual(Array.from(actual.coefficients.subarray(start,start+64)),Array.from(expected.coefficients.subarray(start,start+64)),fixture.name+' coefficients at '+x+','+y);
                }
            }
        }
    }
});

function progressiveFixture(name='progressive-gray-17x13'){
    const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'));
    return Buffer.from(fixtures.find(f=>f.name===name).jpeg,'base64');
}

function scanRanges(bytes){
    const scans=[];
    for(let p=2;p<bytes.length;){
        assert.equal(bytes[p],255);
        const start=p,marker=bytes[p+1];
        if(marker===217)break;
        const end=p+2+bytes.readUInt16BE(p+2);
        p=end;
        if(marker===218){
            while(p<bytes.length){
                if(bytes[p]===255){
                    const code=bytes[p+1];
                    if(code===0 || code>=208&&code<=215){p+=2;continue;}
                    break;
                }
                p++;
            }
            scans.push({start,data:end,end:p,ss:bytes[end-3],se:bytes[end-2],ah:bytes[end-1]>>4,al:bytes[end-1]&15});
        }
    }
    return scans;
}

test('Truncated progressive refinement retains earlier detail transactionally and marks partial blocks',async()=>{
    const bytes=progressiveFixture('progressive-dense-137x91'),scans=scanRanges(bytes),last=scans.at(-1);
    const cut=last.data+Math.floor((last.end-last.data)/2),source=bytes.subarray(0,cut).toString('latin1');
    const before=Buffer.from(bytes),state=await decoder.decode(source),bitmap=await decoder.bitmap(state);
    assert.equal(state.scans,scans.length);assert.equal(state.events.length,2);
    assert.ok(bitmap.mask.some(n=>n===1));assert.ok(bitmap.mask.some(n=>n===2));assert.ok(bitmap.mask.every(n=>n!==0));
    assert.match(state.log.join(' '),/incomplete/);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/End of available scan data/);
    const earlier=await decoder.decode(bytes.subarray(0,last.start).toString('latin1'));
    const component=state.components[0],prior=earlier.components[0];
    // Blocks at/after the interruption retain their entire earlier coefficient array.
    for(let i=0;i<component.available.length;i++)if(component.available[i]===2){
        assert.deepEqual(Array.from(component.coefficients.subarray(i*64,i*64+64)),Array.from(prior.coefficients.subarray(i*64,i*64+64)));
    }
    assert.deepEqual(bytes,before);
});

test('Damaged progressive AC scans allow independent scans but skip dependent refinements',async()=>{
    const bytes=progressiveFixture('progressive-444-17x13'),scans=scanRanges(bytes),ac=scans.find(s=>s.ss>0);
    const source=Buffer.concat([bytes.subarray(0,ac.data),bytes.subarray(ac.end)]).toString('latin1');
    const state=await decoder.decode(source),bitmap=await decoder.bitmap(state);
    assert.equal(state.scans,scans.length);assert.ok(state.events.length>=1);
    assert.match(state.log.join(' '),/depends on a damaged earlier coefficient band/);
    assert.ok(bitmap.mask.every(n=>n===2));
    // Chroma refinements and the later DC refinement remain independently decodable.
    const intact=await decoder.decode(bytes.toString('latin1'),{mode:'strict'});
    for(let c=1;c<3;c++)assert.deepEqual(Array.from(state.components[c].coefficients),Array.from(intact.components[c].coefficients));
    for(let i=0;i<state.components[0].coefficients.length;i+=64)assert.equal(state.components[0].coefficients[i],intact.components[0].coefficients[i]);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/Marker encountered/);
});

test('Progressive missing EOI, incomplete initial DC, invalid ordering and cancellation are explicit',async()=>{
    const bytes=progressiveFixture(),scans=scanRanges(bytes),source=bytes.subarray(0,-2).toString('latin1');
    const state=await decoder.decode(source),bitmap=await decoder.bitmap(state);
    assert.ok(bitmap.mask.every(n=>n===1));assert.match(state.log.join(' '),/incomplete/);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/end marker/);
    const missing=await decoder.decode(bytes.subarray(0,scans[0].data).toString('latin1'));
    assert.ok((await decoder.bitmap(missing)).mask.every(n=>n===0));
    const bad=Buffer.from(bytes);bad[scans[1].data-1]=0x21;
    await assert.rejects(decoder.decode(bad.toString('latin1'),{mode:'strict'}),/scan order/);
    let pauses=0;
    await assert.rejects(decoder.decode(bytes.toString('latin1'),{cancelled:()=>++pauses>4}),/Cancelled/);
});

test('Progressive strict mode requires the expected restart sequence',async()=>{
    const bytes=progressiveFixture('progressive-restart-420-17x13');
    const rst=bytes.indexOf(Buffer.from([255,208]));assert.ok(rst>0);
    bytes[rst+1]=209;
    await assert.rejects(decoder.decode(bytes.toString('latin1'),{mode:'strict'}),/progressive restart marker/);
    const state=await decoder.decode(bytes.toString('latin1'));
    assert.match(state.events[0].message,/restart marker/);
});

test('Each truncation of a progressive fixture terminates with a result or descriptive error',async()=>{
    const bytes=progressiveFixture();
    // Exercise all segment/entropy boundaries without hundreds of scheduler delays.
    const originalPause=decoder.pause;
    decoder.pause=async()=>{};
    try{
        for(let i=0;i<=bytes.length;i++){
            try{const state=await decoder.decode(bytes.subarray(0,i).toString('latin1'));assert.equal(state.width,17);}
            catch(error){assert.ok(error instanceof Error || typeof error.message==='string');}
        }
    }finally{decoder.pause=originalPause;}
});

test('Opt-in codeword substitution recovers a baseline prefix without changing source bytes',async()=>{
    const source=gray(24,8,[0x23]); // 00, 10 (damaged DC), 00, padding 11
    const before=Buffer.from(source,'latin1');
    const conservative=await decoder.decode(source),state=await decoder.decode(source,{substituteCodewords:true});
    assert.equal(conservative.decoded,1);assert.equal(state.decoded,3);
    assert.deepEqual(Array.from(state.components[0].available),[1,2,2]);
    assert.equal(state.codewordSubstitutions.length,1);
    const change=state.codewordSubstitutions[0];
    assert.equal(change.offset,state.offset);assert.equal(change.bit,2);
    assert.equal(change.originalBits,'1');assert.equal(change.replacementBits,'0');assert.equal(change.symbol,0);
    assert.equal(change.scan,1);assert.equal(change.block,1);assert.equal(change.component,1);
    const bitmap=await decoder.bitmap(state);assert.equal(bitmap.mask[0],1);assert.equal(bitmap.mask[8],2);
    assert.deepEqual(Buffer.from(source,'latin1'),before);
    await assert.rejects(decoder.decode(source,{mode:'strict'}),/Marker encountered|Invalid Huffman/);
    await assert.rejects(decoder.decode(source,{mode:'strict',substituteCodewords:true}),/Strict decoding cannot substitute/);
});

test('Invalid AC run codewords can be replaced while retaining their bit length',async()=>{
    const base=Buffer.from(gray(8,8,[0x2a,0xff,0]),'latin1');
    const start=base.indexOf(Buffer.from([255,196])),end=start+2+base.readUInt16BE(start+2);
    const dc=Buffer.from([0,1,...Array(15).fill(0),0]);
    const ac=Buffer.from([16,0,2,...Array(14).fill(0),0,240]); // 00=EOB, 01=ZRL
    // DC 0, ZRL 01 three times, then invalid ZRL 01 (only 15 positions left).
    const source=Buffer.concat([base.subarray(0,start),segment(196,Buffer.concat([dc,ac])),base.subarray(end)]).toString('latin1');
    const state=await decoder.decode(source,{substituteCodewords:true});
    assert.equal(state.decoded,1);assert.equal(state.codewordSubstitutions.length,1);
    const repair=state.codewordSubstitutions[0];
    assert.equal(repair.originalBits,'01');assert.equal(repair.replacementBits,'00');assert.equal(repair.symbol,0);
    assert.match(repair.reason,/invalid in this block/);assert.equal(state.components[0].available[0],2);
    const conservative=await decoder.decode(source);assert.equal(conservative.decoded,0);
});

test('Codeword substitution limits stop guessing and preserve completed blocks',async()=>{
    const source=gray(24,8,[0xa3]); // damaged DC in blocks 1 and 2
    const state=await decoder.decode(source,{substituteCodewords:true,maxCodewordSubstitutions:1});
    assert.equal(state.codewordSubstitutions.length,1);assert.equal(state.decoded,1);
    assert.match(state.events[0].message,/substitution limit/);
    for(const limit of [0,4097,1.5,NaN])await assert.rejects(decoder.decode(source,{substituteCodewords:true,maxCodewordSubstitutions:limit}),/substitution limit/);
});

test('Substitution preserves stuffed-byte positions and does not invent missing bits or cross markers',()=>{
    const table=decoder.huffman({counts:[1,...Array(15).fill(0)],values:[0]});
    const state={codewordSubstitutions:[],codewordSubstitutionLimit:16};
    const reader=decoder.scanReader('\xff\0\xff\xd9',0,state,{substituteCodewords:true},1);
    for(let i=0;i<8;i++)assert.equal(reader.symbol(table),0);
    assert.equal(reader.p,2);
    assert.deepEqual(Array.from(state.codewordSubstitutions,s=>[s.offset,s.bit]),Array.from({length:8},(_,i)=>[0,i]));
    assert.throws(()=>reader.symbol(table),/Marker encountered/);assert.equal(state.codewordSubstitutions.length,8);
    const longTable=decoder.huffman({counts:[...Array(15).fill(0),1],values:[0]});
    const short=decoder.scanReader('\0',0,{codewordSubstitutions:[],codewordSubstitutionLimit:16},{substituteCodewords:true},1);
    assert.throws(()=>short.symbol(longTable),/End of available/);
    const impossible=decoder.scanReader('\xff\0\xff\xd9',0,{codewordSubstitutions:[],codewordSubstitutionLimit:16},{substituteCodewords:true},1);
    assert.throws(()=>impossible.symbol(longTable),/no valid replacement/);
});

test('Progressive substitutions remain uncertain through later refinements; intact images need no guesses',async()=>{
    const bytes=progressiveFixture('progressive-444-17x13'),scans=scanRanges(bytes),damaged=Buffer.from(bytes);
    damaged[scans[0].data]^=0xff;
    const guessed=await decoder.decode(damaged.toString('latin1'),{substituteCodewords:true});
    assert.ok(guessed.codewordSubstitutions.length>0);
    assert.ok((await decoder.bitmap(guessed)).mask.every(n=>n!==1));
    const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reconstruction-reference.json'),'utf8'));
    for(const fixture of fixtures){
        const source=Buffer.from(fixture.jpeg,'base64').toString('latin1');
        const expected=await decoder.decode(source,{mode:'strict'}),actual=await decoder.decode(source,{substituteCodewords:true});
        assert.equal(actual.codewordSubstitutions.length,0,fixture.name);assert.equal(actual.events.length,0,fixture.name);
        for(let c=0;c<actual.components.length;c++)assert.deepEqual(Array.from(actual.components[c].coefficients),Array.from(expected.components[c].coefficients),fixture.name);
    }
});

test('Byte analysis keeps absolute offsets, scopes, result limits and conservative signature labels',()=>{
    const data='ignore\0HELLO world\0https://example.test\0PK\x03\x04payload';
    const strings=analysis.strings(data,7,data.length,6,1);
    assert.equal(strings.found[0].start,7);assert.equal(strings.limited,true);
    const signatures=analysis.signatures(data,7,data.length);assert.equal(signatures.found.length,1);
    assert.equal(signatures.found[0].type,'ZIP');assert.equal(signatures.found[0].end,null);assert.match(signatures.found[0].status,/unverified/);
    assert.equal(analysis.signatures(data,0,7).found.length,0);
    assert.equal(analysis.entropy('\0'.repeat(256),0,256).entropy,0);
    const uniform=Array.from({length:256},(_,i)=>String.fromCharCode(i)).join('');
    assert.equal(analysis.entropy(uniform,0,256).entropy,8);
});

test('Structural comparison includes encoded image regions and trailers, while metadata stays scoped',()=>{
    const model={rows:[{code:'SOI',start:0,end:2,size:2,header:{type:'d8'}},{code:'Scan data',start:2,end:3,size:1,header:null},{code:'Extra',start:3,end:4,size:1,header:null}]};
    const result=analysis.compare(model,model,'abct','abdu');
    assert.equal(result.rows.length,3);assert.equal(result.rows[0].same,true);assert.equal(result.rows[1].same,false);assert.equal(result.rows[2].same,false);
    assert.equal(analysis.compare(model,model,'abct','abdu',true).rows.length,0);
});
