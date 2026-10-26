// Adapted from https://github.com/dschanoeh/exif-js

/**
 * Read bounded TIFF directories, field values and thumbnails.
 */
class TIFFReader{
    // Resolve the shared debug flag when used, avoiding a circular module import.
    static get debug(){
        if(typeof module!=='undefined' && module.exports) return require('./EXIF').debug;
        return EXIF.debug;
    }

    static readTags(file,tiffStart,dirStart,strings,bigEnd){
        if(!TIFFReader.validIFD(file, tiffStart, dirStart, bigEnd)) return {};
        var entries = file.getUint16(dirStart, !bigEnd),
        tags = {},
        entryOffset, tag,
        i;

        for(i=0;i<entries;i++){
            entryOffset = dirStart + i*12 + 2;
            tag = strings[file.getUint16(entryOffset, !bigEnd)];
            if(!tag && TIFFReader.debug) console.log("Unknown tag: " + file.getUint16(entryOffset, !bigEnd));
            if(!tag) continue;
            var value = TIFFReader.readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd);
            if(typeof value !== 'undefined') tags[tag] = value;
        }
        return tags;
    }

    static readTagValue(file,entryOffset,tiffStart,dirStart,bigEnd){
        var type = file.getUint16(entryOffset+2, !bigEnd),
        numValues = file.getUint32(entryOffset+4, !bigEnd),
        valueOffset = file.getUint32(entryOffset+8, !bigEnd) + tiffStart,
        offset,
        vals, val, n,
        numerator, denominator;

        var sizes = [0,1,1,2,4,8,1,1,2,4,8,4,8];
        var size = sizes[type];
        if(!size || numValues < 1) return;
        var byteLength = numValues * size;
        offset = byteLength > 4 ? valueOffset : entryOffset + 8;
        if(offset < tiffStart + 8 || offset > file.byteLength || byteLength > file.byteLength - offset) return;

        switch (type) {
            case 1: // byte, 8-bit unsigned int
            case 7: // undefined, 8-bit byte, value depending on field
            if(numValues == 1) {
                return file.getUint8(entryOffset + 8, !bigEnd);
            } else {
                offset = numValues > 4 ? valueOffset : (entryOffset + 8);
                vals = [];
                for(n=0;n<numValues;n++){
                    vals[n] = file.getUint8(offset + n);
                }
                return vals;
            }

            case 2: // ascii, 8-bit byte
            offset = numValues > 4 ? valueOffset : (entryOffset + 8);
            if(file.getUint8(offset+numValues-1) !== 0) return;
            return TIFFReader.BinaryUtils.readString(file, offset, numValues-1);

            case 6: // signed byte
            case 8: // signed short
            case 11: // IEEE float
            case 12: // IEEE double
            var reader = {6:'getInt8',8:'getInt16',11:'getFloat32',12:'getFloat64'}[type];
            vals = [];
            for(n=0;n<numValues;n++) vals.push(file[reader](offset+size*n,!bigEnd));
            return numValues === 1 ? vals[0] : vals;

            case 3: // short, 16 bit int
            if(numValues == 1) {
                return file.getUint16(entryOffset + 8, !bigEnd);
            } else {
                offset = numValues > 2 ? valueOffset : (entryOffset + 8);
                vals = [];
                for(n=0;n<numValues;n++){
                    vals[n] = file.getUint16(offset + 2*n, !bigEnd);
                }
                return vals;
            }

            case 4: // long, 32 bit int
            if(numValues == 1) {
                return file.getUint32(entryOffset + 8, !bigEnd);
            } else {
                vals = [];
                for(n=0;n<numValues;n++){
                    vals[n] = file.getUint32(valueOffset + 4*n, !bigEnd);
                }
                return vals;
            }

            case 5:    // rational = two long values, first is numerator, second is denominator
            if(numValues == 1) {
                numerator = file.getUint32(valueOffset, !bigEnd);
                denominator = file.getUint32(valueOffset+4, !bigEnd);
                val = new Number(numerator / denominator);
                val.numerator = numerator;
                val.denominator = denominator;
                return val;
            } else {
                vals = [];
                for(n=0;n<numValues;n++){
                    numerator = file.getUint32(valueOffset + 8*n, !bigEnd);
                    denominator = file.getUint32(valueOffset+4 + 8*n, !bigEnd);
                    vals[n] = new Number(numerator / denominator);
                    vals[n].numerator = numerator;
                    vals[n].denominator = denominator;
                }
                return vals;
            }

            case 9: // slong, 32 bit signed int
            if(numValues == 1) {
                return file.getInt32(entryOffset + 8, !bigEnd);
            } else {
                vals = [];
                for(n=0;n<numValues;n++){
                    vals[n] = file.getInt32(valueOffset + 4*n, !bigEnd);
                }
                return vals;
            }

            case 10: // signed rational, two slongs, first is numerator, second is denominator
            if(numValues == 1) {
                return file.getInt32(valueOffset, !bigEnd) / file.getInt32(valueOffset+4, !bigEnd);
            } else {
                vals = [];
                for(n=0;n<numValues;n++){
                    vals[n] = file.getInt32(valueOffset + 8*n, !bigEnd) / file.getInt32(valueOffset+4 + 8*n, !bigEnd);
                }
                return vals;
            }
        }
    }

    static validIFD(file,tiffStart,dirStart,bigEnd){
        if(typeof dirStart !== 'number' || dirStart % 1 !== 0 || dirStart < tiffStart + 8 || dirStart + 2 > file.byteLength) return false;
        return file.getUint16(dirStart, !bigEnd) <= Math.floor((file.byteLength - dirStart - 2) / 12);
    }

    static getNextIFDOffset(dataView,dirStart,bigEnd){
        //the first 2bytes means the number of directory entries contains in this IFD
        var entries = dataView.getUint16(dirStart, !bigEnd);
        if(dirStart + 2 + entries * 12 + 4 > dataView.byteLength) return 0;

        // After last directory entry, there is a 4bytes of data,
        // it means an offset to next IFD.
        // If its value is '0x00000000', it means this is the last IFD and there is no linked IFD.

        return dataView.getUint32(dirStart + 2 + entries * 12, !bigEnd); // each entry is 12 bytes long
    }

    static readThumbnailImage(dataView,tiffStart,firstIFDOffset,bigEnd){
        // get the IFD1 offset
        var IFD1OffsetPointer = TIFFReader.getNextIFDOffset(dataView, tiffStart+firstIFDOffset, bigEnd);

        if(!IFD1OffsetPointer) {
            // console.log('******** IFD1Offset is empty, image thumb not found ********');
            return {};
        }
        else if(!TIFFReader.validIFD(dataView, tiffStart, tiffStart + IFD1OffsetPointer, bigEnd)) {
            // console.log('******** IFD1Offset is outside the bounds of the DataView ********');
            return {};
        }
        // console.log('*******  thumbnail IFD offset (IFD1) is: %s', IFD1OffsetPointer);

        var thumbTags = TIFFReader.readTags(dataView, tiffStart, tiffStart + IFD1OffsetPointer, TIFFReader.EXIFTags.IFD1Tags, bigEnd)

        // EXIF 2.3 specification for JPEG format thumbnail

        // If the value of Compression(0x0103) Tag in IFD1 is '6', thumbnail image format is JPEG.
        // Most of Exif image uses JPEG format for thumbnail. In that case, you can get offset of thumbnail
        // by JpegIFOffset(0x0201) Tag in IFD1, size of thumbnail by JpegIFByteCount(0x0202) Tag.
        // Data format is ordinary JPEG format, starts from 0xFFD8 and ends by 0xFFD9. It seems that
        // JPEG format and 160x120pixels of size are recommended thumbnail format for Exif2.1 or later.

        if(thumbTags['Compression']) {
            // console.log('Thumbnail image found!');

            switch (thumbTags['Compression']) {
                case 6:
                // console.log('Thumbnail image format is JPEG');
                if(thumbTags.JpegIFOffset && thumbTags.JpegIFByteCount) {
                    // extract the thumbnail
                    var tOffset = tiffStart + thumbTags.JpegIFOffset;
                    var tLength = thumbTags.JpegIFByteCount;
                    if(tOffset >= 0 && tLength > 0 && tOffset <= dataView.byteLength && tLength <= dataView.byteLength - tOffset) {
                        thumbTags['blob'] = new Blob([new Uint8Array(dataView.buffer, dataView.byteOffset + tOffset, tLength)], {
                            type: 'image/jpeg'
                        });
                    }
                }
                break;

                case 1:
                console.log("Thumbnail image format is TIFF, which is not implemented.");
                break;
                default:
                console.log("Unknown thumbnail image format '%s'", thumbTags['Compression']);
            }
        }
        else if(thumbTags['PhotometricInterpretation'] == 2) {
            console.log("Thumbnail image format is RGB, which is not implemented.");
        }
        return thumbTags;
    }
}

if(typeof module!=='undefined' && module.exports){
    TIFFReader.BinaryUtils=require('../util/BinaryUtils');
    TIFFReader.EXIFTags=require('./EXIFTags');
}else{
    TIFFReader.BinaryUtils=BinaryUtils;
    TIFFReader.EXIFTags=EXIFTags;
}

if(typeof module!=='undefined' && module.exports) module.exports=TIFFReader;
