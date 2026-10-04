


function processJPEG(data){
        console.log(data);
        console.log(typeof data);
	var info={
		valid:true,
		filesize:data.length,
		nextp:-1,
		headers:[],
		hasextraneous:false,
		extraneous:""
	};

	for(var p=0;p<data.length;p++){
		var header=processHeader(data,p)
		console.log(header)
		if(p>0){
			var prevheader=info.headers.last();
			if(prevheader.haslen || (hexdec(prevheader.type)>=0xd0 && hexdec(prevheader.type)<=0xd7)){//allow content for RST market sections
				console.log("prevtype: "+prevheader.type)
				console.log("prevoffset: "+prevheader.p)
				console.log("nextoffset: "+p)
				prevheader.actuallen=(p-prevheader.p)-prevheader.markerwidth;//exclude the previous marker, not the following marker
				prevheader.contentlen=prevheader.actuallen;
				if(prevheader.haslenbytes){
					prevheader.contentlen-=2;//if we scanned in the data and the header has no length bytes, don't subtract them!
				}
				prevheader.content=data.substr(prevheader.contentp,prevheader.contentlen);
				if(prevheader.actuallen==0) prevheader.contentlen=0
                                
                                if(prevheader.type=="da"){//postprocess scan header
                                    prevheader.extendeddata = postprocessSOS(prevheader);
                                }
                                
			}
			//console.log(p+" "+prevheader.p+" "+prevheader.actuallen)
		}
		info.headers.push(header);

		if((p==0 && (header.type!="d8" && header.type!="4f")) || !header.valid){
			//console.log((p==0 && header.type!="d8"))
			console.log("invalid header at position 0")
			info.valid=false;
			break;
		}
		var nextp=header.nextp
		if(header.type=="93"){
			var tilePartHeader;
			for(var h=info.headers.length-1;h>=0;h--){
				if(info.headers[h].type==="90"){
					tilePartHeader=info.headers[h];
					break;
				}
			}
			if(tilePartHeader && tilePartHeader.tilePartLength){
				nextp=tilePartHeader.p+tilePartHeader.tilePartLength;
				if(nextp<header.nextp || nextp>data.length){
					header.valid=false;
					nextp=data.length;
				}
			}else{
				nextp=scanJPEGEnd(data,nextp);
			}
		}
		if(header.type=="da") nextp=scanJPEG(data,nextp)
		if(hexdec(header.type)>=0xd0 && hexdec(header.type)<=0xd7) nextp=scanJPEG(data,nextp)//fixed: support restart markers
		if(info.nextp<nextp) info.nextp=nextp
		if(header.type=="d9"){
			info.nextp=nextp
			break;
		}

		console.log("advancing position "+p+" -> "+(nextp-1))
		if((nextp-1) < p){
			console.error("error: parsing loop detected")
			break;
		}
		p=nextp-1
	}

	if(info.headers.length===0 || info.headers[info.headers.length-1].type!=="d9"){
		info.valid=false;
	}

	if(info.filesize>info.nextp){
		info.hasextraneous=true
		info.extraneous=data.substring(info.nextp)
	}

	console.log(info)
	return info;
}


function findMarkerStart(data,ps){
	for(var p=ps;p<data.length;p++){
		if(data.charCodeAt(p)!==0xff) continue;
		var codep=p+1;
		while(codep<data.length && data.charCodeAt(codep)===0xff) codep++;
		if(codep>=data.length) return data.length;
		if(data.charCodeAt(codep)===0x00){
			p=codep;
			continue;
		}
		return p;
	}
	return data.length;
}

function scanJPEGEnd(data,ps){
	for(var p=ps;p<data.length;p=findMarkerStart(data,p+1)){
		if(p>=data.length) return data.length;
		if(data.charCodeAt(p)!==0xff) continue;
		var codep=p+1;
		while(codep<data.length && data.charCodeAt(codep)===0xff) codep++;
		var marker=data.charCodeAt(codep);
		if(marker===0xd9 || marker===0x90) return p;
		if(marker===0x91){
			if(codep+2>=data.length) return data.length;
			var sopLength=data.charCodeAt(codep+1)*256+data.charCodeAt(codep+2);
			var sopEnd=codep+1+sopLength;
			if(sopLength<2 || sopEnd>data.length) return data.length;
			p=sopEnd-1;
		}
	}
	return data.length
}

function scanJPEG(data,ps){
	return findMarkerStart(data,ps)
}

function processHeader(data,p){
	var header={valid:true,magic:"00",type:"00",haslen:true,haslenbytes:true,p:p,len:0,actuallen:0,contentp:(p+2),content:"",nextp:(p+2),contentlen:0,desc:{},hasextendeddata:false,extendedtype:"",extendeddata:{},markerwidth:2}
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
	header.contentp=codep+1;
	header.valid=true;
	header.type=lb;
	//console.log(hb+lb)
	if(!header.valid) return header;
	header.desc=jpeg_headerdump_name(header.type)


	header.haslenbytes = header.haslen=(header.type!="4f" && header.type!="d8" && header.type!="d9" && header.type!="01" && !(dlb>=0xd0 && dlb<=0xd7));
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
	//console.log(header.type+header.content+isJFIF(header.content))
	//if(header.type=="c0"){
	if(dlb>=0xc0 && dlb<=0xc3){
		if(header.content.length<6 || header.content.length!==6+3*header.content.charCodeAt(5)){
			header.valid=false;
			return header;
		}
		header.hasextendeddata=true;
		header.extendedtype="SOF";
		header.extendeddata=processSOF0(header.content);
	}
	if(header.type=='ee'){
		var app14=processAPP14(header.content);
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

