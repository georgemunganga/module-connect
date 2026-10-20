import { RecordTable } from "../components/data/RecordTable";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Field, Input, Panel, Select } from "../components/ui";

export function CurrencySettings({
  onSavePreview,
}: {
  onSavePreview: (label: string) => void;
}) {
  const [rows, setRows] = useState([
    { name: "Zambian Kwacha", code: "ZMW", decimals: "2", isDefault: true },
    { name: "US Dollar", code: "USD", decimals: "2", isDefault: false },
    {
      name: "South African Rand",
      code: "ZAR",
      decimals: "2",
      isDefault: false,
    },
  ]);
  const update = (index: number, key: string, value: string | boolean) =>
    setRows((previous) =>
      previous.map((row, i) =>
        i === index
          ? { ...row, [key]: value }
          : key === "isDefault"
            ? { ...row, isDefault: false }
            : row,
      ),
    );
  return (
    <Panel
      title="Currencies"
      action={
        <Button
          onClick={() =>
            setRows((previous) => [
              ...previous,
              {
                name: "New currency",
                code: "",
                decimals: "2",
                isDefault: false,
              },
            ])
          }
        >
          <Plus size={15} />
          Add currency
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <RecordTable className="w-full min-w-[720px] text-left">
          <thead className="table-head">
            <tr>
              <th className="table-cell">Currency</th>
              <th className="table-cell">Code</th>
              <th className="table-cell">Decimal places</th>
              <th className="table-cell">Default</th>
              <th className="table-cell">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.code}-${index}`}>
                <td className="table-cell">
                  <Input
                    aria-label={`Currency name ${index + 1}`}
                    value={row.name}
                    onChange={(event) =>
                      update(index, "name", event.target.value)
                    }
                  />
                </td>
                <td className="table-cell">
                  <Input
                    aria-label={`Currency code ${index + 1}`}
                    value={row.code}
                    maxLength={3}
                    onChange={(event) =>
                      update(index, "code", event.target.value.toUpperCase())
                    }
                  />
                </td>
                <td className="table-cell">
                  <Select
                    aria-label={`Decimal places ${index + 1}`}
                    value={row.decimals}
                    onChange={(event) =>
                      update(index, "decimals", event.target.value)
                    }
                  >
                    <option value="0">0</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </Select>
                </td>
                <td className="table-cell">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="default-currency"
                      checked={row.isDefault}
                      onChange={() => update(index, "isDefault", true)}
                    />
                    {row.isDefault ? <Badge>Default</Badge> : "Set default"}
                  </label>
                </td>
                <td className="table-cell">
                  <Button
                    variant="ghost"
                    disabled={row.isDefault}
                    aria-label={`Remove ${row.name}`}
                    onClick={() =>
                      setRows((previous) =>
                        previous.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </RecordTable>
      </div>
      <div className="border-t border-border px-5 py-4">
        <Button onClick={() => onSavePreview("Currencies")}>
          Save preview snapshot
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Currency conversion and live organization configuration are not
          connected.
        </p>
      </div>
    </Panel>
  );
}

export function TaxSettings({
  kind,
  onSavePreview,
}: {
  kind: "taxes" | "tds";
  onSavePreview: (label: string) => void;
}) {
  const initial =
    kind === "tds"
      ? [
          { name: "Withholding — services", rate: "5", appliesTo: "Services" },
          { name: "Withholding — rent", rate: "10", appliesTo: "Rent" },
        ]
      : [
          {
            name: "VAT standard",
            rate: "16",
            appliesTo: "Purchases and bills",
          },
          { name: "VAT zero rated", rate: "0", appliesTo: "Eligible goods" },
          { name: "Tourism levy", rate: "1.5", appliesTo: "Travel categories" },
        ];
  const [rows, setRows] = useState(initial);
  const title = kind === "tds" ? "Withholding tax (TDS)" : "Tax rates";
  return (
    <Panel
      title={title}
      action={
        <Button
          onClick={() =>
            setRows((previous) => [
              ...previous,
              {
                name: kind === "tds" ? "New withholding rate" : "New tax rate",
                rate: "0",
                appliesTo: "Purchases",
              },
            ])
          }
        >
          <Plus size={15} />
          Add rate
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <RecordTable className="w-full min-w-[720px] text-left">
          <thead className="table-head">
            <tr>
              <th className="table-cell">Name</th>
              <th className="table-cell">Rate (%)</th>
              <th className="table-cell">Applies to</th>
              <th className="table-cell">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`}>
                <td className="table-cell">
                  <Input
                    aria-label={`${title} name ${index + 1}`}
                    value={row.name}
                    onChange={(event) =>
                      setRows((previous) =>
                        previous.map((item, i) =>
                          i === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </td>
                <td className="table-cell">
                  <Input
                    aria-label={`${title} percentage ${index + 1}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.rate}
                    onChange={(event) =>
                      setRows((previous) =>
                        previous.map((item, i) =>
                          i === index
                            ? { ...item, rate: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </td>
                <td className="table-cell">
                  <Select
                    aria-label={`${title} scope ${index + 1}`}
                    value={row.appliesTo}
                    onChange={(event) =>
                      setRows((previous) =>
                        previous.map((item, i) =>
                          i === index
                            ? { ...item, appliesTo: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option>Purchases and bills</option>
                    <option>Services</option>
                    <option>Goods</option>
                    <option>Rent</option>
                    <option>Eligible goods</option>
                    <option>Travel categories</option>
                  </Select>
                </td>
                <td className="table-cell">
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${row.name}`}
                    onClick={() =>
                      setRows((previous) =>
                        previous.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </RecordTable>
      </div>
      <div className="border-t border-border px-5 py-4">
        <Button onClick={() => onSavePreview(title)}>
          Save preview snapshot
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Sample rates only. No tax engine or live configuration is connected.
        </p>
      </div>
    </Panel>
  );
}
