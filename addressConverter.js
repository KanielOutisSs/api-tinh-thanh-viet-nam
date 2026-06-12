const fs = require('fs');
const path = require('path');

class AddressConverter {
    constructor() {
        this.provinces = [];
        this.districts = [];
        this.wards = [];
        this.provinceMap = new Map();
        this.districtMap = new Map();         // Key: `${provinceCode}_${districtNorm}` -> district object
        this.districtByCodeMap = new Map();   // Key: `${provinceCode}_${districtCode}` -> district object
        this.wardMap = new Map();             // Key: `${provinceCode}_${wardNorm}` -> array of ward objects
        this.provinceWardsMap = new Map();    // Key: provinceCode -> flat array of all ward objects in province
        this.oldWardToNewWard = {};
        this.oldDistricts = [];
        this.oldProvinceToNewProvince = {};
        this.isLoaded = false;
    }

    normalize(str) {
        if (!str) return '';
        let s = String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        s = s.toLowerCase().trim();
        
        const prefixes = [
            "thu do ", "tinh ", "thanh pho ", "dac khu ", "thi xa ", "thi tran ", "quan ", "huyen ", "phuong ", "xa "
        ];
        for (const p of prefixes) {
            if (s.startsWith(p)) {
                return s.substring(p.length).trim();
            }
        }
        return s;
    }

    capitalizeWords(str) {
        return str.split(/\s+/).map(w => {
            if (!w) return '';
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
    }

    // Helper functions for Unicode index mapping and splitting
    getNFDSubstrings(nfdPart, matchIndex, matchLength) {
        let cleanIdx = 0;
        let startNFDIdx = -1;
        let endNFDIdx = -1;
        
        for (let i = 0; i < nfdPart.length; i++) {
            const char = nfdPart[i];
            const isDiacritic = /[\u0300-\u036f]/.test(char);
            
            if (cleanIdx === matchIndex && startNFDIdx === -1) {
                startNFDIdx = i;
            }
            if (cleanIdx === matchIndex + matchLength && endNFDIdx === -1) {
                endNFDIdx = i;
                break;
            }
            
            if (!isDiacritic) {
                cleanIdx++;
            }
        }
        if (startNFDIdx === -1) startNFDIdx = 0;
        if (endNFDIdx === -1) {
            endNFDIdx = nfdPart.length;
        } else {
            // Include any combining diacritics immediately following the match
            while (endNFDIdx < nfdPart.length && /[\u0300-\u036f]/.test(nfdPart[endNFDIdx])) {
                endNFDIdx++;
            }
        }
        
        return {
            prefix: nfdPart.substring(0, startNFDIdx).normalize('NFC'),
            suffix: nfdPart.substring(endNFDIdx).normalize('NFC')
        };
    }

    getNFDMatchedSubstring(originalPart, matchIndex, matchLength) {
        const nfdPart = originalPart.normalize('NFD');
        let cleanIdx = 0;
        let startNFDIdx = -1;
        let endNFDIdx = -1;
        
        for (let i = 0; i < nfdPart.length; i++) {
            const char = nfdPart[i];
            const isDiacritic = /[\u0300-\u036f]/.test(char);
            
            if (cleanIdx === matchIndex && startNFDIdx === -1) {
                startNFDIdx = i;
            }
            if (cleanIdx === matchIndex + matchLength && endNFDIdx === -1) {
                endNFDIdx = i;
                break;
            }
            
            if (!isDiacritic) {
                cleanIdx++;
            }
        }
        if (startNFDIdx === -1) startNFDIdx = 0;
        if (endNFDIdx === -1) {
            endNFDIdx = nfdPart.length;
        } else {
            // Include any combining diacritics immediately following the match
            while (endNFDIdx < nfdPart.length && /[\u0300-\u036f]/.test(nfdPart[endNFDIdx])) {
                endNFDIdx++;
            }
        }
        
        return nfdPart.substring(startNFDIdx, endNFDIdx).normalize('NFC');
    }

    stripProvinceSuffix(part, provNorm) {
        const nfdPart = part.normalize('NFD');
        const cleanNorm = nfdPart.replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
        
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(`(?:tinh|thanh pho|thu do)?\\s*${escapeRegExp(provNorm)}\\s*$`, 'i');
        const match = cleanNorm.match(rx);
        
        if (match) {
            const splitResult = this.getNFDSubstrings(nfdPart, match.index, match[0].length);
            let combined = splitResult.prefix.normalize('NFC').trim();
            combined = combined.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();
            return combined;
        }
        
        const idx = cleanNorm.lastIndexOf(provNorm);
        if (idx !== -1) {
            const splitResult = this.getNFDSubstrings(nfdPart, idx, provNorm.length);
            let combined = splitResult.prefix.normalize('NFC').trim();
            combined = combined.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();
            return combined;
        }
        
        return part;
    }

    splitWardFromPart(originalPart, matchedNorm) {
        const nfdPart = originalPart.normalize('NFD');
        const cleanNorm = nfdPart.replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
        
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(`\\b(phuong|xa|thi tran|tt|p|x)?\\s*${escapeRegExp(matchedNorm)}\\b`, 'i');
        const match = cleanNorm.match(rx);
        
        if (match) {
            return this.getNFDSubstrings(nfdPart, match.index, match[0].length);
        }
        
        const idx = cleanNorm.indexOf(matchedNorm);
        if (idx !== -1) {
            return this.getNFDSubstrings(nfdPart, idx, matchedNorm.length);
        }
        
        return { prefix: originalPart, suffix: '' };
    }

    stripDistrictFromName(part, districtObj) {
        if (!districtObj) return part;
        
        const normalizeKeepPrefix = (str) => {
            if (!str) return '';
            return str.normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/đ/g, 'd')
                      .replace(/Đ/g, 'D')
                      .toLowerCase()
                      .trim();
        };

        const distShortNorm = normalizeKeepPrefix(districtObj.name);
        
        const cleanPart = part.normalize('NFD');
        const cleanNorm = cleanPart.replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
        
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match the district name optionally preceded by any administrative prefix (mismatched or not, e.g. "xa yen son" or "huyen yen son")
        const rx = new RegExp(`\\b(quan|huyen|thanh pho|thi xa|q|h|tp|tx|xa|phuong|tt)?\\s*${escapeRegExp(distShortNorm)}\\b`, 'i');
        const match = cleanNorm.match(rx);
        
        if (match) {
            const idx = cleanNorm.indexOf(match[0]);
            const result = this.getNFDSubstrings(cleanPart, idx, match[0].length);
            let combined = [result.prefix, result.suffix].filter(s => s.trim()).join(' ');
            combined = combined.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();
            return combined;
        }
        
        return part;
    }

    disambiguateWard(candidates, fullAddressNorm, wNorm) {
        if (!candidates || candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        
        let bestCandidate = candidates[0];
        let maxScore = -1;
        
        for (const cand of candidates) {
            let score = 0;
            if (cand.districtFullName) {
                const distFullNorm = this.normalize(cand.districtFullName);
                const distShortNorm = this.normalize(cand.districtFullName.replace(/^(quan|huyen|thi xa|thanh pho)\s+/i, ''));
                
                if (fullAddressNorm.includes(distFullNorm)) {
                    score += 10;
                } else if (fullAddressNorm.includes(distShortNorm)) {
                    score += 5;
                }
            }
            
            // 1. Score based on direct ward name match
            const wardNorm = cand.norm;
            const wardFullNorm = this.normalize(cand.fullName);
            if (fullAddressNorm.includes(wardFullNorm)) {
                score += 20;
            } else if (fullAddressNorm.includes(wardNorm)) {
                score += 10;
            }
            
            // 2. Score based on mapped old ward name match
            if (wNorm) {
                const mappedNewNorms = this.oldWardToNewWard[wNorm];
                if (mappedNewNorms && mappedNewNorms.includes(cand.norm)) {
                    if (fullAddressNorm.includes("xa " + wNorm) || 
                        fullAddressNorm.includes("phuong " + wNorm) || 
                        fullAddressNorm.includes("thi tran " + wNorm)) {
                        score += 20;
                    } else if (fullAddressNorm.includes(wNorm)) {
                        score += 10;
                    }
                }
            }
            
            if (score > maxScore) {
                maxScore = score;
                bestCandidate = cand;
            }
        }
        return bestCandidate;
    }

    loadData(oldDataPath, newDataPath) {
        const newData = JSON.parse(fs.readFileSync(newDataPath, 'utf8'));
        
        this.provinces = [];
        this.districts = [];
        this.wards = [];
        this.provinceMap = new Map();
        this.districtMap = new Map();
        this.districtByCodeMap = new Map();
        this.wardMap = new Map();
        this.provinceWardsMap = new Map();

        for (const prov of newData) {
            const pObj = {
                code: prov.Code,
                name: prov.Name,
                fullName: prov.FullName,
                norm: this.normalize(prov.FullName)
            };
            this.provinces.push(pObj);
            this.provinceMap.set(pObj.norm, pObj);
            
            const provWards = [];
            if (prov.Districts) {
                for (const dist of prov.Districts) {
                    const dObj = {
                        provinceCode: prov.Code,
                        code: dist.Code,
                        name: dist.Name,
                        fullName: dist.FullName,
                        norm: this.normalize(dist.FullName)
                    };
                    this.districts.push(dObj);
                    this.districtMap.set(`${prov.Code}_${dObj.norm}`, dObj);
                    this.districtByCodeMap.set(`${prov.Code}_${dist.Code}`, dObj);
                    
                    if (dist.Wards) {
                        for (const ward of dist.Wards) {
                            const wObj = {
                                provinceCode: prov.Code,
                                provinceFullName: prov.FullName,
                                districtCode: dist.Code,
                                districtFullName: dist.FullName,
                                code: ward.Code,
                                name: ward.Name,
                                fullName: ward.FullName,
                                norm: this.normalize(ward.FullName)
                            };
                            this.wards.push(wObj);
                            
                            const wKey = `${prov.Code}_${wObj.norm}`;
                            if (!this.wardMap.has(wKey)) {
                                this.wardMap.set(wKey, []);
                            }
                            this.wardMap.get(wKey).push(wObj);
                            provWards.push(wObj);
                        }
                    }
                }
            }
            this.provinceWardsMap.set(prov.Code, provWards);
        }

        const oldData = JSON.parse(fs.readFileSync(oldDataPath, 'utf8'));
        
        // Populate oldProvinceToNewProvince
        for (const d of oldData) {
            if (d.ma.startsWith('ti') && d.truocsapnhap && d.truocsapnhap !== "giữ nguyên") {
                const newNameNorm = this.normalize(d.ten);
                const newProv = this.provinceMap.get(newNameNorm);
                if (newProv) {
                    const parts = d.truocsapnhap.split(/,| và /).map(s => s.trim()).filter(s => s);
                    for (const p of parts) {
                        let cleanOldName = p.replace(/\(.*\)/, '').trim();
                        let oldNameNorm = this.normalize(cleanOldName);
                        if (oldNameNorm && oldNameNorm !== newProv.norm) {
                            this.oldProvinceToNewProvince[oldNameNorm] = newProv;
                        }
                    }
                }
            }
        }

        for (const d of oldData) {
            if (d.tinhthanh && d.quanhuyen) {
                let pCode = null;
                const pNorm = this.normalize(d.tinhthanh);
                const prov = this.provinces.find(p => this.normalize(p.name).endsWith(pNorm) || p.norm.endsWith(pNorm));
                if (prov) pCode = prov.code;

                if (pCode) {
                    const dNorm = this.normalize(d.quanhuyen);
                    if (!this.oldDistricts.some(od => od.provinceCode === pCode && od.norm === dNorm)) {
                        this.oldDistricts.push({ provinceCode: pCode, norm: dNorm });
                    }
                }
            }
        }
        for (const unit of oldData) {
            if (unit.ma.startsWith('ti')) continue;
            if (!unit.truocsapnhap || unit.truocsapnhap === "giữ nguyên") continue;
            
            const newNameNorm = this.normalize(unit.ten);
            const parts = unit.truocsapnhap.split(/,| và /).map(s => s.trim()).filter(s => s);
            
            for (const p of parts) {
                let cleanOldName = p.replace(/\(.*\)/, '').trim();
                let oldNameNorm = this.normalize(cleanOldName);
                if (oldNameNorm && oldNameNorm !== newNameNorm) {
                    if (!this.oldWardToNewWard[oldNameNorm]) {
                        this.oldWardToNewWard[oldNameNorm] = [];
                    }
                    this.oldWardToNewWard[oldNameNorm].push(newNameNorm);
                }
            }
        }
        // Hardcode old province Hà Tây mapping to Hà Nội
        this.oldProvinceToNewProvince[this.normalize("Hà Tây")] = this.provinceMap.get(this.normalize("Hà Nội"));
        
        this.isLoaded = true;
    }

    convertAddress(rawAddress) {
        if (!this.isLoaded) throw new Error("Data not loaded");
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let text = rawAddress;
        
        // Standardize common administrative abbreviations (with dot, space, or preceding a digit)
        // 1. Insert space between single letter abbreviation and digit (e.g. p5 -> p 5)
        text = text.replace(/(?<![\p{L}\p{N}])(q|p|h|x)(?=\d)/giu, '$1 ');

        // 2. Expand ktt
        text = text.replace(/(?<![\p{L}\p{N}])(ktt)(?![\p{L}\p{N}])\.?\s*/giu, 'khu tập thể ');

        // 3. Expand khu tt, nhà tt, dãy tt
        text = text.replace(/\b(khu|nha|day)\s+(tt|t\.t)\b/gi, '$1 tập thể');

        // 4. Expand tt followed by number or single letter block to "tập thể"
        text = text.replace(/(?<![\p{L}\p{N}])(tt|t\.t)(?![\p{L}\p{N}])\.?\s*(?=\d|[a-z]\b|[a-z]\d)/giu, 'tập thể ');

        // 5. Expand other abbreviations using Unicode property escapes
        text = text.replace(/(?<![\p{L}\p{N}])(tp|t\.p)(?![\p{L}\p{N}])\.?\s*/giu, 'thành phố ');
        text = text.replace(/(?<![\p{L}\p{N}])(tx)(?![\p{L}\p{N}])\.?\s*/giu, 'thị xã ');
        text = text.replace(/(?<![\p{L}\p{N}])(tt)(?![\p{L}\p{N}])\.?\s*/giu, 'thị trấn ');
        text = text.replace(/(?<![\p{L}\p{N}])(q)(?![\p{L}\p{N}])\.?\s*/giu, 'quận ');
        text = text.replace(/(?<![\p{L}\p{N}])(h)(?![\p{L}\p{N}])\.?\s*/giu, 'huyện ');
        text = text.replace(/(?<![\p{L}\p{N}])(p)(?![\p{L}\p{N}])\.?\s*/giu, 'phường ');
        text = text.replace(/(?<![\p{L}\p{N}])(x)(?![\p{L}\p{N}])\.?\s*/giu, 'xã ');
        text = text.replace(/(?<![\p{L}\p{N}])(t)(?![\p{L}\p{N}])\.?\s*/giu, 'tỉnh ');

        // Convert hyphens and semicolons to commas for standard splitting
        text = text.replace(/\s*-\s*/g, ', ');
        text = text.replace(/\s*;\s*/g, ', ');

        // Fix common typos in prefixes
        text = text.replace(/\bxả\b/gi, 'xã');
        text = text.replace(/\bhuyên\b/gi, 'huyện');
        
        // Auto-insert commas before administrative prefixes if missing
        text = text.replace(/(?<!,\s*)\b(tỉnh|thành phố|thủ đô|huyện|quận|thị xã|phường|xã|thị trấn)\s+/gi, ', $1 ');
        
        const parts = text.split(',').map(s => s.trim().normalize('NFC')).filter(s => s);
        
        let resultProvince = null;
        let resultDistrict = null;
        let resultWard = null;
        let mappedFromOldWard = null;

        let pIdx = parts.length - 1;
        
        // Step 1: Detect Province
        if (pIdx >= 0) {
            let pNorm = this.normalize(parts[pIdx]);
            let foundProv = this.provinceMap.get(pNorm);
            if (!foundProv) {
                foundProv = this.oldProvinceToNewProvince[pNorm];
            }
            
            if (foundProv) {
                pIdx--;
            } else {
                // Fallback for missing commas (e.g. "sơn dương tuyên quang")
                for (const p of this.provinces) {
                    if (pNorm.endsWith(p.norm)) {
                        foundProv = p;
                        parts[pIdx] = this.stripProvinceSuffix(parts[pIdx], p.norm);
                        if (!parts[pIdx]) {
                            pIdx--;
                        }
                        break;
                    }
                }
                
                // Fallback for missing commas with old provinces
                if (!foundProv) {
                    for (const oldProvNorm in this.oldProvinceToNewProvince) {
                        if (pNorm.endsWith(oldProvNorm)) {
                            foundProv = this.oldProvinceToNewProvince[oldProvNorm];
                            parts[pIdx] = this.stripProvinceSuffix(parts[pIdx], oldProvNorm);
                            if (!parts[pIdx]) {
                                pIdx--;
                            }
                            break;
                        }
                    }
                }
            }
            if (foundProv) {
                resultProvince = foundProv;
            }
        }

        // Step 2: Detect Ward (Phase 1)
        let foundWard = null;
        let foundWardPartIdx = -1;
        let foundWardSubstringMatch = false;

        for (let i = 0; i <= pIdx; i++) {
            let wNorm = this.normalize(parts[i]);
            if (!wNorm) continue;
            
            let candidates = [];
            let wasMapped = false;
            
            if (resultProvince) {
                // If this exact ward name is also a district name in the same province,
                // check if there is another part in the address that contains a ward name.
                // If so, skip exact match for this part here so it can be matched as a district later.
                let isAlsoDistrict = this.districts.some(d => d.provinceCode === resultProvince.code && d.norm === wNorm);
                if (isAlsoDistrict) {
                    let otherPartHasWard = false;
                    for (let j = 0; j <= pIdx; j++) {
                        if (j === i) continue;
                        let otherNorm = this.normalize(parts[j]);
                        if (!otherNorm) continue;
                        
                        const provinceWards = this.provinceWardsMap.get(resultProvince.code) || [];
                        for (const w of provinceWards) {
                            let rx = new RegExp(`\\b${escapeRegExp(w.norm)}\\b`, 'i');
                            if (rx.test(otherNorm)) {
                                otherPartHasWard = true;
                                break;
                            }
                        }
                        if (otherPartHasWard) break;
                        
                        for (const oldNorm in this.oldWardToNewWard) {
                            let rx = new RegExp(`\\b${escapeRegExp(oldNorm)}\\b`, 'i');
                            if (rx.test(otherNorm)) {
                                let mappedNewNorms = this.oldWardToNewWard[oldNorm];
                                for (const mappedNorm of mappedNewNorms) {
                                    if (this.wardMap.has(`${resultProvince.code}_${mappedNorm}`)) {
                                        otherPartHasWard = true;
                                        break;
                                    }
                                }
                            }
                            if (otherPartHasWard) break;
                        }
                    }
                    if (otherPartHasWard) {
                        continue; // Skip exact match in Step 2
                    }
                }

                // Direct match
                let directCands = this.wardMap.get(`${resultProvince.code}_${wNorm}`);
                if (directCands && directCands.length > 0) {
                    candidates.push(...directCands);
                }
                
                // Mapped match (always check old ward mapping too)
                let mappedNewNorms = this.oldWardToNewWard[wNorm];
                if (mappedNewNorms && mappedNewNorms.length > 0) {
                    for (const mappedNorm of mappedNewNorms) {
                        let wardsInProv = this.wardMap.get(`${resultProvince.code}_${mappedNorm}`);
                        if (wardsInProv) {
                            for (const w of wardsInProv) {
                                if (!candidates.some(c => c.code === w.code)) {
                                    candidates.push(w);
                                }
                            }
                        }
                    }
                }
            }
            
            if (candidates.length > 0) {
                foundWard = this.disambiguateWard(candidates, this.normalize(text), wNorm);
                foundWardPartIdx = i;
                if (foundWard && foundWard.norm !== wNorm) {
                    let mappedNewNorms = this.oldWardToNewWard[wNorm];
                    if (mappedNewNorms && mappedNewNorms.includes(foundWard.norm)) {
                        mappedFromOldWard = { originalName: parts[i], norm: wNorm };
                    }
                }
                break;
            }
        }

        // Step 3: Substring Fallback for Ward if not found
        if (!foundWard && resultProvince) {
            let matches = [];
            const wardsInProv = this.provinceWardsMap.get(resultProvince.code) || [];
            
            for (let i = 0; i <= pIdx; i++) {
                let wNorm = this.normalize(parts[i]);
                if (!wNorm) continue;
                
                // Skip ward matching if the current part is exactly a district name to avoid false positives (e.g. "Nam Từ Liêm")
                let isDistrictPart = false;
                for (const d of this.districts) {
                    if (d.provinceCode === resultProvince.code && d.norm === wNorm) {
                        isDistrictPart = true;
                        break;
                    }
                }
                if (isDistrictPart) {
                    continue;
                }

                for (const w of wardsInProv) {
                    let rx = new RegExp(`\\b${escapeRegExp(w.norm)}\\b`, 'i');
                    let match = wNorm.match(rx);
                    if (match) {
                        let prefixSub = wNorm.substring(0, match.index).trim();
                        if (/^\d+$/.test(w.norm)) {
                            if (/\b(to|khu|so|ngo|ngach|hem|ap|duong|km|nha|sn|thon|ban|lang|buon|khoi|giap|phuong|xa)\b/i.test(prefixSub)) {
                                continue;
                            }
                        }
                        
                        // Check for road/street indicator prefix for non-numeric ward names to avoid false matches (e.g. đường Lê Lợi)
                        let isStreet = /\b(duong|pho|ngo|ngach|hem|so|sn|km|so nha|ki lo met|ql|dt|quoc lo|duong tinh)\b[\s\d/a-z-]*$/i.test(prefixSub);
                        // Do not treat as street if preceded by a neighborhood indicator (e.g. "tổ dân phố số 10 Cầu Diễn")
                        let isNeigh = /\b(to\s+dan\s+pho|khu\s+pho|lien\s+khu|to|khu|thon|xom|ap|ban|buon|phum|soc)\b/i.test(prefixSub);
                        if (isStreet && !isNeigh) {
                            continue;
                        }
                        
                        matches.push({
                            ward: w,
                            partIdx: i,
                            index: match.index,
                            length: w.norm.length,
                            wasMapped: false
                        });
                    }
                }
                
                for (const oldNorm in this.oldWardToNewWard) {
                    let rx = new RegExp(`\\b${escapeRegExp(oldNorm)}\\b`, 'i');
                    let match = wNorm.match(rx);
                    if (match) {
                        let prefixSub = wNorm.substring(0, match.index).trim();
                        if (/^\d+$/.test(oldNorm)) {
                            if (/\b(to|khu|so|ngo|ngach|hem|ap|duong|km|nha|sn|thon|ban|lang|buon|khoi|giap|phuong|xa)\b/i.test(prefixSub)) {
                                continue;
                            }
                        }
                        
                        // Check for road/street indicator prefix for non-numeric ward names to avoid false matches
                        let isStreet = /\b(duong|pho|ngo|ngach|hem|so|sn|km|so nha|ki lo met|ql|dt|quoc lo|duong tinh)\b[\s\d/a-z-]*$/i.test(prefixSub);
                        // Do not treat as street if preceded by a neighborhood indicator
                        let isNeigh = /\b(to\s+dan\s+pho|khu\s+pho|lien\s+khu|to|khu|thon|xom|ap|ban|buon|phum|soc)\b/i.test(prefixSub);
                        if (isStreet && !isNeigh) {
                            continue;
                        }
                        
                        let mappedNewNorms = this.oldWardToNewWard[oldNorm];
                        let validCandidates = [];
                        for (const mappedNorm of mappedNewNorms) {
                            let wardsInProv = this.wardMap.get(`${resultProvince.code}_${mappedNorm}`);
                            if (wardsInProv) {
                                validCandidates.push(...wardsInProv);
                            }
                        }
                        
                        if (validCandidates.length > 0) {
                            for (const cand of validCandidates) {
                                matches.push({
                                    ward: cand,
                                    partIdx: i,
                                    index: match.index,
                                    length: oldNorm.length,
                                    wasMapped: true,
                                    originalMatched: oldNorm
                                });
                            }
                        }
                    }
                }
            }
            
            if (matches.length > 0) {
                matches.sort((a, b) => {
                    if (a.partIdx !== b.partIdx) return a.partIdx - b.partIdx;
                    if (a.index !== b.index) return a.index - b.index;
                    return b.length - a.length;
                });
                
                const bestMatchItem = matches[0];
                const bestCandidates = matches.filter(m => m.partIdx === bestMatchItem.partIdx && m.index === bestMatchItem.index && m.length === bestMatchItem.length)
                                              .map(m => m.ward);
                
                let matchedWNorm = bestMatchItem.wasMapped ? bestMatchItem.originalMatched : bestMatchItem.ward.norm;
                foundWard = this.disambiguateWard(bestCandidates, this.normalize(text), matchedWNorm);
                foundWardPartIdx = bestMatchItem.partIdx;
                foundWardSubstringMatch = true;
                
                let matchedStr = bestMatchItem.wasMapped ? bestMatchItem.originalMatched : foundWard.norm;
                const originalPart = parts[foundWardPartIdx];
                const splitResult = this.splitWardFromPart(originalPart, matchedStr);
                
                let newParts = [];
                if (splitResult.prefix) newParts.push(splitResult.prefix);
                if (splitResult.suffix) newParts.push(splitResult.suffix);
                
                parts.splice(foundWardPartIdx, 1, ...newParts);
                pIdx = pIdx - 1 + newParts.length;
                
                if (bestMatchItem.wasMapped) {
                    const cleanPart = originalPart.normalize('NFD');
                    const cleanNorm = cleanPart.replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
                    const idx = cleanNorm.indexOf(matchedStr);
                    let origMatchedName = matchedStr;
                    if (idx !== -1) {
                        origMatchedName = this.getNFDMatchedSubstring(originalPart, idx, matchedStr.length);
                    }
                    mappedFromOldWard = { originalName: origMatchedName, norm: matchedStr };
                }
            }
        }

        if (foundWard) {
            resultWard = foundWard;
            
            if (!foundWardSubstringMatch) {
                parts.splice(foundWardPartIdx, 1);
                pIdx--;
            }
            
            if (resultProvince) {
                resultDistrict = this.districtByCodeMap.get(`${resultProvince.code}_${resultWard.districtCode}`);
            }
            
            if (resultDistrict) {
                for (let i = 0; i <= pIdx; i++) {
                    parts[i] = this.stripDistrictFromName(parts[i], resultDistrict);
                }
            }
        }

        // Step 4: Detect District (Phase 2 - if Ward not detected)
        if (!resultWard && resultProvince) {
            for (let i = 0; i <= pIdx; i++) {
                let dNorm = this.normalize(parts[i]);
                if (!dNorm) continue;
                
                let matchedDist = this.districtMap.get(`${resultProvince.code}_${dNorm}`);
                if (!matchedDist) {
                    let oldDistObj = this.oldDistricts.find(od => od.provinceCode === resultProvince.code && od.norm === dNorm);
                    if (oldDistObj) {
                        matchedDist = this.districts.find(d => d.provinceCode === resultProvince.code && d.norm === dNorm);
                    }
                }
                
                if (matchedDist) {
                    resultDistrict = matchedDist;
                    parts.splice(i, 1);
                    pIdx--;
                    break;
                }
            }
        }

        // Step 5: Format Remaining Parts
        let remainingParts = parts.slice(0, pIdx + 1)
            .map(p => p.replace(/^[,\-\s]+|[,\-\s]+$/g, '').replace(/\s+/g, ' ').trim())
            .filter(p => p);

        if (mappedFromOldWard && remainingParts.length > 0) {
            let oldNameClean = mappedFromOldWard.originalName.replace(/^(phường|xã|thị trấn)\s+/i, '').trim();
            oldNameClean = this.capitalizeWords(oldNameClean);
            for (let i = 0; i < remainingParts.length; i++) {
                let p = remainingParts[i];
                if (/\bkhu\s+\d+/i.test(p)) {
                    remainingParts[i] = p.replace(/\bkhu\b/i, `Khu phố ${oldNameClean}`);
                } else {
                    remainingParts[i] = this.capitalizeWords(p);
                }
            }
        } else {
            for (let i = 0; i < remainingParts.length; i++) {
                remainingParts[i] = this.capitalizeWords(remainingParts[i]);
            }
        }

        let addressSuffix = [];
        if (resultWard) addressSuffix.push(resultWard.fullName);
        
        // All provinces operate on 2-tier local government model (no district level in output address)
        const isTwoTierProvince = true;
        if (resultDistrict && !isTwoTierProvince) {
            addressSuffix.push(resultDistrict.fullName);
        }
        
        if (resultProvince) addressSuffix.push(resultProvince.fullName);

        let addressPrefix = remainingParts.join(', ');
        
        let finalAddress = [addressPrefix, ...addressSuffix].filter(s => s).join(', ');
        return finalAddress;
    }
}

module.exports = AddressConverter;
