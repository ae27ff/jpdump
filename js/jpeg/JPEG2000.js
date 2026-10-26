/**
 * Validate raw JPEG 2000 codestream headers and tile parts.
 */
class JPEG2000{
    static validHeader(header,previous,state){
        var type=header.type, data=header.content;
        if(type==='4f') return true;
        if(previous==='4f' && type!=='51') return false;
        if(state.tile && state.tile.data && type!=='90' && type!=='d9') return false;
        if((state.tile ? ['55','57','60','63'] : ['58','61']).indexOf(type)!==-1 || type==='91' || type==='92') return false;
        if(state.tile && state.tile.part!==0 && ['52','53','5c','5d','5e'].indexOf(type)!==-1) return false;
        var scope=state.tile ? state.tiles[state.tile.tileId].config : state;
        if(type==='51'){
            if(state.siz || previous!=='4f' || data.length<36) return false;
            var count=BinaryUtils.readBigEndian(data,34,2);
            if(count<1 || count>16384 || data.length!==36+3*count) return false;
            var x=BinaryUtils.readBigEndian(data,2,4), y=BinaryUtils.readBigEndian(data,6,4);
            var x0=BinaryUtils.readBigEndian(data,10,4), y0=BinaryUtils.readBigEndian(data,14,4);
            var tx=BinaryUtils.readBigEndian(data,18,4), ty=BinaryUtils.readBigEndian(data,22,4);
            var tx0=BinaryUtils.readBigEndian(data,26,4), ty0=BinaryUtils.readBigEndian(data,30,4);
            if(x<=x0 || y<=y0 || !tx || !ty || tx0>x0 || ty0>y0 || tx0+tx<=x0 || ty0+ty<=y0) return false;
            var tiles=Math.ceil((x-tx0)/tx)*Math.ceil((y-ty0)/ty);
            if(tiles>65535) return false;
            var descriptors=[];
            for(var index=36;index<data.length;index+=3){
                if((data.charCodeAt(index)&127)>37 || !data.charCodeAt(index+1) || !data.charCodeAt(index+2)) return false;
                descriptors.push({precision:data.charCodeAt(index)&127,x:data.charCodeAt(index+1),y:data.charCodeAt(index+2)});
            }
            state.siz={tiles:tiles,width:x-x0,height:y-y0,components:count,descriptors:descriptors};
        }else if(type==='52'){
            if(!state.siz || scope.cod || data.length<10 || data.charCodeAt(0)>7 || data.charCodeAt(1)>4 ||
                BinaryUtils.readBigEndian(data,2,2)===0 || data.charCodeAt(4)>1 || (data.charCodeAt(4) && state.siz.components<3)) return false;
            var coding=JPEG2000.readCoding(data,5,data.charCodeAt(0));
            if(!coding) return false;
            coding.mct=data.charCodeAt(4);
            scope.cod=coding;
        }else if(type==='53'){
            if(!state.siz) return false;
            var size=state.siz.components<257 ? 1 : 2, id=BinaryUtils.readBigEndian(data,0,size);
            if(data.length<size+6 || id>=state.siz.components || scope.coc[id] || data.charCodeAt(size)>1) return false;
            var coding=JPEG2000.readCoding(data,size+1,data.charCodeAt(size));
            if(!coding) return false;
            scope.coc[id]=coding;
        }else if(type==='5c'){
            if(!state.siz || scope.qcd) return false;
            var quantizer=JPEG2000.readQuantizer(data);
            if(!quantizer) return false;
            scope.qcd=quantizer;
        }else if(type==='5d' || type==='5e'){
            if(!state.siz) return false;
            var size=state.siz.components<257 ? 1 : 2, id=BinaryUtils.readBigEndian(data,0,size);
            if(id>=state.siz.components) return false;
            if(type==='5d'){
                if(scope.qcc[id]) return false;
                var quantizer=JPEG2000.readQuantizer(data.substring(size));
                if(!quantizer) return false;
                scope.qcc[id]=quantizer;
            }else{
                if(scope.rgn[id] || data.length!==size+2 || data.charCodeAt(size)!==0) return false;
                scope.rgn[id]=true;
            }
        }else if(type==='64'){
            if(data.length<3 || BinaryUtils.readBigEndian(data,0,2)>1) return false;
        }else if(type==='63'){
            if(state.crg || data.length!==4*state.siz.components) return false;
            state.crg=true;
        }else if(type==='5f'){
            if(!JPEG2000.validProgressions(data,state.siz.components)) return false;
            if(state.tile && state.tile.part!==0 && !state.tiles[state.tile.tileId].poc) return false;
            if(state.tile && state.tile.part===0) state.tiles[state.tile.tileId].poc=true;
        }else if(['55','57','58','60','61'].indexOf(type)!==-1){
            if(!JPEG2000.validPointer(header,state)) return false;
        }else if(type==='90'){
            if(!state.siz || !state.cod || !state.qcd || (state.tile && (!state.tile.data || state.tile.tilePartLength===0))) return false;
            if(!state.tile){
                state.plmGroups=JPEG2000.validLengths(state.pointers['57'],1);
                state.ppmGroups=JPEG2000.validLengths(state.pointers['60'],4);
                if(state.plmGroups===false || state.ppmGroups===false) return false;
            }
            var tileId=BinaryUtils.readBigEndian(data,0,2), part=data.charCodeAt(6), parts=data.charCodeAt(7);
            if(tileId>=state.siz.tiles || part>254 || (parts && part>=parts)) return false;
            var tile=state.tiles[tileId];
            if(part!==(tile ? tile.seen : 0) || (tile && parts && tile.parts && parts!==tile.parts)) return false;
            if(!tile) tile=state.tiles[tileId]={seen:0,parts:0,config:{cod:null,qcd:null,coc:{},qcc:{},rgn:{}}};
            tile.seen++; if(parts) tile.parts=parts;
            header.tileId=tileId; header.part=part;
            header.pointers={};
            state.tile=header;
            state.tileParts.push(header);
        }else if(type==='93'){
            if(!state.tile || state.tile.data) return false;
            if(!JPEG2000.validQuantizers(state,scope)) return false;
            state.tile.data=true;
        }else if(type==='d9'){
            header.desc={shortname:'J2K-EOC',longname:'End of Codestream',uses:''};
            if(!state.tile || !state.tile.data) return false;
        }else if(type==='d8' || type==='da' || JPEGFrame.isMarker(type) || (BinaryUtils.parseHex(type)>=0xd0 && BinaryUtils.parseHex(type)<=0xd7)) return false;
        return true;
    }

    static readCoding(data,offset,style){
        var levels=data.charCodeAt(offset);
        if(levels>32 || data.length!==offset+5+((style&1)?levels+1:0) ||
            data.charCodeAt(offset+1)>8 || data.charCodeAt(offset+2)>8 ||
            data.charCodeAt(offset+1)+data.charCodeAt(offset+2)>8 || data.charCodeAt(offset+3)>63 || data.charCodeAt(offset+4)>1) return;
        if(style&1) for(var index=offset+6;index<data.length;index++)
            if(!(data.charCodeAt(index)&15) || !(data.charCodeAt(index)>>4)) return;
        return {levels:levels,transform:data.charCodeAt(offset+4)};
    }

    static readQuantizer(data){
        if(data.length<2) return;
        var style=data.charCodeAt(0)&31, steps=style===0 ? data.length-1 : (data.length-1)/2;
        if(style>2 || steps%1 || (style===1 ? steps!==1 : steps>97 || (steps-1)%3!==0)) return;
        if(style===0) for(var index=1;index<data.length;index++) if(data.charCodeAt(index)&7) return;
        return {style:style,steps:steps};
    }

    static validQuantizers(main,tile){
        if(typeof tile.quantizersValid!=='undefined') return tile.quantizersValid;
        // Many tiles/parts share these defaults; validate each distinct override once.
        var key=JSON.stringify([tile.cod,tile.qcd,tile.coc,tile.qcc]);
        if(Object.prototype.hasOwnProperty.call(main.quantizerCache,key)) return tile.quantizersValid=main.quantizerCache[key];
        for(var id=0;id<main.siz.components;id++){
            // T.800 A.6: tile component > tile default > main component > main default.
            var coding=tile.coc[id] || tile.cod || main.coc[id] || main.cod;
            var quantizer=tile.qcc[id] || tile.qcd || main.qcc[id] || main.qcd;
            if((quantizer.style!==1 && quantizer.steps<1+3*coding.levels) || (coding.transform===1)!==(quantizer.style===0))
                return tile.quantizersValid=main.quantizerCache[key]=false;
            if(id<3 && (tile.cod || main.cod).mct){
                var first=main.siz.descriptors[0], component=main.siz.descriptors[id];
                var firstCoding=tile.coc[0] || tile.cod || main.coc[0] || main.cod;
                if(component.precision!==first.precision || component.x!==first.x || component.y!==first.y || coding.transform!==firstCoding.transform)
                    return tile.quantizersValid=main.quantizerCache[key]=false;
            }
        }
        return tile.quantizersValid=main.quantizerCache[key]=true;
    }

    static validProgressions(data,components){
        var size=components<257 ? 1 : 2, stride=5+2*size;
        if(!data.length || data.length%stride) return false;
        for(var offset=0;offset<data.length;offset+=stride){
            var resolution=data.charCodeAt(offset), component=BinaryUtils.readBigEndian(data,offset+1,size);
            var layers=BinaryUtils.readBigEndian(data,offset+1+size,2), endResolution=data.charCodeAt(offset+3+size);
            var endComponent=BinaryUtils.readBigEndian(data,offset+4+size,size) || 256;
            if(resolution>32 || component>(size===1 ? 255 : 16383) || !layers || endResolution<=resolution || endResolution>33 ||
                endComponent<=component || endComponent>16384 || data.charCodeAt(offset+4+2*size)>4) return false;
        }
        return true;
    }

    static validPointer(header,state){
        var type=header.type,data=header.content,minimum={'55':4,'57':2,'58':2,'60':5,'61':2};
        if(data.length<minimum[type] || (type==='61' && state.pointers['60'])) return false;
        var owner=state.tile || state, fragments=owner.pointers[type] || (owner.pointers[type]={});
        var index=data.charCodeAt(0);
        if(Object.prototype.hasOwnProperty.call(fragments,index)) return false;
        if(type==='55'){
            var tileSize=(data.charCodeAt(1)>>4)&3, lengthSize=(data.charCodeAt(1)&64)?4:2;
            if((data.charCodeAt(1)&0x8f) || tileSize===3 || (data.length-2)%(tileSize+lengthSize)) return false;
            for(var offset=2;offset<data.length;offset+=tileSize+lengthSize){
                var tile=tileSize ? BinaryUtils.readBigEndian(data,offset,tileSize) : null;
                var length=BinaryUtils.readBigEndian(data,offset+tileSize,lengthSize);
                if((tile!==null && (tile>=state.siz.tiles || (tileSize===1 && tile===255))) || length<14) return false;
            }
            fragments[index]={data:data.substring(2),tileSize:tileSize,lengthSize:lengthSize};
        }else{
            if(type==='58' && (data.charCodeAt(data.length-1)&128)) return false;
            fragments[index]=data.substring(1);
        }
        return true;
    }

    static orderedFragments(fragments){
        return Object.keys(fragments).sort(function(a,b){ return a-b; }).map(function(index){ return fragments[index]; });
    }

    static validLengths(fragments,size){
        if(!fragments) return;
        var parts=JPEG2000.orderedFragments(fragments), groups=0;
        if(size===4){
            // Nppm and its opaque packet-header bytes can span marker segments.
            var data=parts.join(''), offset=0;
            while(offset<data.length){
                if(data.length-offset<4) return false;
                var length=BinaryUtils.readBigEndian(data,offset,4);
                offset+=4+length;
                if(offset>data.length) return false;
                groups++;
            }
        }else{
            var remaining=0;
            for(var index=0;index<parts.length;index++){
                var data=parts[index], continuation=false;
                for(var offset=0;offset<data.length;offset++){
                    if(!remaining){ remaining=data.charCodeAt(offset); groups++; continue; }
                    remaining--;
                    continuation=(data.charCodeAt(offset)&128)!==0;
                    if(!remaining && continuation) return false;
                }
                // A group may span markers, but an individual packet length may not.
                if(continuation) return false;
            }
            if(remaining) return false;
        }
        return groups;
    }

    static isComplete(state){
        if(!state.siz || Object.keys(state.tiles).length!==state.siz.tiles) return false;
        if((typeof state.plmGroups!=='undefined' && state.plmGroups!==state.tileParts.length) ||
            (typeof state.ppmGroups!=='undefined' && state.ppmGroups!==state.tileParts.length)) return false;
        for(var id in state.tiles) if(state.tiles[id].parts && state.tiles[id].seen!==state.tiles[id].parts) return false;
        if(state.pointers['55']){
            var fragments=JPEG2000.orderedFragments(state.pointers['55']), index=0;
            for(var fragment=0;fragment<fragments.length;fragment++){
                var entry=fragments[fragment];
                for(var offset=0;offset<entry.data.length;offset+=entry.tileSize+entry.lengthSize){
                    var part=state.tileParts[index], tile=entry.tileSize ? BinaryUtils.readBigEndian(entry.data,offset,entry.tileSize) : null;
                    var length=BinaryUtils.readBigEndian(entry.data,offset+entry.tileSize,entry.lengthSize);
                    if(!part || (tile!==null && tile!==part.tileId) || length!==part.tilePartLength || length!==part.actualLength) return false;
                    if(tile===null && (part.tileId!==index || part.part!==0)) return false;
                    index++;
                }
            }
            if(index!==state.tileParts.length) return false;
        }
        return true;
    }
}
