const assert = require('node:assert/strict');
const test = require('node:test');
const { jpeg, readMetadata } = require('./metadata-helpers');
const { exifSegment, tiffSegment } = require('./exif-helpers');

test('Unknown TIFF tags do not create an undefined metadata property', () => {
    for (const bigEndian of [false, true]) {
        const tags = readMetadata(jpeg(exifSegment(bigEndian))).exifdata;
        assert.equal(tags.Make, 'A');
        assert.equal(Object.hasOwn(tags, 'undefined'), false);
        assert.deepEqual(Object.keys(tags).sort(), ['Make', 'thumbnail']);
    }
});

test('Unknown private tag values are skipped without dereferencing invalid offsets', () => {
    const tags = readMetadata(jpeg(exifSegment(false, true))).exifdata;
    assert.equal(tags.Make, 'A');
    assert.equal(Object.hasOwn(tags, 'undefined'), false);
});

test('Legal marker fill before SOI does not hide EXIF metadata', () => {
    const bytes=Buffer.concat([Buffer.from([0xff,0xff]),jpeg(exifSegment())]);
    assert.equal(readMetadata(bytes).exifdata.Make,'A');
});

const make={tag:0x010f,type:2,count:2,value:Buffer.from('A\0')};
test('Malformed known EXIF values and optional directory pointers do not hide valid tags', () => {
    for (const bad of [
        {tag:0x010e,type:2,count:100,value:999999},
        {tag:0x010e,type:2,count:0,value:0},
        {tag:0x010e,type:2,count:3,value:Buffer.from('bad')},
        {tag:0x010e,type:2,count:8,value:0},
        {tag:0x8769,type:4,count:1,value:999999},
        {tag:0x8825,type:4,count:1,value:999999}
    ]) assert.equal(readMetadata(jpeg(tiffSegment([make,bad]))).exifdata.Make,'A');
    assert.equal(readMetadata(jpeg(tiffSegment([make],{nextIFD:999999}))).exifdata.Make,'A');
});

test('Empty and unusable EXIF directories do not hide a later valid APP1', () => {
    for (const empty of [tiffSegment([]),tiffSegment([{tag:0x010e,type:2,count:100,value:999999}])]) {
        assert.equal(readMetadata(jpeg(empty,exifSegment())).exifdata.Make,'A');
    }
});

test('TIFF numeric values use their declared signedness and floating-point types', () => {
    const values=[
        [6,Buffer.from([0xff]),-1],
        [8,Buffer.from([0xfe,0xff]),-2],
        [11,Buffer.from([0,0,0xc0,0x3f]),1.5]
    ];
    for (const [type,value,expected] of values) {
        const tags=readMetadata(jpeg(tiffSegment([make,{tag:0x0100,type,count:1,value}]))).exifdata;
        assert.equal(tags.ImageWidth,expected);
    }
    const extra=Buffer.alloc(8); extra.writeDoubleLE(1.25);
    assert.equal(readMetadata(jpeg(tiffSegment([{tag:0x0100,type:12,count:1,value:26}],{extra}))).exifdata.ImageWidth,1.25);
});

test('Malformed EXIF enumeration strings cannot resolve inherited lookup properties', () => {
    const extra=Buffer.alloc(27);
    extra.writeUInt16LE(1,0);
    extra.writeUInt16LE(0x9208,2); extra.writeUInt16LE(2,4); extra.writeUInt32LE(9,6);
    extra.writeUInt32LE(56,10); extra.write('toString\0',18);
    const tags=readMetadata(jpeg(tiffSegment([make,{tag:0x8769,type:4,count:1,value:38}],{extra}))).exifdata;
    assert.equal(tags.Make,'A');
    assert.equal(tags.LightSource,'toString');
});

test('Digital zoom uses the standard EXIF tag name', () => {
    const extra=Buffer.alloc(26);
    extra.writeUInt16LE(1,0);
    extra.writeUInt16LE(0xa404,2); extra.writeUInt16LE(5,4);
    extra.writeUInt32LE(1,6); extra.writeUInt32LE(44,10);
    extra.writeUInt32LE(3,18); extra.writeUInt32LE(2,22);
    const tags=readMetadata(jpeg(tiffSegment([{tag:0x8769,type:4,count:1,value:26}],{extra}))).exifdata;
    assert.equal(Number(tags.DigitalZoomRatio),1.5);
    assert.equal(Object.hasOwn(tags,'DigitalZoomRation'),false);
});

test('A truncated APP1 retains complete EXIF fields within its available bytes', () => {
    const segment=exifSegment(), bytes=Buffer.concat([Buffer.from([255,216]),segment.subarray(0,-2)]);
    assert.equal(readMetadata(bytes).exifdata.Make,'A');
    // Oversized declared length has no trustworthy following segment boundary.
    const overlong=Buffer.from(bytes); overlong.writeUInt16BE(65535,4);
    assert.equal(readMetadata(overlong).exifdata.Make,'A');
});
