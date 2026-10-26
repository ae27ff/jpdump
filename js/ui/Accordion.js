/**
 * Create and toggle nested accordion panels.
 */
class Accordion{
    static toggle(){
        this.classList.toggle("active");
        var panel=this.nextElementSibling;
        // Natural height keeps expanded descendants and wrapped text visible.
        panel.style.maxHeight=panel.style.maxHeight ? '' : 'none';
    }

    static prepare(){
        var acc = document.getElementsByClassName("accordion");
        var i;

        for(i = 0; i < acc.length; i++){
            acc[i].onclick = Accordion.toggle;
        }
    }

    static create(header,body){
        var elAccordion=document.createElement('div');
        elAccordion.classList.add('accordionentry')
        var elHead=document.createElement('button');
        elHead.classList.add('accordion')
        elHead.type='button';
        elHead.textContent=header;

        elHead.onclick = Accordion.toggle;
        var elBody=document.createElement('div');
        elBody.classList.add('panel')
        if(Array.isArray(body)){
            for(var i=0;i<body.length;i++){
                elBody.appendChild(body[i]);
            }
        }else elBody.innerHTML=body;
        elAccordion.appendChild(elHead)
        elAccordion.appendChild(elBody);
        return elAccordion;
    }
}
