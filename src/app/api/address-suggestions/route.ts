import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

interface PhotonProperties {
  name?: unknown;
  housenumber?: unknown;
  street?: unknown;
  city?: unknown;
  town?: unknown;
  village?: unknown;
  municipality?: unknown;
  locality?: unknown;
  suburb?: unknown;
  district?: unknown;
  county?: unknown;
  state?: unknown;
  postcode?: unknown;
}

interface PhotonFeature {
  properties?: PhotonProperties;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAddress(properties: PhotonProperties): string {
  const houseNumber = text(properties.housenumber);
  const street = text(properties.street) || text(properties.name);
  const streetLine = [houseNumber, street].filter(Boolean).join(" ");
  const locality =
    text(properties.city) ||
    text(properties.town) ||
    text(properties.village) ||
    text(properties.municipality) ||
    text(properties.locality) ||
    text(properties.suburb) ||
    text(properties.district) ||
    text(properties.county);
  const placeParts = [locality, text(properties.state)].filter(Boolean);
  if (!houseNumber && street && locality.toLowerCase() === street.toLowerCase()) {
    placeParts.shift();
  }
  const postcode = text(properties.postcode);
  const placeLine = [placeParts.join(", "), postcode].filter(Boolean).join(" ");

  return [streetLine, placeLine].filter(Boolean).join(", ");
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }
  if (query.length > 200) {
    return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");
  // Keep the suggestions relevant to the app's US address fields.
  url.searchParams.set("countrycode", "US");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CustomerJobApp/1.0 address autocomplete",
      },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Address suggestions are temporarily unavailable." },
        { status: 502 }
      );
    }

    const data = (await response.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const suggestions = (Array.isArray(data.features) ? data.features : [])
      .map((feature) => formatAddress(feature?.properties || {}))
      .filter((label) => {
        const normalized = label.toLowerCase();
        if (!label || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 6)
      .map((label) => ({ label }));

    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Address suggestions are temporarily unavailable." },
      { status: 502 }
    );
  }
}
