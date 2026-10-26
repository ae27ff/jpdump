/**
 * Read frame components and validate frame and scan relationships.
 */
class JPEGFrame{
    static read(data){
        var p=0;
        var sof0={dataprec:"",imgw:0,imgh:0,ncomponents:0,ncomponentsstr:"",components:[]}
        sof0.dataprec=data.length ? data.charCodeAt(p) : '';
        sof0.imgh=data.length>=3 ? BinaryUtils.parseHex(BinaryUtils.wordHex(data,p+1)) : '';
        sof0.imgw=data.length>=5 ? BinaryUtils.parseHex(BinaryUtils.wordHex(data,p+3)) : '';
        sof0.ncomponents=data.length>=6 ? data.charCodeAt(p+5) : 0;
        sof0.ncomponentsstr=data.length>=6 ? JPEGFrame.componentsText(sof0.ncomponents) : 'Unknown (truncated)';
        p=6
        var pe=p+3*sof0.ncomponents
        for(var q=p;q<pe && q+3<=data.length;q+=3){
            sof0.components.push(JPEGFrame.readComponent(data.substr(q,3)));
        }
        return sof0
    }

    static componentsText(ncomponents){
        return ncomponents+(ncomponents===1 ? " component" : " components");
    }

    static readComponent(data){
        var comp={id:0,idstr:"",samplingfactors:0,samplingstr:"",qtablenum:0}
        comp.id=data.charCodeAt(0)
        comp.samplingfactors=data.charCodeAt(1)
        comp.qtablenum=data.charCodeAt(2)
        comp.idstr=JPEGFrame.componentId(comp.id)
        comp.samplingstr=JPEGFrame.samplingText(comp.samplingfactors)
        return comp
    }

    static componentId(id){
        return "ID "+id;
    }

    static samplingText(samp){
        //vertical horizontal
        //0 1 2 3  4 5 6 7
        var sf={v:0,h:0}
        sf.h=(samp&0xF0)>>4;//Sampling factors (1byte) (bit 0-3 vertical., 4-7 horizontal.),
        sf.v= samp&0x0F;
        return samp+" ("+sf.v+" Vertical, "+sf.h+" Horizontal)"
    }

    static isMarker(type){
        var marker=BinaryUtils.parseHex(type);
        return (marker>=0xc0 && marker<=0xcf && marker!==0xc4 && marker!==0xc8 && marker!==0xcc) || marker===0xf7;
    }

    static validScanComponents(frame,scan){
        var identifiers={};
        for(var index=0;index<frame.extendeddata.components.length;index++) identifiers[frame.extendeddata.components[index].id]=index;
        var selected={};
        var last=-1, blocks=0;
        for(var index=0;index<scan.extendeddata.components.length;index++){
            var component=scan.extendeddata.components[index];
            var frameIndex=identifiers[component.id];
            if(typeof frameIndex==='undefined' || selected[component.id] || frameIndex<=last) return false;
            last=frameIndex;
            var sampling=frame.extendeddata.components[frameIndex].samplingfactors;
            blocks+=(sampling>>4)*(sampling&15);
            selected[component.id]=true;
        }
        return frame.type==='f7' || scan.extendeddata.components.length===1 || blocks<=10;
    }

    static validScanParameters(frame,header,state){
        var scan=header.extendeddata, marker=BinaryUtils.parseHex(frame.type);
        var progressive=(marker&3)===2, lossless=(marker&3)===3;
        var high=scan.sabp>>4, low=scan.sabp&15;
        if(marker===0xf7){
            var maximum=frame.lsPreset && frame.lsPreset.maximum || Math.pow(2,frame.extendeddata.dataprec)-1;
            if(!frame.extendeddata.imgw || maximum>Math.pow(2,frame.extendeddata.dataprec)-1 || scan.ess>2 ||
                (scan.ncomponents===1 ? scan.ess!==0 : scan.ess===0) || high!==0 || low>=frame.extendeddata.dataprec ||
                scan.sss>Math.min(255,Math.floor(maximum/2))) return false;
            if(frame.lsPreset && !JPEGLS.validPreset(frame.lsPreset,maximum,scan.sss)) return false;
            if(scan.ess===2 && !JPEGLS.validInterleave(frame.extendeddata,scan)) return false;
            for(var index=0;index<scan.components.length;index++){
                var mapping=scan.components[index].dctn*16+scan.components[index].actn;
                if(low && mapping) return false;
                if(mapping && frame.lsTables && frame.lsTables[mapping] && frame.lsTables[mapping].entries!==maximum+1) return false;
            }
        }else{
            if(scan.ncomponents>4) return false;
            if(progressive){
                if(scan.sss>63 || scan.ess>63 || scan.ess<scan.sss || (scan.sss===0 ? scan.ess!==0 : scan.ncomponents!==1) || high>13 || low>13 || (high && low!==high-1)) return false;
            }else if(lossless){
                if(((marker&4) ? scan.sss!==0 : scan.sss<1 || scan.sss>7) || scan.ess!==0 || high!==0 || low>=frame.extendeddata.dataprec) return false;
            }else if(scan.sss!==0 || scan.ess!==63 || scan.sabp!==0) return false;
        }
        for(var index=0;index<scan.components.length;index++){
            var component=scan.components[index], previous=state[component.id];
            if(marker!==0xf7){
                var maxTable=marker===0xc0 ? 1 : 3;
                if(component.dctn>maxTable || component.actn>maxTable || (lossless && component.actn!==0)) return false;
            }
            if(progressive){
                if(scan.sss && (!previous || typeof previous[0]==='undefined')) return false;
                for(var coefficient=scan.sss;coefficient<=scan.ess;coefficient++){
                    var approximation=previous && previous[coefficient];
                    if(high ? approximation!==high : typeof approximation!=='undefined') return false;
                }
            }else if(previous) return false;
        }
        for(var index=0;index<scan.components.length;index++){
            var id=scan.components[index].id;
            if(progressive){
                if(!state[id]) state[id]={};
                for(var coefficient=scan.sss;coefficient<=scan.ess;coefficient++) state[id][coefficient]=low;
            }else state[id]=true;
        }
        return true;
    }

    static isComplete(frame,state){
        var progressive=(BinaryUtils.parseHex(frame.type)&3)===2;
        for(var index=0;index<frame.extendeddata.components.length;index++){
            var component=state[frame.extendeddata.components[index].id];
            if(!component || (progressive && typeof component[0]==='undefined')) return false;
        }
        return true;
    }

    static isValid(type,content){
        if(content.length<6) return false;
        var count=content.charCodeAt(5);
        if(count<1 || content.length!==6+3*count || (type!=='f7' && BinaryUtils.parseHex(BinaryUtils.wordHex(content,3))===0)) return false;
        var marker=BinaryUtils.parseHex(type);
        var precision=content.charCodeAt(0);
        var lossless=(marker & 3)===3 || marker===0xf7;
        if(type==='c0' ? precision!==8 : (lossless ? precision<2 || precision>16 : precision!==8 && precision!==12)) return false;
        if((marker & 3)===2 && count>4) return false;
        var identifiers={};
        for(var index=6; index<content.length; index+=3){
            var id=content.charCodeAt(index);
            var sampling=content.charCodeAt(index+1);
            var horizontal=sampling>>4, vertical=sampling & 15;
            var table=content.charCodeAt(index+2);
            if(identifiers[id] || horizontal<1 || horizontal>4 || vertical<1 || vertical>4 || (lossless ? table!==0 : table>3)) return false;
            identifiers[id]=true;
        }
        return true;
    }

    static validHierarchyFrame(frame,hierarchy,state,differential){
        if(frame.type==='f7') return false;
        var marker=BinaryUtils.parseHex(frame.type), lossless=(marker&3)===3;
        if(!differential){
            if(typeof state.lossless!=='undefined' && state.lossless!==lossless) return false;
            state.lossless=lossless;
        }else if(state.lossless && !lossless) return false;
        if(marker!==0xc0){
            var arithmetic=(marker&8)!==0;
            if(typeof state.arithmetic!=='undefined' && state.arithmetic!==arithmetic) return false;
            state.arithmetic=arithmetic;
        }
        var allowed={};
        for(var index=0;index<hierarchy.components.length;index++) allowed[hierarchy.components[index].id]=true;
        for(var index=0;index<frame.extendeddata.components.length;index++){
            var id=frame.extendeddata.components[index].id;
            if(!allowed[id] || (differential ? !state[id] || state[id]==='final-lossless' : state[id])) return false;
        }
        for(var index=0;index<frame.extendeddata.components.length;index++) state[frame.extendeddata.components[index].id]=differential && lossless && !state.lossless ? 'final-lossless' : true;
        return true;
    }

    static validScanTables(frame,scan,tables,previous){
        if((BinaryUtils.parseHex(frame.type)&3)===3 || frame.type==='f7') return true;
        for(var index=0;index<scan.extendeddata.components.length;index++){
            var id=scan.extendeddata.components[index].id, component;
            for(var entry=0;entry<frame.extendeddata.components.length;entry++)
            if(frame.extendeddata.components[entry].id===id) component=frame.extendeddata.components[entry];
            var table=tables[component.qtablenum];
            if(!table) continue; // Abbreviated image streams can supply tables externally.
            if(frame.extendeddata.dataprec===8 && (table.charCodeAt(0)>>4)!==0) return false;
            if(previous[id] && previous[id]!==table) return false;
            previous[id]=table;
        }
        return true;
    }
}
