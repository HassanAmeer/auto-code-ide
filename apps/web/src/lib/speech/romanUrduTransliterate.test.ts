import { describe, expect, it } from "vite-plus/test";
import { containsUrduOrHindi, transliterateUrduToRoman } from "./romanUrduTransliterate";

describe("transliterateUrduToRoman", () => {
  it("keeps already-Roman text untouched", () => {
    expect(transliterateUrduToRoman("mujhe yeh feature pasand hai")).toBe(
      "mujhe yeh feature pasand hai",
    );
  });

  it("transliterates common conversational Urdu", () => {
    expect(transliterateUrduToRoman("السلام علیکم کیسے ہو آپ")).toBe("assalam o alaikum kesy ho ap");
    expect(transliterateUrduToRoman("میں نے کہا تھا کہ یہ کام نہیں ہوگا")).toBe(
      "main ne kaha tha keh yeh kaam nahi hoga",
    );
  });

  it("uses common word mappings instead of raw phonetic fallback", () => {
    expect(transliterateUrduToRoman("مجھے اس پروجیکٹ میں ایک بگ ٹھیک کرنا ہے")).toBe(
      "mujhe is project main aik bug theek karna hai",
    );
    expect(transliterateUrduToRoman("براہ کرم فائل کو اپڈیٹ کریں")).toBe(
      "barah karam file ko update karein",
    );
  });

  it("handles multi-word technology phrases", () => {
    expect(transliterateUrduToRoman("نیا ورژن ڈاؤن لوڈ کرو")).toBe("naya version download karo");
    expect(transliterateUrduToRoman("اے پی آئی کی سیٹنگ کہاں ہے")).toBe(
      "api key setting kahan hai",
    );
  });

  it("normalizes Arabic keyboard variants and diacritics", () => {
    expect(transliterateUrduToRoman("كيا حال هے")).toBe("kya haal hai");
  });

  it("detects Urdu and Hindi scripts", () => {
    expect(containsUrduOrHindi("کیسے ہو")).toBe(true);
    expect(containsUrduOrHindi("कैसे हो")).toBe(true);
    expect(containsUrduOrHindi("how are you")).toBe(false);
  });
});
