import { describe, expect, it } from "vitest";
import { chooseLang, currentLang, subscribeLang } from "./prefs.ts";

describe("header language", () => {
  it("tells every reader when the language changes", () => {
    const heard: string[] = [];
    const stopA = subscribeLang(() => heard.push(`a:${currentLang()}`));
    const stopB = subscribeLang(() => heard.push(`b:${currentLang()}`));
    chooseLang("bn");
    expect(currentLang()).toBe("bn");
    expect(heard).toEqual(["a:bn", "b:bn"]);
    stopA();
    stopB();
    chooseLang("en");
    expect(heard).toHaveLength(2);
  });

  it("does not wake readers when the choice is unchanged", () => {
    chooseLang("hi");
    let calls = 0;
    const stop = subscribeLang(() => calls++);
    chooseLang("hi");
    expect(calls).toBe(0);
    stop();
    chooseLang("en");
  });
});
