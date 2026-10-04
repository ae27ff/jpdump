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
