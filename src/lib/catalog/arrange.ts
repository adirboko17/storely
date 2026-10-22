export function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

export function placeByIds<T extends { id: number }>(products: T[], orderedIds: number[]) {
  const next = [...products];
  const slots: number[] = [];
  products.forEach((product, index) => {
    if (orderedIds.includes(product.id)) slots.push(index);
  });
  if (slots.length !== orderedIds.length) return products;
  orderedIds.forEach((id, index) => {
    const product = products.find((item) => item.id === id);
    const slot = slots[index];
    if (product && slot != null) next[slot] = product;
  });
  return next;
}

export function orderMatching<T extends { id: string | number }>(products: T[], ids: Array<T["id"]>) {
  if (!ids.length) return products;
  const rank = new Map(ids.map((id, index) => [id, index]));
  return products
    .map((product, index) => ({ product, index, rank: rank.get(product.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.product);
}
