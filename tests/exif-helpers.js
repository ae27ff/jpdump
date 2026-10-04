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
