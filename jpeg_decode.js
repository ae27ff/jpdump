


function processJPEG(data){
	var info={
		valid:true,
		filesize:data.length,
		nextp:0,
		headers:[],
		hasextraneous:false,
		extraneous:""
	};
	var jpeg2000=false, frame=null, frameScans=0, scans=0;
	var hasTableStreamData=false, hasSIZ=false, hasSOT=false, hasSOD=false;
	var hierarchy=null, hierarchyState={}, scanState={}, quantTables={}, frameQuant={}, inScan=false, restartInterval=0, restartWidth=2, expectedRestart=0;
	var j2k={siz:null,cod:false,qcd:false,tile:null,tiles:{}};
	var lsPreset=null, lsDimensions=null;
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
			if(['51','52','53','55','57','58','5c','5d','5e','5f','60','61','63','64','90','91','92','93'].indexOf(header.type)!==-1) header.valid=false;
			if(header.type==='f8'){
				var lse=readLSE(header.content);
				if(!lse) header.valid=false;
				else if(lse.id===1) lsPreset=lse;
				else if(lse.id===4) lsDimensions=lse;
				if(frame && frame.type==='f7' && lse && lse.id===4){
					frame.extendeddata.imgw=lse.width;
					frame.extendeddata.imgh=lse.height;
				}
			}
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
				if(frame.type==='f7' && lsDimensions){ frame.extendeddata.imgw=lsDimensions.width; frame.extendeddata.imgh=lsDimensions.height; }
				frameScans=0;
				scanState={};
				frameQuant={};
			}
			if(header.type==='da'){
				if(pendingExpansion) header.valid=false;
				if(frame) frame.lsPreset=lsPreset;
				if(!frame || !validScanComponents(frame,header) || !validScanParameters(frame,header,scanState) || !validScanTables(frame,header,quantTables,frameQuant) ||
					(frame.type!=='f7' && restartWidth!==2)) header.valid=false;
				header.scanCoding=frame && frame.type==='f7' ? 'jpeg-ls' : 'jpeg';
				frameScans++;
				scans++;
				expectedRestart=0;
			}
			if(header.type==='dc'){
				// T.81 B.2.5: DNL terminates the first scan; it does not resume it.
				var beforeDNL=info.headers[info.headers.length-2];
				var followsScan=beforeDNL && (beforeDNL.type==='da' || (hexdec(beforeDNL.type)>=0xd0 && hexdec(beforeDNL.type)<=0xd7));
				var lines=readBigEndian(header.content,0,frame && frame.type==='f7' ? header.content.length : 2);
				if(!frame || frameScans!==1 || !followsScan || header.content.length<2 ||
					(frame.type==='f7' && header.content.length>4) || !lines || (hierarchy && hierarchy.imgh && lines>hierarchy.imgh)) header.valid=false;
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
		if(!header.valid){ info.valid=false; break; }
		if(header.type=="93"){
			var tilePartHeader;
			for(var h=info.headers.length-1;h>=0;h--){
				if(info.headers[h].type==="90"){
					tilePartHeader=info.headers[h];
					break;
				}
			}
			if(tilePartHeader && tilePartHeader.tilePartLength){
				nextp=tilePartHeader.markerp+tilePartHeader.tilePartLength;
				if(nextp<header.nextp || nextp>data.length){
					header.valid=false;
					nextp=data.length;
				}
				else if(scanJPEGEnd(data,header.nextp,nextp)!==nextp){ header.valid=false; info.valid=false; }
			}else{
				nextp=scanJPEGEnd(data,nextp);
			}
		}
		if(header.type=="da") nextp=scanJPEG(data,nextp,header.scanCoding==='jpeg-ls')
		if(hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7) nextp=scanJPEG(data,nextp,frame && frame.type==='f7')//fixed: support restart markers
		if(!jpeg2000 && inScan && nextp===header.nextp){ header.valid=false; info.valid=false; }
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
	}
	if(jpeg2000 ? !hasSIZ || !hasSOT || !hasSOD || !completeJ2K(j2k) :
		(frame ? !completeFrame(frame,scanState) || frame.extendeddata.imgh===0 : !hasTableStreamData || scans!==0 || hierarchy)) info.valid=false;
	if(hierarchy && hierarchy.components.some(function(component){ return !hierarchyState[component.id]; })) info.valid=false;
	if(!jpeg2000 && (pendingExpansion || (hasExtendedDRI && (!frame || frame.type!=='f7')))) info.valid=false;
	info.tableOnly=!jpeg2000 && !frame && hasTableStreamData && info.valid;
	if(jpeg2000 && j2k.siz) info.dimensions={width:j2k.siz.width,height:j2k.siz.height};
	else if(frame) info.dimensions={width:hierarchy ? hierarchy.imgw : frame.extendeddata.imgw,height:hierarchy && hierarchy.imgh || frame.extendeddata.imgh};

	if(info.filesize>info.nextp){
		info.hasextraneous=true
		info.extraneous=data.substring(info.nextp)
	}

	return info;
}

function finalizeHeaderContent(data,header,endp){
	if(!(header.haslen || (hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7))) return;
	header.actuallen=(endp-header.p)-header.markerwidth;
	header.contentlen=header.actuallen;
	if(header.haslenbytes) header.contentlen-=2;
	header.content=data.substr(header.contentp,header.contentlen);
	if(header.actuallen==0) header.contentlen=0;
	if(header.type==="da") header.extendeddata=postprocessSOS(header);
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
		if(typeof frameIndex==='undefined' || selected[component.id] || (frame.type!=='f7' && frameIndex<=last)) return false;
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
		if (marker===0xf7 && sampling!==0x11) return false;
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
		return header
	}


	if(!header.haslenbytes){//J2K-SOD scan's from end of marker with no length bytes (fixed 16-bit)
		header.len='None (Scanned)'
		header.nextp=codep+1
		return header;
	}




	if(codep+2>=data.length){
		header.valid=false;
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
		return header;
	}
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
	if(type==='df') return data.length===1 && (data.charCodeAt(0)>>4)<=1 && (data.charCodeAt(0)&15)<=1;
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
	if((id===2 || id===3) && data.length>=3 && data.charCodeAt(1)!==0 && data.charCodeAt(2)!==0) return {id:id};
	return;
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
		for(var index=36;index<data.length;index+=3) if((data.charCodeAt(index)&127)>37 || !data.charCodeAt(index+1) || !data.charCodeAt(index+2)) return false;
		state.siz={tiles:tiles,width:x-x0,height:y-y0};
	}else if(type==='52'){
		if(!state.siz || data.length<10 || data.charCodeAt(1)>4 || readBigEndian(data,2,2)===0) return false;
		var levels=data.charCodeAt(5);
		if(levels>32 || data.length!==10+((data.charCodeAt(0)&1)?levels+1:0)) return false;
		if(data.charCodeAt(6)>8 || data.charCodeAt(7)>8 || data.charCodeAt(6)+data.charCodeAt(7)>8) return false;
		state.cod=true;
	}else if(type==='5c'){
		if(!state.siz || data.length<2) return false;
		var style=data.charCodeAt(0)&31;
		if(style>2 || (style===1 && data.length!==3) || (style===2 && (data.length-1)%2)) return false;
		state.qcd=true;
	}else if(type==='90'){
		if(!state.siz || !state.cod || !state.qcd || (state.tile && (!state.tile.data || state.tile.tilePartLength===0))) return false;
		var tileId=readBigEndian(data,0,2), part=data.charCodeAt(6), parts=data.charCodeAt(7);
		if(tileId>=state.siz.tiles || (parts && part>=parts)) return false;
		var tile=state.tiles[tileId];
		if(part!==(tile ? tile.seen : 0) || (tile && parts && tile.parts && parts!==tile.parts)) return false;
		if(!tile) tile=state.tiles[tileId]={seen:0,parts:0};
		tile.seen++; if(parts) tile.parts=parts;
		state.tile=header;
	}else if(type==='93'){
		if(!state.tile || state.tile.data) return false;
		state.tile.data=true;
	}else if(type==='d9'){
		header.desc={shortname:'J2K-EOC',longname:'End of Codestream',uses:''};
		if(!state.tile || !state.tile.data) return false;
	}else if(type==='d8' || type==='da' || isSOFMarker(type) || (hexdec(type)>=0xd0 && hexdec(type)<=0xd7)) return false;
	return true;
}

function completeJ2K(state){
	if(!state.siz || Object.keys(state.tiles).length!==state.siz.tiles) return false;
	for(var id in state.tiles) if(state.tiles[id].parts && state.tiles[id].seen!==state.tiles[id].parts) return false;
	return true;
}

