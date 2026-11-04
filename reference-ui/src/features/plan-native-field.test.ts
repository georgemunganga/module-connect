import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, Input } from "../components/ui";
import { currencyTextboxName } from "../../tests/normal-cookie/plan-review/selectors";
describe("native Plan shared Field selector markup", () => {
  it("renders the actual shared Currency Field hint inside its implicit input label", () => {
    const hint = "The company sets the currency for a new plan. Saved plans keep their original currency.";
    const html = renderToStaticMarkup(createElement(Field, { label: "Currency", hint, children: createElement(Input, { readOnly: true, required: true, maxLength: 3, value: "ZMW" }) }));
    const label = html.match(/<label\b[^>]*>([\s\S]*?)<\/label>/)?.[1];
    expect(label).toBeDefined(); expect(label).toContain("<input"); expect(label).toContain(hint);
    const renderedLabelText = label!.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    expect(renderedLabelText).toBe("Currency " + hint);
    expect(renderedLabelText === "Currency").toBe(false);
    expect(currencyTextboxName.test(renderedLabelText)).toBe(true);
  });
  it("matches the unhinted label without accepting a different currency field", () => {
    expect(currencyTextboxName.test("Currency")).toBe(true);
    expect(currencyTextboxName.test("Currency code override")).toBe(true);
    expect(currencyTextboxName.test("Confirm saved currency")).toBe(false);
    expect(currencyTextboxName.test("CurrencyOverride")).toBe(false);
  });
});
