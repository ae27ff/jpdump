
function isEXIF(content){
	return (content.substr(0,6)==="Exif\0\0");
}
function processEXIF(data){//stub because we will process with Exif.js instead
	return {}
}

