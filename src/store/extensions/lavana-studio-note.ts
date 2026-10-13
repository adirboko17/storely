import type { StoreExtension } from "@/platform/modules";
import { installation } from "@/store/installation";

/**
 * A note that belongs only to סטודיו לבנה.
 * It stays off so the approved dashboard is unchanged.
 * Set `enabled` to true to add the card through the dashboard extension point.
 */
export const lavanaStudioNote: StoreExtension = {
  id: "lavana-studio-note",
  storeId: installation.storeId,
  name: "הערת סטודיו",
  description: "כרטיס דשבורד פרטי לחנות הזו.",
  enabled: false,
  contributions: {
    "dashboard.cards": [
      {
        id: "studio-note",
        title: "הערת סטודיו",
        body: "התאמה פרטית לחנות הזו. הכרטיס מופיע רק כשההרחבה מופעלת.",
        permission: "analytics.read",
      },
    ],
  },
};
