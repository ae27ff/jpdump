/* 
 * Copyright (C) 2019 crashdemons (crashenator at gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


//Shim for deprecaated accordion methods for bootstrap replacements

function accordion_prepare(){
    //init all accordion elements
}
function accordion_create(header,body){
    var bodyElem = $('<div></div>');
    var bodyHtml = "";
    if(body instanceof Array){
        for(var i=0;i<body.length;i++)
            bodyElem.append($(body[i]));
        bodyHtml = bodyElem.html();
    }else
        bodyHtml=body;
    bodyElem=null;
    
    
    var html = `
<div class="card">
    <div class="card-header" id="heading${accordion_create.id}" data-toggle="collapse" data-target="#collapse${accordion_create.id}" aria-expanded="true" aria-controls="collapse${accordion_create.id}">
      <h6 class="mb-0">
        <span >
          ${header}
        </span>
      </h6>
    </div>

    <div class="collapse" id="collapse${accordion_create.id}">
      <div class="card-body pt-0 pb-0">
        ${bodyHtml}
      </div>
    </div>
  </div>
</div>
`;
    accordion_create.id++;
    return $(html).get(0);
}
accordion_create.id=0;