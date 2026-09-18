import { Client } from "@notionhq/client";

// The Notion token lives only here on the server. It is read from .env.local and
// is never sent to the browser.
export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  // Pin the stable classic API version so behavior doesn't shift under us.
  notionVersion: "2022-06-28",
});

export const DB = {
  queue: process.env.NOTION_DB_QUEUE || "42fc97c5742546b499fd2b6f240334fd",
  findings: process.env.NOTION_DB_FINDINGS || "58c67e76cc884be39775bde5bf6b2c23",
  drafts: process.env.NOTION_DB_DRAFTS || "0db9b7caa9114bc7a0e18254cf605ca5",
  ideas: process.env.NOTION_DB_IDEAS || "356b0b5c40f44701a8751209b5b45379",
  assets: process.env.NOTION_DB_ASSETS || "1fa418a092294f538fc7ceb18da19711",
};

export function assertConfigured() {
  if (!process.env.NOTION_TOKEN) {
    throw new Error(
      "NOTION_TOKEN is not set. Copy .env.local.example to .env.local and add your Notion integration secret."
    );
  }
}

// ---- Reading properties into plain values the UI can render ----

export type SelectValue = { name: string; color: string } | null;

export function readProp(prop: any): any {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
      return prop.title.map((t: any) => t.plain_text).join("");
    case "rich_text":
      return prop.rich_text.map((t: any) => t.plain_text).join("");
    case "select":
      return prop.select ? { name: prop.select.name, color: prop.select.color } : null;
    case "status":
      return prop.status ? { name: prop.status.name, color: prop.status.color } : null;
    case "multi_select":
      return prop.multi_select.map((s: any) => ({ name: s.name, color: s.color }));
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url;
    case "number":
      return prop.number;
    case "date":
      return prop.date?.start ?? null;
    case "relation":
      return prop.relation.map((r: any) => r.id);
    case "created_time":
      return prop.created_time;
    case "last_edited_time":
      return prop.last_edited_time;
    default:
      return null;
  }
}

// Flatten a Notion page into { id, url, props } where props is keyed by property name.
export function simplifyPage(page: any) {
  const props: Record<string, any> = {};
  for (const [name, value] of Object.entries(page.properties || {})) {
    props[name] = readProp(value);
  }
  return { id: page.id, url: page.url, createdTime: page.created_time, props };
}

// ---- Building property values for writes ----

export function buildProp(type: string, value: any): any {
  switch (type) {
    case "title":
      return { title: value ? [{ text: { content: String(value) } }] : [] };
    case "rich_text":
      return { rich_text: value ? [{ text: { content: String(value) } }] : [] };
    case "select":
      return { select: value ? { name: String(value) } : null };
    case "multi_select":
      return { multi_select: (value || []).map((name: string) => ({ name })) };
    case "checkbox":
      return { checkbox: !!value };
    case "url":
      return { url: value || null };
    case "date":
      return { date: value ? { start: String(value) } : null };
    default:
      throw new Error(`Unsupported write type: ${type}`);
  }
}

// Query every row of a database, following pagination.
export async function queryAll(databaseId: string, sorts?: any[]) {
  const results: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const resp: any = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      ...(sorts ? { sorts } : {}),
    });
    results.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results;
}
