/**
 * Binary strings, byte arrays, numeric reads and hex previews.
 */
class BinaryUtils{
    static pad(n,width,z){
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

    static byteHex(n){
        return BinaryUtils.pad(n.toString(16),2)
    }

    static wordHex(data,p){
        var hb=BinaryUtils.pad(data.charCodeAt(p).toString(16),2)
        var lb=BinaryUtils.pad(data.charCodeAt(p+1).toString(16),2)
        return hb+lb
    }

    static parseHex(h){
        return parseInt(h,16)
    }

    static hexDump(data,wrap){
        var hex=""
        for(var p=0;p<data.length;p++){
            hex+=BinaryUtils.pad(data.charCodeAt(p).toString(16),2)+" "
            if( ((p+1)%wrap)==0 ) hex+="\r\n";
        }
        return hex
    }

    static arrayToString(arr){
        var chunks=[];
        for(var i=0;i<arr.length;i+=32768){
            var chunk=Array.prototype.slice.call(arr,i,i+32768);
            chunks.push(String.fromCharCode.apply(null,chunk));
        }
        return chunks.join('');
    }

    static stringToBuffer(str){
        var buf = new ArrayBuffer(str.length);
        var bufView = new Uint8Array(buf);
        for(var i=0, strLen=str.length; i < strLen; i++){
            bufView[i] = str.charCodeAt(i);
            if(str.charCodeAt(i)<0 || str.charCodeAt(i)>255){
                console.log("!!! "+str.charCodeAt(i));
            }
        }
        return buf;
    }

    static readBigEndian(data,offset,size){
        var value=0;
        for(var index=0;index<size;index++) value=value*256+data.charCodeAt(offset+index);
        return value;
    }

    static readString(buffer,start,length){
        var outstr = "";
        for(var n = start; n < start+length; n++){
            outstr += String.fromCharCode(buffer.getUint8(n));
        }
        return outstr;
    }

    static readUTF8String(buffer,start,length){
        try {
            var value;
            if(typeof TextDecoder === 'function') {
                var bytes = new Uint8Array(buffer.buffer, buffer.byteOffset + start, length);
                value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            } else {
                // decodeURIComponent supplies strict UTF-8 decoding in older browsers.
                var encoded = '';
                for(var index = start; index < start + length; index++){
                    encoded += '%' + ('0' + buffer.getUint8(index).toString(16)).slice(-2);
                }
                value = decodeURIComponent(encoded);
            }
            return value.replace(/^\uFEFF/, '');
        } catch(error){
            return;
        }
    }
}

if(typeof module!=='undefined' && module.exports) module.exports=BinaryUtils;
