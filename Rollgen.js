// ===== SVPCET Roll Number Generator =====
const _SL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function _si(s){ return /^[0-9]{2}$/.test(s)?parseInt(s,10):100+_SL.indexOf(s[0])*10+parseInt(s[1],10); }
function _is(n){ if(n<=99)return String(n).padStart(2,"0"); const o=n-100; return _SL[Math.floor(o/10)]+(o%10); }
function _gen(br,s,e){ const r=[]; for(let i=_si(s);i<=_si(e);i++) r.push("25G01A"+br+_is(i)); return r; }

const SECTION_ROLLS = {
  "CSE - A":    _gen("05","01","75"),
  "CSE - B":    _gen("05","76","F0"),
  "CSE - C":    _gen("05","F1","M5"),
  "CSE - D":    _gen("05","M6","R9"),
  "A.I - A":    _gen("43","01","75"),
  "A.I - B":    _gen("43","76","F0"),
  "A.I - C":    _gen("43","F1","I2"),
  "AIML - A":   _gen("42","01","75"),
  "AIML - B":   _gen("42","76","F0"),
  "AIML - C":   _gen("42","F1","M0"),
  "D.S":        _gen("32","01","41"),
  "ECE - A":    _gen("04","01","75"),
  "ECE - B":    _gen("04","76","B5"),
  "ECE - C":    _gen("02","01","19"),
  "CIVIL":      _gen("01","02","09"),
  "Mechanical": _gen("03","01","12"),
};

function getStudentsForSection(sec){ return SECTION_ROLLS[sec]||[]; }
function isValidRollForSection(roll,sec){ return (SECTION_ROLLS[sec]||[]).includes(roll); }
function getSectionForRoll(roll){ for(const[s,r]of Object.entries(SECTION_ROLLS)) if(r.includes(roll)) return s; return null; }