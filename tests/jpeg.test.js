const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadJPEG, parseJPEG, jpeg, segment } = require('./jpeg-helpers');

test('Empty and non-JPEG inputs have a nonnegative parsed size', () => {
    const empty = parseJPEG(Buffer.alloc(0));
    assert.equal(empty.valid, false);
    assert.equal(empty.nextp, 0);
    assert.equal(empty.hasextraneous, false);
    const invalid = parseJPEG(Buffer.from('invalid'));
    assert.equal(invalid.valid, false);
    assert.equal(invalid.nextp, 0);
    assert.equal(invalid.extraneous, 'invalid');
    assert.equal(invalid.headers[0].desc.longname,'Unrecognized marker');
});

test('The parsed size and trailer boundary of a valid JPEG are unchanged', () => {
    const bytes = jpeg();
    const result = parseJPEG(Buffer.concat([bytes, Buffer.from('trailer')]));
    assert.equal(result.valid, true);
    assert.equal(result.nextp, bytes.length);
    assert.equal(result.extraneous, 'trailer');
});

test('APP1 metadata has the correct application marker label', () => {
    const result = parseJPEG(jpeg(segment(0xe1, Buffer.from('metadata'))));
    assert.equal(result.headers.find(header => header.type === 'e1').desc.shortname, 'APP1');
    const context=loadJPEG();
    assert.equal(context.jpeg_headerdump_name('c3').longname,'Start of Lossless Frame');
    assert.equal(context.jpeg_headerdump_name('f7').longname,'Start of JPEG-LS Frame');
    assert.equal(context.jpeg_headerdump_name('f8').shortname,'LSE');
});

test('Parsing does not log binary image data or retain header objects in the console', () => {
    const logged = [];
    const result = parseJPEG(jpeg(), { console: { log: (...args) => logged.push(args), error() {} } });
    assert.equal(result.valid, true);
    assert.deepEqual(logged, []);
});

test('Truncated Adobe APP14 headers are invalid without fabricated numeric fields', () => {
    for (let length = 5; length < 12; length++) {
        const payload = Buffer.alloc(length);
        payload.write('Adobe');
        const result = parseJPEG(jpeg(segment(0xee, payload)));
        assert.equal(result.valid, false);
        const header = result.headers.find(header => header.type === 'ee');
        assert.equal(header.valid, false);
        assert.equal(header.hasextendeddata, false);
    }
});

test('Complete Adobe APP14 metadata and unknown application payloads still parse', () => {
    const payload = Buffer.alloc(12);
    payload.write('Adobe');
    payload.writeUInt16BE(100, 5);
    payload.writeUInt16BE(1, 7);
    payload.writeUInt16BE(2, 9);
    payload[11] = 2;
    const result = parseJPEG(jpeg(segment(0xee, payload)));
    assert.equal(result.valid, true);
    const adobe = result.headers.find(header => header.type === 'ee').extendeddata;
    assert.equal(adobe.DCTEncodeVersion, 100);
    assert.equal(adobe.flags0, 1);
    assert.equal(adobe.flags1, 2);
    assert.equal(adobe.colorTransform, '2 (YCCK)');
    assert.equal(parseJPEG(jpeg(segment(0xee, Buffer.from('other')))).valid, true);
});

test('All SOF variants reject frames without components', () => {
    const context = loadJPEG();
    for (const marker of [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf,0xf7]) {
        const header = context.processHeader(segment(marker, Buffer.from([8,0,1,0,1,0])).toString('latin1'), 0);
        assert.equal(header.valid, false, marker.toString(16));
    }
});

test('Frame validation rejects invalid precision, width, sampling and duplicate identifiers', () => {
    const context = loadJPEG();
    const payloads = [
        [7,0,1,0,1,1,1,0x11,0],
        [8,0,1,0,0,1,1,0x11,0],
        [8,0,1,0,1,1,1,0x10,0],
        [8,0,1,0,1,1,1,0x51,0],
        [8,0,1,0,1,2,1,0x11,0,1,0x11,0]
    ];
    for (const payload of payloads) {
        assert.equal(context.processHeader(segment(0xc0, Buffer.from(payload)).toString('latin1'), 0).valid, false);
    }
});

test('Valid frame variants, including zero height for DNL, remain supported', () => {
    const context = loadJPEG();
    for (const [marker, precision] of [[0xc0,8],[0xc1,12],[0xc2,12],[0xc3,16],[0xc9,12],[0xca,12],[0xcb,16],[0xf7,8]]) {
        const header = context.processHeader(segment(marker, Buffer.from([precision,0,0,0,1,1,1,0x11,0])).toString('latin1'), 0);
        assert.equal(header.valid, true, marker.toString(16));
        assert.equal(header.extendeddata.ncomponents, 1);
    }
});

test('Images require a frame and scan, and scans must reference unique frame components', () => {
    const base = jpeg();
    const frameStart = base.indexOf(Buffer.from([0xff, 0xc0]));
    const scanStart = base.indexOf(Buffer.from([0xff, 0xda]));
    const variants = [
        Buffer.from([0xff,0xd8,0xff,0xd9]),
        Buffer.from([0xff,0x4f,0xff,0xd9]),
        Buffer.concat([base.subarray(0, scanStart), Buffer.from([0xff,0xd9])]),
        Buffer.concat([base.subarray(0, frameStart), base.subarray(frameStart + 13)]),
        Buffer.concat([base.subarray(0,scanStart), segment(0xda,Buffer.from([2,1,0,1,0,0,63,0])), base.subarray(scanStart+10)])
    ];
    const undeclared = Buffer.from(base);
    undeclared[scanStart+5] = 2;
    variants.push(undeclared);
    for (const bytes of variants) assert.equal(parseJPEG(bytes).valid, false);
    assert.equal(parseJPEG(base).valid, true);
});

test('An abbreviated tables-only stream remains supported', () => {
    const table = Buffer.alloc(65, 1);
    table[0] = 0;
    for (const data of [segment(0xdb,table), segment(0xfe,Buffer.from('comment'))]) {
        const bytes = Buffer.concat([Buffer.from([0xff,0xd8]), data, Buffer.from([0xff,0xd9])]);
        const result = parseJPEG(bytes);
        assert.equal(result.valid, true);
        assert.equal(result.tableOnly, true);
    }
});

test('DNL supplies zero frame height at the end of the first scan', () => {
    const base = jpeg();
    const frameStart = base.indexOf(Buffer.from([0xff,0xc0]));
    base[frameStart+5] = base[frameStart+6] = 0;
    assert.equal(parseJPEG(base).valid, false);
    const prefix = Buffer.concat([base.subarray(0,-2), segment(0xdc,Buffer.from([0,1]))]);
    const legal = Buffer.concat([prefix, base.subarray(-2)]);
    const result = parseJPEG(legal);
    assert.equal(result.valid, true);
    assert.equal(result.headers.find(header => header.type==='c0').extendeddata.imgh, 1);
    assert.equal(parseJPEG(Buffer.concat([prefix, Buffer.from([0x3f]), base.subarray(-2)])).valid, false);
});

test('DNL can redefine an existing line count but must immediately follow the first scan', () => {
    const base = jpeg();
    const prefix = base.subarray(0,-2), eoi = base.subarray(-2);
    const dnl = segment(0xdc,Buffer.from([0,1]));
    assert.equal(parseJPEG(Buffer.concat([prefix,dnl,eoi])).valid,true);
    assert.equal(parseJPEG(Buffer.concat([prefix,dnl,dnl,eoi])).valid,false);
    assert.equal(parseJPEG(Buffer.concat([prefix,segment(0xfe,Buffer.from('comment')),dnl,eoi])).valid,false);
});

test('The CharLS conformance JPEG-LS scan preserves bit-stuffed bytes and reaches EOI', () => {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/t8nde0.jls'));
    const result = parseJPEG(Buffer.concat([bytes, Buffer.from('trailer')]));
    assert.equal(result.valid, true);
    assert.equal(result.nextp, bytes.length);
    assert.equal(result.extraneous, 'trailer');
    const scan = result.headers.find(header => header.type==='da');
    assert.equal(scan.extendeddata.scanCoding, 'jpeg-ls');
    const raw = bytes.subarray(scan.nextp, -2).toString('latin1');
    assert.ok(raw.includes('\xff\x7f'));
    assert.equal(scan.extendeddata.hcdata, raw);
});

test('JPEG-LS FF00 is preserved while ordinary JPEG byte stuffing is removed', () => {
    const frame = segment(0xf7, Buffer.from([8,0,1,0,1,1,1,0x11,0]));
    const scan = segment(0xda, Buffer.from([1,1,0,0,0,0]));
    const bytes = Buffer.concat([Buffer.from([0xff,0xd8]), frame, scan, Buffer.from([0xff,0,0xff,0xd9])]);
    assert.equal(parseJPEG(bytes).headers.find(header => header.type==='da').extendeddata.hcdata, '\xff\0');
    assert.equal(loadJPEG().unstuffSOSHCData('\xff\0'), '\xff');
});

function frame(marker=0xc0,components=[1],sampling=0x11) {
    return segment(marker,Buffer.from([8,0,1,0,1,components.length,...components.flatMap(id => [id,sampling,0])]));
}
function scan(components=[1], start=0, end=63, approximation=0, selector=0) {
    return Buffer.concat([segment(0xda,Buffer.from([components.length,...components.flatMap(id => [id,selector]),start,end,approximation])),Buffer.from([0x3f])]);
}
function stream(...parts) { return Buffer.concat([Buffer.from([0xff,0xd8]),...parts,Buffer.from([0xff,0xd9])]); }

test('Scan validation rejects invalid coding parameters and incomplete or repeated components', () => {
    for (const bytes of [
        stream(frame(),scan([1],1)), stream(frame(),scan([1],0,62)), stream(frame(),scan([1],0,63,1)),
        stream(frame(),scan([1],0,63,0,0x22)), stream(frame(0xc0,[1,2]),scan([1])),
        stream(frame(),scan(),scan()), stream(frame(0xc0,[1,2]),scan([2,1])),
        stream(frame(0xc0,[1,2],0x44),scan([1,2]))
    ]) assert.equal(parseJPEG(bytes).valid,false);
    assert.equal(parseJPEG(stream(frame(0xc0,[1,2]),scan([1]),scan([2]))).valid,true);
});

test('Progressive scans enforce DC ordering and successive approximation history', () => {
    const progressive=frame(0xc2);
    assert.equal(parseJPEG(stream(progressive,scan([1],0,0,1),scan([1],1,63),scan([1],0,0,0x10))).valid,true);
    for (const parts of [
        [scan([1],1,63)], [scan([1],0,0),scan([1],0,0)],
        [scan([1],0,0),scan([1],1,63,0x10)], [scan([1],0,0,2),scan([1],0,0,0x10)]
    ]) assert.equal(parseJPEG(stream(progressive,...parts)).valid,false);
});

test('Restart markers require an active scan, nonzero interval and modulo-eight ordering', () => {
    const dri=segment(0xdd,Buffer.from([0,1]));
    const rst0=Buffer.from([0xff,0xd0,0x3f]);
    assert.equal(parseJPEG(stream(dri,frame(),scan(),rst0)).valid,true);
    assert.equal(parseJPEG(stream(frame(),scan(),rst0)).valid,false);
    assert.equal(parseJPEG(stream(dri,frame(),scan(),Buffer.from([0xff,0xd1,0x3f]))).valid,false);
    assert.equal(parseJPEG(stream(dri,frame(),scan(),segment(0xfe,Buffer.from('comment')),rst0)).valid,false);
    const emptyScan=segment(0xda,Buffer.from([1,1,0,0,63,0]));
    assert.equal(parseJPEG(stream(frame(),emptyScan)).valid,false);
});

test('Malformed DQT, DHT, DAC and restart interval payloads are rejected', () => {
    const fullTree=Buffer.from([0,2,...Array(15).fill(0),0,1]);
    for (const [marker,payload] of [
        [0xdb,Buffer.alloc(0)], [0xdb,Buffer.alloc(65)], [0xdb,Buffer.from([0,1])],
        [0xc4,Buffer.alloc(17)], [0xc4,fullTree], [0xc4,Buffer.from([0,1])],
        [0xcc,Buffer.from([0,0x12])], [0xcc,Buffer.from([0x10,64])],
        [0xcc,Buffer.from([0x10,0])], [0xcc,Buffer.from([4,0x10])],
        [0xdd,Buffer.from([0])], [0xdd,Buffer.alloc(5)]
    ]) assert.equal(parseJPEG(jpeg(segment(marker,payload))).valid,false);
});

test('Multiple and differential frames require a preceding hierarchy definition', () => {
    assert.equal(parseJPEG(stream(frame(),scan(),frame(),scan())).valid,false);
    assert.equal(parseJPEG(stream(frame(0xc5),scan())).valid,false);
    const dhp=segment(0xde,Buffer.from([8,0,1,0,1,1,1,0x11,0]));
    assert.equal(parseJPEG(stream(dhp,frame(),scan(),frame(0xc5),scan())).valid,true);
});

test('All byte truncations and deterministic mutations terminate without parser exceptions', () => {
    const context=loadJPEG(), base=jpeg();
    for(let length=0;length<base.length;length++) {
        const result=context.processJPEG(base.subarray(0,length).toString('latin1'));
        assert.equal(result.valid,false);
        assert.ok(result.nextp>=0 && result.nextp<=length);
    }
    for(let index=0;index<base.length;index++) for (const value of [0,1,127,255]) {
        const bytes=Buffer.from(base); bytes[index]=value;
        assert.doesNotThrow(() => context.processJPEG(bytes.toString('latin1')));
    }
});

test('JPEG-LS extended DNL and LSE dimensions are decoded at their declared widths', () => {
    const zeroHeight=frame(0xf7);
    zeroHeight[5]=zeroHeight[6]=0;
    for (const lines of [Buffer.from([0,0,1]),Buffer.from([0,0,0,1])]) {
        const result=parseJPEG(stream(zeroHeight,scan([1],0,0),segment(0xdc,lines)));
        assert.equal(result.valid,true);
        assert.equal(result.headers.find(header=>header.type==='f7').extendeddata.imgh,1);
    }
    const zeroWidth=frame(0xf7); zeroWidth[7]=zeroWidth[8]=0;
    const result=parseJPEG(stream(zeroWidth,segment(0xf8,Buffer.from([4,3,0,0,1,1,0,0])),scan([1],0,0)));
    assert.equal(result.valid,true);
    assert.equal(result.headers.find(header=>header.type==='f7').extendeddata.imgw,65536);
    assert.equal(parseJPEG(stream(zeroWidth,scan([1],0,0))).valid,false);
});

test('Malformed JPEG-LS presets and invalid interleave modes are rejected', () => {
    const preset=Buffer.from([1,0,255,0,3,0,7,0,21,0,64]);
    assert.equal(parseJPEG(stream(frame(0xf7),segment(0xf8,preset),scan([1],0,0))).valid,true);
    for (const payload of [Buffer.alloc(0),Buffer.from([1]),Buffer.from([4,1,0,1,0,1])]) {
        assert.equal(parseJPEG(stream(frame(0xf7),segment(0xf8,payload),scan([1],0,0))).valid,false);
    }
    const bad=Buffer.from(preset); bad.writeUInt16BE(1,9);
    assert.equal(parseJPEG(stream(frame(0xf7),segment(0xf8,bad),scan([1],0,0))).valid,false);
    assert.equal(parseJPEG(stream(frame(0xf7),scan([1],0,2))).valid,false);
    const mixed=Buffer.from(preset); mixed.writeUInt16BE(0,3); mixed.writeUInt16BE(2,5);
    assert.equal(parseJPEG(stream(frame(0xf7),segment(0xf8,mixed),scan([1],0,0))).valid,false);
    assert.equal(parseJPEG(stream(frame(0xf7),segment(0xf8,Buffer.from([1,0,0,0,0,0,0,0,0,0,0])),scan([1],0,0))).valid,true);
});

test('Hierarchy components must be defined before differential frames and all be present', () => {
    const dhp=segment(0xde,Buffer.from([8,0,1,0,1,2,1,0x11,0,2,0x11,0]));
    assert.equal(parseJPEG(stream(dhp,frame(0xc0,[1]),scan([1]),frame(0xc0,[2]),scan([2]))).valid,true);
    for (const parts of [
        [frame(0xc0,[1]),scan([1])],
        [frame(0xc0,[3]),scan([3])],
        [frame(0xc0,[1]),scan([1]),frame(0xc5,[2]),scan([2])],
        [frame(0xc0,[1]),scan([1]),frame(0xc0,[1]),scan([1])]
    ]) assert.equal(parseJPEG(stream(dhp,...parts)).valid,false);
    const one=segment(0xde,Buffer.from([8,0,1,0,1,1,1,0x11,0]));
    assert.equal(parseJPEG(stream(one,frame(0xc3),scan([1],1,0),frame(0xc7),scan([1],0,0))).valid,true);
    assert.equal(parseJPEG(stream(one,frame(0xc3),scan([1],1,0),frame(0xc7),scan([1],0,0),frame(0xc7),scan([1],0,0))).valid,true);
    assert.equal(parseJPEG(stream(one,frame(0xc3),scan([1],1,0),frame(0xc7),scan([1],1,0))).valid,false);
    assert.equal(parseJPEG(stream(frame(0xc9),scan([1],0,63,0,0x44))).valid,false);
    assert.equal(parseJPEG(stream(one,frame(0xc3),scan([1],1,0),frame(0xc5),scan())).valid,false);
    assert.equal(parseJPEG(stream(one,frame(0xc1),scan(),frame(0xcd),scan())).valid,false);
    assert.equal(parseJPEG(stream(one,frame(),scan(),frame(0xcf),scan([1],0,0))).valid,true);
});

test('EXP applies once to a following differential frame and wide DRI requires JPEG-LS', () => {
    const exp=segment(0xdf,Buffer.from([0x11]));
    const dhp=segment(0xde,Buffer.from([8,0,1,0,1,1,1,0x11,0]));
    assert.equal(parseJPEG(stream(dhp,frame(),scan(),exp,frame(0xc5),scan())).valid,true);
    for (const parts of [
        [frame(),scan(),exp], [dhp,exp,frame(),scan()], [dhp,frame(),scan(),exp],
        [dhp,frame(),scan(),exp,exp,frame(0xc5),scan()], [dhp,frame(),scan(),exp,scan()]
    ]) assert.equal(parseJPEG(stream(...parts)).valid,false);
    const wide=segment(0xdd,Buffer.from([0,0,1])), normal=segment(0xdd,Buffer.from([0,1]));
    assert.equal(parseJPEG(stream(wide,normal,frame(),scan())).valid,false);
    assert.equal(parseJPEG(stream(frame(),scan(),wide)).valid,false);
    assert.equal(parseJPEG(stream(wide,frame(0xf7),scan([1],0,0))).valid,true);
});

test('Eight-bit DCT scans cannot use sixteen-bit quantizers or change quantizers between progressive scans', () => {
    const wide=Buffer.alloc(129); wide[0]=0x10;
    for (let offset=1;offset<wide.length;offset+=2) wide.writeUInt16BE(1,offset);
    const table=Buffer.concat([Buffer.from([0]),Buffer.alloc(64,1)]);
    assert.equal(parseJPEG(stream(segment(0xdb,wide),frame(),scan())).valid,false);
    const twelve=frame(); twelve[4]=12;
    twelve[1]=0xc1;
    assert.equal(parseJPEG(stream(segment(0xdb,wide),twelve,scan())).valid,true);
    assert.equal(parseJPEG(stream(segment(0xdb,table),frame(0xc2),scan([1],0,0),segment(0xdb,table),scan([1],1,63))).valid,true);
    table[1]=2;
    assert.equal(parseJPEG(stream(segment(0xdb,Buffer.concat([Buffer.from([0]),Buffer.alloc(64,1)])),frame(0xc2),scan([1],0,0),segment(0xdb,table),scan([1],1,63))).valid,false);
});

function j2k({fill=false,psot=15,omit=[],sizChange=()=>{}}={}) {
    const siz=Buffer.alloc(39);
    for (const offset of [2,6,18,22]) siz.writeUInt32BE(1,offset);
    siz.writeUInt16BE(1,34); siz[36]=7; siz[37]=siz[38]=1; sizChange(siz);
    const sot=Buffer.alloc(8); sot.writeUInt32BE(psot,2); sot[7]=1;
    const parts=[segment(0x51,siz),segment(0x52,Buffer.from([0,0,0,1,0,0,4,4,0,1])),segment(0x5c,Buffer.from([0x40,0x40])),
        Buffer.concat([fill?Buffer.from([0xff,0xff]):Buffer.alloc(0),segment(0x90,sot)]),Buffer.from([0xff,0x93,0])];
    return Buffer.concat([Buffer.from([0xff,0x4f]),...parts.filter((_,index)=>!omit.includes(index)),Buffer.from([0xff,0xd9])]);
}

test('JPEG 2000 validates SIZ, mandatory defaults and tile-part structure', () => {
    for (const options of [{},{fill:true},{psot:0}]) {
        const bytes=j2k(options), result=parseJPEG(Buffer.concat([bytes,Buffer.from('trailer')]));
        assert.equal(result.valid,true);
        assert.equal(result.nextp,bytes.length);
        assert.equal(result.extraneous,'trailer');
        assert.equal(result.headers.at(-1).desc.shortname,'J2K-EOC');
    }
    for (const options of [
        {omit:[0]},{omit:[1]},{omit:[2]},{omit:[3]},{omit:[4]},
        {sizChange:siz=>siz.writeUInt16BE(0,34)}, {sizChange:siz=>siz.writeUInt32BE(0,18)}, {psot:14},{psot:16}
    ]) assert.equal(parseJPEG(j2k(options)).valid,false);
});

test('JPEG 2000 reserved no-length markers are handled and codestream markers cannot enter JPEG scans', () => {
    const bytes=j2k();
    const cod=bytes.indexOf(Buffer.from([0xff,0x52]));
    assert.equal(parseJPEG(Buffer.concat([bytes.subarray(0,cod),Buffer.from([0xff,0x30]),bytes.subarray(cod)])).valid,true);
    assert.equal(parseJPEG(stream(frame(),scan(),Buffer.from([0xff,0x93,0]))).valid,false);
    const reserved=segment(0xee,Buffer.from('Adobe'));
    assert.equal(parseJPEG(Buffer.concat([bytes.subarray(0,cod),reserved,bytes.subarray(cod)])).valid,true);
});

test('An OpenJPEG-encoded RGB codestream keeps its dimensions, labels and exact trailer boundary', () => {
    const bytes=fs.readFileSync(path.join(__dirname,'fixtures/openjpeg-3x2.j2k'));
    const context=loadJPEG(), result=context.processJPEG(Buffer.concat([bytes,Buffer.from('trailer')]).toString('latin1'));
    assert.equal(result.valid,true);
    assert.equal(result.nextp,bytes.length);
    assert.equal(result.extraneous,'trailer');
    assert.deepEqual({...result.dimensions},{width:3,height:2});
    assert.equal(result.headers.find(header=>header.type==='64').desc.shortname,'J2K-COM');
    assert.equal(context.jpeg_headerdump_name('5f').shortname,'J2K-POC');
    for (const name of ['n','intermediate','out','pe','q']) assert.equal(context[name],undefined);
    for (let length=0;length<bytes.length;length++) assert.equal(context.processJPEG(bytes.subarray(0,length).toString('latin1')).valid,false);
});
