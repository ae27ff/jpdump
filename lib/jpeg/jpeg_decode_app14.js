
function processAPP14(data){
	var app14={valid:false,type:"",info:null};
	if(isAPP14Adobe(data)){
		app14.valid=true;
		app14.type="Adobe";
		app14.info=processAPP14Adobe(data);
	}
	return app14;
}


function isAPP14Adobe(content){
	return (content.substr(0,5)==="Adobe");
}

function processAPP14Adobe(data){
	var adobe={DCTEncodeVersion:"unknown",flags0:0,flags1:0,colorTransform:0};
	var p=5;
	adobe.DCTEncodeVersion = hexdec( get2bytes(data,p) );
	adobe.flags0 = hexdec( get2bytes(data,p+2) )
	adobe.flags1 = hexdec( get2bytes(data,p+4) )
	adobe.colorTransform = data.charCodeAt(p+6)

	switch(adobe.colorTransform){
		case 0:
			adobe.colorTransform+=" (Unknown, possibly RBG or CMYK)";
			break;
		case 1:
			adobe.colorTransform+=" (YCbCr)";
			break;
		case 2:
			adobe.colorTransform+=" (YCCK)";
			break;
		default:
			adobe.colorTransform+=" (Unknown)";

	}
	return adobe;
}

