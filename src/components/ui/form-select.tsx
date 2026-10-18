import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Choice = { value: string; label: React.ReactNode; disabled: boolean };
const EMPTY_VALUE = "__erp_empty_select_value__";

function choicesFrom(children: React.ReactNode): Choice[] {
  const choices: Choice[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) return;
    if (child.type === "option") {
      const label = child.props.children;
      choices.push({ value: String(child.props.value ?? label ?? ""), label, disabled: Boolean(child.props.disabled) });
    } else if (child.type === React.Fragment || child.type === "optgroup") {
      choices.push(...choicesFrom(child.props.children));
    }
  });
  return choices;
}

/** A floating select that keeps the value/onChange contract of existing forms. */
export function FormSelect({ children, className, value, onChange, disabled, required, id, name, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const choices = choicesFrom(children);
  const selected = String(value ?? "");
  const displayed = choices.some((choice) => choice.value === selected) ? selected : choices[0]?.value ?? "";
  const emptyKey = choices.some((choice) => choice.value === EMPTY_VALUE) ? `${EMPTY_VALUE}_reserved` : EMPTY_VALUE;
  const encode = (next: string) => next === "" ? emptyKey : next;
  const decode = (next: string) => next === emptyKey ? "" : next;
  const change = (next: string) => {
    const decoded = decode(next);
    onChange?.({ target: { value: decoded, name }, currentTarget: { value: decoded, name } } as React.ChangeEvent<HTMLSelectElement>);
  };

  return <Select value={displayed} onValueChange={change} disabled={disabled} required={required} name={name}>
    <SelectTrigger
      id={id}
      aria-label={props["aria-label"]}
      aria-describedby={props["aria-describedby"]}
      title={props.title}
      className={cn(className, "h-11 w-full rounded-lg border-input bg-background px-4 text-sm shadow-sm focus:ring-2 focus:ring-ring/30")}
    >
      <SelectValue placeholder={choices.find((choice) => choice.value === "")?.label ?? "Select an option"} />
    </SelectTrigger>
    <SelectContent>
      {choices.map((choice, index) => <SelectItem key={`${choice.value}-${index}`} value={encode(choice.value)} disabled={choice.disabled}>
        {choice.label}
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
