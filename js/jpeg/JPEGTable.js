/**
 * Read quantization and Huffman tables and validate table segments.
 */
class JPEGTable{
    static huffmanCodes(table){
        var codes = [], code = 0, index = 0;
        for(var length = 1; length <= 16; length++){
            for(var n = 0; n < table.counts[length - 1]; n++) codes.push({value: table.values[index++], length: length, code: code++});
            code *= 2;
        }
        return codes;
    }

    static isValid(type,data){
        if(type==='dd') return data.length>=2 && data.length<=4;
        if(type==='df') return data.length===1 && data.charCodeAt(0)!==0 && (data.charCodeAt(0)>>4)<=1 && (data.charCodeAt(0)&15)<=1;
        if(type!=='db' && type!=='c4' && type!=='cc') return true;
        if(data.length===0) return false;
        for(var offset=0;offset<data.length;){
            var descriptor=data.charCodeAt(offset++), kind=descriptor>>4, id=descriptor&15;
            if(type==='db'){
                if(kind>1 || id>3 || offset+64*(kind+1)>data.length) return false;
                for(var item=0;item<64;item++){
                    var value=kind ? BinaryUtils.parseHex(BinaryUtils.wordHex(data,offset)) : data.charCodeAt(offset);
                    if(value===0) return false;
                    offset+=kind+1;
                }
            }else if(type==='c4'){
                if(kind>1 || id>3 || offset+16>data.length) return false;
                var symbols=0, available=1;
                for(var length=0;length<16;length++){
                    var count=data.charCodeAt(offset++);
                    symbols+=count; available=available*2-count;
                    if(available<=0) return false; // Oversubscribed, or uses the reserved all-ones code.
                }
                if(symbols===0 || symbols>256 || offset+symbols>data.length) return false;
                if(kind===0) for(var symbol=0;symbol<symbols;symbol++) if(data.charCodeAt(offset+symbol)>16) return false;
                offset+=symbols;
            }else{
                if(kind>1 || id>3 || offset>=data.length) return false;
                var condition=data.charCodeAt(offset++);
                if(kind ? condition<1 || condition>63 : (condition&15)>(condition>>4)) return false;
            }
        }
        return true;
    }

    static readQuantizers(data,tables){
        for(var offset=0;offset<data.length;){
            var descriptor=data.charCodeAt(offset), size=1+64*((descriptor>>4)+1);
            tables[descriptor&15]=data.substring(offset,offset+size);
            offset+=size;
        }
    }

    static read(header){
        var data = header.content, p = 0, tables = [];
        while(p < data.length){
            var descriptor = data.charCodeAt(p++), values = [], counts = [], count = 0, i;
            if(header.type === 'db') {
                var precision = descriptor >> 4, width = precision + 1;
                if(precision > 1 || p + 64 * width > data.length) return null;
                for(i = 0; i < 64; i++){ values.push(width === 1 ? data.charCodeAt(p) : data.charCodeAt(p) * 256 + data.charCodeAt(p + 1)); p += width; }
                tables.push({id: descriptor & 15, precision: width * 8, values: values});
            } else if(header.type === 'c4') {
                if(descriptor >> 4 > 1 || p + 16 > data.length) return null;
                for(i = 0; i < 16; i++){ counts.push(data.charCodeAt(p++)); count += counts[i]; }
                if(p + count > data.length) return null;
                for(i = 0; i < count; i++) values.push(data.charCodeAt(p++));
                tables.push({id: descriptor & 15, coding: descriptor >> 4 ? 'AC' : 'DC', counts: counts, values: values});
            } else return null;
        }
        return tables;
    }
}
