import { RecordTable } from "./RecordTable";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select } from "../ui";
import { useApp, items, money, type Line } from "../../lib/store";

export function VendorSelect({
  value,
  onChange,
  label = "Select a vendor",
  fallbackLabel,
}: {
  value: string;
  onChange: (vendorId: string) => void;
  label?: string;
  fallbackLabel?: string;
}) {
  const { records } = useApp();
  const vendors = records.filter((record) => record.kind === "vendors");
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{fallbackLabel || label}</option>
      {vendors.map((vendor) => (
        <option key={vendor.id} value={vendor.id}>
          {vendor.title}
        </option>
      ))}
    </Select>
  );
}
export function LineEditor({
  lines,
  onChange,
  receiving = false,
  request = false,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  receiving?: boolean;
  request?: boolean;
}) {
  const { records } = useApp();
  const catalog = records.filter((record) => record.kind === "items");
  const update = (id: string, values: Partial<Line>) =>
    onChange(
      lines.map((line) => (line.id === id ? { ...line, ...values } : line)),
    );
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-medium">
          {receiving ? "Items to Receive" : "Item Table"}
        </h2>
        <Link to="/items" className="text-xs text-blue-500">
          View item catalog →
        </Link>
      </header>
      <div className="overflow-x-auto">
        <RecordTable variant="compact" className="w-full min-w-[720px] text-left">
          <thead className="table-head">
            <tr>
              {[
                "Item Details",
                request ? "Category" : "Account",
                receiving ? "Received Qty" : "Quantity",
                ...(receiving ? [] : [request ? "Estimated Rate" : "Rate"]),
                receiving ? "Unit" : "Amount",
                "",
              ].map((label, index) => (
                <th className="px-4 py-3" key={index}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id} className="border-b border-slate-100">
                <td className="w-[35%] p-3">
                  <Select
                    aria-label={`Item ${index + 1}`}
                    value={line.name}
                    onChange={(event) => {
                      const item = catalog.find(
                        (record) => record.title === event.target.value,
                      );
                      const fallback = items.find(
                        (item) => item.name === event.target.value,
                      );
                      update(line.id, {
                        itemId: item?.id,
                        name: event.target.value,
                        rate: item?.amount ?? fallback?.rate ?? 0,
                        unit: item?.meta?.unit ?? fallback?.unit ?? "pcs",
                      });
                    }}
                  >
                    <option value="">Choose an item</option>
                    {catalog.map((record) => (
                      <option key={record.id}>{record.title}</option>
                    ))}
                    {line.name &&
                      !catalog.some((record) => record.title === line.name) && (
                        <option>{line.name}</option>
                      )}
                  </Select>
                  <span className="mt-1.5 block text-[10px] text-slate-400">
                    Shared catalog · {line.unit}
                  </span>
                </td>
                <td className="w-[20%] p-3">
                  <Select
                    aria-label={`${request ? "Category" : "Account"} for item ${index + 1}`}
                    value={line.account ?? "Office Supplies"}
                    onChange={(event) =>
                      update(line.id, { account: event.target.value })
                    }
                  >
                    <option>Office Supplies</option>
                    <option>Equipment</option>
                    <option>Cost of Goods Sold</option>
                    <option>Services</option>
                  </Select>
                </td>
                <td className="w-[13%] p-3">
                  <Input
                    aria-label={`Quantity for item ${index + 1}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(event) =>
                      update(line.id, { quantity: Number(event.target.value) })
                    }
                  />
                </td>
                {!receiving && (
                  <td className="w-[15%] p-3">
                    <Input
                      aria-label={`Rate for item ${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.rate}
                      onChange={(event) =>
                        update(line.id, { rate: Number(event.target.value) })
                      }
                    />
                  </td>
                )}
                <td className="px-4 text-right text-sm font-medium">
                  {receiving ? line.unit : money(line.quantity * line.rate)}
                </td>
                <td className="pr-3">
                  <button
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() =>
                      onChange(lines.filter((row) => row.id !== line.id))
                    }
                    className="rounded p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </RecordTable>
      </div>
      <div className="p-3">
        <Button
          variant="ghost"
          className="!px-2 !text-blue-500"
          onClick={() =>
            onChange([
              ...lines,
              {
                id: crypto.randomUUID(),
                itemId: undefined,
                name: "",
                quantity: 1,
                rate: 0,
                unit: "pcs",
              },
            ])
          }
        >
          <Plus size={14} />
          Add new row
        </Button>
      </div>
    </section>
  );
}
