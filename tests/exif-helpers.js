const { segment } = require('./metadata-helpers');

function exifSegment(bigEndian = false, malformedUnknown = false) {
    const tiff = Buffer.alloc(8 + 2 + 24 + 4);
    tiff.write(bigEndian ? 'MM' : 'II');
    const u16 = (value, offset) => tiff[bigEndian ? 'writeUInt16BE' : 'writeUInt16LE'](value, offset);
    const u32 = (value, offset) => tiff[bigEndian ? 'writeUInt32BE' : 'writeUInt32LE'](value, offset);
    u16(42, 2);
    u32(8, 4);
    u16(2, 8);
    u16(0x010f, 10); // Make: inline ASCII string.
    u16(2, 12);
    u32(2, 14);
    tiff.write('A\0', 18);
    u16(0xcafe, 22); // Unknown private tag.
    u16(malformedUnknown ? 2 : 3, 24);
    u32(malformedUnknown ? 100 : 1, 26);
    if (malformedUnknown) u32(999999, 30);
    else u16(7, 30);
    return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), tiff]));
}

module.exports = { exifSegment };

function tiffSegment(entries, { nextIFD=0, extra=Buffer.alloc(0) } = {}) {
    const tiff=Buffer.alloc(8+2+entries.length*12+4);
    tiff.write('II'); tiff.writeUInt16LE(42,2); tiff.writeUInt32LE(8,4);
    tiff.writeUInt16LE(entries.length,8);
    entries.forEach((entry,index) => {
        const offset=10+12*index;
        tiff.writeUInt16LE(entry.tag,offset); tiff.writeUInt16LE(entry.type,offset+2);
        tiff.writeUInt32LE(entry.count,offset+4);
        if (Buffer.isBuffer(entry.value)) entry.value.copy(tiff,offset+8);
        else tiff.writeUInt32LE(entry.value,offset+8);
    });
    tiff.writeUInt32LE(nextIFD,10+12*entries.length);
    return segment(0xe1,Buffer.concat([Buffer.from('Exif\0\0'),tiff,extra]));
}
module.exports.tiffSegment=tiffSegment;
