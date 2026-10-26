/**
 * Format decoded metadata and render the accordion results view.
 */
class ResultView{
    static addPreviewEXIF(parent,json){
        var exifinfo=ResultView.exifInfo(json);
        var elEXIF=Accordion.create("EXIF Information",exifinfo);
        parent.children[1].appendChild(elEXIF);
    }

    static detailPre(name,value){
        if(value==="") return "";
        value=ResultView.escapeHTML(value).replace(/ /g,'&nbsp;');
        return '<li><span class="detailname">'+ResultView.escapeHTML(name)+': </span><div class="detailvalue presim">'+value+'</div></li>';
    }

    static escapeHTML(value){
        return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    static detail(name,value){
        if(value==="") return "";
        return '<li><span class="detailname">'+name+': </span><div class="detailvalue presim">'+value+'</div></li>';
    }

    static headerInfo(header){
        var html="<ul>"+
            (header.truncated ? ResultView.detail('Status','<span class="warning">Truncated; available bytes shown</span>') :
            !header.valid ? ResultView.detail('Status','<span class="warning">Invalid structure; available bytes shown</span>') :
            header.recovered ? ResultView.detail('Status','<span class="warning">Recovered; sequence unverified</span>') : '')+
            ResultView.detail("Marker ID",header.magic+header.type)+
            ResultView.detail("Offset",header.p)+
            ResultView.detail("Len",header.len)+
            ResultView.detail("Actual Size",header.actuallen)+"</ul><br><ul>"+
            ResultView.detail("Uses",header.desc.uses)+"</ul><br><ul>"+
            ResultView.detail("ContentLen",header.contentlen)+
            ResultView.detail("Content",ContentView.links(header.content));
        //console.log(header.hasextendeddata);
        if(header.hasextendeddata){
            html+=ResultView.detail("Content Type",header.extendedtype);
        }
        html+="</ul>";

        return html;
    }

    static imageInfo(info){
        var html="<ul>"+
            ResultView.detail("Filesize",info.filesize)+
            ResultView.detail("Datasize",info.nextp)+
            ResultView.detail("JPEG Structure",info.valid ? "Valid" : '<span class="warning">Invalid or incomplete; recovered data shown</span>')+
            (info.images && info.images.length>1 ? ResultView.detail('Format',ResultView.escapeHTML(info.format))+ResultView.detail('Images / streams',info.images.length) : '')+
            ResultView.detail("Resolution",info.dimensions ? info.dimensions.width+'x'+info.dimensions.height : ImageController.getPreviewDimensions());
        for(var index=0;index<(info.warnings || []).length;index++) html+=ResultView.detailPre('Warning',info.warnings[index]);

        if(info.hasextraneous){
            html+="</ul><br><ul>"+
                ResultView.detail(info.unparsed ? 'Unparsed Data Exists' : "Extraneous Data Exists",'<span class="warning">YES</span>')+
                ResultView.detail(info.unparsed ? 'Unparsed Data' : "Extraneous Data",ContentView.links(info.extraneous));
        }
        return html+"</ul>";
    }

    static objectInfo(obj){
        var html="<ul>";
        for(var property in obj){
            if(Object.prototype.hasOwnProperty.call(obj,property)) {
                html+=ResultView.detailPre(property,obj[property]);
            }
        }
        return html+"</ul>";
    }

    static jfifInfo(jfif){
        var html="<ul>"+
            ResultView.detail("Version",jfif.version)+
            ResultView.detail("Units",jfif.units)+
            ResultView.detail("X Density",jfif.xdensity)+
            ResultView.detail("Y Density",jfif.ydensity)+"</ul><br><ul>"+
            ResultView.detail("Thumbnail Pixels",jfif.xthumbpixels+"x"+jfif.ythumbpixels+" ("+jfif.thumbpixels+")")+
            ResultView.detail("Thumbnail Size",jfif.thumblen)+
            ResultView.detail("Thumbnail",ContentView.links(jfif.thumb));
        if(jfif.extraneous.length>0){
            html+="</ul><br><ul>"+
                ResultView.detail("Extraneous Data Exists",'<span class="warning">YES</span>')+
                ResultView.detail("Extraneous Data",ContentView.links(jfif.extraneous));
        }
        return html+"</ul>";
    }

    static exifInfo(exif){
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
                html+=ResultView.detailPre(prop,JSON.stringify(value));
                if(ResultView.isByteArray(value)) html+=ResultView.detail(prop+" Raw bytes",ContentView.links(BinaryUtils.arrayToString(value)));
                html+="</ul><br><ul>";
            }else{
                html+=ResultView.detailPre(prop,value)+"</ul><br><ul>"
            }
            //console.log(exif[prop])
            //console.log(" ")
        }
        return html+"</ul>";
    }

    static isByteArray(values){
        for(var i=0;i<values.length;i++){
            if(typeof values[i]!=="number" || values[i]<0 || values[i]>255 || values[i]%1!==0) return false;
        }
        return true;
    }

    static frameInfo(sof0){
        var html="<ul>"+
            ResultView.detail("Data Precision (bits/sample)",sof0.dataprec)+"</ul><br><ul>"+
            ResultView.detail("Image Width",sof0.imgw)+
            ResultView.detail("Image Height",sof0.imgh)+"</ul><br><ul>"+
            ResultView.detail("Components",sof0.ncomponentsstr)+""
        //html+="</ul><br><ul>"+
        return html+"</ul>";
    }

    static frameComponentInfo(comp){
        var html="<ul>"+
            ResultView.detail("Component Id",comp.id)+
            ResultView.detail("Sampling Factors",comp.samplingstr)+
            ResultView.detail("Quantization Table #",comp.qtablenum)+""
        //html+="</ul><br><ul>"+
        return html+"</ul>";
    }

    static scanInfo(sos){
        //var sos = {scanlen:0, ncomponents:0, ncomponentsstr:"", components:[], sss:0, ess:0, sabp:0, hcdata:""};
        var html="<ul>"+
            ResultView.detail("Components",sos.ncomponentsstr)+"</ul><br><ul>"+
            ResultView.detail(sos.scanCoding==='jpeg-ls' ? "Near-lossless error limit" : "Start of Spectral/Predictive Selection",sos.sss)+
            ResultView.detail(sos.scanCoding==='jpeg-ls' ? "Interleave mode" : "End of Spectral Selection",sos.ess)+
            ResultView.detail(sos.scanCoding==='jpeg-ls' ? "Point transform" : "Successive Approximate Bit Positions",sos.sabp)+"</ul><br><ul>"+
            ResultView.detail(sos.scanCoding==='jpeg-ls' ? "JPEG-LS coded data (bit-stuffed)" : "Entropy-coded data (destuffed)",ContentView.links(sos.hcdata))+""
        //html+="</ul><br><ul>"+
        return html+"</ul>";
    }

    static scanComponentInfo(comp,coding){
        if(coding==='jpeg-ls') return '<ul>'+ResultView.detail('Component Id',comp.id)+ResultView.detail('Mapping Table #',comp.dctn*16+comp.actn)+'</ul>';
        //var component={id:0,idstr:"",actn:0,dctn:0};
        var html="<ul>"+
            ResultView.detail("Component Id",comp.id)+
            ResultView.detail("AC Table #",comp.actn)+
            ResultView.detail("DC Table #",comp.dctn)+""
        //html+="</ul><br><ul>"+
        return html+"</ul>";
    }

    static render(info){
        ++ContentView.requestId;
        ContentView.release();
        if(typeof Inspector !== 'undefined' && Inspector.mounted()) {
            Inspector.render(info);
            return;
        }
        var elImage=document.getElementById('image')
        elImage.innerHTML="";
        var elHeaders=[]
        var elImageInfo=Accordion.create('Image Info',ResultView.imageInfo(info))
        for(var i=0;i<info.headers.length;i++){
            var header=info.headers[i];
            var headerinfo=ResultView.headerInfo(header);
            var elHeader = Accordion.create((info.images && info.images.length>1 ? 'Image '+(header.imageIndex+1)+' · ' : '')+header.desc.shortname+" - "+header.desc.longname,headerinfo);
            //console.log(header.hasextendeddata && header.extendedtype==="JFIF")

            if(header.hasextendeddata && header.extendedtype==="EXIF"){
                ImageController.getPreviewEXIF(elHeader,info.images && info.images.length>1 ? info.images[header.imageIndex] : null);
            }
            else if(header.hasextendeddata && header.extendedtype==="Scan"){
                var scaninfo = ResultView.scanInfo(header.extendeddata);
                var elScan = Accordion.create(header.extendedtype+" Information",scaninfo);
                if(header.extendeddata.components.length>0){
                    for(var j=0;j<header.extendeddata.components.length;j++){
                        //console.log(j)
                        //console.log(header.extendeddata.components[j])
                        //console.log(header.extendeddata.components)
                        var comp=header.extendeddata.components[j];
                        var elComponent=Accordion.create(comp.idstr+' Component',ResultView.scanComponentInfo(comp,header.extendeddata.scanCoding));
                        elScan.children[1].appendChild(elComponent);
                    }
                }
                elHeader.children[1].appendChild(elScan);
            }
            else if(header.hasextendeddata && header.extendedtype==="JFIF"){
                var jfifInfo=ResultView.jfifInfo(header.extendeddata);
                var elJFIF = Accordion.create(header.extendedtype+" Information",jfifInfo);
                elHeader.children[1].appendChild(elJFIF);
            }
            else if(header.hasextendeddata && header.extendedtype==="SOF"){
                var extInfo=ResultView.frameInfo(header.extendeddata);
                var elExtended = Accordion.create(header.extendedtype+" Information",extInfo);
                if(header.extendeddata.components.length>0){
                    for(var j=0;j<header.extendeddata.components.length;j++){
                        //console.log(j)
                        //console.log(header.extendeddata.components[j])
                        //console.log(header.extendeddata.components)
                        var comp=header.extendeddata.components[j]
                        var elComponent=Accordion.create(comp.idstr+' Component',ResultView.frameComponentInfo(comp))
                        elExtended.children[1].appendChild(elComponent);
                    }
                }
                elHeader.children[1].appendChild(elExtended);
            }
            else if(header.hasextendeddata){
                var objinfo=ResultView.objectInfo(header.extendeddata);
                var elInfo = Accordion.create(header.extendedtype+" Information",objinfo);
                elHeader.children[1].appendChild(elInfo);
            }
            elHeaders.push(elHeader)
        }
        var elHeaderInfo=Accordion.create('Image Headers ('+info.headers.length+')',elHeaders)
        elImage.appendChild(elImageInfo)
        elImage.appendChild(elHeaderInfo)
    }
}
