export type UserIntent =
  | "GREETING_OR_CHITCHAT"
  | "FAREWELL_OR_EXIT"
  | "CAPABILITIES_INQUIRY"
  | "STATUS_INQUIRY"
  | "BRAINSTORM_OR_CONSULT"
  | "CONFIRM_AND_BUILD"
  | "AWAY_SUPERVISION"
  | "WISHLIST_ADD"
  | "WISHLIST_LIST"
  | "AUTO_HEAL_REQUEST"
  | "WHATSAPP_ACTION"
  | "GENERAL_WORK";

export interface IntentAnalysis {
  intent: UserIntent;
  confidence: number;
  extractedProjectName?: string;
  isUrdu: boolean;
}

export function isUrduText(text: string): boolean {
  return (
    /[\u0600-\u06FF]/.test(text) ||
    /\b(kya|hai|hain|karo|batao|kaise|theek|suno|bhai|yaar|acha|haan|nahi|karna|dekho|chalo|baad|mein|main|raat|subah|baje|masla|kharabi|pehle|mashwara|mashwra|chahiye|humne|mera|meri|mere|aap|aapka|aapki|do|kar|karwa|banao|chalana|theek hai|allah hafiz|shukriya)\b/i.test(
      text,
    )
  );
}

export function classifyIntent(userText: string): IntentAnalysis {
  const t = userText.trim().toLowerCase();
  const isUrdu = isUrduText(t);

  // 1. Farewell / Exit Check (e.g. "baad me baat karenge", "theek hai bye", "chalo theek hai", "allah hafiz")
  if (
    /\b(baad\s+(?:me|mein|mai|main)\s+baat\s+kar(?:e|en|eng[ey]|enge|ungi|o)|phir\s+baat\s+kar|phir\s+milte\s+hain|allah\s*hafiz|alvida|khuda\s*hafiz|bye|goodbye|talk\s+later|see\s+you\s+later|catch\s+you\s+later)\b/i.test(
      t,
    ) ||
    /^(chalo\s+)?theek\s+hai\s*$/i.test(t) ||
    /^(ok\s+)?(bye|chalo\s+bye|take\s+care)\s*$/i.test(t) ||
    /(اللہ\s*حافظ|خدا\s*حافظ|الوداع|بعد\s*میں\s*بات|پھر\s*ملتے)/.test(t)
  ) {
    return { intent: "FAREWELL_OR_EXIT", confidence: 0.95, isUrdu };
  }

  // 2. Greeting / ChitChat Check (e.g. "hello", "hi", "salam", "kya haal hai", "kaise ho", "السلام علیکم")
  if (
    (/^(as*alam\s*o\s*alaikum|salam|hello|hi|hey|kya\s+haal\s+hai|kaise\s+ho|kaisay\s+ho|suno|sun\s+rahe\s+ho|good\s+morning|good\s+evening|whats\s+up|wassup)\b/i.test(
      t,
    ) ||
      /(السلام\s*علیکم|سلام|کیا\s*حال\s*ہے|کیسے\s*ہو|صبح\s*بخیر|شام\s*بخیر)/.test(t)) &&
    !/(project|status|code|error|feature|banao|fix|kaam|kar sakte)/i.test(t)
  ) {
    return { intent: "GREETING_OR_CHITCHAT", confidence: 0.9, isUrdu };
  }

  // 2.1 Capabilities / What Can You Do (e.g. "aap kya kar sakte hain", "اپ کیا کر سکتے ہیں", "what can you do")
  if (
    /(کیا\s*(?:کچھ\s*)?کر\s*سکتے\s*(?:ہو|ہیں)|کیا\s*کام\s*کرتے\s*(?:ہو|ہیں)|کون\s*ہو|کیا\s*صلاحیتیں\s*ہیں|کیا\s*مدد\s*کر\s*سکتے)/.test(
      t,
    ) ||
    /\b(kya\s*(?:kuch\s*)?kar\s*sakt(?:ey|e|i)\s*(?:ho|hain|hai)|kaam\s*kya\s*hai|tum\s*kya\s*ho|tum\s*kaun\s*ho|aap\s*kaun\s*hain|kya\s*features?\s*hain|kya\s*madad\s*kar\s*sakt(?:ey|e)|kya\s*help\s*kar\s*sakt(?:ey|e)|kya\s*kar\s*leta\s*hai|what\s+can\s+you\s+do|what\s+are\s+your\s+capabilities|how\s+can\s+you\s+help|who\s+are\s+you|what\s+do\s+you\s+do)\b/i.test(
      t,
    )
  ) {
    return { intent: "CAPABILITIES_INQUIRY", confidence: 0.95, isUrdu };
  }

  // 3. Away / Autonomous Supervision (e.g. "main bahar ja raha hoon", "khud dekhte rehna", "piche se check karo")
  if (
    /\b(main\s+ja\s+raha\s+hoon|main\s+bahar\s+hoon|main\s+busy\s+hoon|khud\s+dekh(te)?\s*rehna|khud\s+manage\s+karo|piche\s+se\s+dekhna|away\s+mode|autonomous\s+mode|tumhare\s+zimmey|zimme\s+laga)\b/i.test(
      t,
    )
  ) {
    return { intent: "AWAY_SUPERVISION", confidence: 0.95, isUrdu };
  }

  // 3.1 Auto-Heal / Self-Healing Request (e.g. "auto heal karo", "error theek karo", "code repair karo", "self heal")
  if (
    /\b(auto\s*heal|self\s*heal|error\s*theek\s*karo|code\s*repair|repair\s*errors?|fix\s*errors?|bugs?\s*fix\s*karo)\b/i.test(
      t,
    )
  ) {
    return { intent: "AUTO_HEAL_REQUEST", confidence: 0.95, isUrdu };
  }

  // 3.1.5 WhatsApp Action Request (e.g. "whatsapp pe message bhejo", "client ko message karo", "whatsapp edit/delete", "voice note send karo")
  if (
    /\b(whatsapp|wa\s+message|client\s+ko\s+message|number\s+ko\s+message|message\s+bhej\s*(?:do|o|na)|message\s+send\s*karo|wa\s+send|message\s+edit\s*karo|message\s+delete\s*karo|voice\s*note\s*(?:send|bhej)|image\s*(?:send|bhej).{0,30}?(?:whatsapp|client))\b/i.test(
      t,
    )
  ) {
    return { intent: "WHATSAPP_ACTION", confidence: 0.95, isUrdu };
  }

  // 3.2 Wishlist / Feature Backlog List Request (e.g. "wishlist dikhao", "kya features bole thay", "backlog dikhao")
  if (
    /\b(wishlist\s*(?:dikhao|check|list|kya\s+hai)|backlog\s*(?:dikhao|check|list)|kaun\s*se\s*features?\s*(?:bole|pending|save)|kya\s*kya\s*features?\s*hain)\b/i.test(
      t,
    )
  ) {
    return { intent: "WISHLIST_LIST", confidence: 0.95, isUrdu };
  }

  // 3.3 Wishlist / Feature Backlog Add Request (e.g. "mujhe ye feature bhi chahiye", "ye improvement karni hai", "wishlist me X add karo")
  if (
    /\b(feature\s*(?:bhi\s*)?(?:chahiye|add\s*karna|hona\s*chahiye|save\s*karo)|improvement\s*(?:karni\s*hai|chahiye|add\s*karo)|wishlist\s*m(?:ein|e)\s*.{1,60}?\s*(?:add|daal|rakh|save)\s*(?:karo|do|karna)?|ye\s*bhi\s*(?:daal\s*do|add\s*karna|chahiye))\b/i.test(
      t,
    ) &&
    !/\b(theek\s+hai\s+bana\s+do|shuru\s+karo)\b/i.test(t)
  ) {
    return { intent: "WISHLIST_ADD", confidence: 0.9, isUrdu };
  }

  // 4. Confirm and Build (e.g. "theek hai bana do", "haan shuru karo", "proceed", "go ahead")
  if (
    /\b(theek\s+hai\s+bana\s+do|shuru\s+karo|kaam\s+shuru\s+karo|go\s+ahead|proceed|start\s+building|execute\s+plan|confirmed|bana\s+do)\b/i.test(
      t,
    )
  ) {
    return { intent: "CONFIRM_AND_BUILD", confidence: 0.9, isUrdu };
  }

  // 5. Brainstorming / Consulting (e.g. "restaurant website banani hai", "kya feature hona chahiye", "mashwara do")
  if (
    /\b(banani\s+hai|banana\s+hai|soch\s+raha\s+hoon|mashwara|mashwra|suggest|ideas?|features?|kya\s+hona\s+chahiye|kaisa\s+rahega|restaurant|ecommerce|portfolio|blog|app|game)\b/i.test(
      t,
    ) &&
    !/\b(git\s+status|kya\s+status\s+hai|kahan\s+tak\s+pohncha)\b/i.test(t)
  ) {
    return { intent: "BRAINSTORM_OR_CONSULT", confidence: 0.85, isUrdu };
  }

  // 6. Status Inquiry (e.g. "kya status hai", "kahan tak pohncha", "progress batao")
  if (
    /\b(kya\s+status\s+hai|status\s+batao|kahan\s+tak\s+pohncha|progress\s+report|kya\s+chal\s+raha\s+hai\s+project|kitna\s+kaam\s+hua)\b/i.test(
      t,
    )
  ) {
    return { intent: "STATUS_INQUIRY", confidence: 0.9, isUrdu };
  }

  return { intent: "GENERAL_WORK", confidence: 0.7, isUrdu };
}
