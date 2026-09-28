import { HttpError, str } from "./http";
import { slugify } from "./validation";

/**
 * CMS collections. To add a new kind of editable content (e.g. "testimonials"),
 * add one entry here - the admin list, add/edit form, API and validation all
 * work from this definition. No other code changes are needed.
 */
export type FieldType = "text" | "textarea" | "url" | "number" | "boolean" | "date" | "select" | "image";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: string[];
  maxLength?: number;
}

export interface CollectionDef {
  key: string;
  label: string;
  singular: string;
  description: string;
  fields: FieldDef[];
}

export const COLLECTIONS: CollectionDef[] = [
  {
    key: "announcements",
    label: "Announcements",
    singular: "Announcement",
    description: "Notices shown to clients on the sign-in page and dashboard.",
    fields: [
      { name: "message", label: "Message", type: "textarea", required: true, maxLength: 600 },
      { name: "level", label: "Style", type: "select", options: ["info", "warning"] },
      { name: "startsOn", label: "Show from", type: "date", help: "Optional. Leave empty to show immediately." },
      { name: "endsOn", label: "Show until", type: "date", help: "Optional. Leave empty to show until unpublished." },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    singular: "Project",
    description: "Portfolio or case-study entries.",
    fields: [
      { name: "summary", label: "Short summary", type: "textarea", maxLength: 300 },
      { name: "description", label: "Full description", type: "textarea", maxLength: 6000 },
      { name: "image", label: "Cover image", type: "image" },
      { name: "link", label: "Project link", type: "url" },
      { name: "status", label: "Status", type: "select", options: ["Planned", "In progress", "Completed"] },
    ],
  },
  {
    key: "services",
    label: "Services",
    singular: "Service",
    description: "What you offer.",
    fields: [
      { name: "summary", label: "Short summary", type: "textarea", maxLength: 300 },
      { name: "details", label: "Details", type: "textarea", maxLength: 6000 },
      { name: "price", label: "Price / rate", type: "text", maxLength: 80 },
      { name: "image", label: "Image", type: "image" },
    ],
  },
  {
    key: "about",
    label: "About",
    singular: "About section",
    description: "Text blocks for the About page.",
    fields: [
      { name: "body", label: "Text", type: "textarea", required: true, maxLength: 8000 },
      { name: "image", label: "Image", type: "image" },
    ],
  },
  {
    key: "contact",
    label: "Contact info",
    singular: "Contact entry",
    description: "Phone numbers, email addresses, address and opening hours.",
    fields: [
      { name: "type", label: "Type", type: "select", options: ["Phone", "Email", "Address", "Hours", "Website"], required: true },
      { name: "value", label: "Value", type: "text", required: true, maxLength: 300 },
    ],
  },
];

export const getCollection = (key: string) => COLLECTIONS.find((c) => c.key === key) ?? null;

export function requireCollection(key: string): CollectionDef {
  const def = getCollection(key);
  if (!def) throw new HttpError(404, "Unknown content type.");
  return def;
}

export interface ContentInput {
  title: string;
  slug: string;
  published: boolean;
  sortOrder: number;
  data: Record<string, string | number | boolean>;
}

const isSafeUrl = (v: string) => /^https?:\/\/\S+$/i.test(v) || /^\/[^\s/][^\s]*$/.test(v);

/** Validates a request body against the collection definition. Unknown fields are dropped. */
export function validateContent(def: CollectionDef, body: Record<string, unknown>): ContentInput {
  const errors: Record<string, string> = {};

  const title = str(body.title);
  if (title.length < 1) errors.title = "Enter a title.";
  else if (title.length > 160) errors.title = "Keep the title under 160 characters.";

  let slug = str(body.slug);
  slug = slugify(slug || title);

  const sortRaw = Number(body.sortOrder ?? 0);
  const sortOrder = Number.isFinite(sortRaw) ? Math.max(-100000, Math.min(100000, Math.round(sortRaw))) : 0;

  const data: ContentInput["data"] = {};
  const source = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;

  for (const field of def.fields) {
    const raw = source[field.name];
    if (field.type === "boolean") {
      data[field.name] = raw === true || raw === "true";
      continue;
    }
    const value = typeof raw === "number" ? String(raw) : str(raw);
    if (!value) {
      if (field.required) errors[`data.${field.name}`] = `${field.label} is required.`;
      continue;
    }
    if (value.length > (field.maxLength ?? 2000)) {
      errors[`data.${field.name}`] = `${field.label} is too long.`;
      continue;
    }
    switch (field.type) {
      case "number": {
        const n = Number(value);
        if (!Number.isFinite(n)) errors[`data.${field.name}`] = `${field.label} must be a number.`;
        else data[field.name] = n;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[`data.${field.name}`] = `${field.label} must be a date.`;
        else data[field.name] = value;
        break;
      case "url":
      case "image":
        if (!isSafeUrl(value)) errors[`data.${field.name}`] = `${field.label} must be a web address.`;
        else data[field.name] = value;
        break;
      case "select":
        if (!field.options?.includes(value)) errors[`data.${field.name}`] = `Choose a valid ${field.label.toLowerCase()}.`;
        else data[field.name] = value;
        break;
      default:
        data[field.name] = value;
    }
  }

  if (Object.keys(errors).length > 0) throw new HttpError(422, "Please fix the highlighted fields.", errors);
  return { title, slug, published: body.published !== false, sortOrder, data };
}
