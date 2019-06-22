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

i18n.String=
class LocalizedString{
    constructor(name){
        this.name=name;
    }
    get(locale_tag){
        return this.get(locale_tag);
    }
    localize(locale_tag){
        var localizations = i18n.localizations.getLocalizations(locale_tag);
        if(localizations==='undefined') return "!MISSING_LOCALIZATIONS:"+locale_tag+"!";
        var localization=localizations[this.name];
        if(localization==='undefined') return "!MISSING_LOCALIZATION:"+locale_tag+":"+this.name+"!";
        return localization;
    }
};