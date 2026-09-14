export default async (request, context) => {
  const response = await context.next();

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const url = new URL(request.url);

  const eventId = url.searchParams.get("event");
  const pairId = url.searchParams.get("paaranmeldung");
  const workshops = url.searchParams.get("workshops") === "1";

  let preview = {
    image: "/tanzpartnerboerse_og.png",
    title: "Peter & Bettina’s Tanzpartnerbörse",
    description: "Workshops & Tanzen im Sonnenhof",
  };

  // Bild 2: Veranstaltungen
  if (eventId) {
    preview = {
      image: "/veranstaltungen_og.png",
      title: "Veranstaltungen",
      description: "Gemeinsam tanzen, feiern und genießen.",
    };
  }

  // Bild 3: Workshop / Paaranmeldung
  else if (pairId || workshops) {
    preview = {
      image: "/workshop_paaranmeldung_og.png",
      title: "Workshop-Paaranmeldung",
      description:
        "Peter & Bettina’s Tanzpartnerbörse – Workshops & Tanzen im Sonnenhof",
    };
  }

  const imageUrl = new URL(preview.image, url.origin).href;

  let html = await response.text();

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function setMeta(html, attribute, key, content) {
    const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;

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

  html = setMeta(html, "property", "og:title", preview.title);
  html = setMeta(html, "property", "og:description", preview.description);
  html = setMeta(html, "property", "og:image", imageUrl);
  html = setMeta(html, "property", "og:type", "website");
  html = setMeta(html, "property", "og:url", url.href);

  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:title", preview.title);
  html = setMeta(
    html,
    "name",
    "twitter:description",
    preview.description
  );
  html = setMeta(html, "name", "twitter:image", imageUrl);

  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "content-type": "text/html; charset=UTF-8",
    },
  });
};

export const config = {
  path: "/",
};
