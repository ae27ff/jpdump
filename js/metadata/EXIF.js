// Adapted from https://github.com/dschanoeh/exif-js

/**
 * Read image metadata from browser images, files or binary buffers.
 */
class EXIF{
    static addEvent(element,event,handler){
        if(element.addEventListener) {
            element.addEventListener(event, handler, false);
        } else if(element.attachEvent) {
            element.attachEvent("on" + event, handler);
        }
    }

    static imageHasData(img){
        return !!(img.exifdata);
    }

    static base64ToArrayBuffer(base64,contentType){
        contentType = contentType || base64.match(/^data\:([^\;]+)\;base64,/mi)[1] || ''; // e.g. 'data:image/jpeg;base64,...' => 'image/jpeg'
        base64 = base64.replace(/^data\:([^\;]+)\;base64,/gmi, '');
        var binary = atob(base64);
        var len = binary.length;
        var buffer = new ArrayBuffer(len);
        var view = new Uint8Array(buffer);
        for(var i = 0; i < len; i++){
            view[i] = binary.charCodeAt(i);
        }
        return buffer;
    }

    static objectURLToBlob(url,callback){
        var http = new XMLHttpRequest();
        http.open("GET", url, true);
        http.responseType = "blob";
        http.onload = function(e){
            if(this.status == 200 || this.status === 0) {
                callback(this.response);
            }
        };
        http.send();
    }

    static getImageData(img,callback){
        function handleBinaryFile(binFile){
            var data = EXIF.findInJPEG(binFile);
            var iptcdata = EXIF.IPTCReader.findInJPEG(binFile);
            var xmpdata= EXIF.XMPReader.findInJPEG(binFile);
            img.exifdata = data || {};
            img.iptcdata = iptcdata || {};
            img.xmpdata = xmpdata || {};
            if(callback) {
                callback.call(img);
            }
        }

        if(img.src) {
            if(/^data\:/i.test(img.src)) { // Data URI
                var arrayBuffer = EXIF.base64ToArrayBuffer(img.src);
                handleBinaryFile(arrayBuffer);

            } else if(/^blob\:/i.test(img.src)) { // Object URL
                var fileReader = new FileReader();
                fileReader.onload = function(e){
                    handleBinaryFile(e.target.result);
                };
                EXIF.objectURLToBlob(img.src, function(blob){
                    fileReader.readAsArrayBuffer(blob);
                });
            } else {
                var http = new XMLHttpRequest();
                http.onload = function(){
                    if(this.status == 200 || this.status === 0) {
                        handleBinaryFile(http.response);
                    } else {
                        throw "Could not load image";
                    }
                    http = null;
                };
                http.open("GET", img.src, true);
                http.responseType = "arraybuffer";
                http.send(null);
            }
        } else if(typeof FileReader!=='undefined' && ((typeof Blob!=='undefined' && img instanceof Blob) || (typeof File!=='undefined' && img instanceof File))) {
            var fileReader = new FileReader();
            fileReader.onload = function(e){
                if(EXIF.debug) console.log("Got file of length " + e.target.result.byteLength);
                handleBinaryFile(e.target.result);
            };

            fileReader.readAsArrayBuffer(img);
        }
    }

    static findInJPEG(file){
        return EXIF.JPEGMetadata.findSegment(file, 0xE1, function(dataView, payloadStart, payloadLength){
            if(payloadLength < 6 || EXIF.BinaryUtils.readString(dataView, payloadStart, 6) !== "Exif\0\0") return;
            try {
                var segmentView = new DataView(dataView.buffer, dataView.byteOffset + payloadStart, payloadLength);
                var tags = EXIF.read(segmentView, 0);
                if(!tags) return;
                var meaningful = Object.keys(tags).some(function(tag){
                    if(tag === 'thumbnail') return Object.keys(tags[tag]).length > 0;
                    return tag !== 'ExifIFDPointer' && tag !== 'GPSInfoIFDPointer';
                });
                if(meaningful) return tags;
            } catch(error){
                return;
            }
        });
    }

    static read(file,start){
        if(EXIF.BinaryUtils.readString(file, start, 4) != "Exif") {
            if(EXIF.debug) console.log("Not valid EXIF data! " + EXIF.BinaryUtils.readString(file, start, 4));
            return false;
        }

        var bigEnd,
        tags, tag,
        exifData, gpsData,
        tiffOffset = start + 6;

        // test for TIFF validity and endianness
        if(file.getUint16(tiffOffset) == 0x4949) {
            bigEnd = false;
        } else if(file.getUint16(tiffOffset) == 0x4D4D) {
            bigEnd = true;
        } else {
            if(EXIF.debug) console.log("Not valid TIFF data! (no 0x4949 or 0x4D4D)");
            return false;
        }

        if(file.getUint16(tiffOffset+2, !bigEnd) != 0x002A) {
            if(EXIF.debug) console.log("Not valid TIFF data! (no 0x002A)");
            return false;
        }

        var firstIFDOffset = file.getUint32(tiffOffset+4, !bigEnd);

        if(firstIFDOffset < 0x00000008) {
            if(EXIF.debug) console.log("Not valid TIFF data! (First offset less than 8)", file.getUint32(tiffOffset+4, !bigEnd));
            return false;
        }
        if(!EXIF.TIFFReader.validIFD(file, tiffOffset, tiffOffset + firstIFDOffset, bigEnd)) return false;

        tags = EXIF.TIFFReader.readTags(file, tiffOffset, tiffOffset + firstIFDOffset, EXIF.EXIFTags.TiffTags, bigEnd);

        if(tags.ExifIFDPointer) {
            exifData = EXIF.TIFFReader.readTags(file, tiffOffset, tiffOffset + tags.ExifIFDPointer, EXIF.EXIFTags.Tags, bigEnd);
            for(tag in exifData){
                switch (tag) {
                    case "LightSource" :
                    case "Flash" :
                    case "MeteringMode" :
                    case "ExposureProgram" :
                    case "SensingMethod" :
                    case "SceneCaptureType" :
                    case "SceneType" :
                    case "CustomRendered" :
                    case "WhiteBalance" :
                    case "GainControl" :
                    case "Contrast" :
                    case "Saturation" :
                    case "Sharpness" :
                    case "SubjectDistanceRange" :
                    case "FileSource" :
                    if(Object.prototype.hasOwnProperty.call(EXIF.EXIFTags.StringValues[tag],exifData[tag])) exifData[tag] = EXIF.EXIFTags.StringValues[tag][exifData[tag]];
                    break;

                    case "ExifVersion" :
                    case "FlashpixVersion" :
                    if(Array.isArray(exifData[tag]) && exifData[tag].length === 4) exifData[tag] = String.fromCharCode.apply(null, exifData[tag]);
                    break;

                    case "ComponentsConfiguration" :
                    if(Array.isArray(exifData[tag]) && exifData[tag].length === 4 && exifData[tag].every(function(value){ return Object.prototype.hasOwnProperty.call(EXIF.EXIFTags.StringValues.Components,value); })) {
                        exifData[tag] = exifData[tag].map(function(value){ return EXIF.EXIFTags.StringValues.Components[value]; }).join('');
                    }
                    break;
                }
                tags[tag] = exifData[tag];
            }
        }

        if(tags.GPSInfoIFDPointer) {
            gpsData = EXIF.TIFFReader.readTags(file, tiffOffset, tiffOffset + tags.GPSInfoIFDPointer, EXIF.EXIFTags.GPSTags, bigEnd);
            for(tag in gpsData){
                switch (tag) {
                    case "GPSVersionID" :
                    if(Array.isArray(gpsData[tag]) && gpsData[tag].length === 4) gpsData[tag] = gpsData[tag].join('.');
                    break;
                }
                tags[tag] = gpsData[tag];
            }
        }

        // extract thumbnail
        tags['thumbnail'] = EXIF.TIFFReader.readThumbnailImage(file, tiffOffset, firstIFDOffset, bigEnd);

        return tags;
    }

    static getData(img,callback){
        if(((typeof Image!=='undefined' && img instanceof Image)
            || (typeof HTMLImageElement!=='undefined' && img instanceof HTMLImageElement))
            && !img.complete)
            return false;

        if(!EXIF.imageHasData(img)) {
            EXIF.getImageData(img, callback);
        } else {
            if(callback) {
                callback.call(img);
            }
        }
        return true;
    }

    static getTag(img,tag){
        if(!EXIF.imageHasData(img)) return;
        return img.exifdata[tag];
    }

    static getIptcTag(img,tag){
        if(!EXIF.imageHasData(img)) return;
        return img.iptcdata[tag];
    }

    static getAllTags(img){
        if(!EXIF.imageHasData(img)) return {};
        var a,
        data = img.exifdata,
        tags = {};
        for(a in data){
            if(data.hasOwnProperty(a)) {
                tags[a] = data[a];
            }
        }
        return tags;
    }

    static getAllIptcTags(img){
        if(!EXIF.imageHasData(img)) return {};
        var a,
        data = img.iptcdata,
        tags = {};
        for(a in data){
            if(data.hasOwnProperty(a)) {
                tags[a] = data[a];
            }
        }
        return tags;
    }

    static pretty(img){
        if(!EXIF.imageHasData(img)) return "";
        var a,
        data = img.exifdata,
        strPretty = "";
        for(a in data){
            if(data.hasOwnProperty(a)) {
                if(typeof data[a] == "object") {
                    if(data[a] instanceof Number) {
                        strPretty += a + " : " + data[a] + " [" + data[a].numerator + "/" + data[a].denominator + "]\r\n";
                    } else {
                        strPretty += a + " : [" + data[a].length + " values]\r\n";
                    }
                } else {
                    strPretty += a + " : " + data[a] + "\r\n";
                }
            }
        }
        return strPretty;
    }

    static readFromBinaryFile(file){
        return EXIF.findInJPEG(file);
    }
}

if(typeof module!=='undefined' && module.exports){
    EXIF.BinaryUtils=require('../util/BinaryUtils');
    EXIF.EXIFTags=require('./EXIFTags');
    EXIF.JPEGMetadata=require('./JPEGMetadata');
    EXIF.TIFFReader=require('./TIFFReader');
    EXIF.IPTCReader=require('./IPTCReader');
    EXIF.XMPReader=require('./XMPReader');
}else{
    EXIF.BinaryUtils=BinaryUtils;
    EXIF.EXIFTags=EXIFTags;
    EXIF.JPEGMetadata=JPEGMetadata;
    EXIF.TIFFReader=TIFFReader;
    EXIF.IPTCReader=IPTCReader;
    EXIF.XMPReader=XMPReader;
}

EXIF.debug=false;
EXIF.Tags=EXIF.EXIFTags.Tags;
EXIF.TiffTags=EXIF.EXIFTags.TiffTags;
EXIF.GPSTags=EXIF.EXIFTags.GPSTags;
EXIF.IFD1Tags=EXIF.EXIFTags.IFD1Tags;
EXIF.StringValues=EXIF.EXIFTags.StringValues;

if(typeof module!=='undefined' && module.exports){
    module.exports=EXIF;
    module.exports.EXIF=EXIF;
}
