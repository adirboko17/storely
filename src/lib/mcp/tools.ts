export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const productFields = {
  title: { type: "string", description: "Product title" },
  status: { type: "string", enum: ["active", "draft", "archived"], description: "active is published, draft is hidden" },
  price: { type: "number", description: "Selling price in the store currency" },
  compareAt: { type: "number", description: "Compare-at price. Omit to leave unchanged on update." },
  cost: { type: "number" },
  stock: { type: "integer", description: "Units available" },
  description: { type: "string" },
  vendor: { type: "string" },
  category: { type: "string" },
  sku: { type: "string" },
  barcode: { type: "string" },
  variant: { type: "string", description: "Variant title, for example size or color" },
  tags: { type: "array", items: { type: "string" } },
} as const;

export const MCP_TOOLS: McpTool[] = [
  {
    name: "store_summary",
    description: "Store name, hostname, and how many products, customers, and discounts it has.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_products",
    description: "List products. Filter by a title or SKU fragment, or by status.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["active", "draft", "archived"] },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_product",
    description: "Full product by id, or by an exact title when only one product has that title.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_product",
    description: "Create a product. Status defaults to draft, so it stays unpublished until status is active.",
    inputSchema: {
      type: "object",
      properties: productFields,
      required: ["title", "price"],
      additionalProperties: false,
    },
  },
  {
    name: "update_product",
    description: "Change fields on an existing product. Omitted fields stay as they are. Read the product first.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...productFields },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_products",
    description: "Permanently delete up to 20 products by id. Confirm with the merchant before calling this.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 } },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "list_customers",
    description: "List customers. Filter by name, email, or phone.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer" } },
      additionalProperties: false,
    },
  },
  {
    name: "create_customer",
    description: "Create a customer.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "update_customer",
    description: "Change a customer. Omitted fields stay as they are.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_discounts",
    description: "Read discount codes and their status. This does not create or edit discounts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const MCP_INSTRUCTIONS = [
  "You are connected to one Storely store, as the person who created this key.",
  "Use the tools to read and edit that store. Do not invent product ids.",
  "New products stay in draft unless the merchant asked to publish them.",
  "Ask before deleting products.",
  "Prices are numbers in the store currency, without a currency symbol.",
].join(" ");
