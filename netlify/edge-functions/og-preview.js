export default async (request, context) => {
  const response = await context.next();

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return response;
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event");
  const pairId = url.searchParams.get("paaranmeldung");
  const workshops = url.searchParams.get("workshops") === "1";

  // Version 4: richtiges Peter-&-Bettina-Bild + Cache-Buster
  const defaultImage = new URL(
    "/tanzpartnerboerse_og.png?v=263",
    url.origin
  ).href;

  let title = "Peter & Bettina’s Tanzpartnerbörse";
  let description = "Workshops & Tanzen im Sonnenhof";
  let image = defaultImage;

  // Veranstaltungen
  if (eventId) {
    title = "Veranstaltungen";
    description = "Gemeinsam tanzen, feiern und genießen.";
    image = new URL(
      "/veranstaltungen_og.png?v=263",
      url.origin
    ).href;
  }

  // Workshop / Paaranmeldung
  if (pairId || workshops) {
    title = "Workshop-Paaranmeldung";
    description =
      "Peter & Bettina’s Tanzpartnerbörse – Workshops & Tanzen im Sonnenhof";

    image = new URL(
      "/workshop_paaranmeldung_og.png?v=263",
      url.origin
    ).href;
  }

  // Veranstaltung hat Vorrang
  if (eventId) {
    title = "Veranstaltungen";
    description = "Gemeinsam tanzen, feiern und genießen.";

    image = new URL(
      "/veranstaltungen_og.png?v=263",
      url.origin
    ).href;
  }

  let html = await response.text();

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function setMeta(html, attribute, key, content) {
    const tag =
      `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;

    const regex = new RegExp(
      `<meta\\s+${attribute}=["']${key}["'][^>]*>`,
      "i"
    );

    if (regex.test(html)) {
      return html.replace(regex, tag);
    }

    return html.replace(
      /<head[^>]*>/i,
      (match) => `${match}\n    ${tag}`
    );
  }

  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "property", "og:image", image);
  html = setMeta(html, "property", "og:image:url", image);
  html = setMeta(html, "property", "og:image:secure_url", image);
  html = setMeta(html, "property", "og:image:type", "image/png");
  html = setMeta(html, "property", "og:image:width", "1200");
  html = setMeta(html, "property", "og:image:height", "630");
  html = setMeta(html, "property", "og:image:alt", title);
  html = setMeta(html, "property", "og:type", "website");
  html = setMeta(html, "property", "og:url", url.href);

  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  html = setMeta(html, "name", "twitter:image", image);

  const headers = new Headers(response.headers);

  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=UTF-8");
  headers.set("cache-control", "no-cache, no-store, must-revalidate");
  headers.set("x-og-preview", "v4");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config = {
  path: "/",
};
