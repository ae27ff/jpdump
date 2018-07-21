
function jpeg_headerdump_name_repl(hex,desc,test,original){
	if(test===hex) return {shortname:desc[0],longname:desc[1],uses:desc[2]};
	return original;
}
function jpeg_headerdump_name_replN(min,max,diff,desc,test,original){
//console.log(original)
	for(n=min;n<=max;n++){
		intermediate=jpeg_headerdump_name_repl(dechex2x(n),desc,test,original);
		//console.log(intermediate)
		intermediate.shortname=intermediate.shortname.replace("%N%",n-diff);
		intermediate.longname=intermediate.longname.replace("%N%",n-diff);
		original=intermediate;
	}
	return original;
}
function jpeg_headerdump_name(header){
	out={shortname:"",longname:"Unknown",uses:""};

	out=jpeg_headerdump_name_repl("4f",["J2K-SOC","Start of Codestream","JPEG2000 Data"],header,out);

	out=jpeg_headerdump_name_replN(0xc0,0xc3,0xc0,["SOF%N%","Start of DCT Frame %N%",""],header,out);
	out=jpeg_headerdump_name_repl("c4",["DHT","Huffman Table",""],header,out);
	out=jpeg_headerdump_name_replN(0xc5,0xc7,0xc0,["SOF%N%","Start of Differential Frame %N%",""],header,out);
	out=jpeg_headerdump_name_repl("c8",["JPG","Extensions",""],header,out);
	out=jpeg_headerdump_name_replN(0xc9,0xcb,0xc0,["SOF%N%","Start of Arithmetic-coding Frame %N%",""],header,out);
	out=jpeg_headerdump_name_repl("cc",["DAC","Arithmetic Coding",""],header,out);
	out=jpeg_headerdump_name_replN(0xcd,0xcf,0xc0,["SOF%N%","Start of Differential/Arithmetic Frame %N%",""],header,out);
	out=jpeg_headerdump_name_replN(0xd0,0xd7,0xd0,["RST%N%","Restart Marker %N%",""],header,out);
	out=jpeg_headerdump_name_repl("d8",["SOI","Start of Image",""],header,out);
	out=jpeg_headerdump_name_repl("d9",["EOI","End of Image",""],header,out);
	out=jpeg_headerdump_name_repl("da",["SOS","Start of Scan",""],header,out);
	out=jpeg_headerdump_name_repl("db",["DQT","Quantization Table",""],header,out);
	out=jpeg_headerdump_name_repl("dc",["DNL","Number of Lines",""],header,out);
	out=jpeg_headerdump_name_repl("dd",["DRI","Restart Interval",""],header,out);
	out=jpeg_headerdump_name_repl("de",["DHP","Hierarchical Progression",""],header,out);
	out=jpeg_headerdump_name_repl("df",["EXP","Expand Reference Component",""],header,out);

	out=jpeg_headerdump_name_repl("e0",["APP0","Application Segment 0","JFIF Header,JFIF Extensions,Motion JPEG"],header,out);
	out=jpeg_headerdump_name_repl("e1",["APP0","Application Segment 1","EXIF,TIFF-IFD,Adobe XMP"],header,out);
	out=jpeg_headerdump_name_repl("e2",["APP2","Application Segment 2","Color Profile,FlashPix"],header,out);
	out=jpeg_headerdump_name_repl("e3",["APP3","Application Segment 3","JPS-Stereoscopic JPEG"],header,out);
	out=jpeg_headerdump_name_replN(0xe4,0xe5,0xe0,["APP%N%","Application Segment %N%",""],header,out);
	out=jpeg_headerdump_name_repl("e6",["APP6","Application Segment 6","NITF Lossless profile"],header,out);
	out=jpeg_headerdump_name_replN(0xe7,0xe9,0xe0,["APP%N%","Application Segment %N%",""],header,out);
	out=jpeg_headerdump_name_repl("ea",["APP10","Application Segment 10","ActiveObject multimedia"],header,out);
	out=jpeg_headerdump_name_repl("eb",["APP11","Application Segment 11","JPEGH-HDR,HELIOS JPEG Resources,OPI Postscript"],header,out);
	out=jpeg_headerdump_name_repl("ec",["APP12","Application Segment 12","Old digicam info,Photoshop Save for Web: Ducky"],header,out);
	out=jpeg_headerdump_name_repl("ed",["APP13","Application Segment 13","Photoshop IRB,8BIM,IPTC"],header,out);
	out=jpeg_headerdump_name_replN(0xee,0xef,0xe0,["APP%N%","Application Segment %N%","Adobe DCT Information"],header,out);

	out=jpeg_headerdump_name_replN(0xf0,0xf6,0xf0,["JPG%N%","Extension %N%",""],header,out);
	out=jpeg_headerdump_name_repl("f7",["JPG7/SOF48","Extension 7","JPEG-LS Lossless JPEG"],header,out);
	out=jpeg_headerdump_name_repl("f8",["JPG8/LSE","Extension 8","JPEG-LS Parameters"],header,out);
	out=jpeg_headerdump_name_replN(0xf9,0xfd,0xf0,["JPG%N%","Extension %N%",""],header,out);
	out=jpeg_headerdump_name_repl("fe",["COM","Comment",""],header,out);
	return out;
}
