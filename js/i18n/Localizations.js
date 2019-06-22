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

if(typeof i18n==='undefined') i18n={};

i18n.Localizations=
class Localizations{
    constructor(){
        this.locales=[];
        this.localizations={};
    }
    addLocale(locale_tag,localizedname){
        this.locales.push({tag:locale_tag, name:localizedname});
    }
    addLocalizations(locale_tag, localizations){
        this.localizations[locale_tag]=localizations;
    }
    getLocalizations(locale_tag){
        return this.localizations[locale_tag];
    }
    addDefaultLocale(locale_tag, localizedname, copylocale){
        this.addLocale(locale_tag,localizedname);
        this.addLocalizations(locale_tag, this.getLocalizations(copylocale));
    }
    getString(string_name){
        return new i18n.String(string_name);
    }
};

i18n.localizations=new i18n.Localizations();




