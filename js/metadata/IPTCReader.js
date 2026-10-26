// Adapted from https://github.com/dschanoeh/exif-js

/**
 * Read Photoshop APP13 resources and IPTC datasets.
 */
class IPTCReader{
    static findInJPEG(file){
        var photoshopSignature = "Photoshop 3.0\0";
        return IPTCReader.JPEGMetadata.findSegment(file, 0xED, function(dataView, payloadStart, payloadLength){
            if(payloadLength < photoshopSignature.length ||
                IPTCReader.BinaryUtils.readString(dataView, payloadStart, photoshopSignature.length) !== photoshopSignature) return;

            var offset = payloadStart + photoshopSignature.length;
            var end = payloadStart + payloadLength;
            while(offset + 7 <= end){
                if(IPTCReader.BinaryUtils.readString(dataView, offset, 4) !== "8BIM") return;

                var resourceId = dataView.getUint16(offset + 4);
                var nameLength = dataView.getUint8(offset + 6);
                var nameFieldLength = nameLength + 1;
                if(nameFieldLength % 2 !== 0) nameFieldLength++;
                var sizeOffset = offset + 6 + nameFieldLength;
                if(sizeOffset + 4 > end) return;

                var resourceLength = dataView.getUint32(sizeOffset);
                var resourceStart = sizeOffset + 4;
                var resourceEnd = resourceStart + resourceLength;
                var paddedResourceEnd = resourceEnd + (resourceLength % 2);
                if(resourceId === 0x0404) {
                    var iptc = IPTCReader.read(dataView, resourceStart, Math.min(resourceLength, end - resourceStart));
                    if(Object.keys(iptc).length > 0) return iptc;
                }
                if(resourceEnd > end || paddedResourceEnd > end) return;
                offset = paddedResourceEnd;
            }
        });
    }

    static read(dataView,startOffset,sectionLength){
        var data = {};
        var fieldValue, fieldName, dataSize, segmentType;
        var segmentStartPos = startOffset;
        var sectionEnd = startOffset + sectionLength;
        var utf8 = false;
        if(startOffset < 0 || sectionLength < 0 || sectionEnd > dataView.byteLength) return data;
        while(segmentStartPos + 5 <= sectionEnd){
            if(dataView.getUint8(segmentStartPos) !== 0x1C) return data;
            var recordNumber = dataView.getUint8(segmentStartPos + 1);
            segmentType = dataView.getUint8(segmentStartPos + 2);
            dataSize = dataView.getUint16(segmentStartPos + 3);
            var valueStart = segmentStartPos + 5;
            if(dataSize & 0x8000) {
                // Extended IIM lengths encode the number of following length octets.
                var lengthOctets = dataSize & 0x7FFF;
                if(lengthOctets === 0 || lengthOctets > sectionEnd - valueStart) return data;
                var maxDataSize = sectionEnd - valueStart - lengthOctets;
                dataSize = 0;
                for(var lengthIndex = 0; lengthIndex < lengthOctets; lengthIndex++){
                    dataSize = dataSize * 256 + dataView.getUint8(valueStart + lengthIndex);
                    // Bound the value while accumulating it, before it can overflow.
                    if(dataSize > maxDataSize) return data;
                }
                valueStart += lengthOctets;
            }
            if(dataSize > sectionEnd - valueStart) return data;
            if(recordNumber === 1 && segmentType === 90) {
                utf8 = IPTCReader.BinaryUtils.readString(dataView, valueStart, dataSize) === '\x1b%G';
            }
            if(recordNumber === 2 && segmentType in IPTCReader.fields) {
                fieldName = IPTCReader.fields[segmentType];
                fieldValue = utf8 ? IPTCReader.BinaryUtils.readUTF8String(dataView, valueStart, dataSize) : IPTCReader.BinaryUtils.readString(dataView, valueStart, dataSize);
                if(typeof fieldValue === 'undefined') {
                    segmentStartPos = valueStart + dataSize;
                    continue;
                }
                // Check if we already stored a value with this name
                if(data.hasOwnProperty(fieldName)) {
                    // Value already stored with this name, create multivalue field
                    if(data[fieldName] instanceof Array) {
                        data[fieldName].push(fieldValue);
                    }
                    else {
                        data[fieldName] = [data[fieldName], fieldValue];
                    }
                }
                else {
                    data[fieldName] = fieldValue;
                }
            }
            // Every dataset has a length, including unknown and binary datasets.
            segmentStartPos = valueStart + dataSize;
        }
        return data;
    }
}

IPTCReader.fields={
    0x78 : 'caption',
    0x6E : 'credit',
    0x19 : 'keywords',
    0x37 : 'dateCreated',
    0x50 : 'byline',
    0x55 : 'bylineTitle',
    0x7A : 'captionWriter',
    0x69 : 'headline',
    0x74 : 'copyright',
    0x0F : 'category'
};

if(typeof module!=='undefined' && module.exports){
    IPTCReader.BinaryUtils=require('../util/BinaryUtils');
    IPTCReader.JPEGMetadata=require('./JPEGMetadata');
}else{
    IPTCReader.BinaryUtils=BinaryUtils;
    IPTCReader.JPEGMetadata=JPEGMetadata;
}

if(typeof module!=='undefined' && module.exports) module.exports=IPTCReader;
