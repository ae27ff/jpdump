var g_ImageData="";
var g_ImageRequestId=0;
var g_ResultRequestId=0;
var g_ExifCache=null;
var g_ExifCacheData=null;
var g_ContentData=[];
var g_DownloadURLs=[];
var MAX_CONTENT_PREVIEW=65536;
branding.init();
window.addEventListener('load',function(){
  var up=document.getElementById('upload');
  up.addEventListener('change', handleFileSelect, false);
  up.value = '';
  accordion_prepare();
  branding.load("branding-bottom");
},false);
function handleFileSelect(evt) {
        console.log("file select "+evt);
	var files = evt.target.files; // FileList object

	// use the 1st file from the list
	var f = files[0];
	if (!f) return;
	var requestId = ++g_ImageRequestId;
	g_ExifCache=null;
	g_ExifCacheData=null;

	var reader = new FileReader();

	// Capture the selection so an older read cannot replace a newer image.
	reader.onload = function(e) {
		if (requestId !== g_ImageRequestId) return;
		console.log("reader onload");

		var result=null;
		if(typeof e.target.result === "undefined" || e.target.result===null){
			result=e.target.content;//IE11
		}else{
			result=e.target.result;
		}
		g_ImageData=typeof result==='string' ? result : array2string(new Uint8Array(result));
		previewImage(g_ImageData, requestId);
		console.log('x');
	};
	reader.onerror = function() {
		if (requestId !== g_ImageRequestId) return;
		g_ImageData='';
		++g_ResultRequestId;
		releaseResultContent();
		document.getElementById('preview').removeAttribute('src');
		document.getElementById('image').innerHTML='<p class="warning">Unable to read the selected file.</p>';
	};
	reader.readAsArrayBuffer(f);

	// Read in the image file as a data URL.
	//reader.readAsText(f);
}

function handleFileClick(obj){
    console.log("file click "+obj);
}

function processData(){
	displayResults(processJPEG(g_ImageData));
}


var testimageexif = function() {
    var image = new Image();
    image.onload = function() {
        EXIF.getData(image, function() {
            alert(EXIF.pretty(this));
        });
    };
	image.src="data:application/jpeg;base64," + btoa(g_ImageData);
}




function addPreviewEXIF(parent,json){
	var exifinfo=displayEXIFInfo(json);
	var elEXIF=accordion_create("EXIF Information",exifinfo);
	parent.children[1].appendChild(elEXIF);
}
function getPreviewEXIF(parent){
	if(g_ExifCache===null || g_ExifCacheData!==g_ImageData){
		g_ExifCache=EXIF.readFromBinaryFile(stobuf(g_ImageData)) || {};
		g_ExifCacheData=g_ImageData;
	}
	addPreviewEXIF(parent,g_ExifCache);
}

function previewImage(data, requestId){
	if (typeof requestId === 'undefined') requestId = g_ImageRequestId;
	var img=document.getElementById('preview');
	var onComplete = function() {
		if (requestId === g_ImageRequestId) processData();
	};
	img.onload=onComplete;
	img.onerror=onComplete;
	img.src="data:application/jpeg;base64," + btoa(data);
}
function getPreviewDims(){
	var img=document.getElementById('preview');
	return img.naturalWidth+"x"+img.naturalHeight
}
/*
function getDataURI(data){
	return "data:application/octet-stream;base64," + btoa(data);
}
function getDataURIMT(data,mt){
	return "data:"+mt+";base64," + btoa(data);
}
*/
function stobuf(str) {
  var buf = new ArrayBuffer(str.length);
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
    if(str.charCodeAt(i)<0 || str.charCodeAt(i)>255){
        console.log("!!! "+str.charCodeAt(i));
    }
  }
  return buf;
}
function ieDownloadData(data,filename){
    var dlData = getDataBlob(data);
    navigator.msSaveBlob(dlData, filename);
}
function getDataBlob(data){
    var buf = stobuf(data);
    //console.log(buf)
    //data=decodeURIComponent(escape(data));
    //data=unescape(encodeURIComponent(data));
    return new Blob([buf], {type: 'application/octet-stream;charset=utf-8;'});//TODO: IE is messing up file encoding!
}

function registerContent(data){
    g_ContentData.push(data);
    return g_ContentData.length-1;
}

function getDlLink(data, filename, contentId){
    if(typeof contentId==='undefined') contentId=registerContent(data);
    var linkElem = document.createElement('a');
    linkElem.href='#';
    linkElem.setAttribute('download', filename);
    linkElem.setAttribute('onclick', 'return downloadContent('+contentId+',this,'+g_ResultRequestId+')');
    linkElem.innerHTML="Download Raw";
    return linkElem.outerHTML;
}

function downloadContent(contentId, linkElem, resultId){
    if(resultId!==g_ResultRequestId || typeof g_ContentData[contentId]!=='string') return false;
    if(linkElem.getAttribute('data-blob-url')) return true;
    var dlData = getDataBlob(g_ContentData[contentId]);
    if (navigator.msSaveBlob) {
        navigator.msSaveBlob(dlData,linkElem.getAttribute('download'));
        return false;
    }else{
        var dlURL = window.URL.createObjectURL(dlData);
        g_DownloadURLs.push(dlURL);
        linkElem.href = dlURL;
        linkElem.setAttribute('data-blob-url',dlURL);
        return true;
    }
}
function getContentURL(content){
	if(content==="") return "None";
	var contentId=registerContent(content);
	return '<a href="#" onclick="return showContent('+contentId+',true,'+g_ResultRequestId+')">View Hex</a> '+
	'<a href="#" onclick="return showContent('+contentId+',false,'+g_ResultRequestId+')">View Text</a> '+
	getDlLink(content,'output.bin',contentId);
}

function showContent(contentId, asHex, resultId){
	if(resultId!==g_ResultRequestId || typeof g_ContentData[contentId]!=='string') return false;
	var content=g_ContentData[contentId];
	var preview=content.substring(0,MAX_CONTENT_PREVIEW);
	showDataOverlay(asHex ? hexdump(preview,16) : preview,content.length,preview.length);
	return false;
}

function releaseResultContent(){
	for(var index=0;index<g_DownloadURLs.length;index++) window.URL.revokeObjectURL(g_DownloadURLs[index]);
	g_DownloadURLs=[];
	g_ContentData=[];
	hideDataOverlay();
	document.getElementById('data-overlay-content').value='';
	document.getElementById('data-overlay-length').innerHTML='0';
}

function displayDetailPre(name,value){
	if(value==="") return "";
	value=escapeHTML(value).replace(/ /g,'&nbsp;');
	return '<li><span class="detailname">'+escapeHTML(name)+': </span><div class="detailvalue presim">'+value+'</div></li>';
}
function escapeHTML(value){
	return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function displayDetail(name,value){
	if(value==="") return "";
	return '<li><span class="detailname">'+name+': </span><div class="detailvalue presim">'+value+'</div></li>';
}
function displayHeaderInfo(header){
	var html="<ul>"+
	(header.truncated ? displayDetail('Status','<span class="warning">Truncated; available bytes shown</span>') :
	 !header.valid ? displayDetail('Status','<span class="warning">Invalid structure; available bytes shown</span>') :
	 header.recovered ? displayDetail('Status','<span class="warning">Recovered; sequence unverified</span>') : '')+
	displayDetail("Marker ID",header.magic+header.type)+
	displayDetail("Offset",header.p)+
	displayDetail("Len",header.len)+
	displayDetail("Actual Size",header.actuallen)+"</ul><br><ul>"+
	displayDetail("Uses",header.desc.uses)+"</ul><br><ul>"+
	displayDetail("ContentLen",header.contentlen)+
	displayDetail("Content",getContentURL(header.content));
	//console.log(header.hasextendeddata);
	if(header.hasextendeddata){
		html+=displayDetail("Content Type",header.extendedtype);
	}
	html+="</ul>";

	return html;
}
function displayImageInfo(info){
	var html="<ul>"+
	displayDetail("Filesize",info.filesize)+
	displayDetail("Datasize",info.nextp)+
	displayDetail("JPEG Structure",info.valid ? "Valid" : '<span class="warning">Invalid or incomplete; recovered data shown</span>')+
	displayDetail("Resolution",info.dimensions ? info.dimensions.width+'x'+info.dimensions.height : getPreviewDims());
	for(var index=0;index<(info.warnings || []).length;index++) html+=displayDetailPre('Warning',info.warnings[index]);

	if(info.hasextraneous){
		html+="</ul><br><ul>"+
		displayDetail(info.unparsed ? 'Unparsed Data Exists' : "Extraneous Data Exists",'<span class="warning">YES</span>')+
		displayDetail(info.unparsed ? 'Unparsed Data' : "Extraneous Data",getContentURL(info.extraneous));
	}
	return html+"</ul>";
}
function displayObjectInfo(obj){
	var html="<ul>";
	for (var property in obj) {
		if (Object.prototype.hasOwnProperty.call(obj,property)) {
			html+=displayDetailPre(property,obj[property]);
		}
	}
	return html+"</ul>";
}
function displayJFIFInfo(jfif){
	var html="<ul>"+
	displayDetail("Version",jfif.version)+
	displayDetail("Units",jfif.units)+
	displayDetail("X Density",jfif.xdensity)+
	displayDetail("Y Density",jfif.ydensity)+"</ul><br><ul>"+
	displayDetail("Thumbnail Pixels",jfif.xthumbpixels+"x"+jfif.ythumbpixels+" ("+jfif.thumbpixels+")")+
	displayDetail("Thumbnail Size",jfif.thumblen)+
	displayDetail("Thumbnail",getContentURL(jfif.thumb));
	if(jfif.extraneous.length>0){
		html+="</ul><br><ul>"+
		displayDetail("Extraneous Data Exists",'<span class="warning">YES</span>')+
		displayDetail("Extraneous Data",getContentURL(jfif.extraneous));
	}
	return html+"</ul>";
}
function displayEXIFInfo(exif){
	var html="<ul>"
	for(var prop in exif){
		if(!Object.prototype.hasOwnProperty.call(exif,prop)) continue;
		var value=exif[prop];
		//console.log(prop)
		//console.log(typeof exif[prop])
		if(value !== null && typeof value === 'object' && !(value instanceof Number || Array.isArray(value))){
			if(Object.keys(value).length===0){
				value="Not present"
			}else{
				//exif[prop]="Present"
				value=JSON.stringify(value)
			}
		}
		if(Array.isArray(value)){
			html+=displayDetailPre(prop,JSON.stringify(value));
			if(isByteArray(value)) html+=displayDetail(prop+" Raw bytes",getContentURL(array2string(value)));
			html+="</ul><br><ul>";
		}else{
			html+=displayDetailPre(prop,value)+"</ul><br><ul>"
		}
		//console.log(exif[prop])
		//console.log(" ")
	}
	return html+"</ul>";
}

function isByteArray(values){
	for(var i=0;i<values.length;i++){
		if(typeof values[i]!=="number" || values[i]<0 || values[i]>255 || values[i]%1!==0) return false;
	}
	return true;
}


function displaySOF0Info(sof0){
	var html="<ul>"+
	displayDetail("Data Precision (bits/sample)",sof0.dataprec)+"</ul><br><ul>"+
	displayDetail("Image Width",sof0.imgw)+
	displayDetail("Image Height",sof0.imgh)+"</ul><br><ul>"+
	displayDetail("Components",sof0.ncomponentsstr)+""
	//html+="</ul><br><ul>"+
	return html+"</ul>";
}
function displaySOF0ComponentInfo(comp){
	var html="<ul>"+
	displayDetail("Component Id",comp.id)+
	displayDetail("Sampling Factors",comp.samplingstr)+
	displayDetail("Quantization Table #",comp.qtablenum)+""
	//html+="</ul><br><ul>"+
	return html+"</ul>";
}
function displayScanInfo(sos){
    //var sos = {scanlen:0, ncomponents:0, ncomponentsstr:"", components:[], sss:0, ess:0, sabp:0, hcdata:""};
    var html="<ul>"+
    displayDetail("Components",sos.ncomponentsstr)+"</ul><br><ul>"+
    displayDetail(sos.scanCoding==='jpeg-ls' ? "Near-lossless error limit" : "Start of Spectral/Predictive Selection",sos.sss)+
    displayDetail(sos.scanCoding==='jpeg-ls' ? "Interleave mode" : "End of Spectral Selection",sos.ess)+
    displayDetail(sos.scanCoding==='jpeg-ls' ? "Point transform" : "Successive Approximate Bit Positions",sos.sabp)+"</ul><br><ul>"+
    displayDetail(sos.scanCoding==='jpeg-ls' ? "JPEG-LS coded data (bit-stuffed)" : "Entropy-coded data (destuffed)",getContentURL(sos.hcdata))+""
    //html+="</ul><br><ul>"+
    return html+"</ul>";
}
function displayScanComponentInfo(comp,coding){
    if(coding==='jpeg-ls') return '<ul>'+displayDetail('Component Id',comp.id)+displayDetail('Mapping Table #',comp.dctn*16+comp.actn)+'</ul>';
    //var component={id:0,idstr:"",actn:0,dctn:0};
    var html="<ul>"+
    displayDetail("Component Id",comp.id)+
    displayDetail("AC Table #",comp.actn)+
    displayDetail("DC Table #",comp.dctn)+""
    //html+="</ul><br><ul>"+
    return html+"</ul>";
}


function displayResults(info){
	++g_ResultRequestId;
	releaseResultContent();
	var elImage=document.getElementById('image')
	elImage.innerHTML="";
	var elHeaders=[]
	var elImageInfo=accordion_create('Image Info',displayImageInfo(info))
	for(var i=0;i<info.headers.length;i++){
		var header=info.headers[i];
		var headerinfo=displayHeaderInfo(header);
		var elHeader = accordion_create(header.desc.shortname+" - "+header.desc.longname,headerinfo);
		//console.log(header.hasextendeddata && header.extendedtype==="JFIF")
                
		if(header.hasextendeddata && header.extendedtype==="EXIF"){
			getPreviewEXIF(elHeader);
		}
                else if(header.hasextendeddata && header.extendedtype==="Scan"){
                    var scaninfo = displayScanInfo(header.extendeddata);
                    var elScan = accordion_create(header.extendedtype+" Information",scaninfo);
                    if(header.extendeddata.components.length>0){
                        for(var j=0;j<header.extendeddata.components.length;j++){
                                //console.log(j)
                                //console.log(header.extendeddata.components[j])
                                //console.log(header.extendeddata.components)
                                var comp=header.extendeddata.components[j];
                                var elComponent=accordion_create(comp.idstr+' Component',displayScanComponentInfo(comp,header.extendeddata.scanCoding));
                                elScan.children[1].appendChild(elComponent);
                        }
                    }
                    elHeader.children[1].appendChild(elScan);
                }
		else if(header.hasextendeddata && header.extendedtype==="JFIF"){
			var jfifInfo=displayJFIFInfo(header.extendeddata);
			var elJFIF = accordion_create(header.extendedtype+" Information",jfifInfo);
			elHeader.children[1].appendChild(elJFIF);
		}
		else if(header.hasextendeddata && header.extendedtype==="SOF"){
			var extInfo=displaySOF0Info(header.extendeddata);
			var elExtended = accordion_create(header.extendedtype+" Information",extInfo);
			if(header.extendeddata.components.length>0){
				for(var j=0;j<header.extendeddata.components.length;j++){
					//console.log(j)
					//console.log(header.extendeddata.components[j])
					//console.log(header.extendeddata.components)
					var comp=header.extendeddata.components[j]
					var elComponent=accordion_create(comp.idstr+' Component',displaySOF0ComponentInfo(comp))
					elExtended.children[1].appendChild(elComponent);
				}
			}
			elHeader.children[1].appendChild(elExtended);
		}
		else if(header.hasextendeddata){
			var objinfo=displayObjectInfo(header.extendeddata);
			var elInfo = accordion_create(header.extendedtype+" Information",objinfo);
			elHeader.children[1].appendChild(elInfo);
		}
		elHeaders.push(elHeader)
	}
	var elHeaderInfo=accordion_create('Image Headers ('+info.headers.length+')',elHeaders)
	elImage.appendChild(elImageInfo)
	elImage.appendChild(elHeaderInfo)
}

/*
String.prototype.replaceAll = function(target, replacement) {
  return this.split(target).join(replacement);
};
*/
function showDataOverlay(data, totalBytes, previewBytes){
	var el = document.getElementById('data-overlay');
	var el_text = document.getElementById('data-overlay-content');
        var el_len = document.getElementById('data-overlay-length');
	el_text.value = data;
        el_len.innerHTML = typeof totalBytes==='undefined' ? data.length :
            (previewBytes<totalBytes ? 'First '+previewBytes+' of '+totalBytes+' bytes; Download Raw for all data' : totalBytes+' bytes');
	el.style.display="block";
}
function hideDataOverlay(){
	var el = document.getElementById('data-overlay');
	el.style.display="none";
}
