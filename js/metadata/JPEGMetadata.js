// Adapted from https://github.com/dschanoeh/exif-js

/**
 * Walk bounded JPEG segments for optional metadata readers.
 */
class JPEGMetadata{
    static findSegment(file,wantedMarker,onSegment){
        var dataView = file instanceof DataView ? file : new DataView(file);
        var length = dataView.byteLength;
        if(length < 2 || dataView.getUint8(0) !== 0xFF) return;
        var offset = 1;
        while(offset < length && dataView.getUint8(offset) === 0xFF) offset++;
        if(offset >= length || dataView.getUint8(offset) !== 0xD8) return;
        offset++;
        var inScan = false;
        var jpegLS = false;
        while(offset < length){
            if(inScan) {
                while(offset < length && dataView.getUint8(offset) !== 0xFF) offset++;
                if(offset >= length) return;
            } else if(dataView.getUint8(offset) !== 0xFF) {
                return;
            }

            var codeOffset = offset + 1;
            while(codeOffset < length && dataView.getUint8(codeOffset) === 0xFF) codeOffset++;
            if(codeOffset >= length) return;

            var marker = dataView.getUint8(codeOffset);
            if(inScan && (jpegLS ? marker < 0x80 : marker === 0x00)) {
                offset = codeOffset + 1;
                continue;
            }
            if(inScan && marker >= 0xD0 && marker <= 0xD7) {
                offset = codeOffset + 1;
                continue;
            }
            inScan = false;

            if(marker === 0xD9) return;
            if(marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
                offset = codeOffset + 1;
                continue;
            }
            if(codeOffset + 2 >= length) return;

            var segmentLength = dataView.getUint16(codeOffset + 1);
            var segmentEnd = codeOffset + 1 + segmentLength;
            if(segmentLength < 2) return;
            if(marker === wantedMarker) {
                var result = onSegment(dataView, codeOffset + 3, Math.min(segmentLength - 2, length - codeOffset - 3));
                if(typeof result !== "undefined") return result;
            }
            if(segmentEnd > length) return;

            offset = segmentEnd;
            if(marker === 0xF7) jpegLS = true;
            else if(marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) jpegLS = false;
            if(marker === 0xDA) inScan = true;
        }
    }
}

if(typeof module!=='undefined' && module.exports) module.exports=JPEGMetadata;
