export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const confirmField = {
  confirm: { type: "boolean", description: "Must be true. Ask the merchant first. The call fails without it." },
} as const;

const pageFields = {
  query: { type: "string" },
  limit: { type: "integer" },
  offset: { type: "integer" },
} as const;

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
    description: "Permanently delete up to 20 products by id. Ask the merchant first. Fails unless confirm is true.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
        ...confirmField,
      },
      required: ["ids", "confirm"],
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
  {
    name: "list_posts",
    description: "List articles in this store. Filter by a title fragment.",
    inputSchema: { type: "object", properties: pageFields, additionalProperties: false },
  },
  {
    name: "get_post",
    description: "One article by id, or by an exact title when only one article has that title.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" }, title: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "create_post",
    description: "Create an article. It stays hidden unless visible is true and the merchant asked to publish it.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        excerpt: { type: "string" },
        body: { type: "string" },
        author: { type: "string" },
        visible: { type: "boolean" },
        blog: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        productId: { type: "string", description: "Catalog product id to feature, or empty" },
        productNote: { type: "string" },
        image: { type: "string", description: "https URL, or empty" },
        video: { type: "string", description: "https URL, or empty" },
        handle: { type: "string" },
        seoTitle: { type: "string" },
        seoDescription: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_post",
    description: "Change one article. Omitted fields stay as they are. Read it first. This cannot create a new page type.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        excerpt: { type: "string" },
        body: { type: "string" },
        author: { type: "string" },
        visible: { type: "boolean" },
        blog: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        productId: { type: "string" },
        productNote: { type: "string" },
        image: { type: "string" },
        video: { type: "string" },
        handle: { type: "string" },
        seoTitle: { type: "string" },
        seoDescription: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_post",
    description: "Permanently delete one article. Ask the merchant first. Fails unless confirm is true.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" }, ...confirmField },
      required: ["id", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "list_collections",
    description: "List categories in this store. Filter by a title fragment.",
    inputSchema: { type: "object", properties: pageFields, additionalProperties: false },
  },
  {
    name: "get_collection",
    description: "One category by its exact title, including the product ids assigned to it.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "create_collection",
    description: "Create a category. The title cannot duplicate an existing category. hidden defaults to false, so it is visible. Pass product ids from this store only.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        hidden: { type: "boolean" },
        productIds: { type: "array", items: { type: "string" } },
        image: { type: "string", description: "https URL, or empty" },
        excludeOutOfStock: { type: "boolean" },
        manualSort: { type: "boolean" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_collection",
    description: "Change a category found by its current title. The title itself does not change. Omitted fields stay as they are. Read it first so product ids are not cleared.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        hidden: { type: "boolean" },
        productIds: { type: "array", items: { type: "string" } },
        image: { type: "string" },
        excludeOutOfStock: { type: "boolean" },
        manualSort: { type: "boolean" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "list_orders",
    description: "List orders. Filter by customer name or order number.",
    inputSchema: { type: "object", properties: pageFields, additionalProperties: false },
  },
  {
    name: "get_order",
    description: "One order by number or id, including its lines.",
    inputSchema: {
      type: "object",
      properties: { number: { type: "integer" }, id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "create_order",
    description: "Create an order. Each line is a catalog product id and a quantity. The price comes from the catalog. A discount or payment paid fails unless confirm is true.",
    inputSchema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string" },
              quantity: { type: "integer" },
            },
            required: ["productId", "quantity"],
            additionalProperties: false,
          },
        },
        customerId: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
        payment: { type: "string", enum: ["pending", "paid"] },
        discount: { type: "number" },
        shipping: { type: "number" },
        shippingName: { type: "string" },
        note: { type: "string" },
        ...confirmField,
      },
      required: ["lines"],
      additionalProperties: false,
    },
  },
  {
    name: "update_order",
    description: "Change an order's status, tracking, or a timeline note. A refund fails unless confirm is true. Omitted fields stay as they are.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "integer" },
        id: { type: "string" },
        pay: { type: "string", enum: ["paid", "pending", "partially_refunded", "refunded"] },
        fulfillment: { type: "string", enum: ["unfulfilled", "fulfilled", "partial", "onhold", "progress"] },
        customerStatus: { type: "string", enum: ["received", "progress", "hold", "sent", "transit", "delivered"] },
        carrier: { type: "string" },
        tracking: { type: "string" },
        comment: { type: "string" },
        refunded: { type: "number" },
        ...confirmField,
      },
      additionalProperties: false,
    },
  },
  {
    name: "delete_order",
    description: "Permanently delete one order. Ask the merchant first. Fails unless confirm is true.",
    inputSchema: {
      type: "object",
      properties: { number: { type: "integer" }, id: { type: "string" }, ...confirmField },
      required: ["confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "list_policies",
    description: "List the store's existing policy documents. This cannot add a new document type.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_policy",
    description: "Read one existing policy by kind.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["return", "privacy", "terms", "shipping", "contact", "legal", "purchase"] },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "update_policy",
    description: "Change the title or body of an existing policy. Kind must already exist. This cannot add a page or a new policy type.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["return", "privacy", "terms", "shipping", "contact", "legal", "purchase"] },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "get_storefront",
    description: "The store name, logo URL, and the seven brand colors.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_logo",
    description: "Set the store logo to an https URL, or to an empty string to remove it.",
    inputSchema: {
      type: "object",
      properties: { logoUrl: { type: "string" } },
      required: ["logoUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "update_brand_colors",
    description: "Replace the seven brand colors. Read get_storefront first and send all seven hex colors.",
    inputSchema: {
      type: "object",
      properties: { colors: { type: "array", items: { type: "string" }, minItems: 7, maxItems: 7 } },
      required: ["colors"],
      additionalProperties: false,
    },
  },
];

export const MCP_INSTRUCTIONS = [
  "You are connected to one Storely store, as the person who authorized this connection.",
  "You may read and edit that store's products, categories, articles, customers, orders, existing policy text, logo, and brand colors.",
  "You cannot run SQL, change the schema, add pages or features, manage staff, or read payment and messaging secrets.",
  "The store is fixed by the connection. Never send a store id, and never touch another store.",
  "Do not invent ids. Read a record before you change it.",
  "New products stay in draft, and new articles stay hidden, unless the merchant asked to publish them.",
  "Ask before deleting, refunding, discounting an order, or marking an order paid. Those calls fail unless confirm is true.",
  "Order lines take a catalog product id and a quantity. Do not send a custom price.",
  "Prices are numbers in the store currency, without a currency symbol.",
].join(" ");
