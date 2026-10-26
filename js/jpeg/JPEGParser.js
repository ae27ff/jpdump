/**
 * Inspect JPEG, JPEG-LS and raw JPEG 2000 structure, retaining recoverable bytes.
 */
class JPEGParser{
    static parse(data,options){
        return JPEGSequence.parse(data,options);
    }

    static recoverPrefix(data){
        const chain = JPEGScan.findHeaderChain(data);
        if(!chain) return null;
        const first = JPEGParser.readHeader(data, chain.start, false);
        const info = {valid:false,filesize:data.length,nextp:chain.start,headers:[first],
            warnings:['The JPEG start marker or earlier headers are missing. Surviving segments are parsed without verifying their original sequence.'],
            hasextraneous:false,extraneous:'',unparsed:true,prefixMissing:true,headerStart:chain.start};
        JPEGParser.recoverHeaders(data,info,first,false,false,true);
        return info;
    }

    static parseImage(data,start){
        var info={
            valid:true,
            filesize:data.length,
            nextp:start,
            headers:[],
            warnings:[],
            hasextraneous:false,
            extraneous:""
        };
        var jpeg2000=false, frame=null, frameScans=0, scans=0;
        var hasTableStreamData=false, hasSIZ=false, hasSOT=false, hasSOD=false;
        var hierarchy=null, hierarchyState={}, scanState={}, quantTables={}, frameQuant={}, inScan=false, restartInterval=0, restartWidth=2, expectedRestart=0;
        var j2k={siz:null,cod:null,qcd:null,coc:{},qcc:{},rgn:{},tile:null,tiles:{},quantizerCache:{},pointers:{},tileParts:[]};
        var lsPreset=null, lsDimensions=null, lsTables={}, lsContinuation=null;
        var hasExtendedDRI=false, pendingExpansion=false;

        for(var p=start;p<data.length;p++){
            var header=JPEGParser.readHeader(data,p,jpeg2000)
            if(p>start){
                var prevheader=info.headers[info.headers.length-1];
                JPEGParser.finalizeContent(data,prevheader,p);
                //console.log(p+" "+prevheader.p+" "+prevheader.actuallen)
            }
            info.headers.push(header);

            if((p===start && (header.type!="d8" && header.type!="4f")) || !header.valid){
                //console.log((p==0 && header.type!="d8"))
                info.valid=false;
                JPEGParser.recoverHeaders(data,info,header,jpeg2000,frame && frame.type==='f7');
                break;
            }
            var nextp=header.nextp
            if(p===start) jpeg2000=header.type==='4f';
            if(p>start && (header.type==='d8' || header.type==='4f')) header.valid=false;
            if(jpeg2000){
                if(!JPEG2000.validHeader(header,info.headers.length>1 ? info.headers[info.headers.length-2].type : '',j2k)) header.valid=false;
                if(header.type==='51') hasSIZ=true;
                if(header.type==='90') { if(!hasSIZ) header.valid=false; hasSOT=true; }
                if(header.type==='93') { if(!hasSOT) header.valid=false; hasSOD=true; }
            }else{
                if(header.type==='db') JPEGTable.readQuantizers(header.content,quantTables);
                if(BinaryUtils.parseHex(header.type)>=0x02 && BinaryUtils.parseHex(header.type)<=0xbf) header.valid=false;
                if(header.type==='f8'){
                    var lse=JPEGLS.readPreset(header.content);
                    if(!lse) header.valid=false;
                    else if(lse.id===1) lsPreset=lse;
                    else if(lse.id===4){
                        if(frame && frame.type==='f7' && !JPEGLS.applyDimensions(frame,lse,frameScans,inScan)) header.valid=false;
                        lsDimensions=lse;
                    }else{
                        if(lse.id===3 && (!lsContinuation || lsContinuation.table!==lse.table || lsContinuation.width!==lse.width)) header.valid=false;
                        else if(lse.id===2) lsTables[lse.table]={width:lse.width,entries:lse.entries};
                        else lsTables[lse.table].entries+=lse.entries;
                        if(lsTables[lse.table] && lsTables[lse.table].entries>65536) header.valid=false;
                        lsContinuation=lse;
                        if(lse.id===2) hasTableStreamData=true;
                    }
                    if(!lse || (lse.id!==2 && lse.id!==3)) lsContinuation=null;
                }else lsContinuation=null;
                if(header.type==='de'){
                    if(hierarchy || frame || !JPEGFrame.isValid('c3',header.content)) header.valid=false;
                    hierarchy=JPEGFrame.read(header.content);
                }
                if(header.type==='df'){
                    if(!hierarchy || !frame || pendingExpansion) header.valid=false;
                    pendingExpansion=true;
                }
                if(header.type==='db' || header.type==='c4' || header.type==='cc' || header.type==='fe' ||
                    (BinaryUtils.parseHex(header.type)>=0xe0 && BinaryUtils.parseHex(header.type)<=0xef)) hasTableStreamData=true;
                if(JPEGFrame.isMarker(header.type)){
                    if(frame && (!hierarchy || !JPEGFrame.isComplete(frame,scanState) || frame.extendeddata.imgh===0)) header.valid=false;
                    var differential=(BinaryUtils.parseHex(header.type) & 4)!==0 && header.type!=='f7';
                    if(differential && (!hierarchy || !frame)) header.valid=false;
                    if(pendingExpansion && !differential) header.valid=false;
                    pendingExpansion=false;
                    if(hierarchy && (header.extendeddata.dataprec!==hierarchy.dataprec || header.extendeddata.imgw>hierarchy.imgw ||
                        (hierarchy.imgh && header.extendeddata.imgh>hierarchy.imgh))) header.valid=false;
                    if(hierarchy && !JPEGFrame.validHierarchyFrame(header,hierarchy,hierarchyState,differential)) header.valid=false;
                    frame=header;
                    if(frame.type==='f7'){
                        if(lsDimensions && !JPEGLS.applyDimensions(frame,lsDimensions,0,false)) header.valid=false;
                        frame.lsSampleScans=[];
                    }
                    frameScans=0;
                    scanState={};
                    frameQuant={};
                }
                if(header.type==='da'){
                    if(pendingExpansion) header.valid=false;
                    if(frame) { frame.lsPreset=lsPreset; frame.lsTables=lsTables; }
                    if(!frame || !JPEGFrame.validScanComponents(frame,header) || !JPEGFrame.validScanParameters(frame,header,scanState) || !JPEGFrame.validScanTables(frame,header,quantTables,frameQuant) ||
                        (frame.type!=='f7' && restartWidth!==2)) header.valid=false;
                    header.scanCoding=frame && frame.type==='f7' ? 'jpeg-ls' : 'jpeg';
                    if(header.valid && frame && frame.type==='f7' && header.extendeddata.ess===2) frame.lsSampleScans.push(header.extendeddata);
                    frameScans++;
                    scans++;
                    expectedRestart=0;
                }
                if(header.type==='dc'){
                    // T.81 B.2.5: DNL terminates the first scan; it does not resume it.
                    var beforeDNL=info.headers[info.headers.length-2];
                    var followsScan=beforeDNL && (beforeDNL.type==='da' || (BinaryUtils.parseHex(beforeDNL.type)>=0xd0 && BinaryUtils.parseHex(beforeDNL.type)<=0xd7));
                    var lines=BinaryUtils.readBigEndian(header.content,0,frame && frame.type==='f7' ? header.content.length : 2);
                    if(!frame || frameScans!==1 || !followsScan ||
                        (frame.type==='f7' ? header.content.length<2 || header.content.length>4 : header.content.length!==2) ||
                        !lines || (hierarchy && hierarchy.imgh && lines>hierarchy.imgh)) header.valid=false;
                    else frame.extendeddata.imgh=lines;
                }
                if(header.type==='dd'){
                    restartWidth=header.content.length;
                    if(restartWidth!==2) hasExtendedDRI=true;
                    restartInterval=0;
                    for(var byte=0;byte<restartWidth;byte++) restartInterval=restartInterval*256+header.content.charCodeAt(byte);
                }
                var restart=BinaryUtils.parseHex(header.type)>=0xd0 && BinaryUtils.parseHex(header.type)<=0xd7;
                if(restart){
                    if(!inScan || !restartInterval || BinaryUtils.parseHex(header.type)!==0xd0+expectedRestart) header.valid=false;
                    expectedRestart=(expectedRestart+1)%8;
                }
                inScan=header.type==='da' || restart;
            }
            if(!header.valid){
                info.valid=false;
                JPEGParser.recoverHeaders(data,info,header,jpeg2000,frame && frame.type==='f7');
                break;
            }
            if(header.type=="93"){
                var tilePartHeader;
                for(var h=info.headers.length-1;h>=0;h--){
                    if(info.headers[h].type==="90"){
                        tilePartHeader=info.headers[h];
                        break;
                    }
                }
                if(tilePartHeader && tilePartHeader.tilePartLength){
                    var declaredEnd=tilePartHeader.markerp+tilePartHeader.tilePartLength;
                    nextp=JPEGScan.findCodestreamEnd(data,header.nextp);
                    if(declaredEnd!==nextp){
                        header.valid=false;
                        header.truncated=declaredEnd>data.length && nextp===data.length;
                    }
                }else{
                    nextp=JPEGScan.findCodestreamEnd(data,nextp);
                }
                j2k.tile.actualLength=nextp-j2k.tile.markerp;
            }
            if(header.type=="da") nextp=JPEGScan.findEnd(data,nextp,header.scanCoding==='jpeg-ls')
            if(BinaryUtils.parseHex(header.type)>=0xd0 && BinaryUtils.parseHex(header.type)<=0xd7) nextp=JPEGScan.findEnd(data,nextp,frame && frame.type==='f7')//fixed: support restart markers
            if(!jpeg2000 && inScan && nextp===header.nextp){ header.valid=false; info.valid=false; }
            if(!header.valid){
                info.valid=false;
                JPEGParser.recoverHeaders(data,info,header,jpeg2000,frame && frame.type==='f7');
                break;
            }
            if(info.nextp<nextp) info.nextp=nextp
            if(header.type=="d9"){
                info.nextp=nextp
                break;
            }

            if((nextp-1) < p){
                console.error("error: parsing loop detected")
                break;
            }
            p=nextp-1
        }
        if(info.headers.length>0){
            var lastheader=info.headers[info.headers.length-1];
            if(lastheader.valid && lastheader.nextp<=data.length) JPEGParser.finalizeContent(data,lastheader,data.length);
        }

        if(info.headers.length===0 || info.headers[info.headers.length-1].type!=="d9"){
            info.valid=false;
            info.warnings.push('End marker is missing; the file may be truncated.');
        }
        if(jpeg2000 ? !hasSIZ || !hasSOT || !hasSOD || !JPEG2000.isComplete(j2k) :
            (frame ? !JPEGFrame.isComplete(frame,scanState) || frame.extendeddata.imgh===0 : !hasTableStreamData || scans!==0 || hierarchy)) info.valid=false;
        if(hierarchy && hierarchy.components.some(function(component){ return !hierarchyState[component.id]; })) info.valid=false;
        if(!jpeg2000 && (pendingExpansion || (hasExtendedDRI && (!frame || frame.type!=='f7')))) info.valid=false;
        if(!jpeg2000 && ((frame && frame.type==='f7') || (!frame && info.headers.some(function(header){ return header.type==='f8'; }))) &&
            info.headers.some(function(header){ return !JPEGLS.isMarker(header.type); })) info.valid=false;
        if(frame && frame.type==='f7' && frame.lsSampleScans.some(function(scan){ return !JPEGLS.validInterleave(frame.extendeddata,scan); })) info.valid=false;
        if(frame && frame.type!=='f7' && info.headers.some(function(header){ return header.type==='f8'; })) info.valid=false;
        info.tableOnly=!jpeg2000 && !frame && hasTableStreamData && info.valid;
        if(jpeg2000 && j2k.siz) info.dimensions={width:j2k.siz.width,height:j2k.siz.height};
        else if(frame) info.dimensions={width:hierarchy ? hierarchy.imgw : frame.extendeddata.imgw,height:hierarchy && hierarchy.imgh || frame.extendeddata.imgh};

        if(!info.valid && !info.warnings.length) info.warnings.push('The recovered data does not satisfy the supported JPEG structure checks.');
        return info;
    }

    static recoverHeaders(data,info,header,jpeg2000,jpegLS,prefixRecovery){
        if(!prefixRecovery) info.warnings.push('Structure error at byte '+header.p+'. Available data is retained; later headers are unverified.');
        while(header){
            header.recovered=true;
            if(header.extendedtype==='SOF' && header.extendeddata.imgw!=='' && header.extendeddata.imgh!=='')
                info.dimensions={width:header.extendeddata.imgw,height:header.extendeddata.imgh};
            if(!header.boundaryKnown){
                header.truncated=!!header.truncated || !!header.incompleteLength;
                if(header.magic!=='ff') header.contentp=header.p;
                header.content=data.substring(Math.min(header.contentp,data.length));
                header.contentlen=header.content.length;
                if(header.magic==='ff'){
                    info.nextp=data.length;
                    JPEGParser.finalizeContent(data,header,data.length);
                }
                info.unparsed=true;
                break;
            }
            if(header.type==='4f') jpeg2000=true;
            if(jpeg2000 && header.type==='d9') header.desc={shortname:'J2K-EOC',longname:'End of Codestream',uses:''};
            if(header.type==='f7') jpegLS=true;
            else if(JPEGFrame.isMarker(header.type)) jpegLS=false;
            header.scanCoding=jpegLS ? 'jpeg-ls' : 'jpeg';
            var nextp=header.nextp;
            if(!jpeg2000 && (header.type==='da' || (BinaryUtils.parseHex(header.type)>=0xd0 && BinaryUtils.parseHex(header.type)<=0xd7))) nextp=JPEGScan.findEnd(data,nextp,jpegLS);
            if(jpeg2000 && header.type==='93') nextp=JPEGScan.findCodestreamEnd(data,nextp);
            JPEGParser.finalizeContent(data,header,nextp);
            info.nextp=Math.max(info.nextp,nextp);
            if(header.type==='d9' || nextp>=data.length) break;
            if(nextp<=header.p) { info.unparsed=true; break; }
            header=JPEGParser.readHeader(data,nextp,jpeg2000);
            info.headers.push(header);
        }
    }

    static finalizeContent(data,header,endp){
        if(!(header.haslen || (BinaryUtils.parseHex(header.type)>=0xd0 && BinaryUtils.parseHex(header.type)<=0xd7))) return;
        header.actuallen=Math.max(0,(endp-header.p)-header.markerwidth);
        header.contentlen=header.actuallen;
        if(header.haslenbytes && !header.incompleteLength) header.contentlen=Math.max(0,header.contentlen-2);
        header.content=data.substr(header.contentp,header.contentlen);
        if(header.actuallen==0) header.contentlen=0;
        if(header.type==="da" && header.hasextendeddata) header.extendeddata=JPEGScan.postprocess(header);
    }

    static readPartialHeader(header){
        if(!header.content.length) return;
        if(JPEGFrame.isMarker(header.type)){
            header.extendedtype='SOF';
            header.extendeddata=JPEGFrame.read(header.content);
        }else if(header.type==='da'){
            header.extendedtype='Scan';
            header.extendeddata=JPEGScan.read(header.content);
        }else if(header.type==='e1' && JPEGExif.matches(header.content)){
            header.extendedtype='EXIF';
            header.extendeddata={};
        }else return;
        header.hasextendeddata=true;
        header.partial=true;
    }

    static readHeader(data,p,jpeg2000){
        var header={valid:true,magic:"00",type:"00",haslen:true,haslenbytes:true,p:p,len:0,actuallen:0,contentp:(p+2),content:"",nextp:(p+2),contentlen:0,desc:{shortname:'Unknown',longname:'Unrecognized marker',uses:''},hasextendeddata:false,extendedtype:"",extendeddata:{},markerwidth:2}
        if(p>=data.length || data.charCodeAt(p)!==0xff){
            header.valid=false;
            return header;
        }
        var codep=p+1;
        while(codep<data.length && data.charCodeAt(codep)===0xff) codep++;
        if(codep>=data.length || data.charCodeAt(codep)===0x00){
            header.valid=false;
            return header;
        }
        var hb="ff"
        var lb=BinaryUtils.pad(data.charCodeAt(codep).toString(16),2)
        var dlb=data.charCodeAt(codep)
        header.magic=hb
        header.markerwidth=codep-p+1;
        header.markerp=codep-1;
        header.contentp=codep+1;
        header.valid=true;
        header.type=lb;
        //console.log(hb+lb)
        if(!header.valid) return header;
        header.desc=JPEGMarkers.get(header.type)

        header.haslenbytes = header.haslen=(header.type!="4f" && header.type!="d8" && header.type!="d9" && header.type!="01" && !(dlb>=0xd0 && dlb<=0xd7) && !(jpeg2000 && dlb>=0x30 && dlb<=0x3f));
        if(header.type=="93" || (dlb>=0xd0 && dlb<=0xd7)) header.haslenbytes=false;

        if(!header.haslen){
            header.len='None (No content)'
            header.nextp=codep+1
            header.boundaryKnown=true;
            return header
        }

        if(!header.haslenbytes){//J2K-SOD scan's from end of marker with no length bytes (fixed 16-bit)
            header.len='None (Scanned)'
            header.nextp=codep+1
            header.boundaryKnown=true;
            return header;
        }

        if(codep+2>=data.length){
            header.valid=false;
            header.incompleteLength=true;
            return header;
        }
        header.contentp=codep+3
        hb=BinaryUtils.pad(data.charCodeAt(codep+1).toString(16),2)
        lb=BinaryUtils.pad(data.charCodeAt(codep+2).toString(16),2)
        header.len=parseInt(hb+lb,16)
        if(!isFinite(header.len) || header.len<2){
            header.valid=false;
            return header;
        }
        header.nextp=codep+1+header.len
        if(header.nextp>data.length){
            header.valid=false;
            header.truncated=true;
            header.content=data.substring(header.contentp);
            header.contentlen=header.content.length;
            JPEGParser.readPartialHeader(header);
            return header;
        }
        header.boundaryKnown=true;
        if(header.haslenbytes) header.contentlen=header.len-2

        header.content=data.substr(header.contentp,header.contentlen);//will be revised by processing above
        if(!jpeg2000 && !JPEGTable.isValid(header.type,header.content)) { header.valid=false; return header; }
        if(header.type==="90"){
            if(header.content.length!==8){
                header.valid=false;
                return header;
            }
            header.tilePartLength=header.content.charCodeAt(2)*0x1000000+
                header.content.charCodeAt(3)*0x10000+
                header.content.charCodeAt(4)*0x100+
                header.content.charCodeAt(5);
            if(header.tilePartLength!==0 && header.tilePartLength<14){
                header.valid=false;
                return header;
            }
        }
        if(jpeg2000) return header;
        //console.log(header.type+header.content+isJFIF(header.content))
        //if(header.type=="c0"){
        if(JPEGFrame.isMarker(header.type)){
            if(!JPEGFrame.isValid(header.type,header.content)){
                header.valid=false;
                JPEGParser.readPartialHeader(header);
                return header;
            }
            header.hasextendeddata=true;
            header.extendedtype="SOF";
            header.extendeddata=JPEGFrame.read(header.content);
        }
        if(header.type=='ee'){
            var app14=JPEGAdobe.read(header.content);
            if(JPEGAdobe.matches(header.content) && !app14.valid) {
                header.valid=false;
                return header;
            }
            if(app14.valid){
                header.hasextendeddata=true;
                header.extendedtype=app14.type;
                header.extendeddata=app14.info;
            }
        }
        if(header.type=="e0" && JPEGJFIF.matches(header.content)){
            header.hasextendeddata=true;
            header.extendedtype="JFIF";
            header.extendeddata=JPEGJFIF.read(header.content);
            if(!header.extendeddata.valid) header.valid=false;
        }

        if(header.type=="e1" && JPEGExif.matches(header.content)){
            header.hasextendeddata=true;
            header.extendedtype="EXIF";
            header.extendeddata=JPEGExif.read(header.content);
        }
        if(header.type=="da"){//technically by spec. SOS has a header length, but we include the scan data as its content because of jpdump limitations
            if(header.content.length<1 || header.content.charCodeAt(0)<1 || header.content.charCodeAt(0)>4 || header.content.length!==4+2*header.content.charCodeAt(0)){
                header.valid=false;
                JPEGParser.readPartialHeader(header);
                return header;
            }
            header.len+=" (Scanned)";
            header.hasextendeddata=true;
            header.extendedtype="Scan";
            header.extendeddata=JPEGScan.read(header.content);
        }

        return header
    }
}
