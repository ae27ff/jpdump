
function processSOF0(data){
	var p=0;
	var sof0={dataprec:"",imgw:0,imgh:0,ncomponents:0,ncomponentsstr:"",components:[]}
	sof0.dataprec=data.charCodeAt(p) //data precision in bits/sample.  12 and 16 not supported by most software.
	sof0.imgh=hexdec(get2bytes(data,p+1))
	sof0.imgw=hexdec(get2bytes(data,p+3))
	sof0.ncomponents=data.charCodeAt(p+5)
	sof0.ncomponentsstr=getSOF0ComponentsStr(sof0.ncomponents)
	p=6
	pe=p+3*sof0.ncomponents
	for(q=p;q<pe;q+=3){
		sof0.components.push(processSOF0Component(data.substr(q,3)));
	}
	return sof0
}
function getSOF0ComponentsStr(ncomponents){
	if(compstr>4) return ncomponents+" (Unknown colorspace)"
	var types=["","grayscale","","Color YcbCr or YIQ","Color CMYK"]
	var compstr=ncomponents+" ("+types[ncomponents]+")"
	if(compstr==="") compstr=ncomponents+" (Unknown colorspace)"
	return compstr
}
function processSOF0Component(data){
	var comp={id:0,idstr:"",samplingfactors:0,samplingstr:"",qtablenum:0}
	comp.id=data.charCodeAt(0)
	comp.samplingfactors=data.charCodeAt(1)
	comp.qtablenum=data.charCodeAt(2)
	comp.idstr=getSOF0ComponentId(comp.id)
	comp.samplingstr=getSOF0SamplingFactor(comp.samplingfactors)
	return comp
}
function getSOF0ComponentId(id){
	if(id<1 || id>5) return id+" (Unknown)"
	var ids=["","Y","Cb","Cr","I","Q"]
	return ids[id]
}
function getSOF0SamplingFactor(samp){
	//vertical horizontal
	//0 1 2 3  4 5 6 7
	var sf={v:0,h:0}
	sf.v=(samp&0xF0)>>4;
	sf.h= samp&0x0F
	return samp+" ("+sf.v+" Vertical, "+sf.h+" Horizontal)"
}
