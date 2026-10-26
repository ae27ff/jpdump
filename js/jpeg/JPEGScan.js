/*
 * Copyright (C) 2019 crashdemons (crashenator at gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Read scan headers and locate the boundaries of stored coded data.
 */
class JPEGScan{
    static componentId(id){
        return "ID "+id;
    }

    static componentsText(ncomponents){
        return ncomponents+(ncomponents===1 ? " component in scan" : " components in scan");
    }

    static read(data){
        var sos = {ncomponents:0, ncomponentsstr:"", components:[], sss:0, ess:0, sabp:0, hcdata:""};
        var p=0;
        //thanks to DCube Software Technologies for overview: http://vip.sugovica.hu/Sardi/kepnezo/JPEG%20File%20Layout%20and%20Format.htm
        //Length                        2 bytes      This must be equal to 6+2*(number of components in scan).
        //sos.scanlen = hexdec( get2bytes(data,p));
        p=-2;// the above line is an oversight, the scan length decoded here is the same as the *header length* we decode before we get here, so our next header at
        //    p+2 actually needs to be at 0

        //Number of Components in scan  1 byte        This must be >= 1 and <=4 (otherwise error), usually 1 or 3
        sos.ncomponents = data.length ? data.charCodeAt(p+2) : 0;
        sos.ncomponentsstr=JPEGScan.componentsText(sos.ncomponents);
        p+=3;//advance to beginning of component section [this was p=0 so this could just be p=3]

        //Each component                2 bytes      For each component, read 2 bytes. It contains,
        for(var i=0;i<sos.ncomponents && p+2<=data.length;i++){
            var component={id:0,idstr:"",actn:0,dctn:0};
            // 1 byte   Component Id (refer to the frame component identifiers),
            component.id=data.charCodeAt(p);
            component.idstr = JPEGScan.componentId(component.id);
            //  1 byte   Huffman table to use :
            var ht = data.charCodeAt(p+1);
            //     bit 0..3 : AC table (0..3)
            component.actn = ht&(0xF);
            //     bit 4..7 : DC table (0..3)
            component.dctn = (ht>>4)&(0xF);
            sos.components.push(component);
            p+=2;//advance for next component position or next field
        }

        //"Ignorable Bytes"               3 bytes      We have to skip 3 bytes.
        // the ignorable bytes are actually (courtesy NTUEE http://lad.dsc.ufcg.edu.br/multimidia/jpegmarker.pdf )
        //    Start of spectral/predictor selection   1 byte
        p=1+2*sos.ncomponents;
        sos.sss=p<data.length ? data.charCodeAt(p) : '';
        //    End of spectral selection               1 byte
        sos.ess=p+1<data.length ? data.charCodeAt(p+1) : '';
        // successive approximate bit positions:  1 byte
        //    Successive approx. high bit position    4 bits
        //    Successive approx. low bit position     4 bits   (or point transform)
        sos.sabp = p+2<data.length ? data.charCodeAt(p+2) : '';
        p+=3;//advance to data after fields

        sos.hcdata=data.substring(p);//blank because we didn't scan yet - see postprocess

        return sos;
    }

    static unstuff(data){
        return data.replace(/\xff\x00/g,'\xff');
    }

    // Strong evidence for a JPEG suffix: complete, adjacent header segments
    // followed by a plausible SOS. A lone marker byte sequence is insufficient.
    static headerChain(data, start, allowScanOnly = false){
        const segments = [];
        let p = start, frame = null, evidence = false;
        for(let count = 0; count < 4096 && p - start <= 8 * 1024 * 1024; count++){
            if(data.charCodeAt(p) !== 255) return null;
            let codep = p + 1;
            while(data.charCodeAt(codep) === 255) codep++;
            const code = data.charCodeAt(codep);
            if(![192,194,196,218,219,221,254].includes(code) && !(code >= 224 && code <= 239)) return null;
            const length = data.charCodeAt(codep + 1) * 256 + data.charCodeAt(codep + 2), end = codep + 1 + length;
            if(!Number.isInteger(length) || length < 2 || end > data.length) return null;
            const content = data.substring(codep + 3, end);
            if(code === 196 || code === 219){
                if(!JPEGTable.isValid(code === 196 ? 'c4' : 'db', content)) return null;
                evidence = true;
            }else if(code === 192 || code === 194){
                if(frame || !JPEGFrame.isValid(code.toString(16), content)) return null;
                frame = {marker:code,content}; evidence = true;
            }else if(code === 221 && content.length !== 2) return null;
            const segment = {start:p,end,marker:code,content}; segments.push(segment);
            if(code === 218){
                const scan = JPEGScan.read(content), ah = scan.sabp >> 4, al = scan.sabp & 15;
                if(!scan.ncomponents || scan.ncomponents > 3 || content.length !== 4 + 2 * scan.ncomponents ||
                    new Set(scan.components.map(c => c.id)).size !== scan.ncomponents ||
                    scan.components.some(c => c.dctn > 3 || c.actn > 3) ||
                    scan.sss > scan.ess || scan.ess > 63 || ah > 13 || al > 13 || ah && ah !== al + 1 ||
                    (scan.sss ? scan.ncomponents !== 1 : scan.ess !== 0 && scan.ess !== 63)) return null;
                if(!evidence && !allowScanOnly) return null;
                return {start,end,segments,frame,scan};
            }
            p = end;
        }
        return null;
    }

    static findHeaderChain(data, allowScanOnly = false){
        const limit = Math.min(data.length, 8 * 1024 * 1024);
        let p = 0, attempts = 0;
        while(p < limit && attempts < 256){
            p = data.indexOf('\xff', p); if(p < 0 || p >= limit) break;
            const code = data.charCodeAt(p + 1);
            if([192,194,196,218,219,221,254].includes(code) || code >= 224 && code <= 239){
                attempts++;
                const chain = JPEGScan.headerChain(data, p, allowScanOnly);
                if(chain) return chain;
            }
            p++;
        }
        return null;
    }

    static postprocess(header){
        var prefix_length = 1;//ncomponents field
        var components_length = 2*(header.extendeddata.ncomponents); //each component data
        var suffix_length = 3;//extra sos data fields after components

        var sos_header_length = prefix_length +  components_length + suffix_length;

        header.extendeddata.hcdata=header.content.substring(sos_header_length);

        //If the huffman coding scheme needed to write a 0xFF byte, then it writes a 0xFF followed by a 0x00 -- a process known as adding a stuff byte.
        //https://www.impulseadventure.com/photo/jpeg-huffman-coding.html
        header.extendeddata.scanCoding = header.scanCoding || 'jpeg';
        // JPEG-LS stuffs one bit, not a complete byte. Preserve its encoded bytes.
        if(header.extendeddata.scanCoding!=='jpeg-ls') header.extendeddata.hcdata = JPEGScan.unstuff(header.extendeddata.hcdata);

        return header.extendeddata;
    }

    static findMarkerStart(data,ps,jpegLS){
        for(var p=ps;p<data.length;p++){
            if(data.charCodeAt(p)!==0xff) continue;
            var codep=p+1;
            while(codep<data.length && data.charCodeAt(codep)===0xff) codep++;
            if(codep>=data.length) return data.length;
            if(jpegLS ? data.charCodeAt(codep)<0x80 : data.charCodeAt(codep)===0x00){
                p=codep;
                continue;
            }
            return p;
        }
        return data.length;
    }

    static findCodestreamEnd(data,ps,end){
        if(typeof end==='undefined') end=data.length;
        for(var p=ps;p<end;p=JPEGScan.findMarkerStart(data,p+1)){
            if(p>=data.length) return data.length;
            if(data.charCodeAt(p)!==0xff) continue;
            var codep=p+1;
            while(codep<data.length && data.charCodeAt(codep)===0xff) codep++;
            var marker=data.charCodeAt(codep);
            if(marker>=0x90 && marker!==0x91 && marker!==0x92) return p;
            if(marker===0x91){
                if(codep+2>=data.length) return data.length;
                var sopLength=data.charCodeAt(codep+1)*256+data.charCodeAt(codep+2);
                var sopEnd=codep+1+sopLength;
                if(sopLength!==4 || sopEnd>end) return data.length;
                p=sopEnd-1;
            }
        }
        return end;
    }

    static findEnd(data,ps,jpegLS){
        return JPEGScan.findMarkerStart(data,ps,jpegLS)
    }
}
