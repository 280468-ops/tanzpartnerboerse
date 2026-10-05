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

  // Standard-Vorschaubild
  const defaultImage = new URL(
    "/tanzpartnerboerse_og.png",
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
      "/veranstaltungen_og.png",
      url.origin
    ).href;
  }

  // Workshop / Paaranmeldung
  if (pairId || workshops) {
    title = "Workshop-Paaranmeldung";
    description =
      "Peter & Bettina’s Tanzpartnerbörse – Workshops & Tanzen im Sonnenhof";

    // Direktes PNG ohne zusätzlichen Cache-Parameter
    image =
      "https://peppy-cat-3434fb.netlify.app/workshop_paaranmeldung_og.png";
  }

  // Veranstaltung hat Vorrang,
  // falls mehrere Parameter gleichzeitig vorhanden sind
  if (eventId) {
    title = "Veranstaltungen";
    description = "Gemeinsam tanzen, feiern und genießen.";

    image = new URL(
      "/veranstaltungen_og.png",
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

  // Open Graph
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

  // Twitter / WhatsApp-kompatible große Vorschau
  html = setMeta(
    html,
    "name",
    "twitter:card",
    "summary_large_image"
  );

  html = setMeta(
    html,
    "name",
    "twitter:title",
    title
  );

  html = setMeta(
    html,
    "name",
    "twitter:description",
    description
  );

  html = setMeta(
    html,
    "name",
    "twitter:image",
    image
  );

  // Keine HTML-Zwischenspeicherung durch Netlify
  const headers = new Headers(response.headers);

  headers.delete("content-length");

  headers.set(
    "content-type",
    "text/html; charset=UTF-8"
  );

  headers.set(
    "cache-control",
    "no-cache, no-store, must-revalidate"
  );

  headers.set(
    "x-og-preview",
    "v5"
  );

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config = {
  path: "/",
};
