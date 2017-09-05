function accordion_prepare(){
	var acc = document.getElementsByClassName("accordion");
	var i;

	for (i = 0; i < acc.length; i++) {
	  acc[i].onclick = function() {
		this.classList.toggle("active");
		var panel = this.nextElementSibling;
		if (panel.style.maxHeight){
		  panel.style.maxHeight = null;
		} else {
		  panel.style.maxHeight = panel.scrollHeight + "px";
		}
	  }
	}
}


function accordion_create(header,body){
	var elAccordion=document.createElement('div');
	elAccordion.classList.add('accordionentry')
	var elHead=document.createElement('button');
	elHead.classList.add('accordion')
	elHead.innerHTML=header;

	elHead.onclick = function() {
		this.classList.toggle("active");
		var panel = this.nextElementSibling;
		if (panel.style.maxHeight){
		  panel.style.maxHeight = null;
		} else {
		  panel.style.maxHeight = (panel.scrollHeight*2+3000) + "px";
		}
	}
	var elBody=document.createElement('div');
	elBody.classList.add('panel')
	if(body instanceof Array){
		for(i=0;i<body.length;i++){
			elBody.appendChild(body[i]);
		}
	}else elBody.innerHTML=body;
	elAccordion.appendChild(elHead)
	elAccordion.appendChild(elBody);
	return elAccordion;
}