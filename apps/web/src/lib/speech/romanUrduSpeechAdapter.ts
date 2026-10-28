/**
 * High-Accuracy Roman Urdu Speech Adapter
 *
 * Bridges Roman Urdu (Latin script) to Web Speech API synthesis engines:
 * 1. Native Urdu voices (ur-PK / ur) -> Converts Roman Urdu to Urdu script (اردو) for 100% authentic Pakistani pronunciation.
 * 2. Native Hindi voices (hi-IN) -> Converts Roman Urdu to Devanagari script for flawless Subcontinental pronunciation.
 * 3. English / Indian English voices (en-IN, en-US, en-GB) -> Applies phonetic respelling so English synthesizers
 *    pronounce Roman Urdu words with natural Pakistani cadence instead of garbled English phonemes.
 */

// Common Roman Urdu to Urdu Script dictionary (Urdu Unicode)
const ROMAN_TO_URDU_DICT: Record<string, string> = {
  // Greetings & Salutations
  assalam: "السلام",
  salam: "سلام",
  alaikum: "علیکم",
  walaikum: "وعلیکم",
  shukriya: "شکریہ",
  meherbani: "مہربانی",
  khuda: "خدا",
  hafiz: "حافظ",
  allah: "اللہ",

  // Pronouns
  main: "میں",
  hum: "ہم",
  tum: "تم",
  aap: "آپ",
  ap: "آپ",
  tu: "تو",
  yeh: "یہ",
  ye: "یہ",
  woh: "وہ",
  wo: "وہ",
  mera: "میرا",
  meri: "میری",
  mere: "میرے",
  hamara: "ہمارا",
  hamari: "ہماری",
  hamare: "ہمارے",
  apka: "آپکا",
  apki: "آپکی",
  apke: "آپکے",
  tumhara: "تمہارا",
  tumhari: "تمہاری",
  tumhare: "تمہارے",
  iska: "اسکا",
  iski: "اسکی",
  iske: "اسکے",
  unka: "انکا",
  unki: "انکی",
  unke: "انکے",
  is: "اس",
  in: "ان",
  isi: "اسی",
  unhein: "انہیں",
  usey: "اسے",
  use: "اسے",
  apna: "اپنا",
  apni: "اپنی",
  apne: "اپنے",
  khud: "خود",

  // Questions
  kya: "کیا",
  kia: "کیا",
  kyun: "کیوں",
  kyu: "کیوں",
  kab: "کب",
  kahan: "کہاں",
  kaun: "کون",
  kon: "کون",
  kaunsa: "کونسا",
  kaunsi: "کونسی",
  kaunse: "کونسے",
  kitna: "کتنا",
  kitni: "کتنی",
  kitne: "کتنے",
  kaise: "کیسے",
  kese: "کیسے",
  kesy: "کیسے",
  kaisa: "کیسا",
  kesa: "کیسا",
  kaisi: "کیسی",
  kesi: "کیسی",

  // Auxiliaries & States
  hai: "ہے",
  hain: "ہیں",
  hoon: "ہوں",
  tha: "تھا",
  thi: "تھی",
  thay: "تھے",
  the: "تھے",
  hona: "ہونا",
  hoga: "ہوگا",
  hogi: "ہوگی",
  honge: "ہوںگے",
  hote: "ہوتے",
  hoti: "ہوتی",
  hota: "ہوتا",
  raha: "رہا",
  rahi: "رہی",
  rahe: "رہے",

  // Common Verbs
  kar: "کر",
  karo: "کرو",
  karein: "کریں",
  karen: "کریں",
  karta: "کرتا",
  karti: "کرتی",
  karte: "کرتے",
  karna: "کرنا",
  karne: "کرنے",
  kaha: "کہا",
  keh: "کہہ",
  kahte: "کہتے",
  kahti: "کہتی",
  kahta: "کہتا",
  jao: "جاؤ",
  jayein: "جائیں",
  jata: "جاتا",
  jati: "جاتی",
  jate: "جاتے",
  jana: "جانا",
  gaya: "گیا",
  gayi: "گئی",
  gaye: "گئے",
  aao: "آؤ",
  aayein: "آئیں",
  aata: "آتا",
  aati: "آتی",
  aate: "آتے",
  aana: "آنا",
  aaya: "آیا",
  aayi: "آئی",
  aaye: "آئے",
  dekho: "دیکھو",
  dekhein: "دیکھیں",
  dekh: "دیکھ",
  dekhna: "دیکھنا",
  dekha: "دیکھا",
  suno: "سنو",
  sunein: "سنیں",
  sun: "سن",
  bolein: "بولیں",
  bolo: "بولو",
  bolna: "بولنا",
  batayein: "بتائیں",
  batao: "بتاؤ",
  batana: "بتانا",
  bata: "بتا",
  samajh: "سمجھ",
  samjhein: "سمجھیں",
  samjhao: "سمجھاؤ",
  socho: "سوچو",
  sochein: "سوچیں",
  dena: "دینا",
  do: "دو",
  dein: "دیں",
  diya: "دیا",
  di: "دی",
  diye: "دیے",
  lena: "لینا",
  lo: "لو",
  lein: "لیں",
  liya: "لیا",
  chahiye: "چاہیے",
  chahye: "چاہیے",
  chahta: "چاہتا",
  chahti: "چاہتی",
  chahte: "چاہتے",
  sakta: "سکتا",
  sakti: "سکتی",
  sakte: "سکتے",

  // Conjunctions & Connectors
  aur: "اور",
  or: "اور",
  ya: "یا",
  lekin: "لیکن",
  magar: "مگر",
  agar: "اگر",
  bhi: "بھی",
  hi: "ہی",
  na: "نہ",
  nahi: "نہیں",
  nhi: "نہیں",
  shayad: "شاید",
  kyunke: "کیونکہ",
  jab: "جب",
  tab: "تب",
  toh: "تو",
  to: "تو",
  ka: "کا",
  ke: "کے",
  ki: "کی",
  ko: "کو",
  se: "سے",
  par: "پر",
  pe: "پہ",
  tak: "تک",
  paas: "پاس",
  saath: "ساتھ",
  sath: "ساتھ",
  liye: "لیے",
  wala: "والا",
  wali: "والی",
  wale: "والے",
  andar: "اندر",
  bahir: "باہر",
  ooper: "اوپر",
  neeche: "نیچے",
  saamne: "سامنے",
  peeche: "پیچھے",

  // Adjectives & Common Terms
  theek: "ٹھیک",
  thik: "ٹھیک",
  bohat: "بہت",
  bht: "بہت",
  acha: "اچھا",
  achha: "اچھا",
  achi: "اچھی",
  achhi: "اچھی",
  ache: "اچھے",
  achhe: "اچھے",
  bura: "برا",
  kaam: "کام",
  baat: "بات",
  sab: "سب",
  kuch: "کچھ",
  koi: "کوئی",
  log: "لوگ",
  waqt: "وقت",
  din: "دن",
  raat: "رات",
  subah: "صبح",
  shaam: "شام",
  aaj: "آج",
  kal: "کل",
  ab: "اب",
  abhi: "ابھی",
  pehlay: "پہلے",
  pehle: "پہلے",
  baad: "بعد",
  phir: "پھر",
  hamesha: "ہمیشہ",
  kabhi: "کبھی",
  zaroor: "ضرور",
  masla: "مسئلہ",
  hal: "حل",
  madad: "مدد",
  sawal: "سوال",
  jawab: "جواب",
  sahi: "صحیح",
  galat: "غلط",
  shuru: "شروع",
  khatam: "ختم",
  bilkul: "بالکل",
  bhai: "بھائی",
  dost: "دوست",
  tabdeeli: "تبدیلی",
  chuka: "چکا",
  chuki: "چکی",
  chuke: "چکے",
  sirf: "صرف",
  ziyada: "زیادہ",
  kam: "کم",
  pata: "پتہ",
  rok: "روک",
  roko: "روکو",
  ruko: "رکو",
  chup: "چپ",
  bas: "بس",
  test: "ٹیسٹ",
  voice: "آواز",
  roman: "رومن",
  urdu: "اردو",
  call: "کال",
  male: "مردانہ",
  female: "زنانہ",
};

// Common Roman Urdu to Hindi (Devanagari) dictionary
const ROMAN_TO_HINDI_DICT: Record<string, string> = {
  assalam: "अस्सलाम",
  salam: "सलाम",
  alaikum: "अलैकुम",
  walaikum: "वालैकुम",
  shukriya: "शुक्रिया",
  meherbani: "मेहरबानी",
  khuda: "खुदा",
  hafiz: "हाफ़िज़",
  main: "मैं",
  hum: "हम",
  tum: "तुम",
  aap: "आप",
  ap: "आप",
  yeh: "यह",
  ye: "यह",
  woh: "वह",
  wo: "वह",
  mera: "मेरा",
  meri: "मेरी",
  mere: "मेरे",
  apka: "आपका",
  apki: "आपकी",
  apke: "आपके",
  kya: "क्या",
  kia: "क्या",
  kyun: "क्यों",
  kab: "कब",
  kahan: "कहाँ",
  kaun: "कौन",
  kaise: "कैसे",
  kesy: "कैसे",
  kese: "कैसे",
  kaisa: "कैसा",
  kaisi: "कैसी",
  hai: "है",
  hain: "हैं",
  hoon: "हूँ",
  tha: "था",
  thi: "थी",
  thay: "थे",
  hoga: "होगा",
  hogi: "होगी",
  honge: "होंगे",
  raha: "रहा",
  rahi: "रही",
  rahe: "रहे",
  kar: "कर",
  karo: "करो",
  karein: "करें",
  karen: "करें",
  karta: "करता",
  karti: "करती",
  karte: "करते",
  karna: "करना",
  dekho: "देखो",
  dekhein: "देखें",
  dekh: "देख",
  suno: "सुनो",
  sunein: "सुनें",
  bolo: "बोलो",
  bolein: "बोलें",
  batao: "बताओ",
  batayein: "बताएं",
  diya: "दिया",
  di: "दी",
  chahiye: "चाहिए",
  sakta: "सकता",
  sakti: "सकती",
  sakte: "सकते",
  aur: "और",
  or: "और",
  ya: "या",
  lekin: "लेकिन",
  bhi: "भी",
  hi: "ही",
  na: "ना",
  nahi: "नहीं",
  nhi: "नहीं",
  toh: "तो",
  to: "तो",
  ka: "का",
  ke: "के",
  ki: "की",
  ko: "को",
  se: "से",
  par: "पर",
  pe: "पे",
  tak: "तक",
  saath: "साथ",
  sath: "साथ",
  theek: "ठीक",
  thik: "ठीक",
  bohat: "बहुत",
  bht: "बहुत",
  acha: "अच्छा",
  achha: "अच्छा",
  achi: "अच्छी",
  ache: "अच्छे",
  kaam: "काम",
  baat: "बात",
  sab: "सब",
  kuch: "कुछ",
  waqt: "वक़्त",
  ab: "अब",
  abhi: "अभी",
  pehlay: "पहले",
  pehle: "पहले",
  baad: "बाद",
  phir: "फिर",
  zaroor: "ज़रूर",
  masla: "मसला",
  hal: "हल",
  madad: "मदद",
  sahi: "सही",
  bilkul: "बिल्कुल",
  bhai: "भाई",
  dost: "दोस्त",
  tabdeeli: "तब्दीली",
  chuka: "चुका",
  chuki: "चुकी",
  chuke: "चुके",
  sirf: "सिर्फ",
  pata: "पता",
};

/**
 * Phonetic respelling dictionary for English / Indian-English synthesizers.
 * Transforms Roman Urdu words into phonetic spellings that standard English TTS engines
 * pronounce with authentic Pakistani accent and natural clarity.
 */
const ROMAN_TO_PHONETIC_ENGLISH: Record<string, string> = {
  // Greetings
  assalam: "Uh-salaam",
  salam: "suh-laam",
  alaikum: "o-lay-koom",
  walaikum: "wuh-lay-koom",
  shukriya: "shook-ree-yah",
  meherbani: "may-hur-baa-nee",
  "khuda hafiz": "khoo-dah haah-fiz",

  // Questions & Conversational terms
  kya: "kyaa",
  kia: "kyaa",
  kyun: "kyoon",
  kyu: "kyoon",
  kahan: "kuh-haan",
  kaun: "kown",
  kon: "kown",
  kaise: "kay-say",
  kesy: "kay-say",
  kese: "kay-say",
  kaisa: "kay-sah",
  kesa: "kay-sah",
  kaisi: "kay-see",
  kesi: "kay-see",

  // Pronouns
  aap: "ahp",
  ap: "ahp",
  apka: "ahp-kah",
  apki: "ahp-kee",
  apke: "ahp-kay",
  aapka: "ahp-kah",
  aapki: "ahp-kee",
  aapke: "ahp-kay",
  tumhara: "toom-haa-rah",
  tumhari: "toom-haa-ree",
  tumhare: "toom-haa-ray",
  hum: "hum",
  humara: "huh-maa-rah",
  yeh: "yeh",
  ye: "yeh",
  woh: "voh",
  wo: "voh",

  // Auxiliaries & State
  hai: "hay",
  hain: "haen",
  hoon: "hoon",
  tha: "tah",
  thi: "tee",
  thay: "tay",
  the: "tay",
  theek: "teek",
  thik: "teek",
  hoga: "hoh-gah",
  hogi: "hoh-gee",
  honge: "hohn-gay",
  raha: "ruh-haa",
  rahi: "ruh-hee",
  rahe: "ruh-hay",

  // Verbs
  kar: "kur",
  karo: "kuh-ro",
  karein: "kuh-rain",
  karen: "kuh-rain",
  karta: "kur-tah",
  karti: "kur-tee",
  karte: "kur-tay",
  karna: "kur-naa",
  karne: "kur-nay",
  madad: "muh-dud",
  sakta: "suk-tah",
  sakti: "suk-tee",
  sakte: "suk-tay",
  dekho: "day-kho",
  dekhein: "day-khain",
  dekh: "daykh",
  suno: "soo-no",
  sunein: "soo-nain",
  bolo: "boh-lo",
  bolein: "boh-lain",
  batao: "buh-taa-o",
  batayein: "buh-taa-yain",
  batayen: "buh-taa-yain",
  diya: "dee-yah",
  di: "dee",
  diye: "dee-yay",
  chahiye: "chaah-hee-yay",
  chahye: "chaah-hee-yay",
  chuka: "choo-kah",
  chuki: "choo-kee",
  chuke: "choo-kay",

  // Conjunctions & Adjectives
  aur: "awr",
  lekin: "lay-kin",
  bhi: "bhee",
  nahi: "nah-hee",
  nhi: "nah-hee",
  bohat: "boh-hut",
  bht: "boh-hut",
  acha: "uch-chah",
  achha: "uch-chah",
  achi: "uch-chee",
  achhi: "uch-chee",
  ache: "uch-chay",
  achhe: "uch-chay",
  masla: "muss-lah",
  hal: "hull",
  zaroor: "zuh-roor",
  zaroori: "zuh-roo-ree",
  bilkul: "bill-kool",
  bhai: "bha-ee",
  dost: "dohst",
  tabdeeli: "tub-dee-lee",
  shuru: "shoo-roo",
  khatam: "khuh-tum",
  sirf: "surf",
  saath: "saath",
  sath: "saath",
  pata: "puh-tah",
  pehle: "peh-lay",
  pehlay: "peh-lay",
  baad: "baahd",
  waqt: "wukt",
  samajh: "sum-mujh",
  aasan: "aa-saan",
  mushkil: "moosh-kil",
};

/**
 * Transliterates Roman Urdu text to Urdu script (اردو).
 */
export function transliterateRomanToUrduScript(text: string): string {
  if (!text) return "";
  let result = text
    .replace(/\bassalam\s+o\s+alaikum\b/gi, "السلام علیکم")
    .replace(/\bassalam-o-alaikum\b/gi, "السلام علیکم")
    .replace(/\bwalaikum\s+assalam\b/gi, "وعلیکم السلام")
    .replace(/\bkhuda\s+hafiz\b/gi, "خدا حافظ")
    .replace(/\broman\s+urdu\b/gi, "رومن اردو");

  return result.replace(/\b([a-zA-Z]+)\b/g, (match, word) => {
    const lower = word.toLowerCase();
    return ROMAN_TO_URDU_DICT[lower] || match;
  });
}

/**
 * Transliterates Roman Urdu text to Hindi script (Devanagari).
 */
export function transliterateRomanToHindiScript(text: string): string {
  if (!text) return "";
  let result = text
    .replace(/\bassalam\s+o\s+alaikum\b/gi, "अस्सलाम अलैकुम")
    .replace(/\bassalam-o-alaikum\b/gi, "अस्सलाम अलैकुम")
    .replace(/\bwalaikum\s+assalam\b/gi, "वालैकुम अस्सलाम")
    .replace(/\bkhuda\s+hafiz\b/gi, "खुदा हाफ़िज़");

  return result.replace(/\b([a-zA-Z]+)\b/g, (match, word) => {
    const lower = word.toLowerCase();
    return ROMAN_TO_HINDI_DICT[lower] || match;
  });
}

/**
 * Respell Roman Urdu phonetically for English TTS engines (en-IN, en-US, en-GB).
 */
export function phoneticizeRomanUrduForEnglishVoice(text: string): string {
  if (!text) return "";

  let result = text;

  // Multi-word phrase replacements first
  result = result
    .replace(/\bassalam\s+o\s+alaikum\b/gi, "Uh-salaam o alay-koom")
    .replace(/\bassalam-o-alaikum\b/gi, "Uh-salaam o alay-koom")
    .replace(/\bwalaikum\s+assalam\b/gi, "wuh-lay-koom uh-salaam")
    .replace(/\bkhuda\s+hafiz\b/gi, "khoo-dah haah-fiz")
    .replace(/\bkar\s+diya\b/gi, "kur dee-yah")
    .replace(/\bkar\s+di\b/gi, "kur dee")
    .replace(/\bkar\s+dein\b/gi, "kur dain")
    .replace(/\btheek\s+hai\b/gi, "teek hay");

  // Single word replacements
  result = result.replace(/\b([a-zA-Z]+)\b/g, (match, word) => {
    const lower = word.toLowerCase();
    const phonetic = ROMAN_TO_PHONETIC_ENGLISH[lower];
    if (phonetic) {
      // Preserve first capital letter if original was capitalized
      if (word[0] === word[0]?.toUpperCase() && phonetic[0]) {
        return phonetic.charAt(0).toUpperCase() + phonetic.slice(1);
      }
      return phonetic;
    }
    return match;
  });

  return result;
}

export interface AdaptedSpeech {
  text: string;
  lang: string;
}

/**
 * Main adapter function:
 * Determines the target voice's capabilities and transforms the input text & language tag
 * so that the speech engine delivers the most authentic, clear Roman Urdu pronunciation possible.
 */
export function adaptRomanUrduForVoice(text: string, voice?: SpeechSynthesisVoice): AdaptedSpeech {
  if (!text) {
    return { text: "", lang: "en-IN" };
  }

  // If text already contains native Urdu / Arabic script, send directly as ur-PK
  if (/[\u0600-\u06FF]/.test(text)) {
    return { text, lang: voice?.lang?.startsWith("ur") ? voice.lang : "ur-PK" };
  }

  const voiceLang = (voice?.lang || "").toLowerCase();
  const voiceName = (voice?.name || "").toLowerCase();

  // 1. Native Urdu Voice available (e.g. Microsoft Asad, Microsoft Uzma, Google Urdu, ur-PK)
  if (voiceLang.startsWith("ur") || voiceName.includes("urdu")) {
    const urduScriptText = transliterateRomanToUrduScript(text);
    return {
      text: urduScriptText,
      lang: voice?.lang || "ur-PK",
    };
  }

  // 2. Hindi Voice available (e.g. Google हिन्दी, Microsoft Swara, hi-IN)
  // Conversational Urdu and Hindi share virtually identical phonetics.
  if (voiceLang.startsWith("hi") || voiceName.includes("hindi") || voiceName.includes("हिन्दी")) {
    const hindiScriptText = transliterateRomanToHindiScript(text);
    return {
      text: hindiScriptText,
      lang: voice?.lang || "hi-IN",
    };
  }

  // 3. English or Subcontinent English voice (en-IN, en-US, en-GB, fallback)
  // Apply our custom phonetic normalizer so the English synthesizer speaks with natural Pakistani accent.
  const phoneticText = phoneticizeRomanUrduForEnglishVoice(text);
  const targetLang = voiceLang.startsWith("en-in")
    ? voice?.lang || "en-IN"
    : voice?.lang || "en-IN";

  return {
    text: phoneticText,
    lang: targetLang,
  };
}
