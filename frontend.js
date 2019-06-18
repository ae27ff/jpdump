var g_ImageData="";
var g_ExifParent={}
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
	f = files[0];

	var reader = new FileReader();

	// Closure to capture the file information.
	reader.onload = (function(theFile) {
		return function(e) {
                        console.log("reader onload");

                        window.g_debug_event=e;
                        window.g_debug_target=e.target;
                        window.g_debug_result=e.target.result;
                        
                        var result=null;
                        if(typeof e.target.result === "undefined" || e.target.result===null){
                            result=e.target.content;//IE11
                        }else{
                            result=e.target.result;
                        }
                        
			g_ImageData=result;
			previewImage(result);
			console.log('x');
			//setTimeout(processData,250);
		};
	})(f);
	reader.readAsBinaryString(f);

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
	g_ExifParent=parent

	var image = new Image();
    image.onload = function() {
        EXIF.getData(image, function() {
			 var allMetaData = EXIF.getAllTags(this);
			 console.log(allMetaData)
			addPreviewEXIF(g_ExifParent,allMetaData);
            //alert(EXIF.pretty(this));
        });
    };
	image.src="data:application/jpeg;base64," + btoa(g_ImageData);


	/*
	//var img2 = document.getElementById("preview");
	//return
    var ret=EXIF.getData(img2, function() {
        var allMetaData = EXIF.getAllTags(this);
		console.log(allMetaData)
		addPreviewEXIF(g_ExifParent,allMetaData);
    });
	console.log(img2.complete)
	console.log(ret)
	*/
}

function previewImage(data){
	var img=document.getElementById('preview');
	img.onload=processData
	img.onerror=processData
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
function getJsLink(data,mt){
        if(typeof mt === "undefined") mt="";
	return '#" onclick="' + "dataOverlayStub('"+btoa(data)+"')";
}
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
    console.log(buf)
    //data=decodeURIComponent(escape(data));
    //data=unescape(encodeURIComponent(data));
    return new Blob([buf], {type: 'application/octet-stream;charset=utf-8;'});//TODO: IE is messing up file encoding!
}

function getDlLink(data, filename){
    
    var linkElem = document.createElement('a');
    if (navigator.msSaveBlob) {
        linkElem.setAttribute('onclick', "ieDownloadData(atob('"+btoa(data)+"'),'"+filename+"')");
    }else{
        var dlData = getDataBlob(data);
        var dlURL = window.URL.createObjectURL(dlData);
        linkElem.href = dlURL;
        linkElem.setAttribute('download', filename);
    }
    linkElem.innerHTML="Download Raw";
    return linkElem.outerHTML;
}
function getContentURL(content){
	if(content==="") return "None";
	return '<a href="'+getJsLink(hexdump(content,16),'text/plain')+'">View Hex</a> '+
	'<a href="'+getJsLink(content,'text/plain')+'">View Text</a> '+
	getDlLink(content,'output.bin');
}

function displayDetailPre(name,value){
	if(value==="") return "";
	value=String(value).replaceAll(' ','&nbsp;');
	return '<li><span class="detailname">'+name+': </span><div class="detailvalue presim">'+value+'</div></li>';
}
function displayDetail(name,value){
	if(value==="") return "";
	return '<li><span class="detailname">'+name+': </span><div class="detailvalue presim">'+value+'</div></li>';
}
function displayHeaderInfo(header){
	var html="<ul>"+
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
	displayDetail("Resolution",getPreviewDims());

	if(info.hasextraneous){
		html+="</ul><br><ul>"+
		displayDetail("Extraneous Data Exists",'<span class="warning">YES</span>')+
		displayDetail("Extraneous Data",getContentURL(info.extraneous));
	}
	return html+"</ul>";
}
function displayObjectInfo(obj){
	var html="<ul>";
	for (var property in obj) {
		if (obj.hasOwnProperty(property)) {
			html+=displayDetail(property,obj[property]);
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
	for(prop in exif){
		console.log(prop)
		console.log(typeof exif[prop])
		if(exif[prop] !== null && typeof exif[prop] === 'object' && !(exif[prop] instanceof Number || exif[prop] instanceof Array)){
			console.log(Object.keys(exif[prop]).length)
			console.log(exif[prop])
			if(Object.keys(exif[prop]).length===0){
				exif[prop]="Not present"
			}else{
				//exif[prop]="Present"
				exif[prop]=JSON.stringify(exif[prop])
			}
		}
		if(exif[prop] instanceof Array){
			html+=displayDetail(prop,getContentURL(array2string(exif[prop])))+"</ul><br><ul>"
		}else{
			html+=displayDetailPre(prop,exif[prop])+"</ul><br><ul>"
		}
		console.log(exif[prop])
		console.log(" ")
	}
	return html+"</ul>";
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
	displayDetail("Component Id",comp.idstr)+
	displayDetail("Sampling Factors",comp.samplingstr)+
	displayDetail("Quantization Table #",comp.qtablenum)+""
	//html+="</ul><br><ul>"+
	return html+"</ul>";
}
function displayScanInfo(sos){
    //var sos = {scanlen:0, ncomponents:0, ncomponentsstr:"", components:[], sss:0, ess:0, sabp:0, hcdata:""};
    var html="<ul>"+
    displayDetail("Scan length",sos.scanlen)+
    displayDetail("Components",sos.ncomponentsstr)+
    displayDetail("Start of Spectral/Predictive Selection",sos.sss)+
    displayDetail("End of Spectral Selection",sos.ess)+
    displayDetail("Successive Approximate Bit Positions",sos.sabp)+
    displayDetail("Huffman-coded data",getContentURL(sos.hcdata))+""
    //html+="</ul><br><ul>"+
    return html+"</ul>";
}
function displayScanComponentInfo(component){
    //var component={id:0,idstr:"",actn:0,dctn:0};
}


function displayResults(info){
	var elImage=document.getElementById('image')
	elImage.innerHTML="";
	var elHeaders=[]
	var elImageInfo=accordion_create('Image Info',displayImageInfo(info))
	for(i=0;i<info.headers.length;i++){
		var header=info.headers[i];
		var headerinfo=displayHeaderInfo(header);
		var elHeader = accordion_create(header.desc.shortname+" - "+header.desc.longname,headerinfo);
		//console.log(header.hasextendeddata && header.extendedtype==="JFIF")
		if(header.hasextendeddata && header.extendedtype==="EXIF"){
			getPreviewEXIF(elHeader);
		}
                else if(header.hasextendeddata && header.extendeddata==="Scan"){
                    var scaninfo = displayScanInfo(header.extendeddata);
                    var elScan = accordion_create(header.extendedtype+" Information",scaninfo);
			if(header.extendeddata.components.length>0){
                        for(var j=0;j<header.extendeddata.components.length;j++){
                                //console.log(j)
                                //console.log(header.extendeddata.components[j])
                                //console.log(header.extendeddata.components)
                                var comp=header.extendeddata.components[j];
                                var elComponent=accordion_create(comp.idstr+' Component',displayScanComponentInfo(comp));
                                elScan.children[1].appendChild(elComponent);
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
function dataOverlayStub(data_b64){
	var data = atob(data_b64);
	showDataOverlay(data);
}
function showDataOverlay(data){
	var el = document.getElementById('data-overlay');
	var el_text = document.getElementById('data-overlay-content');
	el_text.value = data;
	el.style.display="block";
}
function hideDataOverlay(){
	var el = document.getElementById('data-overlay');
	el.style.display="none";
}