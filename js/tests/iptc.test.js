const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { jpeg, segment, readMetadata } = require('./metadata-helpers');

function dataset(record, type, value, lengthOctets = 0) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    const header = Buffer.from([0x1c, record, type, 0, 0]);
    header.writeUInt16BE(lengthOctets ? 0x8000 | lengthOctets : bytes.length, 3);
    if (!lengthOctets) return Buffer.concat([header, bytes]);
    const length = Buffer.alloc(lengthOctets);
    let size = bytes.length;
    for (let i = lengthOctets - 1; i >= 0; i--) {
        length[i] = size % 256;
        size = Math.floor(size / 256);
    }
    return Buffer.concat([header, length, bytes]);
}

function readIPTC(...datasets) {
    return readMetadata(jpeg(iptcSegment(...datasets))).iptcdata;
}

function iptcSegment(...datasets) {
    const data = Buffer.concat(datasets);
    return segment(0xed, Buffer.concat([Buffer.from('Photoshop 3.0\0', 'ascii'), iptcResource(data)]));
}

function iptcResource(data) {
    const resource = Buffer.from([0x38, 0x42, 0x49, 0x4d, 0x04, 0x04, 0, 0, 0, 0, 0, 0]);
    resource.writeUInt32BE(data.length, 8);
    return Buffer.concat([
        resource, data,
        data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
    ]);
}

test('Truncated IPTC resources retain earlier complete datasets and tolerate missing final padding', () => {
    const full=iptcSegment(dataset(2,120,'OK'),dataset(2,25,'unfinished'));
    const partial=full.subarray(0,-5);
    const bytes=Buffer.concat([Buffer.from([255,216]),partial]);
    assert.equal(readMetadata(bytes).iptcdata.caption,'OK');
    assert.equal(readMetadata(bytes).iptcdata.keywords,undefined);
    const padded=iptcSegment(dataset(2,120,'OK'));
    const missingPadding=Buffer.concat([Buffer.from([255,216]),padded.subarray(0,-1)]);
    assert.equal(readMetadata(missingPadding).iptcdata.caption,'OK');
});

test('IPTC ignores record signatures inside a binary JPEG preview', () => {
    const preview = jpeg(segment(0xfe, dataset(2, 25, 'FAKE')));
    const data = readIPTC(
        dataset(2, 0, Buffer.from([0, 4])),
        dataset(2, 200, Buffer.from([0, 11])),
        dataset(2, 201, Buffer.from([0, 1])),
        dataset(2, 202, preview), dataset(2, 25, 'REAL')
    );
    assert.equal(data.keywords, 'REAL');
});

test('IPTC skips embedded signatures in recognized fields and other records', () => {
    const fake = dataset(2, 25, 'FAKE');
    const data = readIPTC(dataset(1, 90, fake), dataset(2, 120, fake), dataset(2, 25, 'REAL'));
    assert.equal(data.caption, fake.toString('latin1'));
    assert.equal(data.keywords, 'REAL');
});

test('IPTC skips extended binary datasets and reads the following metadata', () => {
    const preview = Buffer.alloc(33000);
    dataset(2, 25, 'FAKE').copy(preview, 20);
    const data = readIPTC(dataset(2, 202, preview, 4), dataset(2, 25, 'REAL'));
    assert.equal(data.keywords, 'REAL');
});

test('IPTC handles extended length descriptors with leading zero octets', () => {
    const preview = Buffer.alloc(33000);
    dataset(2, 25, 'FAKE').copy(preview);
    assert.equal(readIPTC(dataset(2, 202, preview, 5), dataset(2, 25, 'REAL')).keywords, 'REAL');
});

test('IPTC retains repeated keywords and advances past empty unknown datasets', () => {
    const data = readIPTC(dataset(2, 25, 'first'), dataset(2, 250, ''), dataset(2, 25, 'second'));
    assert.deepEqual(Array.from(data.keywords), ['first', 'second']);
});

test('IPTC stops at truncated datasets without scanning their contents', () => {
    for (const type of [25, 202]) {
        const truncated = Buffer.concat([Buffer.from([0x1c, 2, type, 0, 100]), dataset(2, 25, 'FAKE')]);
        assert.equal(readIPTC(dataset(2, 25, 'REAL'), truncated).keywords, 'REAL');
    }
});

test('IPTC rejects empty, truncated, and oversized extended lengths', () => {
    const malformed = [
        Buffer.from([0x1c, 2, 202, 0x80, 0]),
        Buffer.from([0x1c, 2, 202, 0x80, 20]),
        Buffer.from([0x1c, 2, 202, 0x80, 4, 0xff, 0xff, 0xff, 0xff])
    ];
    for (const header of malformed) {
        assert.equal(readIPTC(dataset(2, 25, 'REAL'), header, dataset(2, 25, 'FAKE')).keywords, 'REAL');
    }
});

test('IPTC does not resynchronize inside a malformed dataset boundary', () => {
    assert.equal(readIPTC(dataset(2, 25, 'REAL'), Buffer.from([0]), dataset(2, 25, 'FAKE')).keywords, 'REAL');
});

test('Metadata after a JPEG-LS bit-stuffed scan remains reachable', () => {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/t8nde0.jls'));
    const image = readMetadata(Buffer.concat([bytes.subarray(0,-2), iptcSegment(dataset(2,25,'REAL')), bytes.subarray(-2)]));
    assert.equal(image.iptcdata.keywords, 'REAL');
});

test('Empty and malformed IPTC resources do not hide later APP13 metadata', () => {
    for (const first of [Buffer.alloc(0), Buffer.from([0]), Buffer.from([0x1c,2,25,0,100]), dataset(2,250,'unknown')]) {
        const image = readMetadata(jpeg(iptcSegment(first), iptcSegment(dataset(2,25,'REAL'))));
        assert.equal(image.iptcdata.keywords, 'REAL');
    }
});

test('Empty IPTC resources do not hide later resources within the same APP13', () => {
    const payload = Buffer.concat([Buffer.from('Photoshop 3.0\0'), iptcResource(Buffer.alloc(0)), iptcResource(dataset(2,25,'REAL'))]);
    assert.equal(readMetadata(jpeg(segment(0xed,payload))).iptcdata.keywords, 'REAL');
});

test('IPTC honors the UTF-8 coded character set with native and legacy decoders', () => {
    const packet = iptcSegment(dataset(1,90,Buffer.from([0x1b,0x25,0x47])),
        dataset(2,120,Buffer.from('café 日本 😀','utf8')),
        dataset(2,25,Buffer.from('français','utf8')), dataset(2,25,Buffer.from('日本','utf8')));
    for (const decoder of [TextDecoder, undefined]) {
        const tags = readMetadata(jpeg(packet), { TextDecoder: decoder }).iptcdata;
        assert.equal(tags.caption, 'café 日本 😀');
        assert.deepEqual(Array.from(tags.keywords), ['français','日本']);
    }
});

test('Malformed UTF-8 skips that dataset while retaining later valid metadata', () => {
    const tags = readIPTC(dataset(1,90,Buffer.from([0x1b,0x25,0x47])),
        dataset(2,120,Buffer.from([0xc3,0x28])), dataset(2,25,'REAL'));
    assert.equal(tags.caption, undefined);
    assert.equal(tags.keywords, 'REAL');
    assert.equal(readIPTC(dataset(2,120,Buffer.from([0xe9]))).caption, 'é');
});
