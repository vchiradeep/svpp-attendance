/*
  =====================================================
  SVPCET Roll Number Generator
  =====================================================
  Full roll format: 25G01A + BRANCH(2) + SERIES(2)

  SERIES encoding:
  01–99 → "01".."99"
  100   → "A0", 101 → "A1" ... 109 → "A9"
  110   → "B0", 111 → "B1" ... 119 → "B9"
  ...and so on

  Usage (browser):
    const rolls = generateSection("05", "01", "75");
    // ["25G01A0501", "25G01A0502", ..., "25G01A0575"]
  =====================================================
*/

const SERIES_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Convert a series string like "01", "F0", "M5" → numeric index
function seriesToIndex(ser) {
  if (/^[0-9]{2}$/.test(ser)) return parseInt(ser, 10);
  // Letter + digit: A0=100, A1=101, ..., Z9=359
  return 100 + SERIES_LETTERS.indexOf(ser[0]) * 10 + parseInt(ser[1], 10);
}

// Convert numeric index → 2-char series string
function indexToSeries(n) {
  if (n <= 99) return String(n).padStart(2, "0");
  const offset = n - 100;
  const letter = SERIES_LETTERS[Math.floor(offset / 10)];
  const digit  = offset % 10;
  return letter + digit;
}

// Generate all roll numbers for a section
// branch = "05", "04", etc.   startSer/endSer = "01", "F0", "M5" etc.
function generateSection(branch, startSer, endSer) {
  const s = seriesToIndex(startSer);
  const e = seriesToIndex(endSer);
  const rolls = [];
  for (let i = s; i <= e; i++) {
    rolls.push("25G01A" + branch + indexToSeries(i));
  }
  return rolls;
}

// ===================== ALL SECTIONS =====================
const SECTION_MAP = {
  // CSE
  "CSE - A":  () => generateSection("05", "01", "75"),
  "CSE - B":  () => generateSection("05", "76", "F0"),
  "CSE - C":  () => generateSection("05", "F1", "M5"),
  "CSE - D":  () => generateSection("05", "M6", "R9"),

  // AI
  "A.I - A":  () => generateSection("43", "01", "75"),
  "A.I - B":  () => generateSection("43", "76", "F0"),
  "A.I - C":  () => generateSection("43", "F1", "I2"),

  // AIML
  "AIML - A": () => generateSection("42", "01", "75"),
  "AIML - B": () => generateSection("42", "76", "F0"),
  "AIML - C": () => generateSection("42", "F1", "M0"),

  // Data Science
  "D.S":      () => generateSection("32", "01", "41"),

  // ECE (Electronics)
  "ECE - A":  () => generateSection("04", "01", "75"),
  "ECE - B":  () => generateSection("04", "76", "B5"),

  // ECE (Electrical)
  "ECE - C":  () => generateSection("02", "01", "19"),

  // Civil
  "CIVIL":    () => generateSection("01", "02", "09"),

  // Mechanical
  "Mechanical": () => generateSection("03", "01", "12"),
};

// Get student list for a section
function getStudentsForSection(section) {
  const fn = SECTION_MAP[section];
  return fn ? fn() : [];
}