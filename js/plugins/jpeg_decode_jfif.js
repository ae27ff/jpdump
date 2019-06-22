function isJFIF(content){
	return (content.substr(0,5)==="JFIF\0");
}

function processJFIF(data){
	var p=0;
	var jfif={valid:true,version:"",units:"",xdensity:0,ydensity:0,xthumbpixels:0,ythumbpixels:0,thumbpixels:0,thumblen:0,thumb:"",extraneous:""}
	jfif.valid=isJFIF(data);
	jfif.version=data.charCodeAt(p+5)+"."+pad(data.charCodeAt(p+6),2)
	jfif.units=getJFIFUnit(data.charCodeAt(p+7))
	jfif.xdensity=hexdec(get2bytes(data,p+8))
	jfif.ydensity=hexdec(get2bytes(data,p+10))
	jfif.xthumbpixels=data.charCodeAt(p+12)
	jfif.ythumbpixels=data.charCodeAt(p+13)
	jfif.thumbpixels=jfif.xthumbpixels*jfif.ythumbpixels
	jfif.thumblen=jfif.thumbpixels;//3 byte entries (packed 24-bit RGB)  3n total = Xthumbnail * Ythumbnail
	p=14
	jfif.thumb=data.substr(p,jfif.thumblen);
	p+=jfif.thumblen
	jfif.extraneous=data.substring(p)
	return jfif
}
function getJFIFUnit(unit){
	var jfifUnits=["Pixel Aspect Ratio (no units)","Dots Per Inch (DPI)","Dots Per cm"]
	if(unit>2) return unit+" - Unknown"
	return jfifUnits[unit]
}