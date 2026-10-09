/**
 * Urdu to Roman Urdu Transliteration Engine
 * Converts Urdu (Arabic script) into phonetic Roman Urdu (English alphabet).
 * Example: "کیسے ہو آپ" -> "kesy ho ap"
 */

// Common high-frequency conversational Urdu word mapping to Roman Urdu
const URDU_TO_ROMAN_DICT: Record<string, string> = {
  // Questions & Greetings
  کیسے: "kesy",
  کیسا: "kesa",
  کیسی: "kesi",
  ہو: "ho",
  آپ: "ap",
  تم: "tum",
  میں: "main",
  ہم: "hum",
  وہ: "woh",
  یہ: "yeh",
  تو: "tu",
  کیا: "kya",
  کیوں: "kyun",
  کب: "kab",
  کہاں: "kahan",
  کون: "kaun",
  کونسا: "kaunsa",
  کونسی: "kaunsi",
  کونسے: "kaunse",
  کتنا: "kitna",
  کتنی: "kitni",
  کتنے: "kitne",
  سلام: "salam",
  السلام: "assalam",
  علیکم: "o alaikum",
  وعلیکم: "wa alaikum",
  شکریہ: "shukriya",
  مہربانی: "meherbani",
  خدا: "khuda",
  حافظ: "hafiz",
  اللہ: "allah",

  // Pronouns & Possessives
  میرا: "mera",
  میری: "meri",
  میرے: "mere",
  ہمارا: "hamara",
  ہماری: "hamari",
  ہمارے: "hamare",
  آپکا: "apka",
  آپکی: "apki",
  آپکے: "apke",
  تمہارا: "tumhara",
  تمہاری: "tumhari",
  تمہارے: "tumhare",
  اسکا: "iska",
  اسکی: "iski",
  اسکے: "iske",
  انکا: "inka",
  انکی: "inki",
  انکے: "inke",
  اس: "is",
  ان: "in",
  اسی: "isi",
  انہیں: "unhein",
  اسے: "usey",
  اپنا: "apna",
  اپنی: "apni",
  اپنے: "apne",
  خود: "khud",

  // Auxiliary & State Verbs
  ہے: "hai",
  ہیں: "hain",
  ہوں: "hoon",
  تھا: "tha",
  تھی: "thi",
  تھے: "thay",
  رہا: "raha",
  رہی: "rahi",
  رہے: "rahe",
  ہونا: "hona",
  ہوگا: "hoga",
  ہوگی: "hogi",
  ہوںگے: "honge",
  ہوتے: "hote",
  ہوتی: "hoti",
  ہوتا: "hota",

  // Common Action Verbs
  کر: "kar",
  کرو: "karo",
  کریں: "karein",
  کرتا: "karta",
  کرتی: "karti",
  کرتے: "karte",
  کرنا: "karna",
  کرنے: "karne",
  کہا: "kaha",
  کہہ: "keh",
  کہتے: "kahte",
  کہتی: "kahti",
  کہتا: "kahta",
  جاؤ: "jao",
  جائیں: "jayein",
  جاتا: "jata",
  جاتی: "jati",
  جاتے: "jate",
  جانا: "jana",
  آؤ: "aao",
  آئیں: "aayein",
  آتا: "aata",
  آتی: "aati",
  آتے: "aate",
  آنا: "aana",
  آیا: "aaya",
  آئی: "aayi",
  آئے: "aaye",
  دیکھو: "dekho",
  دیکھیں: "dekhein",
  دیکھنا: "dekhna",
  دیکھا: "dekha",
  سنو: "suno",
  سنیں: "sunein",
  بولیں: "bolein",
  بولو: "bolo",
  بولنا: "bolna",
  بتائیں: "batayein",
  بتاؤ: "batao",
  بتانا: "batana",
  بتا: "bata",
  لکھو: "likho",
  لکھیں: "likhein",
  لکھنا: "likhna",
  پڑھو: "parho",
  پڑھیں: "parhein",
  پڑھنا: "parhna",
  سمجھ: "samajh",
  سمجھیں: "samjhein",
  سمجھاؤ: "samjhao",
  سوچو: "socho",
  سوچیں: "sochein",
  دینا: "dena",
  دو: "do",
  دیں: "dein",
  دیا: "diya",
  دی: "di",
  دئے: "diye",
  دیے: "diye",
  لینا: "lena",
  لو: "lo",
  لیں: "lein",
  لیا: "liya",
  لی: "li",
  پوچھو: "poocho",
  چاہئے: "chahiye",
  چاہیے: "chahiye",
  چاہتا: "chahta",
  چاہتی: "chahti",
  چاہتے: "chahte",
  سکتا: "sakta",
  سکتی: "sakti",
  سکتے: "sakte",

  // Conjunctions & Modifiers
  اور: "aur",
  یا: "ya",
  لیکن: "lekin",
  مگر: "magar",
  اگر: "agar",
  تو: "toh",
  بھی: "bhi",
  ہی: "hi",
  نہ: "na",
  نہیں: "nahi",
  "نہیں،": "nahi,",
  شاید: "shayad",
  کیونکہ: "kyunke",
  حالانکہ: "halanke",
  جب: "jab",
  تب: "tab",

  // Prepositions & Connectors
  کا: "ka",
  کے: "ke",
  کی: "ki",
  کو: "ko",
  سے: "se",
  پر: "par",
  پہ: "pe",
  تک: "tak",
  پاس: "paas",
  ساتھ: "saath",
  لیے: "liye",
  لئے: "liye",
  والا: "wala",
  والی: "wali",
  والے: "wale",
  اندر: "andar",
  باہر: "bahir",
  اوپر: "ooper",
  نیچے: "neeche",
  سامنے: "saamne",
  پیچھے: "peeche",
  درمیان: "darmiyan",

  // Common Adjectives & Adverbs
  ٹھیک: "theek",
  بہت: "bohat",
  اچھا: "acha",
  اچھی: "achi",
  اچھے: "ache",
  برا: "bura",
  بری: "buri",
  برے: "bure",
  کام: "kaam",
  بات: "baat",
  باتیں: "baatein",
  سب: "sab",
  کچھ: "kuch",
  کوئی: "koi",
  لوگ: "log",
  وقت: "waqt",
  دن: "din",
  رات: "raat",
  صبح: "subah",
  شام: "shaam",
  آج: "aaj",
  کل: "kal",
  اب: "ab",
  ابھی: "abhi",
  پہلے: "pehlay",
  بعد: "baad",
  دوبارہ: "dobara",
  پھر: "phir",
  ہمیشہ: "hamesha",
  کبھی: "kabhi",
  ضرور: "zaroor",
  پلیز: "please",
  مسئلہ: "masla",
  حل: "hal",
  مدد: "madad",
  سوال: "sawal",
  جواب: "jawab",
  صحیح: "sahi",
  غلط: "galat",
  نیا: "naya",
  نئی: "nayi",
  نئے: "naye",
  پرانا: "purana",
  بڑا: "bada",
  بڑی: "badi",
  بڑے: "bade",
  چھوٹا: "chota",
  چھوٹی: "choti",
  چھوٹے: "chote",
  زیادہ: "zyada",
  کم: "kam",
  سارا: "saara",
  ساری: "saari",
  سارے: "saare",
  حال: "haal",
  خیریت: "khariyat",
  طبیعت: "tabiyat",

  // Tech / Programming terms
  کوڈ: "code",
  فائل: "file",
  فائلیں: "files",
  ایپ: "app",
  ایپلیکیشن: "application",
  "سافٹ ویئر": "software",
  سرور: "server",
  ایرر: "error",
  بگ: "bug",
  ٹیسٹ: "test",
  رن: "run",
  اوپن: "open",
  کلوز: "close",
  بٹن: "button",
  پیج: "page",
  اسکرین: "screen",
  ویب: "web",
  سائٹ: "site",
  چیک: "check",
  چینج: "change",
  سیو: "save",
  ڈیلیٹ: "delete",
  اپڈیٹ: "update",
  فکس: "fix",
  شو: "show",
  ایڈ: "add",
  نیو: "new",
  پروجیکٹ: "project",
  سیٹنگ: "setting",
  سیٹنگز: "settings",
  ڈیٹا: "data",
  ماڈل: "model",
  ماڈلز: "models",
  پرووائیڈر: "provider",
  "اے پی آئی": "api",
  کی: "key",
};

// Digraph / aspirate letter clusters
const URDU_DIGRAPHS: [string, string][] = [
  ["بھ", "bh"],
  ["پھ", "ph"],
  ["تھ", "th"],
  ["ٹھ", "th"],
  ["جھ", "jh"],
  ["چھ", "chh"],
  ["دھ", "dh"],
  ["ڈھ", "dh"],
  ["رھ", "rh"],
  ["ڑھ", "rh"],
  ["کھ", "kh"],
  ["گھ", "gh"],
  ["لھ", "lh"],
  ["مھ", "mh"],
  ["نھ", "nh"],
];

// Single letter mapping
const URDU_CHAR_MAP: Record<string, string> = {
  آ: "aa",
  ا: "a",
  ب: "b",
  پ: "p",
  ت: "t",
  ٹ: "t",
  ث: "s",
  ج: "j",
  چ: "ch",
  ح: "h",
  خ: "kh",
  د: "d",
  ڈ: "d",
  ذ: "z",
  ر: "r",
  ڑ: "r",
  ز: "z",
  ژ: "zh",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "z",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "gh",
  ف: "f",
  ق: "q",
  ک: "k",
  گ: "g",
  ل: "l",
  م: "m",
  ن: "n",
  ں: "n",
  و: "o",
  ہ: "h",
  ۂ: "h",
  ۃ: "t",
  ھ: "h",
  ء: "",
  ی: "i",
  ے: "e",
  ئے: "ye",
  ئ: "y",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

/**
 * Checks if a string contains Urdu / Arabic characters.
 */
export function containsUrdu(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Phonetically transliterates a single Urdu word into Roman Urdu
 */
function transliterateUrduWord(word: string): string {
  // 1. Remove diacritics / harkat
  const clean = word.replace(/[\u064B-\u065F\u0670]/g, "");

  // 2. Direct dictionary check
  if (URDU_TO_ROMAN_DICT[clean]) {
    return URDU_TO_ROMAN_DICT[clean];
  }

  // Check punctuation stripped version
  const stripped = clean.replace(/[؟،۔!?,.]/g, "");
  if (URDU_TO_ROMAN_DICT[stripped]) {
    return URDU_TO_ROMAN_DICT[stripped];
  }

  // 3. Fallback: Phonetic character & digraph transliteration
  let result = clean;

  // Replace digraphs first
  for (const [digraph, roman] of URDU_DIGRAPHS) {
    if (result.includes(digraph)) {
      result = result.split(digraph).join(roman);
    }
  }

  // Replace individual characters
  let output = "";
  for (let i = 0; i < result.length; i++) {
    const char = result[i]!;
    if (URDU_CHAR_MAP[char] !== undefined) {
      output += URDU_CHAR_MAP[char];
    } else {
      output += char;
    }
  }

  // Post-processing cleanup (e.g. double vowels smoothing)
  return output.replace(/aaa+/g, "aa").replace(/eee+/g, "ee").replace(/ooo+/g, "oo");
}

/**
 * Transliterates an Urdu sentence into Roman Urdu.
 * Non-Urdu words and punctuation are preserved.
 *
 * Example:
 *   "کیسے ہو آپ" -> "kesy ho ap"
 */
export function transliterateUrduToRoman(text: string): string {
  if (!text || !containsUrdu(text)) {
    return text;
  }

  // Split text by tokens while keeping whitespace and punctuation intact
  const tokens = text.split(/([\s\p{P}]+)/u);

  return tokens
    .map((token) => {
      if (!token || !containsUrdu(token)) {
        return token;
      }
      return transliterateUrduWord(token);
    })
    .join("");
}
