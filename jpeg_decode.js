


function processJPEG(data){
	var info={
		valid:true,
		filesize:data.length,
		nextp:0,
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

	for(var p=0;p<data.length;p++){
		var header=processHeader(data,p,jpeg2000)
		if(p>0){
			var prevheader=info.headers.last();
			finalizeHeaderContent(data,prevheader,p);
			//console.log(p+" "+prevheader.p+" "+prevheader.actuallen)
		}
		info.headers.push(header);

		if((p==0 && (header.type!="d8" && header.type!="4f")) || !header.valid){
			//console.log((p==0 && header.type!="d8"))
			info.valid=false;
			recoverJPEGHeaders(data,info,header,jpeg2000,frame && frame.type==='f7');
			break;
		}
		var nextp=header.nextp
		if(p===0) jpeg2000=header.type==='4f';
		if(p>0 && (header.type==='d8' || header.type==='4f')) header.valid=false;
		if(jpeg2000){
			if(!validJ2KHeader(header,info.headers.length>1 ? info.headers[info.headers.length-2].type : '',j2k)) header.valid=false;
			if(header.type==='51') hasSIZ=true;
			if(header.type==='90') { if(!hasSIZ) header.valid=false; hasSOT=true; }
			if(header.type==='93') { if(!hasSOT) header.valid=false; hasSOD=true; }
		}else{
			if(header.type==='db') readQuantTables(header.content,quantTables);
			if(hexdec(header.type)>=0x02 && hexdec(header.type)<=0xbf) header.valid=false;
			if(header.type==='f8'){
				var lse=readLSE(header.content);
				if(!lse) header.valid=false;
				else if(lse.id===1) lsPreset=lse;
				else if(lse.id===4){
					if(frame && frame.type==='f7' && !applyLSDimensions(frame,lse,frameScans,inScan)) header.valid=false;
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
				if(hierarchy || frame || !validFrameHeader('c3',header.content)) header.valid=false;
				hierarchy=processSOF0(header.content);
			}
			if(header.type==='df'){
				if(!hierarchy || !frame || pendingExpansion) header.valid=false;
				pendingExpansion=true;
			}
			if(header.type==='db' || header.type==='c4' || header.type==='cc' || header.type==='fe' ||
				(hexdec(header.type)>=0xe0 && hexdec(header.type)<=0xef)) hasTableStreamData=true;
			if(isSOFMarker(header.type)){
				if(frame && (!hierarchy || !completeFrame(frame,scanState) || frame.extendeddata.imgh===0)) header.valid=false;
				var differential=(hexdec(header.type) & 4)!==0 && header.type!=='f7';
				if(differential && (!hierarchy || !frame)) header.valid=false;
				if(pendingExpansion && !differential) header.valid=false;
				pendingExpansion=false;
				if(hierarchy && (header.extendeddata.dataprec!==hierarchy.dataprec || header.extendeddata.imgw>hierarchy.imgw ||
					(hierarchy.imgh && header.extendeddata.imgh>hierarchy.imgh))) header.valid=false;
				if(hierarchy && !validHierarchyFrame(header,hierarchy,hierarchyState,differential)) header.valid=false;
				frame=header;
				if(frame.type==='f7'){
					if(lsDimensions && !applyLSDimensions(frame,lsDimensions,0,false)) header.valid=false;
					frame.lsSampleScans=[];
				}
				frameScans=0;
				scanState={};
				frameQuant={};
			}
			if(header.type==='da'){
				if(pendingExpansion) header.valid=false;
				if(frame) { frame.lsPreset=lsPreset; frame.lsTables=lsTables; }
				if(!frame || !validScanComponents(frame,header) || !validScanParameters(frame,header,scanState) || !validScanTables(frame,header,quantTables,frameQuant) ||
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
				var followsScan=beforeDNL && (beforeDNL.type==='da' || (hexdec(beforeDNL.type)>=0xd0 && hexdec(beforeDNL.type)<=0xd7));
				var lines=readBigEndian(header.content,0,frame && frame.type==='f7' ? header.content.length : 2);
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
			var restart=hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7;
			if(restart){
				if(!inScan || !restartInterval || hexdec(header.type)!==0xd0+expectedRestart) header.valid=false;
				expectedRestart=(expectedRestart+1)%8;
			}
			inScan=header.type==='da' || restart;
		}
		if(!header.valid){
			info.valid=false;
			recoverJPEGHeaders(data,info,header,jpeg2000,frame && frame.type==='f7');
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
				nextp=scanJPEGEnd(data,header.nextp);
				if(declaredEnd!==nextp){
					header.valid=false;
					header.truncated=declaredEnd>data.length && nextp===data.length;
				}
			}else{
				nextp=scanJPEGEnd(data,nextp);
			}
			j2k.tile.actualLength=nextp-j2k.tile.markerp;
		}
		if(header.type=="da") nextp=scanJPEG(data,nextp,header.scanCoding==='jpeg-ls')
		if(hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7) nextp=scanJPEG(data,nextp,frame && frame.type==='f7')//fixed: support restart markers
		if(!jpeg2000 && inScan && nextp===header.nextp){ header.valid=false; info.valid=false; }
		if(!header.valid){
			info.valid=false;
			recoverJPEGHeaders(data,info,header,jpeg2000,frame && frame.type==='f7');
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
		var lastheader=info.headers.last();
		if(lastheader.valid && lastheader.nextp<=data.length) finalizeHeaderContent(data,lastheader,data.length);
	}

	if(info.headers.length===0 || info.headers[info.headers.length-1].type!=="d9"){
		info.valid=false;
		info.warnings.push('End marker is missing; the file may be truncated.');
	}
	if(jpeg2000 ? !hasSIZ || !hasSOT || !hasSOD || !completeJ2K(j2k) :
		(frame ? !completeFrame(frame,scanState) || frame.extendeddata.imgh===0 : !hasTableStreamData || scans!==0 || hierarchy)) info.valid=false;
	if(hierarchy && hierarchy.components.some(function(component){ return !hierarchyState[component.id]; })) info.valid=false;
	if(!jpeg2000 && (pendingExpansion || (hasExtendedDRI && (!frame || frame.type!=='f7')))) info.valid=false;
	if(!jpeg2000 && ((frame && frame.type==='f7') || (!frame && info.headers.some(function(header){ return header.type==='f8'; }))) &&
		info.headers.some(function(header){ return !validLSMarker(header.type); })) info.valid=false;
	if(frame && frame.type==='f7' && frame.lsSampleScans.some(function(scan){ return !validLSInterleave(frame.extendeddata,scan); })) info.valid=false;
	if(frame && frame.type!=='f7' && info.headers.some(function(header){ return header.type==='f8'; })) info.valid=false;
	info.tableOnly=!jpeg2000 && !frame && hasTableStreamData && info.valid;
	if(jpeg2000 && j2k.siz) info.dimensions={width:j2k.siz.width,height:j2k.siz.height};
	else if(frame) info.dimensions={width:hierarchy ? hierarchy.imgw : frame.extendeddata.imgw,height:hierarchy && hierarchy.imgh || frame.extendeddata.imgh};

	if(info.filesize>info.nextp){
		info.hasextraneous=true
		info.extraneous=data.substring(info.nextp)
	}

	if(!info.valid && !info.warnings.length) info.warnings.push('The recovered data does not satisfy the supported JPEG structure checks.');
	return info;
}

function recoverJPEGHeaders(data,info,header,jpeg2000,jpegLS){
	info.warnings.push('Structure error at byte '+header.p+'. Available data is retained; later headers are unverified.');
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
				finalizeHeaderContent(data,header,data.length);
			}
			info.unparsed=true;
			break;
		}
		if(header.type==='4f') jpeg2000=true;
		if(jpeg2000 && header.type==='d9') header.desc={shortname:'J2K-EOC',longname:'End of Codestream',uses:''};
		if(header.type==='f7') jpegLS=true;
		else if(isSOFMarker(header.type)) jpegLS=false;
		header.scanCoding=jpegLS ? 'jpeg-ls' : 'jpeg';
		var nextp=header.nextp;
		if(!jpeg2000 && (header.type==='da' || (hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7))) nextp=scanJPEG(data,nextp,jpegLS);
		if(jpeg2000 && header.type==='93') nextp=scanJPEGEnd(data,nextp);
		finalizeHeaderContent(data,header,nextp);
		info.nextp=Math.max(info.nextp,nextp);
		if(header.type==='d9' || nextp>=data.length) break;
		if(nextp<=header.p) { info.unparsed=true; break; }
		header=processHeader(data,nextp,jpeg2000);
		info.headers.push(header);
	}
}

function finalizeHeaderContent(data,header,endp){
	if(!(header.haslen || (hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7))) return;
	header.actuallen=Math.max(0,(endp-header.p)-header.markerwidth);
	header.contentlen=header.actuallen;
	if(header.haslenbytes && !header.incompleteLength) header.contentlen=Math.max(0,header.contentlen-2);
	header.content=data.substr(header.contentp,header.contentlen);
	if(header.actuallen==0) header.contentlen=0;
	if(header.type==="da" && header.hasextendeddata) header.extendeddata=postprocessSOS(header);
}

function readPartialHeader(header){
	if(!header.content.length) return;
	if(isSOFMarker(header.type)){
		header.extendedtype='SOF';
		header.extendeddata=processSOF0(header.content);
	}else if(header.type==='da'){
		header.extendedtype='Scan';
		header.extendeddata=processSOS(header.content);
	}else if(header.type==='e1' && isEXIF(header.content)){
		header.extendedtype='EXIF';
		header.extendeddata={};
	}else return;
		header.hasextendeddata=true;
		header.partial=true;
}


function findMarkerStart(data,ps,jpegLS){
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

function scanJPEGEnd(data,ps,end){
	if(typeof end==='undefined') end=data.length;
	for(var p=ps;p<end;p=findMarkerStart(data,p+1)){
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

function scanJPEG(data,ps,jpegLS){
	return findMarkerStart(data,ps,jpegLS)
}

function isSOFMarker(type){
	var marker=hexdec(type);
	return (marker>=0xc0 && marker<=0xcf && marker!==0xc4 && marker!==0xc8 && marker!==0xcc) || marker===0xf7;
}

function validScanComponents(frame,scan){
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

function validScanParameters(frame,header,state){
	var scan=header.extendeddata, marker=hexdec(frame.type);
	var progressive=(marker&3)===2, lossless=(marker&3)===3;
	var high=scan.sabp>>4, low=scan.sabp&15;
	if(marker===0xf7){
		var maximum=frame.lsPreset && frame.lsPreset.maximum || Math.pow(2,frame.extendeddata.dataprec)-1;
		if(!frame.extendeddata.imgw || maximum>Math.pow(2,frame.extendeddata.dataprec)-1 || scan.ess>2 ||
			(scan.ncomponents===1 ? scan.ess!==0 : scan.ess===0) || high!==0 || low>=frame.extendeddata.dataprec ||
			scan.sss>Math.min(255,Math.floor(maximum/2))) return false;
		if(frame.lsPreset && !validLSPreset(frame.lsPreset,maximum,scan.sss)) return false;
		if(scan.ess===2 && !validLSInterleave(frame.extendeddata,scan)) return false;
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

function completeFrame(frame,state){
	var progressive=(hexdec(frame.type)&3)===2;
	for(var index=0;index<frame.extendeddata.components.length;index++){
		var component=state[frame.extendeddata.components[index].id];
		if(!component || (progressive && typeof component[0]==='undefined')) return false;
	}
	return true;
}

function validFrameHeader(type, content){
	if (content.length<6) return false;
	var count=content.charCodeAt(5);
	if (count<1 || content.length!==6+3*count || (type!=='f7' && hexdec(get2bytes(content,3))===0)) return false;
	var marker=hexdec(type);
	var precision=content.charCodeAt(0);
	var lossless=(marker & 3)===3 || marker===0xf7;
	if (type==='c0' ? precision!==8 : (lossless ? precision<2 || precision>16 : precision!==8 && precision!==12)) return false;
	if ((marker & 3)===2 && count>4) return false;
	var identifiers={};
	for (var index=6; index<content.length; index+=3){
		var id=content.charCodeAt(index);
		var sampling=content.charCodeAt(index+1);
		var horizontal=sampling>>4, vertical=sampling & 15;
		var table=content.charCodeAt(index+2);
		if (identifiers[id] || horizontal<1 || horizontal>4 || vertical<1 || vertical>4 || (lossless ? table!==0 : table>3)) return false;
		identifiers[id]=true;
	}
	return true;
}

function processHeader(data,p,jpeg2000){
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
	var lb=pad(data.charCodeAt(codep).toString(16),2)
	var dlb=data.charCodeAt(codep)
	header.magic=hb
	header.markerwidth=codep-p+1;
	header.markerp=codep-1;
	header.contentp=codep+1;
	header.valid=true;
	header.type=lb;
	//console.log(hb+lb)
	if(!header.valid) return header;
	header.desc=jpeg_headerdump_name(header.type)


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
	hb=pad(data.charCodeAt(codep+1).toString(16),2)
	lb=pad(data.charCodeAt(codep+2).toString(16),2)
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
		readPartialHeader(header);
		return header;
	}
	header.boundaryKnown=true;
	if(header.haslenbytes) header.contentlen=header.len-2

	header.content=data.substr(header.contentp,header.contentlen);//will be revised by processing above
	if(!jpeg2000 && !validTableSegment(header.type,header.content)) { header.valid=false; return header; }
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
	if(isSOFMarker(header.type)){
		if(!validFrameHeader(header.type,header.content)){
			header.valid=false;
			readPartialHeader(header);
			return header;
		}
		header.hasextendeddata=true;
		header.extendedtype="SOF";
		header.extendeddata=processSOF0(header.content);
	}
	if(header.type=='ee'){
		var app14=processAPP14(header.content);
		if (isAPP14Adobe(header.content) && !app14.valid) {
			header.valid=false;
			return header;
		}
		if(app14.valid){
			header.hasextendeddata=true;
			header.extendedtype=app14.type;
			header.extendeddata=app14.info;
		}
	}
	if(header.type=="e0" && isJFIF(header.content)){
		header.hasextendeddata=true;
		header.extendedtype="JFIF";
		header.extendeddata=processJFIF(header.content);
		if(!header.extendeddata.valid) header.valid=false;
	}

	if(header.type=="e1" && isEXIF(header.content)){
		header.hasextendeddata=true;
		header.extendedtype="EXIF";
		header.extendeddata=processEXIF(header.content);
	}
	if(header.type=="da"){//technically by spec. SOS has a header length, but we include the scan data as its content because of jpdump limitations
		if(header.content.length<1 || header.content.charCodeAt(0)<1 || header.content.charCodeAt(0)>4 || header.content.length!==4+2*header.content.charCodeAt(0)){
			header.valid=false;
			readPartialHeader(header);
			return header;
		}
		header.len+=" (Scanned)";
                header.hasextendeddata=true;
                header.extendedtype="Scan";
                header.extendeddata=processSOS(header.content);
	}

	return header
}

function validTableSegment(type,data){
	if(type==='dd') return data.length>=2 && data.length<=4;
	if(type==='df') return data.length===1 && data.charCodeAt(0)!==0 && (data.charCodeAt(0)>>4)<=1 && (data.charCodeAt(0)&15)<=1;
	if(type!=='db' && type!=='c4' && type!=='cc') return true;
	if(data.length===0) return false;
	for(var offset=0;offset<data.length;){
		var descriptor=data.charCodeAt(offset++), kind=descriptor>>4, id=descriptor&15;
		if(type==='db'){
			if(kind>1 || id>3 || offset+64*(kind+1)>data.length) return false;
			for(var item=0;item<64;item++){
				var value=kind ? hexdec(get2bytes(data,offset)) : data.charCodeAt(offset);
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

function readBigEndian(data,offset,size){
	var value=0;
	for(var index=0;index<size;index++) value=value*256+data.charCodeAt(offset+index);
	return value;
}

function readLSE(data){
	if(data.length<1) return;
	var id=data.charCodeAt(0);
	if(id===1){
		if(data.length!==11) return;
		return {id:id,maximum:readBigEndian(data,1,2),t1:readBigEndian(data,3,2),t2:readBigEndian(data,5,2),t3:readBigEndian(data,7,2),reset:readBigEndian(data,9,2)};
	}
	if(id===4){
		var size=data.charCodeAt(1);
		if(size<2 || size>4 || data.length!==2+2*size) return;
		var height=readBigEndian(data,2,size), width=readBigEndian(data,2+size,size);
		if(!width) return;
		return {id:id,width:width,height:height};
	}
	if((id===2 || id===3) && data.length>3 && data.charCodeAt(1)!==0 && data.charCodeAt(2)!==0 &&
		(data.length-3)%data.charCodeAt(2)===0)
		return {id:id,table:data.charCodeAt(1),width:data.charCodeAt(2),entries:(data.length-3)/data.charCodeAt(2)};
	return;
}

function validLSMarker(type){
	var marker=hexdec(type);
	return ['d8','d9','da','dc','dd','f7','f8','fe'].indexOf(type)!==-1 ||
		(marker>=0xd0 && marker<=0xd7) || (marker>=0xe0 && marker<=0xef);
}

function applyLSDimensions(frame,dimensions,scans,followsScan){
	var info=frame.extendeddata;
	if((!info.imgh && (scans>1 || (scans===1 && !followsScan))) || (info.imgw && info.imgw!==dimensions.width) ||
		(info.imgh && info.imgh!==dimensions.height)) return false;
	info.imgw=dimensions.width; info.imgh=dimensions.height;
	return true;
}

function validLSInterleave(frame,scan){
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

function validLSPreset(preset,maximum,near){
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

function validHierarchyFrame(frame,hierarchy,state,differential){
	if(frame.type==='f7') return false;
	var marker=hexdec(frame.type), lossless=(marker&3)===3;
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

function readQuantTables(data,tables){
	for(var offset=0;offset<data.length;){
		var descriptor=data.charCodeAt(offset), size=1+64*((descriptor>>4)+1);
		tables[descriptor&15]=data.substring(offset,offset+size);
		offset+=size;
	}
}

function validScanTables(frame,scan,tables,previous){
	if((hexdec(frame.type)&3)===3 || frame.type==='f7') return true;
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

function validJ2KHeader(header,previous,state){
	var type=header.type, data=header.content;
	if(type==='4f') return true;
	if(previous==='4f' && type!=='51') return false;
	if(state.tile && state.tile.data && type!=='90' && type!=='d9') return false;
	if((state.tile ? ['55','57','60','63'] : ['58','61']).indexOf(type)!==-1 || type==='91' || type==='92') return false;
	if(state.tile && state.tile.part!==0 && ['52','53','5c','5d','5e'].indexOf(type)!==-1) return false;
	var scope=state.tile ? state.tiles[state.tile.tileId].config : state;
	if(type==='51'){
		if(state.siz || previous!=='4f' || data.length<36) return false;
		var count=readBigEndian(data,34,2);
		if(count<1 || count>16384 || data.length!==36+3*count) return false;
		var x=readBigEndian(data,2,4), y=readBigEndian(data,6,4);
		var x0=readBigEndian(data,10,4), y0=readBigEndian(data,14,4);
		var tx=readBigEndian(data,18,4), ty=readBigEndian(data,22,4);
		var tx0=readBigEndian(data,26,4), ty0=readBigEndian(data,30,4);
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
			readBigEndian(data,2,2)===0 || data.charCodeAt(4)>1 || (data.charCodeAt(4) && state.siz.components<3)) return false;
		var coding=readJ2KCoding(data,5,data.charCodeAt(0));
		if(!coding) return false;
		coding.mct=data.charCodeAt(4);
		scope.cod=coding;
	}else if(type==='53'){
		if(!state.siz) return false;
		var size=state.siz.components<257 ? 1 : 2, id=readBigEndian(data,0,size);
		if(data.length<size+6 || id>=state.siz.components || scope.coc[id] || data.charCodeAt(size)>1) return false;
		var coding=readJ2KCoding(data,size+1,data.charCodeAt(size));
		if(!coding) return false;
		scope.coc[id]=coding;
	}else if(type==='5c'){
		if(!state.siz || scope.qcd) return false;
		var quantizer=readJ2KQuantizer(data);
		if(!quantizer) return false;
		scope.qcd=quantizer;
	}else if(type==='5d' || type==='5e'){
		if(!state.siz) return false;
		var size=state.siz.components<257 ? 1 : 2, id=readBigEndian(data,0,size);
		if(id>=state.siz.components) return false;
		if(type==='5d'){
			if(scope.qcc[id]) return false;
			var quantizer=readJ2KQuantizer(data.substring(size));
			if(!quantizer) return false;
			scope.qcc[id]=quantizer;
		}else{
			if(scope.rgn[id] || data.length!==size+2 || data.charCodeAt(size)!==0) return false;
			scope.rgn[id]=true;
		}
	}else if(type==='64'){
		if(data.length<3 || readBigEndian(data,0,2)>1) return false;
	}else if(type==='63'){
		if(state.crg || data.length!==4*state.siz.components) return false;
		state.crg=true;
	}else if(type==='5f'){
		var owner=state.tile || state;
		if(owner.poc || !validJ2KProgressions(data,state.siz.components)) return false;
		if(state.tile && state.tile.part!==0 && !state.tiles[state.tile.tileId].poc) return false;
		owner.poc=true;
		if(state.tile && state.tile.part===0) state.tiles[state.tile.tileId].poc=true;
	}else if(['55','57','58','60','61'].indexOf(type)!==-1){
		if(!validJ2KPointer(header,state)) return false;
	}else if(type==='90'){
		if(!state.siz || !state.cod || !state.qcd || (state.tile && (!state.tile.data || state.tile.tilePartLength===0))) return false;
		if(!state.tile){
			state.plmGroups=validJ2KLengths(state.pointers['57'],1);
			state.ppmGroups=validJ2KLengths(state.pointers['60'],4);
			if(state.plmGroups===false || state.ppmGroups===false) return false;
		}
		var tileId=readBigEndian(data,0,2), part=data.charCodeAt(6), parts=data.charCodeAt(7);
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
		if(!validJ2KQuantizers(state,scope)) return false;
		state.tile.data=true;
	}else if(type==='d9'){
		header.desc={shortname:'J2K-EOC',longname:'End of Codestream',uses:''};
		if(!state.tile || !state.tile.data) return false;
	}else if(type==='d8' || type==='da' || isSOFMarker(type) || (hexdec(type)>=0xd0 && hexdec(type)<=0xd7)) return false;
	return true;
}

function readJ2KCoding(data,offset,style){
	var levels=data.charCodeAt(offset);
	if(levels>32 || data.length!==offset+5+((style&1)?levels+1:0) ||
		data.charCodeAt(offset+1)>8 || data.charCodeAt(offset+2)>8 ||
		data.charCodeAt(offset+1)+data.charCodeAt(offset+2)>8 || data.charCodeAt(offset+3)>63 || data.charCodeAt(offset+4)>1) return;
	if(style&1) for(var index=offset+6;index<data.length;index++)
		if(!(data.charCodeAt(index)&15) || !(data.charCodeAt(index)>>4)) return;
	return {levels:levels,transform:data.charCodeAt(offset+4)};
}

function readJ2KQuantizer(data){
	if(data.length<2) return;
	var style=data.charCodeAt(0)&31, steps=style===0 ? data.length-1 : (data.length-1)/2;
	if(style>2 || steps%1 || (style===1 ? steps!==1 : steps>97 || (steps-1)%3!==0)) return;
	if(style===0) for(var index=1;index<data.length;index++) if(data.charCodeAt(index)&7) return;
	return {style:style,steps:steps};
}

function validJ2KQuantizers(main,tile){
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

function validJ2KProgressions(data,components){
	var size=components<257 ? 1 : 2, stride=5+2*size;
	if(!data.length || data.length%stride) return false;
	for(var offset=0;offset<data.length;offset+=stride){
		var resolution=data.charCodeAt(offset), component=readBigEndian(data,offset+1,size);
		var layers=readBigEndian(data,offset+1+size,2), endResolution=data.charCodeAt(offset+3+size);
		var endComponent=readBigEndian(data,offset+4+size,size) || 256;
		if(resolution>32 || component>(size===1 ? 255 : 16383) || !layers || endResolution<=resolution || endResolution>33 ||
			endComponent<=component || endComponent>16384 || data.charCodeAt(offset+4+2*size)>4) return false;
	}
	return true;
}

function validJ2KPointer(header,state){
	var type=header.type,data=header.content,minimum={'55':4,'57':2,'58':2,'60':5,'61':2};
	if(data.length<minimum[type] || (type==='61' && state.pointers['60'])) return false;
	var owner=state.tile || state, fragments=owner.pointers[type] || (owner.pointers[type]={});
	var index=data.charCodeAt(0);
	if(Object.prototype.hasOwnProperty.call(fragments,index)) return false;
	if(type==='55'){
		var tileSize=(data.charCodeAt(1)>>4)&3, lengthSize=(data.charCodeAt(1)&64)?4:2;
		if((data.charCodeAt(1)&0x8f) || tileSize===3 || (data.length-2)%(tileSize+lengthSize)) return false;
		for(var offset=2;offset<data.length;offset+=tileSize+lengthSize){
			var tile=tileSize ? readBigEndian(data,offset,tileSize) : null;
			var length=readBigEndian(data,offset+tileSize,lengthSize);
			if((tile!==null && (tile>=state.siz.tiles || (tileSize===1 && tile===255))) || length<14) return false;
		}
		fragments[index]={data:data.substring(2),tileSize:tileSize,lengthSize:lengthSize};
	}else{
		if(type==='58' && (data.charCodeAt(data.length-1)&128)) return false;
		fragments[index]=data.substring(1);
	}
	return true;
}

function orderedJ2KFragments(fragments){
	return Object.keys(fragments).sort(function(a,b){ return a-b; }).map(function(index){ return fragments[index]; });
}

function validJ2KLengths(fragments,size){
	if(!fragments) return;
	var parts=orderedJ2KFragments(fragments), groups=0;
	if(size===4){
		// Nppm and its opaque packet-header bytes can span marker segments.
		var data=parts.join(''), offset=0;
		while(offset<data.length){
			if(data.length-offset<4) return false;
			var length=readBigEndian(data,offset,4);
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

function completeJ2K(state){
	if(!state.siz || Object.keys(state.tiles).length!==state.siz.tiles) return false;
	if((typeof state.plmGroups!=='undefined' && state.plmGroups!==state.tileParts.length) ||
		(typeof state.ppmGroups!=='undefined' && state.ppmGroups!==state.tileParts.length)) return false;
	for(var id in state.tiles) if(state.tiles[id].parts && state.tiles[id].seen!==state.tiles[id].parts) return false;
	if(state.pointers['55']){
		var fragments=orderedJ2KFragments(state.pointers['55']), index=0;
		for(var fragment=0;fragment<fragments.length;fragment++){
			var entry=fragments[fragment];
			for(var offset=0;offset<entry.data.length;offset+=entry.tileSize+entry.lengthSize){
				var part=state.tileParts[index], tile=entry.tileSize ? readBigEndian(entry.data,offset,entry.tileSize) : null;
				var length=readBigEndian(entry.data,offset+entry.tileSize,entry.lengthSize);
				if(!part || (tile!==null && tile!==part.tileId) || length!==part.tilePartLength || length!==part.actualLength) return false;
				if(tile===null && (part.tileId!==index || part.part!==0)) return false;
				index++;
			}
		}
		if(index!==state.tileParts.length) return false;
	}
	return true;
}

