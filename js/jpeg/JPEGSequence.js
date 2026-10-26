/**
 * Inspect adjacent raw JPEG-family streams without guessing container boundaries.
 */
class JPEGSequence{
    static isSequenceFile(name){
        return /\.(mjpg|mjpeg)$/i.test(name || '');
    }

    static signature(data,start){
        if(data.charCodeAt(start)!==0xff) return '';
        var p=start+1;
        while(data.charCodeAt(p)===0xff) p++;
        return data.charCodeAt(p)===0xd8 ? 'jpeg' : data.charCodeAt(p)===0x4f ? 'j2k' : '';
    }

    static imageFormat(info){
        var first=info.headers[0];
        if(!first || first.magic!=='ff') return 'Unrecognized format';
        if(first.type==='4f') return 'JPEG 2000 codestream';
        if(info.prefixMissing) return 'JPEG (recovered prefix)';
        if(first.type!=='d8') return 'Unrecognized format';
        return info.headers.some(function(h){ return h.type==='f7'; }) ? 'JPEG-LS' : 'JPEG';
    }

    static parse(data,options){
        var images=[], start=0, image, prefixRecovered=false, recoveredImage=null;
        // A cut or damaged file prefix is not evidence that everything following
        // it is junk. Resume only at an SOI whose complete marker walk still finds
        // a valid frame and scan; the skipped bytes remain visible as unparsed.
        if(!JPEGSequence.signature(data,0)){
            var attempts=0, searchEnd=Math.min(data.length,8*1024*1024);
            for(var candidate=1;candidate+1<searchEnd && attempts<256;candidate++){
                if(data.charCodeAt(candidate)!==0xff || JPEGSequence.signature(data,candidate)!=='jpeg') continue;
                attempts++;
                var probe=JPEGParser.parseImage(data,candidate);
                var frame=probe.headers.some(function(header){ return header.valid && (header.type==='c0'||header.type==='c2'); });
                var scan=probe.headers.some(function(header){ return header.valid && header.type==='da'; });
                var corrupt=probe.headers.some(function(header){ return !header.valid; });
                if(frame && scan && !corrupt){ start=candidate; prefixRecovered=true; break; }
            }
            if(!prefixRecovered){
                recoveredImage=JPEGParser.recoverPrefix(data);
                prefixRecovered=!!recoveredImage;
            }
        }
        do{
            // Offsets remain relative to the original file. Do not copy the
            // remaining video or retain a trailing substring for every image.
            image=recoveredImage || JPEGParser.parseImage(data,start);
            recoveredImage=null;
            image.start=start;
            image.end=Math.min(data.length,image.nextp);
            image.filesize=image.end-start;
            image.format=JPEGSequence.imageFormat(image);
            var index=images.length;
            image.headers.forEach(function(header){ header.imageIndex=index; });
            images.push(image);
            if(!options || options.sequence!==true || !image.valid || image.end<=start) break;
            start=image.end;
        }while(JPEGSequence.signature(data,start));

        var info=Object.assign({},images[0]);
        info.images=images;
        info.filesize=data.length;
        info.nextp=image.end;
        info.end=image.end;
        info.valid=!prefixRecovered && images.every(function(part){ return part.valid; });
        info.unparsed=prefixRecovered || images.some(function(part){ return part.unparsed; });
        info.tableOnly=images.every(function(part){ return part.tableOnly; });
        info.headers=[];
        info.warnings=[];
        images.forEach(function(part,index){
            part.headers.forEach(function(header){ info.headers.push(header); });
            part.warnings.forEach(function(warning){ info.warnings.push((images.length>1 ? 'Image '+(index+1)+': ' : '')+warning); });
            if(!info.dimensions && part.dimensions) info.dimensions=part.dimensions;
        });
        info.mixedDimensions=images.some(function(part){
            return part.dimensions && info.dimensions &&
                (part.dimensions.width!==info.dimensions.width || part.dimensions.height!==info.dimensions.height);
        });
        if(images.length>1){
            var sameFormat=images.every(function(part){ return part.format===images[0].format; });
            info.format=!sameFormat ? 'JPEG-family sequence' : images[0].format==='JPEG' ?
                (images.some(function(part){ return part.tableOnly; }) ? 'JPEG abbreviated stream sequence' : 'MJPEG / JPEG sequence') : images[0].format+' sequence';
        }
        info.hasextraneous=data.length>info.nextp;
        info.extraneous=data.substring(info.nextp);
        const prefixEnd=images[0].prefixMissing ? images[0].headerStart : images[0].start;
        if(prefixRecovered && prefixEnd) info.warnings.unshift('Unverified prefix bytes (0–'+(prefixEnd-1)+') precede recovered JPEG segments.');
        info.prefixRecovered=prefixRecovered;
        if(prefixRecovered) info.prefixRange=[0,prefixEnd];
        return info;
    }
}
