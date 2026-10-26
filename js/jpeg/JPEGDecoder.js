/**
 * Bounded baseline and progressive Huffman JPEG decoding. Original bytes are never modified.
 * Coefficients and per-block availability are retained for forensic inspection.
 */
class JPEGDecoder{
    static headers(data, options = {}){
        if(options.recoverHeaders){
            if(options.mode === 'strict') throw new Error('Strict decoding cannot rebuild missing headers.');
            try{ return JPEGDecoder.headers(data,{...options,recoverHeaders:false,assumedFrame:undefined}); }
            catch(error){ return JPEGDecoder.recoverHeaderPrefix(data,options); }
        }
        const byte = p => data.charCodeAt(p), word = p => byte(p) * 256 + byte(p + 1);
        if(byte(0) !== 255 || byte(1) !== 216) throw new Error('Select a JPEG image beginning with SOI.');
        const state = {quant: {}, huffman: {}, components: [], restart: 0, log: [], adobe: null, jfif: false};
        let p = 2, count = 0;
        while(p < data.length && ++count <= 4096){
            if(byte(p++) !== 255) throw new Error('A damaged marker prevents locating the image scan.');
            while(byte(p) === 255) p++;
            const marker = byte(p++), length = word(p), end = p + length;
            if(marker === 217) break;
            if(!Number.isInteger(length) || length < 2 || end > data.length) throw new Error('An incomplete segment prevents locating the image scan.');
            const content = data.substring(p + 2, end);
            if(marker === 219 || marker === 196){
                const kind = marker === 219 ? 'db' : 'c4';
                if(!JPEGTable.isValid(kind, content)) throw new Error('Invalid ' + (marker === 219 ? 'quantization' : 'Huffman') + ' table.');
                for(const table of JPEGTable.read({type: kind, content})){
                    if(marker === 219){
                        if(table.precision !== 8) throw new Error('Baseline reconstruction requires 8-bit quantization tables.');
                        state.quant[table.id] = table.values;
                    }else state.huffman[table.coding + table.id] = JPEGDecoder.huffman(table);
                }
            }else if(JPEGFrame.isMarker(marker.toString(16))){
                if(marker !== 192 && marker !== 194) throw new Error('Reconstruction supports baseline (SOF0) and progressive (SOF2) Huffman JPEGs. Lossless, arithmetic, JPEG-LS and JPEG 2000 decoding are not supported.');
                state.progressive = marker === 194;
                if(state.components.length) throw new Error('Multiple frame headers are not supported.');
                const frame = JPEGFrame.read(content);
                if(frame.dataprec !== 8 || ![1, 3].includes(frame.ncomponents) || frame.components.length !== frame.ncomponents || content.length !== 6 + 3 * frame.ncomponents) throw new Error('Expected a complete 8-bit grayscale or three-component frame.');
                state.width = frame.imgw; state.height = frame.imgh;
                state.components = frame.components.map(c => ({id: c.id, h: c.samplingfactors >> 4, v: c.samplingfactors & 15, q: c.qtablenum, predictor: 0}));
                if(new Set(state.components.map(c => c.id)).size !== state.components.length || state.components.some(c => c.h < 1 || c.h > 4 || c.v < 1 || c.v > 4) || state.components.reduce((n, c) => n + c.h * c.v, 0) > 10) throw new Error('Unsupported or invalid component sampling.');
            }else if(marker === 221){
                if(length !== 4) throw new Error('Invalid restart interval.');
                state.restart = word(p + 2);
            }else if(marker === 238 && content.startsWith('Adobe') && content.length >= 12) state.adobe = content.charCodeAt(11);
            else if(marker === 224 && content.startsWith('JFIF\0')) state.jfif = true;
            else if(marker === 218){
                if(!state.components.length) throw new Error('The frame header is missing. Dimensions and component layout cannot be inferred safely.');
                const scan = JPEGScan.read(content);
                if(state.progressive){
                    JPEGDecoder.progressiveHeader(state, content, options);
                    state.offset = end;
                    return state;
                }
                if(scan.sss !== 0 || scan.ess !== 63 || scan.sabp !== 0 || scan.ncomponents !== state.components.length || content.length !== 4 + 2 * scan.ncomponents) throw new Error('Only a single baseline scan containing all components is supported.');
                const ids = new Set();
                state.scan = scan.components.map(s => {
                    const c = state.components.find(c => c.id === s.id);
                    if(!c || ids.has(c.id)) throw new Error('Invalid scan component selection.');
                    ids.add(c.id); c.dc = 'DC' + s.dctn; c.ac = 'AC' + s.actn; return c;
                });
                // A donor is opt-in and fills missing tables only; its use is recorded.
                for(const c of state.components){
                    if(!state.quant[c.q] && options.donor && options.donor.quant[c.q]){
                        state.quant[c.q] = options.donor.quant[c.q]; state.log.push('Assumed missing quantization table ' + c.q + ' from the comparison image.');
                    }
                    for(const key of [c.dc, c.ac]) if(!state.huffman[key] && options.donor && options.donor.huffman[key]){
                        state.huffman[key] = options.donor.huffman[key]; state.log.push('Assumed missing Huffman table ' + key + ' from the comparison image.');
                    }
                    if(!state.quant[c.q] || !state.huffman[c.dc] || !state.huffman[c.ac]) throw new Error('A required coding table is missing. Advanced options can explicitly use tables from a comparison image.');
                }
                state.offset = end;
                return state;
            }
            p = end;
        }
        throw new Error('No supported image scan was found.');
    }

    static recoverHeaderPrefix(data, options){
        const chain = JPEGScan.findHeaderChain(data, !!options.assumedFrame);
        if(!chain) throw new Error('No sufficiently complete JPEG header sequence and scan were found in the first 8 MiB.');
        if(!chain.frame && !options.assumedFrame) throw new Error('The frame header is missing. Load a known matching comparison image to assume dimensions and component sampling.');
        const hasSOI = data.charCodeAt(0) === 255 && data.charCodeAt(1) === 216;
        const parts = [], offsetMap = [], assumptions = [], discarded = [], inserted = [];
        let length = 0;
        const append = (bytes, sourceStart) => {
            offsetMap.push({start:length,end:length + bytes.length,sourceStart});
            parts.push(bytes); length += bytes.length;
        };
        append('\xff\xd8', hasSOI ? 0 : null);
        if(!hasSOI){
            assumptions.push('Assumed a missing SOI (start of image) marker.');
            inserted.push({marker:'SOI',beforeSourceOffset:chain.start,hex:'FFD8'});
        }
        const prefixStart = hasSOI ? 2 : 0;
        if(chain.start > prefixStart){
            discarded.push({start:prefixStart,end:chain.start,reason:'Unverified bytes before the surviving header sequence.'});
            assumptions.push('Skipped ' + (chain.start - prefixStart) + ' unverified prefix bytes.');
        }
        for(const segment of chain.segments){
            if(segment.marker === 218 && !chain.frame){
                const frame = options.assumedFrame;
                if(!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.width > 65535 || frame.height < 1 || frame.height > 65535 ||
                    !Array.isArray(frame.components) || ![1,3].includes(frame.components.length) ||
                    frame.components.some(c => ![c.id,c.h,c.v,c.q].every(Number.isInteger) || c.id < 0 || c.id > 255 || c.h < 1 || c.h > 4 || c.v < 1 || c.v > 4 || c.q < 0 || c.q > 3))
                    throw new Error('Invalid assumed frame dimensions or component layout.');
                const values = [8,frame.height >> 8,frame.height & 255,frame.width >> 8,frame.width & 255,frame.components.length];
                frame.components.forEach(c => values.push(c.id,c.h * 16 + c.v,c.q));
                const content = String.fromCharCode(...values), marker = frame.progressive ? 194 : 192;
                if(!JPEGFrame.isValid(marker.toString(16),content)) throw new Error('Invalid assumed frame header.');
                const header = '\xff' + String.fromCharCode(marker,0,content.length + 2) + content;
                append(header,null);
                inserted.push({marker:frame.progressive?'SOF2':'SOF0',beforeSourceOffset:segment.start,hex:Array.from(header,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('').toUpperCase()});
                assumptions.push('Assumed a missing ' + (frame.progressive ? 'progressive' : 'baseline') + ' frame header, ' + frame.width + ' × ' + frame.height + ' dimensions and component sampling from the comparison image.');
            }
            if(segment.marker === 218 && options.donor && options.donor.restart && !chain.segments.some(s => s.marker === 221)){
                const interval = options.donor.restart;
                if(!Number.isInteger(interval) || interval < 1 || interval > 65535) throw new Error('Invalid assumed restart interval.');
                const header = '\xff\xdd\0\x04' + String.fromCharCode(interval >> 8,interval & 255);
                append(header,null);
                inserted.push({marker:'DRI',beforeSourceOffset:segment.start,hex:Array.from(header,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('').toUpperCase()});
                assumptions.push('Assumed a missing restart interval of ' + interval + ' MCU(s) from the comparison image.');
            }
            append(data.substring(segment.start,segment.end),segment.start);
        }
        append(data.substring(chain.end),chain.end);
        const rebuilt = parts.join('');
        const state = JPEGDecoder.headers(rebuilt,{...options,recoverHeaders:false,assumedFrame:undefined});
        state.decodeData = rebuilt; state.offsetMap = offsetMap;
        state.recovery = {sourceStart:chain.start,missingSOI:!hasSOI,assumedFrame:!chain.frame,discarded,inserted,assumptions};
        state.log.unshift(...assumptions);
        return state;
    }

    static sourceOffset(state, offset){
        if(!state.offsetMap) return offset;
        const range = state.offsetMap.find(item => offset >= item.start && offset < item.end);
        if(range) return range.sourceStart === null ? null : range.sourceStart + offset - range.start;
        const last = state.offsetMap[state.offsetMap.length - 1];
        return last && offset === last.end && last.sourceStart !== null ? last.sourceStart + last.end - last.start : null;
    }

    static huffman(table){
        const codes = Array.from({length: 17}, () => new Map());
        for(const entry of JPEGTable.huffmanCodes(table)) codes[entry.length].set(entry.code, entry.value);
        return codes;
    }

    static reader(data, offset, onSymbol){
        return {data, p: offset, bits: 0, value: 0, byteStart: offset,
            snapshot(){ return {p:this.p,bits:this.bits,value:this.value,byteStart:this.byteStart}; },
            restore(saved){ Object.assign(this, saved); },
            bit(){
                if(!this.bits){
                    if(this.p >= data.length) throw new Error('End of available scan data');
                    const start = this.p, value = data.charCodeAt(this.p++);
                    if(value === 255){
                        if(data.charCodeAt(this.p) !== 0){ this.p = start; throw new Error('Marker encountered inside a block'); }
                        this.p++;
                    }
                    this.byteStart = start; this.value = value; this.bits = 8;
                }
                return (this.value >> --this.bits) & 1;
            },
            symbol(table, accepts){
                const start = this.repair ? this.snapshot() : null;
                const book = this.repair ? JPEGDecoder.codebook(table) : null;
                let code = 0;
                for(let length = 1; length <= 16; length++){
                    code = code * 2 + this.bit();
                    if(table[length].has(code)){
                        let value = table[length].get(code);
                        if(this.repair && accepts && !accepts(value)) value = JPEGDecoder.substitute(this, table, start, length, accepts, 'Codeword is invalid in this block');
                        if(onSymbol) onSymbol(value);
                        return value;
                    }
                    if(book && !book.prefixes[length].has(code)){
                        const value = JPEGDecoder.substitute(this, table, start, length, accepts, 'Invalid Huffman code');
                        if(onSymbol) onSymbol(value);
                        return value;
                    }
                }
                throw new Error('Invalid Huffman code');
            },
            receive(n){
                const value = this.raw(n);
                return n && value < 2 ** (n - 1) ? value - (2 ** n - 1) : value;
            },
            raw(n){
                let value = 0;
                for(let i = 0; i < n; i++) value = value * 2 + this.bit();
                return value;
            }
        };
    }

    static codebook(table){
        if(table.recoveryBook) return table.recoveryBook;
        const entries = [], prefixes = Array.from({length:17}, () => new Set());
        for(let length = 1; length <= 16; length++) for(const [code, value] of table[length]){
            entries.push({code,value,length});
            for(let n = 1; n <= length; n++) prefixes[n].add(code >> (length - n));
        }
        return table.recoveryBook = {entries,prefixes};
    }

    static substitute(reader, table, start, preferredLength, accepts, reason){
        const policy = reader.repair, failed = reader.snapshot();
        if(policy.substitutions.length >= policy.limit) throw new Error('Codeword substitution limit (' + policy.limit + ') reached');
        reader.restore(start);
        let bits = '';
        // Look ahead only through available entropy bits. Never synthesize EOF,
        // stuffed bytes, markers or restart boundaries as replacement codewords.
        try{ for(let n = 0; n < 16; n++) bits += reader.bit(); }
        catch(error){ if(!/End of available scan data|Marker encountered/.test(error.message)) throw error; }
        let best = null;
        for(const entry of JPEGDecoder.codebook(table).entries){
            if(entry.length > bits.length || accepts && !accepts(entry.value)) continue;
            const original = bits.substring(0, entry.length), replacement = entry.code.toString(2).padStart(entry.length, '0');
            let changes = 0;
            for(let n = 0; n < entry.length; n++) if(original[n] !== replacement[n]) changes++;
            if(changes > 2) continue;
            const score = changes * 32 + Math.abs(entry.length - preferredLength);
            if(!best || score < best.score) best = {...entry,original,replacement,changes,score};
        }
        reader.restore(start);
        if(!best){ reader.restore(failed); throw new Error(reason + '; no valid replacement within two bit changes'); }
        reader.raw(best.length);
        policy.substitutions.push({
            offset:start.bits ? start.byteStart : start.p, bit:start.bits ? 8 - start.bits : 0,
            ...reader.location, reason, originalBits:best.original,replacementBits:best.replacement,
            symbol:best.value,bitChanges:best.changes,rejectedBitLength:preferredLength,replacementBitLength:best.length
        });
        policy.state.uncertain = true;
        return best.value;
    }

    static scanReader(data, offset, state, options, scan){
        const reader = JPEGDecoder.reader(data, offset, options.onSymbol && (value => options.onSymbol(value, offset)));
        if(options.substituteCodewords) reader.repair = {state,substitutions:state.codewordSubstitutions,limit:state.codewordSubstitutionLimit};
        reader.location = {scan};
        return reader;
    }

    static block(reader, component, state, offset){
        const out = component.coefficients;
        const size = reader.symbol(state.huffman[component.dc], value => value <= 11);
        if(size > 11) throw new Error('Invalid DC magnitude');
        component.predictor += reader.receive(size);
        if(component.predictor < -2048 || component.predictor > 2047) throw new Error('DC predictor exceeds baseline range');
        out[offset] = component.predictor;
        let k = 1;
        while(k < 64){
            const rs = reader.symbol(state.huffman[component.ac], value => {
                const run = value >> 4, size = value & 15;
                return size ? size <= 10 && k + run < 64 : run === 0 || run === 15 && k + 16 <= 64;
            }), run = rs >> 4, n = rs & 15;
            if(!n){
                if(!run) break;
                if(run !== 15 || k + 16 > 64) throw new Error('Invalid zero run');
                k += 16; continue;
            }
            k += run;
            if(n > 10 || k >= 64) throw new Error('Invalid AC magnitude or run');
            out[offset + JPEGDecoder.zigzag[k++]] = reader.receive(n);
        }
    }

    static marker(data, p){
        if(data.charCodeAt(p) !== 255) return null;
        while(data.charCodeAt(p) === 255) p++;
        const code = data.charCodeAt(p);
        return Number.isInteger(code) && code !== 0 ? {code, end: p + 1} : null;
    }

    static progressiveHeader(state, content, options){
        const scan = JPEGScan.read(content), ss = scan.sss, se = scan.ess;
        const ah = scan.sabp >> 4, al = scan.sabp & 15;
        if(!scan.ncomponents || scan.ncomponents > state.components.length || content.length !== 4 + 2 * scan.ncomponents ||
            ss > se || se > 63 || (ss === 0 ? se !== 0 : scan.ncomponents !== 1) || ah > 13 || al > 13 || (ah && ah !== al + 1))
            throw new Error('Invalid progressive scan parameters.');
        const ids = new Set();
        state.scan = scan.components.map(s => {
            const c = state.components.find(c => c.id === s.id);
            if(!c || ids.has(c.id) || s.dctn > 3 || s.actn > 3) throw new Error('Invalid progressive scan component selection.');
            ids.add(c.id); c.dc = 'DC' + s.dctn; c.ac = 'AC' + s.actn;
            if(!state.quant[c.q] && options.donor && options.donor.quant[c.q]){
                state.quant[c.q] = options.donor.quant[c.q]; state.log.push('Assumed missing quantization table ' + c.q + ' from the comparison image.');
            }
            // DC refinement is raw bits; AC scans do not require a DC table.
            const keys = ss ? [c.ac] : ah ? [] : [c.dc];
            for(const key of keys) if(!state.huffman[key] && options.donor && options.donor.huffman[key]){
                state.huffman[key] = options.donor.huffman[key]; state.log.push('Assumed missing Huffman table ' + key + ' from the comparison image.');
            }
            if(!state.quant[c.q] || keys.some(key => !state.huffman[key])) throw new Error('A required coding table is missing. Advanced options can explicitly use tables from a comparison image.');
            if(c.quantValues && c.quantValues.some((value, i) => value !== state.quant[c.q][i])) throw new Error('Changing quantization tables within a progressive component is not supported.');
            c.quantValues = state.quant[c.q];
            return c;
        });
        state.spectral = {ss, se, ah, al};
    }

    // T.81 Annex G: spectral selection, EOB runs and successive approximation.
    // Work on a scratch block so an interrupted refinement cannot overwrite earlier detail.
    static progressiveBlock(reader, c, state, out){
        const {ss, se, ah, al} = state.spectral, step = 2 ** al;
        if(ss === 0){
            if(ah) out[0] |= reader.bit() * step;
            else{
                const size = reader.symbol(state.huffman[c.dc], value => value <= 11);
                if(size > 11) throw new Error('Invalid progressive DC magnitude');
                c.predictor += reader.receive(size);
                const value = c.predictor * step;
                if(value < -32768 || value > 32767) throw new Error('Progressive DC coefficient exceeds supported range');
                out[0] = value;
            }
            return;
        }
        const refine = k => {
            const index = JPEGDecoder.zigzag[k], value = out[index];
            if(reader.bit() && !(Math.abs(value) & step)) out[index] += value > 0 ? step : -step;
        };
        let k = ss;
        if(!ah){
            if(state.eobRun){ state.eobRun--; return; }
            while(k <= se){
                const rs = reader.symbol(state.huffman[c.ac], value => {
                    const run = value >> 4, size = value & 15;
                    return size ? size <= 10 && k + run <= se : run === 15 ? k + 16 <= se + 1 : 2 ** run <= reader.remainingMCUs + 1;
                }), run = rs >> 4, size = rs & 15;
                if(!size){
                    if(run !== 15){ state.eobRun = 2 ** run + reader.raw(run) - 1; return; }
                    if(k + 16 > se + 1) throw new Error('Invalid progressive zero run');
                    k += 16;
                }else{
                    k += run;
                    if(size > 10 || k > se) throw new Error('Invalid progressive AC magnitude or run');
                    const value = reader.receive(size) * step;
                    if(value < -32768 || value > 32767) throw new Error('Progressive AC coefficient exceeds supported range');
                    out[JPEGDecoder.zigzag[k++]] = value;
                }
            }
            return;
        }
        if(!state.eobRun){
            while(k <= se){
                const rs = reader.symbol(state.huffman[c.ac], value => {
                    const run = value >> 4, size = value & 15;
                    let zeros = 0;
                    for(let n = k; n <= se; n++) if(!out[JPEGDecoder.zigzag[n]]) zeros++;
                    return size ? size === 1 && run < zeros : run === 15 ? zeros >= 16 : 2 ** run <= reader.remainingMCUs + 1;
                });
                let run = rs >> 4, value = 0;
                const size = rs & 15;
                if(size){
                    if(size !== 1) throw new Error('Invalid progressive AC refinement magnitude');
                    value = reader.bit() ? step : -step;
                }else if(run !== 15){
                    state.eobRun = 2 ** run + reader.raw(run); break;
                }else run = 16;
                // Existing nonzero coefficients consume correction bits, not zero runs.
                while(k <= se){
                    if(out[JPEGDecoder.zigzag[k]]) refine(k);
                    else{
                        if(run === 0) break;
                        run--;
                    }
                    k++;
                    if(!value && run === 0) break;
                }
                if(run || (value && k > se)) throw new Error('Invalid progressive AC refinement run (remaining ' + run + ', position ' + k + ', band end ' + se + ')');
                if(value) out[JPEGDecoder.zigzag[k++]] = value;
            }
        }
        if(state.eobRun){
            for(; k <= se; k++) if(out[JPEGDecoder.zigzag[k]]) refine(k);
            state.eobRun--;
        }
    }

    static async progressiveScans(data, state, options){
        const recover = options.mode !== 'strict', scratch = new Int16Array(64);
        let p = state.offset, ended = false, scanNumber = 0, stopped = false;
        for(const c of state.components){
            c.precision = new Int8Array(64).fill(-1);
            c.damagedBands = new Uint8Array(64);
            c.fullLow = new Uint32Array(c.available.length); c.fullHigh = new Uint32Array(c.available.length);
            c.actualCols = Math.ceil(state.width * c.h / state.maxH / 8);
            c.actualRows = Math.ceil(state.height * c.v / state.maxV / 8);
        }
        try{
            for(; scanNumber < 4096;){
                scanNumber++; state.scans = scanNumber;
                const {ss, se, ah, al} = state.spectral;
                let skipScan = false;
                for(const c of state.scan){
                    if(ss && c.precision[0] < 0) throw new Error('Progressive AC scan precedes its DC scan.');
                    for(let k = ss; k <= se; k++) if(c.precision[k] !== (ah || -1)) throw new Error('Invalid progressive scan order or refinement dependency.');
                    for(let k = ss; k <= se; k++) if(c.damagedBands[k]) skipScan = true;
                }
                const single = state.scan.length === 1, first = state.scan[0];
                const cols = single ? first.actualCols : state.cols;
                const total = single ? cols * first.actualRows : state.total;
                const scanOffset = p;
                const reader = JPEGDecoder.scanReader(data, p, state, options, scanNumber);
                state.components.forEach(c => { c.predictor = 0; }); state.eobRun = 0;
                let expected = 0;
                if(skipScan){
                    state.log.push('Skipped progressive scan ' + scanNumber + ' because it depends on a damaged earlier coefficient band.');
                    reader.p = JPEGDecoder.progressiveBoundary(data, reader.p);
                    for(const c of state.scan) for(let k = ss; k <= se; k++) c.damagedBands[k] = 1;
                }
                for(let mcu = 0; !skipScan && mcu < total; mcu++){
                    if(mcu % 128 === 0){
                        if(options.progress) options.progress(Math.min(69, reader.p / data.length * 70));
                        await JPEGDecoder.pause(options);
                    }
                    try{
                        if(mcu && state.restart && mcu % state.restart === 0){
                            const marker = JPEGDecoder.marker(data, reader.p);
                            if(!marker || marker.code !== 208 + expected) throw new Error('Missing or unexpected progressive restart marker');
                            reader.p = marker.end; reader.bits = 0; expected = (expected + 1) % 8;
                            state.components.forEach(c => { c.predictor = 0; }); state.eobRun = 0;
                        }
                        for(const c of state.scan){
                            for(let v = 0; v < (single ? 1 : c.v); v++) for(let h = 0; h < (single ? 1 : c.h); h++){
                                const index = single ? Math.floor(mcu / cols) * c.cols + mcu % cols :
                                    (Math.floor(mcu / cols) * c.v + v) * c.cols + (mcu % cols) * c.h + h;
                                reader.location = {scan:scanNumber,component:c.id,block:index,mcu};
                                const remaining = Math.min(total - mcu - 1, state.restart ? state.restart - mcu % state.restart - 1 : total);
                                reader.remainingMCUs = remaining;
                                scratch.set(c.coefficients.subarray(index * 64, index * 64 + 64));
                                JPEGDecoder.progressiveBlock(reader, c, state, scratch);
                                if(state.eobRun > remaining) throw new Error('Progressive EOB run exceeds the scan or restart interval');
                                c.coefficients.set(scratch, index * 64);
                                if(ss === 0) c.available[index] = 2;
                                if(al === 0) for(let k = ss; k <= se; k++){
                                    if(k < 32) c.fullLow[index] |= 1 << k;
                                    else c.fullHigh[index] |= 1 << (k - 32);
                                }
                            }
                        }
                    }catch(error){
                        if(!recover) throw new Error(error.message + ' in progressive scan ' + scanNumber + ' at byte ' + reader.p + '.');
                        if(state.events.length < 200) state.events.push({message:error.message + '; retained earlier scans and completed blocks. Dependent refinements will be skipped.',offset:reader.p,scan:scanNumber,firstMCU:mcu,endMCU:total});
                        for(const c of state.scan) for(let k = ss; k <= se; k++) c.damagedBands[k] = 1;
                        // AC damage is local to a band. Other components and DC refinement
                        // can still be read at the next intact scan boundary. DC damage
                        // prevents safe AC reconstruction, so retain the prefix and stop.
                        if(ss === 0) stopped = true;
                        else reader.p = JPEGDecoder.progressiveBoundary(data, reader.p);
                        break;
                    }
                }
                if(stopped) break;
                for(const c of state.scan) for(let k = ss; k <= se; k++) c.precision[k] = al;
                if(options.stopAfterScan === scanOffset){
                    JPEGDecoder.scanEnd(reader); state.exportedScan = scanOffset; ended = true; break;
                }
                p = reader.p;
                if(state.codewordSubstitutions.length && !JPEGDecoder.marker(data, p) && p < data.length){
                    const boundary = JPEGDecoder.progressiveBoundary(data, p);
                    if(state.events.length < 200) state.events.push({message:'Discarded leftover entropy after guessed codewords; resumed at the next scan boundary. Alignment remains uncertain.',offset:p,scan:scanNumber,endOffset:boundary});
                    p = boundary;
                }
                let nextScan = false;
                for(let segments = 0; segments < 4096; segments++){
                    const marker = JPEGDecoder.marker(data, p);
                    if(!marker) throw new Error('Missing or damaged progressive end marker / scan boundary.');
                    if(marker.code === 217){ ended = true; break; }
                    if(![196, 219, 221, 254, 218].includes(marker.code) && !(marker.code >= 224 && marker.code <= 239)) throw new Error('Unsupported marker between progressive scans.');
                    const length = data.charCodeAt(marker.end) * 256 + data.charCodeAt(marker.end + 1), end = marker.end + length;
                    if(!Number.isInteger(length) || length < 2 || end > data.length) throw new Error('Incomplete segment between progressive scans.');
                    const content = data.substring(marker.end + 2, end);
                    if(marker.code === 196 || marker.code === 219){
                        const kind = marker.code === 196 ? 'c4' : 'db';
                        if(!JPEGTable.isValid(kind, content)) throw new Error('Invalid progressive coding table.');
                        for(const table of JPEGTable.read({type:kind,content})){
                            if(kind === 'c4') state.huffman[table.coding + table.id] = JPEGDecoder.huffman(table);
                            else{
                                if(table.precision !== 8) throw new Error('Reconstruction requires 8-bit quantization tables.');
                                state.quant[table.id] = table.values;
                            }
                        }
                    }else if(marker.code === 221){
                        if(length !== 4) throw new Error('Invalid progressive restart interval.');
                        state.restart = data.charCodeAt(marker.end + 2) * 256 + data.charCodeAt(marker.end + 3);
                    }else if(marker.code === 218){
                        JPEGDecoder.progressiveHeader(state, content, options); nextScan = true;
                    }
                    p = end;
                    if(nextScan) break;
                }
                if(ended) break;
                if(!nextScan) throw new Error('Progressive segment limit exceeded.');
            }
            if(!ended && !stopped) throw new Error('Progressive scan limit exceeded.');
        }catch(error){
            if(error.message === 'Cancelled' || !recover) throw error;
            state.events.push({message:error.message + ' Retained available progressive coefficients.',offset:p,scan:scanNumber});
        }
        let partial = false;
        for(const c of state.components){
            for(let i = 0; i < c.available.length; i++) if(c.available[i]){
                c.available[i] = !state.uncertain && !state.codewordSubstitutions.length && c.fullLow[i] === 0xffffffff && c.fullHigh[i] === 0xffffffff ? 1 : 2;
                if(c.available[i] === 2) partial = true;
            }
            delete c.fullLow; delete c.fullHigh;
        }
        // Count frame MCUs with usable DC data in every real block.
        for(let mcu = 0; mcu < state.total; mcu++){
            if(state.components.every(c => {
                for(let v = 0; v < c.v; v++) for(let h = 0; h < c.h; h++){
                    const x = mcu % state.cols * c.h + h, y = Math.floor(mcu / state.cols) * c.v + v;
                    if(x < c.actualCols && y < c.actualRows && !c.available[y * c.cols + x]) return false;
                }
                return true;
            })) state.decoded++;
        }
        if(!ended) state.log.push('The progressive image is incomplete; retained earlier scans and completed blocks. Missing or unfinished detail is marked missing or uncertain.');
        if(partial) state.log.push('Progressive blocks without all 64 coefficients at full precision are uncertain; unavailable detail was left at its earlier approximation.');
    }

    static progressiveBoundary(data, offset){
        for(let p = offset; p < data.length; p++){
            if(data.charCodeAt(p) !== 255) continue;
            const marker = JPEGDecoder.marker(data, p);
            if(marker && !(marker.code >= 208 && marker.code <= 215)) return p;
        }
        return data.length;
    }

    static async pause(options){
        if(options.cancelled && options.cancelled()) throw new Error('Cancelled');
        await new Promise(resolve => setTimeout(resolve, 0));
        if(options.cancelled && options.cancelled()) throw new Error('Cancelled');
    }

    static async baselineScan(data, state, options){
        const recover = options.mode !== 'strict';
        const reader = JPEGDecoder.scanReader(data, state.offset, state, options, 1);
        let mcu = 0, expected = 0, handledBoundary = -1;
        function reset(){ reader.bits = 0; state.components.forEach(c => { c.predictor = 0; }); }
        function record(message, offset, start, end){
            if(state.events.length < 200) state.events.push({message, offset, firstMCU: start, endMCU: end});
        }
        function resync(start, boundary){
            if(!state.restart) return false;
            for(let p = reader.p; p < data.length; p++){
                if(data.charCodeAt(p) !== 255) continue;
                const marker = JPEGDecoder.marker(data, p);
                if(!marker) continue;
                if(marker.code === 217 || marker.code === 218) return false;
                if(marker.code >= 208 && marker.code <= 215){
                    const delta = (marker.code - 208 - expected + 8) % 8;
                    const next = boundary + delta * state.restart;
                    record('Skipped damaged data and resumed at RST' + (marker.code - 208) + '; alignment assumes fewer than eight lost restart intervals.', reader.p, start, Math.min(next, state.total));
                    state.uncertain = true; reader.p = marker.end; mcu = Math.min(next, state.total); handledBoundary = mcu; expected = (marker.code - 207) % 8; reset(); return true;
                }
                // Other marker bytes may be damage. Searching here is explicitly recovery only.
            }
            return false;
        }
        while(mcu < state.total){
            if(mcu % 128 === 0){
                if(options.progress) options.progress(mcu / state.total * 70);
                await JPEGDecoder.pause(options);
            }
            if(mcu && state.restart && mcu % state.restart === 0 && mcu !== handledBoundary){
                const marker = JPEGDecoder.marker(data, reader.p);
                if(marker && marker.code === 208 + expected){ reader.p = marker.end; expected = (expected + 1) % 8; reset(); }
                else{
                    if(!recover) throw new Error('Missing or unexpected restart marker at byte ' + reader.p + '.');
                    if(resync(mcu, mcu)) continue;
                    record('No usable restart marker; the remaining image is missing.', reader.p, mcu, state.total); break;
                }
            }
            const touched = [];
            try{
                for(const c of state.scan){
                    for(let v = 0; v < c.v; v++) for(let h = 0; h < c.h; h++){
                        const index = (Math.floor(mcu / state.cols) * c.v + v) * c.cols + (mcu % state.cols) * c.h + h;
                        reader.location = {scan:1,component:c.id,block:index,mcu};
                        const entry = [c, index, false]; touched.push(entry);
                        JPEGDecoder.block(reader, c, state, index * 64);
                        entry[2] = true; c.available[index] = state.uncertain ? 2 : 1;
                    }
                }
                state.decoded++; mcu++;
            }catch(error){
                touched.forEach(([c, index, complete]) => { if(!complete) c.coefficients.fill(0, index * 64, index * 64 + 64); });
                if(!recover) throw new Error(error.message + ' at byte ' + reader.p + '.');
                const boundary = state.restart ? (Math.floor(mcu / state.restart) + 1) * state.restart : state.total;
                if(resync(mcu, boundary)) continue;
                record(error.message + '; retained completed blocks and stopped.', reader.p, mcu, state.total); break;
            }
        }
        if(options.stopAfterScan === state.offset){
            JPEGDecoder.scanEnd(reader); state.exportedScan = state.offset; return;
        }
        let p = reader.p, ended = false;
        // Trailing metadata may legally follow the last scan. No second image is consumed.
        for(let n = 0; mcu === state.total && p < data.length && n < 4096; n++){
            const marker = JPEGDecoder.marker(data, p);
            if(!marker) break;
            if(marker.code === 217){ ended = true; break; }
            if(marker.code === 218) throw new Error('Multiple baseline scans are not supported by reconstruction.');
            if(!(marker.code === 254 || marker.code >= 224 && marker.code <= 239)) break;
            const len = data.charCodeAt(marker.end) * 256 + data.charCodeAt(marker.end + 1);
            if(!Number.isInteger(len) || len < 2 || marker.end + len > data.length) break;
            p = marker.end + len;
        }
        if(!ended){
            if(!recover) throw new Error('The scan does not finish at a valid end marker.');
            state.log.push(mcu === state.total ? 'All expected blocks decoded; accepted a missing or damaged end marker / trailing scan boundary.' : 'The image is incomplete. Undecoded blocks remain marked as missing.');
        }
    }

    static async decode(data, options = {}){
        if(options.mode === 'strict' && options.donor) throw new Error('Strict decoding cannot assume donor tables.');
        if(options.mode === 'strict' && options.substituteCodewords) throw new Error('Strict decoding cannot substitute codewords.');
        if(options.mode === 'strict' && (options.recoverHeaders || options.assumedFrame)) throw new Error('Strict decoding cannot rebuild missing headers.');
        // Recover mode can restore a start marker from surviving headers without
        // borrowing a missing frame. Donor geometry still needs explicit opt-in.
        const automaticPrefix = options.mode !== 'strict' && !options.recoverHeaders &&
            (data.charCodeAt(0) !== 255 || data.charCodeAt(1) !== 216);
        const state = JPEGDecoder.headers(data, automaticPrefix ? {...options,recoverHeaders:true,assumedFrame:undefined} : options);
        if(state.recovery) state.recovery.automatic=automaticPrefix;
        if(state.decodeData){ data=state.decodeData; delete state.decodeData; }
        state.codewordSubstitutions = [];
        state.codewordSubstitutionLimit = options.maxCodewordSubstitutions === undefined ? 256 : Number(options.maxCodewordSubstitutions);
        if(!Number.isInteger(state.codewordSubstitutionLimit) || state.codewordSubstitutionLimit < 1 || state.codewordSubstitutionLimit > 4096) throw new Error('Choose a codeword substitution limit from 1 to 4,096.');
        const maxPixels = Math.min(16000000, Math.max(1, Number(options.maxPixels) || 8000000));
        if(!state.width || !state.height || state.width * state.height > maxPixels) throw new Error('Image exceeds the ' + maxPixels.toLocaleString('en-US') + '-pixel reconstruction limit, or has missing dimensions.');
        state.maxH = Math.max(...state.components.map(c => c.h)); state.maxV = Math.max(...state.components.map(c => c.v));
        // A one-component scan is non-interleaved, regardless of its sampling fields.
        if(state.components.length === 1) state.components[0].h = state.components[0].v = state.maxH = state.maxV = 1;
        state.cols = Math.ceil(state.width / (state.maxH * 8)); state.rows = Math.ceil(state.height / (state.maxV * 8));
        state.total = state.cols * state.rows; state.decoded = 0; state.events = [];
        if(state.recovery) state.uncertain=true;
        for(const c of state.components){
            c.cols = state.cols * c.h; c.rows = state.rows * c.v;
            c.coefficients = new Int16Array(c.cols * c.rows * 64); c.available = new Uint8Array(c.cols * c.rows);
        }
        if(state.progressive) await JPEGDecoder.progressiveScans(data, state, options);
        else await JPEGDecoder.baselineScan(data, state, options);
        if(state.codewordSubstitutions.length) state.log.push('Guessed ' + state.codewordSubstitutions.length + ' codeword substitution(s), each within two bit changes of a valid table entry. Codeword lengths and later alignment may be wrong. ' + (state.progressive ? 'All available progressive pixels are uncertain.' : 'Available pixels from the first substitution onward are uncertain.'));
        if(options.coefficientsOnly) return state;
        state.assumed = state.log.some(line => line.startsWith('Assumed'));
        state.color = state.components.length === 1 ? 'gray' : state.adobe === 0 || (!state.jfif && state.components.map(c => c.id).join(',') === '82,71,66') ? 'rgb' : 'ycbcr';
        if(state.adobe === 2) throw new Error('YCCK reconstruction is not supported.');
        for(const c of state.components){
            c.plane = new Uint8Array(c.cols * c.rows * 64);
            if(!c.available.some(value => value)) continue;
            const q = new Float64Array(64);
            for(let i = 0; i < 64; i++) q[JPEGDecoder.zigzag[i]] = (c.quantValues || state.quant[c.q])[i];
            for(let by = 0; by < c.rows; by++){
                if(by % 16 === 0) await JPEGDecoder.pause(options);
                for(let bx = 0; bx < c.cols; bx++){
                    const index = by * c.cols + bx;
                    if(c.available[index]) JPEGDecoder.idct(c.coefficients, index * 64, q, c.plane, by * 8 * c.cols * 8 + bx * 8, c.cols * 8);
                }
            }
        }
        if(options.progress) options.progress(100);
        return state;
    }

    static scanEnd(reader){
        const marker = JPEGDecoder.marker(reader.data, reader.p);
        if(!marker || marker.code >= 208 && marker.code <= 215) throw new Error('The decoded scan does not end at a marker boundary.');
        if((reader.value & (2 ** reader.bits - 1)) !== 2 ** reader.bits - 1) throw new Error('Invalid padding bits at the end of the scan.');
    }

    // Symbols remain in entropy order. Amplitude, EOB-run and refinement bits
    // are consumed by the decoder but are not Huffman symbols in this output.
    static async scanSymbols(data, offset, options = {}){
        if(!Number.isInteger(offset) || offset < 0 || offset >= data.length) throw new Error('Invalid scan offset.');
        const limit = Math.min(32 * 1024 * 1024, Math.max(1, Number(options.maxBytes) || 32 * 1024 * 1024));
        const chunks = []; let chunk, count = 0;
        const state = await JPEGDecoder.decode(data, {
            mode:'strict', coefficientsOnly:true, stopAfterScan:offset,
            cancelled:options.cancelled, maxPixels:options.maxPixels,
            onSymbol(value, scanOffset){
                if(scanOffset !== offset) return;
                if(count >= limit) throw new Error('Huffman symbol export exceeds the output limit.');
                if(count % 65536 === 0){ chunk = new Uint8Array(65536); chunks.push(chunk); }
                chunk[count++ % 65536] = value;
            }
        });
        if(state.exportedScan !== offset) throw new Error('The selected scan was not decoded.');
        const bytes = new Uint8Array(count);
        chunks.forEach((part, i) => bytes.set(part.subarray(0, Math.min(part.length, count - i * 65536)), i * 65536));
        return bytes;
    }

    static idct(coefficients, offset, quant, plane, start, stride){
        const work = new Float64Array(64), basis = JPEGDecoder.basis;
        let dcOnly = true;
        for(let k = 1; k < 64; k++) if(coefficients[offset + k]){ dcOnly = false; break; }
        if(dcOnly){
            const value = JPEGDecoder.clamp(128 + coefficients[offset] * quant[0] / 8);
            for(let y = 0; y < 8; y++) plane.fill(value, start + y * stride, start + y * stride + 8);
            return;
        }
        for(let v = 0; v < 8; v++) for(let x = 0; x < 8; x++){
            let sum = 0;
            for(let u = 0; u < 8; u++) sum += basis[x * 8 + u] * coefficients[offset + v * 8 + u] * quant[v * 8 + u];
            work[v * 8 + x] = sum;
        }
        for(let y = 0; y < 8; y++) for(let x = 0; x < 8; x++){
            let sum = 0;
            for(let v = 0; v < 8; v++) sum += basis[y * 8 + v] * work[v * 8 + x];
            plane[start + y * stride + x] = JPEGDecoder.clamp(128 + sum / 4);
        }
    }

    static clamp(n){ return Math.max(0, Math.min(255, Math.round(n))); }

    static async bitmap(state, options = {}){
        const pixels = new Uint8ClampedArray(state.width * state.height * 4), mask = new Uint8Array(state.width * state.height);
        const component = Number.isInteger(options.component) ? options.component : -1;
        if(component >= state.components.length || component < -1) throw new Error('This component is not present in the selected image.');
        const used = component >= 0 ? [state.components[component]] : state.components;
        const color = options.color === 'rgb' || options.color === 'ycbcr' ? options.color : state.color;
        for(let y = 0; y < state.height; y++){
            if(y % 64 === 0) await JPEGDecoder.pause(options);
            for(let x = 0; x < state.width; x++){
                const values = [], index = y * state.width + x;
                let status = state.assumed ? 2 : 1;
                for(const c of used){
                    const cx = Math.floor(x * c.h / state.maxH), cy = Math.floor(y * c.v / state.maxV);
                    const block = Math.floor(cy / 8) * c.cols + Math.floor(cx / 8), available = c.available[block];
                    if(!available) status = 0;
                    else if(available === 2 && status) status = 2;
                    values.push(c.plane[cy * c.cols * 8 + cx]);
                }
                mask[index] = status;
                let rgb;
                if(!status){
                    const fill = options.fill === 'neutral' ? 128 : ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 95 : 45);
                    rgb = [fill, fill, fill];
                }else if(values.length === 1) rgb = [values[0], values[0], values[0]];
                else if(color === 'rgb') rgb = values;
                else{
                    const [luma, cb, cr] = values;
                    rgb = [luma + 1.402 * (cr - 128), luma - .344136 * (cb - 128) - .714136 * (cr - 128), luma + 1.772 * (cb - 128)];
                }
                if(options.overlay && status !== 1) rgb = status ? [255, 175, 35] : [225, 55, 100];
                for(let c = 0; c < 3; c++) pixels[index * 4 + c] = JPEGDecoder.clamp(rgb[c]);
                pixels[index * 4 + 3] = 255;
            }
        }
        return {width: state.width, height: state.height, pixels, mask};
    }

    static bmp(bitmap){
        const stride = Math.ceil(bitmap.width * 3 / 4) * 4;
        const bytes = new Uint8Array(54 + stride * bitmap.height), view = new DataView(bytes.buffer);
        bytes[0] = 66; bytes[1] = 77; view.setUint32(2, bytes.length, true); view.setUint32(10, 54, true);
        view.setUint32(14, 40, true); view.setInt32(18, bitmap.width, true); view.setInt32(22, bitmap.height, true);
        view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, stride * bitmap.height, true);
        for(let y = 0; y < bitmap.height; y++) for(let x = 0; x < bitmap.width; x++){
            const src = (y * bitmap.width + x) * 4, dst = 54 + (bitmap.height - 1 - y) * stride + x * 3;
            bytes[dst] = bitmap.pixels[src + 2]; bytes[dst + 1] = bitmap.pixels[src + 1]; bytes[dst + 2] = bitmap.pixels[src];
        }
        return bytes;
    }
}

JPEGDecoder.zigzag = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
JPEGDecoder.basis = Float64Array.from({length: 64}, (_, i) => (i % 8 ? 1 : Math.SQRT1_2) * Math.cos((2 * Math.floor(i / 8) + 1) * (i % 8) * Math.PI / 16));
