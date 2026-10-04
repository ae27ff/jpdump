if (!Array.prototype.last){
    Array.prototype.last = function(){
        return this[this.length - 1];
    };
};

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}
function dechex2x(n){
	return pad(n.toString(16),2)
}

function get2bytes(data,p){
	var hb=pad(data.charCodeAt(p).toString(16),2)
	var lb=pad(data.charCodeAt(p+1).toString(16),2)
	return hb+lb
}
function hexdec(h){
	return parseInt(h,16)
}

function hexdump(data,wrap){
	var hex=""
	for(var p=0;p<data.length;p++){
		hex+=pad(data.charCodeAt(p).toString(16),2)+" "
		if( ((p+1)%wrap)==0 ) hex+="\r\n";
	}
	return hex
}


function array2string(arr){
	var chunks=[];
	for(var i=0;i<arr.length;i+=32768){
		var chunk=Array.prototype.slice.call(arr,i,i+32768);
		chunks.push(String.fromCharCode.apply(null,chunk));
	}
	return chunks.join('');
}
