


function processJPEG(data){
	var info={
		valid:true,
		filesize:data.length,
		nextp:-1,
		headers:[],
		hasextraneous:false,
		extraneous:""
	}

	for(var p=0;p<data.length;p++){
		var header=processHeader(data,p)
		console.log(header)
		if(p>0){
			var prevheader=info.headers.last();
			if(prevheader.haslen || (hexdec(prevheader.type)>=0xd0 && hexdec(prevheader.type)<=0xd7)){//allow content for RST market sections
				console.log("prevtype: "+prevheader.type)
				console.log("prevoffset: "+prevheader.p)
				console.log("nextoffset: "+p)
				prevheader.actuallen=(p-prevheader.p)-2;//subtract marker bytes from previous header len - this is differencing the start position of two headers, so it includes marker bytes
				prevheader.contentlen=prevheader.actuallen;
				if(prevheader.haslenbytes){
					prevheader.contentlen-=2;//if we scanned in the data and the header has no length bytes, don't subtract them!
				}
				prevheader.content=data.substr(prevheader.contentp,prevheader.contentlen)
				if(prevheader.actuallen==0) prevheader.contentlen=0
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
		if(header.type=="93") nextp=scanJPEGEnd(data,nextp);
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

	if(info.filesize>info.nextp){
		info.hasextraneous=true
		info.extraneous=data.substring(info.nextp)
	}

	console.log(info)
	return info;
}

function scanJPEGEnd(data,ps){
	for(p=ps;p<data.length;p++){
		var hb=pad(data.charCodeAt(p).toString(16),2)
		var lb=pad(data.charCodeAt(p+1).toString(16),2)
		var dlb=data.charCodeAt(p+1)
		if(hb=="ff" && lb=="d9" ) return p;//OPTIONAL: && (dlb<0xd0 || dlb>0xd7)  d0-d7 are restart markers, we could ignore during scan
	}
	return p
}

function scanJPEG(data,ps){
	for(p=ps;p<data.length;p++){
		var hb=pad(data.charCodeAt(p).toString(16),2)
		var lb=pad(data.charCodeAt(p+1).toString(16),2)
		var dlb=data.charCodeAt(p+1)
		if(hb=="ff" && lb!="00" ) return p;//OPTIONAL: && (dlb<0xd0 || dlb>0xd7)  d0-d7 are restart markers, we could ignore during scan
	}
	return p
}

function processHeader(data,p){
	var header={valid:true,magic:"00",type:"00",haslen:true,haslenbytes:true,p:p,len:0,actuallen:0,contentp:(p+2),content:"",nextp:(p+2),contentlen:0,desc:{},hasextendeddata:false,extendedtype:"",extendeddata:{}}
	var hb=pad(data.charCodeAt(p).toString(16),2)
	var lb=pad(data.charCodeAt(p+1).toString(16),2)
	var dlb=data.charCodeAt(p+1)
	header.magic=hb
	header.valid=(hb=="ff");
	header.type=lb;
	//console.log(hb+lb)
	if(!header.valid) return header;
	header.desc=jpeg_headerdump_name(header.type)


	header.haslenbytes = header.haslen=(header.type!="4f" && header.type!="d8" && header.type!="d9");//fixed: support restart markers
	if(header.type=="93" || (dlb>=0xd0 && dlb<=0xd7)) header.haslenbytes=false;

	if(!header.haslen){
		header.len='None (No content)'
		return header
	}


	if(!header.haslenbytes){//J2K-SOD scan's from end of marker with no length bytes (fixed 16-bit)
		header.len='None (Scanned)'
		return header;
	}




	header.contentp+=2
	hb=pad(data.charCodeAt(p+2).toString(16),2)
	lb=pad(data.charCodeAt(p+3).toString(16),2)
	header.len=parseInt(hb+lb,16)
	header.nextp+=header.len
	if(header.haslenbytes) header.contentlen=header.len-2

	header.content=data.substr(header.contentp,header.contentlen);//will be revised by processing above
	//console.log(header.type+header.content+isJFIF(header.content))
	//if(header.type=="c0"){
	if(dlb>=0xc0 && dlb<=0xc3){
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
		header.len+=" (Scanned)";
	}

	return header
}

