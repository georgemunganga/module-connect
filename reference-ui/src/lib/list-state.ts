export function updateVisibleSelection(
  selected: string[],
  visibleIds: string[],
  checked: boolean,
): string[] {
  const visible = new Set(visibleIds);
  if (checked) return [...new Set([...selected, ...visible])];
  return selected.filter((id) => !visible.has(id));
}

export function removeSelectedId(selected: string[], id: string): string[] {
  return selected.filter((selectedId) => selectedId !== id);
}
