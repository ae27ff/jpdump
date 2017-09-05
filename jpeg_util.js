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
	for(p=0;p<data.length;p++){
		hex+=pad(data.charCodeAt(p).toString(16),2)+" "
		if( ((p+1)%wrap)==0 ) hex+="\r\n";
	}
	return hex
}
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};


function array2string(arr){
	var str=""
	for(i=0;i<arr.length;i++){
		str+=String.fromCharCode(arr[i])
	}
	return str
}
