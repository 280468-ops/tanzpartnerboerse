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

  let preview = {
    image: new URL("/tanzpartnerboerse_og.png", url.origin).href,
    title: "Peter & Bettina’s Tanzpartnerbörse",
    description: "Workshops & Tanzen im Sonnenhof",
  };

  // Bild 2: Veranstaltungen
  if (eventId) {
    preview = {
      image: new URL("/veranstaltungen_og.png", url.origin).href,
      title: "Veranstaltungen",
      description: "Gemeinsam tanzen, feiern und genießen.",
    };
  }

  // Bild 3: Workshop / Paaranmeldung
  else if (pairId || workshops) {
    preview = {
      image: new URL("/workshop_paaranmeldung_og.png", url.origin).href,
      title: "Workshop-Paaranmeldung",
      description:
        "Peter & Bettina’s Tanzpartnerbörse – Workshops & Tanzen im Sonnenhof",
    };
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
    const safeContent = escapeHtml(content);
    const tag = `<meta ${attribute}="${key}" content="${safeContent}">`;

    const re = new RegExp(
      `<meta\\s+${attribute}=["']${key}["'][^>]*>`,
      "i"
    );

    if (re.test(html)) {
      return html.replace(re, tag);
    }

    return html.replace(
      /<head[^>]*>/i,
      (match) => `${match}\n    ${tag}`
    );
  }

  // Open Graph
  html = setMeta(html, "property", "og:title", preview.title);
  html = setMeta(html, "property", "og:description", preview.description);
  html = setMeta(html, "property", "og:image", preview.image);
  html = setMeta(html, "property", "og:image:url", preview.image);
  html = setMeta(html, "property", "og:image:secure_url", preview.image);
  html = setMeta(html, "property", "og:image:type", "image/png");
  html = setMeta(html, "property", "og:type", "website");
  html = setMeta(html, "property", "og:url", url.href);

  // Bildabmessungen der verwendeten PNGs
  html = setMeta(html, "property", "og:image:width", "1536");
  html = setMeta(html, "property", "og:image:height", "1024");

  // Twitter / WhatsApp-kompatible Large Preview
  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:title", preview.title);
  html = setMeta(html, "name", "twitter:description", preview.description);
  html = setMeta(html, "name", "twitter:image", preview.image);

  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
};

export const config = {
  path: "/",
};
