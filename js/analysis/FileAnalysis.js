/** Read-only byte analysis. Offsets always refer to the original file. */
class FileAnalysis{
    static strings(data, start, end, minimum = 6, limit = 400){
        const found = [];
        let p = start;
        while(p < end){
            const begin = p;
            while(p < end && data.charCodeAt(p) >= 32 && data.charCodeAt(p) <= 126) p++;
            if(p - begin >= minimum){
                const value = data.substring(begin, Math.min(p, begin + 512));
                const kind = /https?:\/\//i.test(value) ? 'URL / text' : /^[0-9a-f]{16,}$/i.test(value) && value.length % 2 === 0 ? 'Possible hex' : /^(?:[A-Za-z0-9+/]{4}){4,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) ? 'Possible Base64' : 'Text';
                found.push({start: begin, end: p, kind, value});
                if(found.length >= limit) return {found, limited: true, scannedEnd: p};
            }
            p++;
        }
        return {found, limited: false, scannedEnd: end};
    }

    static entropy(data, start, end, buckets = 128){
        const histogram = new Uint32Array(256), points = [], step = Math.max(1, Math.ceil((end - start) / buckets));
        for(let p = start; p < end; p += step){
            const stop = Math.min(end, p + step), local = new Uint32Array(256);
            for(let i = p; i < stop; i++){ const value = data.charCodeAt(i); local[value]++; histogram[value]++; }
            points.push({start: p, end: stop, entropy: FileAnalysis.shannon(local, stop - p)});
        }
        return {histogram, points, entropy: FileAnalysis.shannon(histogram, end - start)};
    }

    static shannon(histogram, size){
        let entropy = 0;
        if(!size) return 0;
        for(const count of histogram) if(count){ const p = count / size; entropy -= p * Math.log2(p); }
        return entropy;
    }

    static signatures(data, start, end, limit = 100){
        const found = [], signatures = [
            ['ZIP', 'PK\x03\x04'], ['PNG', '\x89PNG\r\n\x1a\n'], ['JPEG', '\xff\xd8\xff'],
            ['PDF', '%PDF-'], ['GIF', 'GIF87a'], ['GIF', 'GIF89a'], ['7z', '7z\xbc\xaf\x27\x1c'], ['RAR', 'Rar!\x1a\x07']
        ];
        for(let p = start; p < end; p++){
            if(![80, 137, 255, 37, 71, 55, 82].includes(data.charCodeAt(p))) continue;
            for(const [type, magic] of signatures){
                if(p + magic.length > end || !data.startsWith(magic, p)) continue;
                let stop = null, status = 'Signature only; contents unverified';
                if(type === 'PNG'){
                    let q = p + 8, chunks = 0;
                    while(q + 12 <= end && chunks++ < 10000){
                        const size = data.charCodeAt(q) * 16777216 + data.charCodeAt(q + 1) * 65536 + data.charCodeAt(q + 2) * 256 + data.charCodeAt(q + 3);
                        const name = data.substring(q + 4, q + 8);
                        if(chunks === 1 && (name !== 'IHDR' || size !== 13)) break;
                        if(q + 12 + size > end || !/^[A-Za-z]{4}$/.test(name)) break;
                        q += 12 + size;
                        if(name === 'IEND' && size === 0){ stop = q; status = 'Chunk boundaries checked; CRCs and image content unverified'; break; }
                    }
                }else if(type === 'PDF'){
                    const eof = data.indexOf('%%EOF', p + 5);
                    if(eof !== -1 && eof + 5 <= end){ stop = eof + 5; status = 'Header and EOF found; PDF structure unverified'; }
                }
                found.push({type, start: p, end: stop, status});
                if(found.length >= limit) return {found, limited: true};
            }
        }
        return {found, limited: false};
    }

    static observations(info, model, threshold = 16384){
        const found = [], seen = new Map();
        for(const warning of info.warnings || []) found.push({message: warning, start: null});
        for(const row of model.rows){
            const h = row.header;
            if(row.group === 'extra' || row.group === 'unparsed') found.push({message: row.size + ' ' + (row.group === 'extra' ? 'bytes after the image stream.' : 'unparsed bytes.'), start: row.start});
            if(!h) continue;
            if(['JFIF','EXIF','Adobe'].includes(h.extendedtype)){
                const key=(row.imageIndex || 0)+':'+h.extendedtype;
                if(seen.has(key)) found.push({message:'Additional '+h.extendedtype+' segment in this image. Multiple segments may be legitimate; compare their contents.',start:row.start});
                seen.set(key,true);
            }
            if(h.type === 'fe') found.push({message: 'Comment segment: ' + (row.contentEnd - row.contentStart) + ' bytes.', start: row.start});
            if(/^e[0-9a-f]$/.test(h.type) && row.size >= threshold) found.push({message: 'Large application segment (' + row.code + '): ' + row.size + ' bytes. Size alone does not establish hidden data.', start: row.start});
            if(/^e[0-9a-f]$/.test(h.type) && !h.hasextendeddata) found.push({message: row.code + ' has no structured decoder; inspect its original bytes.', start: row.start});
        }
        return found.slice(0, 200);
    }

    static compare(left, right, leftData, rightData, metadataOnly = false){
        const keep = row => !metadataOnly || row.header && (/^e[0-9a-f]$/.test(row.header.type) || row.header.type === 'fe');
        const a = left.rows.filter(keep), b = right.rows.filter(keep), rows = [];
        const count = Math.min(1000, Math.max(a.length, b.length));
        for(let i = 0; i < count; i++){
            const l = a[i], r = b[i];
            const same = !!(l && r && l.code === r.code && l.size === r.size && leftData.substring(l.start, l.end) === rightData.substring(r.start, r.end));
            rows.push({left: l, right: r, same});
        }
        return {rows, limited: Math.max(a.length, b.length) > count, leftCount: a.length, rightCount: b.length};
    }

    static coefficients(state, component = 0, frequency = -1){
        const c = state.components[component], histogram = new Map();
        let count = 0, zero = 0, even = 0, odd = 0, uncertain = 0;
        for(let block = 0; block < c.available.length; block++){
            // Exclude padded edge blocks that have no samples inside the declared dimensions.
            if((block % c.cols) * 8 >= Math.ceil(state.width * c.h / state.maxH) || Math.floor(block / c.cols) * 8 >= Math.ceil(state.height * c.v / state.maxV)) continue;
            if(!c.available[block]) continue;
            if(c.available[block] === 2 || state.assumed){ uncertain++; continue; }
            for(let k = frequency < 0 ? 1 : frequency; k < (frequency < 0 ? 64 : frequency + 1); k++){
                const value = c.coefficients[block * 64 + k];
                count++; if(!value) zero++; else if(Math.abs(value) % 2) odd++; else even++;
                histogram.set(value, (histogram.get(value) || 0) + 1);
            }
        }
        return {histogram, count, zero, even, odd, uncertain};
    }
}
