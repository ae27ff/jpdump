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

Jfif.Decoder = 
class Decoder{
    constructor(){
        this.pos=0;
    }
    
    static validateSignature(marker){
        switch(marker){
            case Jfif.MARKERS['SOI'].id:
            case Jfif.MARKERS['J2K-SOC'].id:
                return true;
        }
        return false;
    }
    
    async processFile(file){
        var source = new FileWindow(file);
        await Plugins.manager.dispatchEvent('beforeProcessFile',this,file,source);
        var result= await this.processData(source);
        await Plugins.manager.dispatchEvent('afterProcessFile',this,file,source,result);
        
    }
    async processData(source){
       await  Plugins.manager.dispatchEvent('beforeProcessData',this,source);
        var result = new Jfif.DecoderResult(source);
        
        this.pos=0;
        var firstheader = await this.peekHeader(source,this.pos);
        if(!Jfif.Decoder.validateSignature(firstheader.marker))  throw new Jfif.DecoderError("Unknown file signature: 255, "+firstheader.marker);
        
        var headers = [];
        var header = null;
        do{
            header = await this.peekHeader(source,this.pos);
            console.log("FF "+header.marker.toString(16));
            var headerlen = header.getHeaderSize();
            console.log(" "+this.pos+"+"+headerlen+" => "+(this.pos + headerlen)+" (cont)");
            this.pos += headerlen;//advance to beginning of header content
            var contlen = header.getContentLength();
            header.content=await this.getData(source, this.pos, contlen);
            await Plugins.manager.dispatchEvent('afterGetContent',this,source,this.pos,header,header.content);//give plugins a chance to read or modify the header content processing
            
            //console.log(header.content)
            console.log(" "+this.pos+"+"+header.content.length+" => "+(this.pos + header.content.length)+" (next)");
            this.pos += header.content.length;//advance to header directly after content
            headers.push(header);
        }while(header.marker!==Jfif.MARKERS['EOI'].id);
        
        var extraneous = await this.getDataPos(source, this.pos);
        console.log(extraneous);
        

   
        await Plugins.manager.dispatchEvent('afterProcessData',this,source,null);//TODO: result
    }
    
    async getDataPos(source,pos, endpos=null){
        if(endpos===null) endpos = source.realend;
        if(endpos<pos) return new Uint8Array;
        console.log(" getpos "+pos+" "+endpos+" ");
        source.selectPos(pos,endpos);
        var abuffer = await source.getSelectionArrayBuffer();
        //console.log(abuffer);
        var buffer = new Uint8Array(abuffer);
        //console.log(buffer);
        //console.log(" ]");
        return buffer;
    }
    
    async getData(source,pos, length){
        if(length===0) return new Uint8Array;
        //console.log(" get "+pos+" "+length+" [");
        source.selectPos(pos,pos+length-1);
        var abuffer = await source.getSelectionArrayBuffer();
        //console.log(abuffer);
        var buffer = new Uint8Array(abuffer);
        //console.log(buffer);
        //console.log(" ]");
        return buffer;
    }
    
    async peekHeader(source,pos){
        console.log("Peek "+pos)
        var buf = await this.getData(source,pos,Jfif.HEADER_SIZE + Jfif.LENGTH_BYTES_SIZE);
        if(buf[0] !== Jfif.MARKER_PREFIX){
            console.log(buf);
            console.log(buf[0]);
            console.log(buf[1]);
            throw new Jfif.DecoderError("Attempted to decode non-JFIF data at offset "+pos);
        }
        var marker = buf[1];
        var header = new Jfif.Header(marker);
        var len = (buf[2]<<16) | buf[3]; // high byte, low byte -> 16-bit integer

        header.setLengths(len);

        await Plugins.manager.dispatchEvent('peekHeader',this,source,pos,header);
        
        console.log(" len "+header.indicatedLength + " "+header.getHeaderSize());

        return header;
     }
    
};



Plugins.manager.defineEvent('beforeProcessFile');
Plugins.manager.defineEvent('afterProcessFile');
Plugins.manager.defineEvent('beforeProcessData');
Plugins.manager.defineEvent('afterProcessData');
Plugins.manager.defineEvent('afterGetContent');
Plugins.manager.defineEvent('peekHeader');




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
				prevheader.actuallen=(p-prevheader.p)-2;//subtract marker bytes from previous header len - this is differencing the start position of two headers, so it includes marker bytes
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
                header.hasextendeddata=true;
                header.extendedtype="Scan";
                header.extendeddata=processSOS(header.content);
	}

	return header
}

