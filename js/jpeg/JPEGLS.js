/**
 * Validate JPEG-LS presets, mapping tables, dimensions and interleaving.
 */
class JPEGLS{
    static readPreset(data){
        if(data.length<1) return;
        var id=data.charCodeAt(0);
        if(id===1){
            if(data.length!==11) return;
            return {id:id,maximum:BinaryUtils.readBigEndian(data,1,2),t1:BinaryUtils.readBigEndian(data,3,2),t2:BinaryUtils.readBigEndian(data,5,2),t3:BinaryUtils.readBigEndian(data,7,2),reset:BinaryUtils.readBigEndian(data,9,2)};
        }
        if(id===4){
            var size=data.charCodeAt(1);
            if(size<2 || size>4 || data.length!==2+2*size) return;
            var height=BinaryUtils.readBigEndian(data,2,size), width=BinaryUtils.readBigEndian(data,2+size,size);
            if(!width) return;
            return {id:id,width:width,height:height};
        }
        if((id===2 || id===3) && data.length>3 && data.charCodeAt(1)!==0 && data.charCodeAt(2)!==0 &&
            (data.length-3)%data.charCodeAt(2)===0)
            return {id:id,table:data.charCodeAt(1),width:data.charCodeAt(2),entries:(data.length-3)/data.charCodeAt(2)};
        return;
    }

    static isMarker(type){
        var marker=BinaryUtils.parseHex(type);
        return ['d8','d9','da','dc','dd','f7','f8','fe'].indexOf(type)!==-1 ||
            (marker>=0xd0 && marker<=0xd7) || (marker>=0xe0 && marker<=0xef);
    }

    static applyDimensions(frame,dimensions,scans,followsScan){
        var info=frame.extendeddata;
        if((!info.imgh && (scans>1 || (scans===1 && !followsScan))) || (info.imgw && info.imgw!==dimensions.width) ||
            (info.imgh && info.imgh!==dimensions.height)) return false;
        info.imgw=dimensions.width; info.imgh=dimensions.height;
        return true;
    }

    static validInterleave(frame,scan){
        var maxH=0,maxV=0,components={};
        for(var index=0;index<frame.components.length;index++){
            var component=frame.components[index];
            maxH=Math.max(maxH,component.samplingfactors>>4); maxV=Math.max(maxV,component.samplingfactors&15);
            components[component.id]=component;
        }
        var width=null,height=null;
        for(var index=0;index<scan.components.length;index++){
            var component=components[scan.components[index].id];
            if(!component) return false;
            var sampling=component.samplingfactors;
            var w=Math.ceil(frame.imgw*(sampling>>4)/maxH), h=Math.ceil(frame.imgh*(sampling&15)/maxV);
            if(width!==null && (width!==w || height!==h)) return false;
            width=w; height=h;
        }
        return true;
    }

    static validPreset(preset,maximum,near){
        function clamp(value,minimum){ return value>maximum || value<minimum ? minimum : value; }
        var factor, t1, t2;
        if(maximum>=128){
            factor=Math.floor((Math.min(maximum,4095)+128)/256);
            t1=clamp(factor+2+3*near,near+1);
            t2=clamp(4*factor+3+5*near,t1);
        }else{
            factor=Math.floor(256/(maximum+1));
            t1=clamp(Math.max(2,Math.floor(3/factor)+3*near),near+1);
            t2=clamp(Math.max(3,Math.floor(7/factor)+5*near),t1);
        }
        return (!preset.t1 || (preset.t1>=near+1 && preset.t1<=maximum)) &&
            (!preset.t2 || (preset.t2>=(preset.t1 || t1) && preset.t2<=maximum)) &&
            (!preset.t3 || (preset.t3>=(preset.t2 || t2) && preset.t3<=maximum)) &&
            (!preset.reset || (preset.reset>=3 && preset.reset<=Math.max(255,maximum)));
    }
}
