/**
 * Wikimedia Commons API integration for image search
 */

import sharp from "sharp";
import {
  WIKIMEDIA_API_BASE,
  CC0_WIKIDATA_ID,
  MAX_RESULTS_LIMIT,
  THUMBNAIL_SIZE,
  MAX_IMAGES_IN_COMPOSITE,
} from "./constants.js";
import type { SearchImagesInput } from "./schemas.js";
import type {
  ImageMetadata,
  SearchResult,
  WikimediaApiResponse,
} from "./types.js";

/**
 * Build Wikimedia Commons API URL for image search
 */
export function buildWikimediaApiUrl(params: SearchImagesInput): string {
  const { query, limit, offset, license } = params;

  // actual fetch limit: requested + 1 (to check if more exist) + offset
  // capped at MAX_RESULTS_LIMIT (50)
  const totalToFetch = Math.min(offset + limit + 1, MAX_RESULTS_LIMIT);

  // Build the search query with filters
  let searchQuery = `${query} filemime:image/*`;

  if (license === "no_restrictions") {
    searchQuery += ` haswbstatement:P275=${CC0_WIKIDATA_ID}`;
  }

  const urlParams = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: searchQuery,
    gsrnamespace: "6", // File namespace
    gsrlimit: totalToFetch.toString(),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: THUMBNAIL_SIZE.toString(), // Request thumbnails of specified width
  });

  return `${WIKIMEDIA_API_BASE}?${urlParams.toString()}`;
}

/**
 * Fetch search results from Wikimedia Commons API
 */
export async function fetchWikimediaImages(
  params: SearchImagesInput
): Promise<WikimediaApiResponse> {
  const url = buildWikimediaApiUrl(params);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "wikimedia-image-search-mcp/1.0.0 (https://github.com/yanexr/wikimedia-image-search-mcp)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Wikimedia API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as WikimediaApiResponse;
  return data;
}

/**
 * Truncate string to max length with ellipsis
 */
function truncateString(
  str: string | undefined,
  maxLength: number = 500
): string | undefined {
  if (!str) return undefined;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Calculate aspect ratio as a simplified string (e.g., "4:3", "16:9", "≈1:1")
 */
function getAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "unknown";

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.abs(width), Math.abs(height));
  const reducedWidth = width / divisor;
  const reducedHeight = height / divisor;

  const MAX_COMPONENT = 21;
  if (reducedWidth <= MAX_COMPONENT && reducedHeight <= MAX_COMPONENT) {
    return `${reducedWidth}:${reducedHeight}`;
  }

  const targetRatio = width / height;
  let bestPair: [number, number] = [reducedWidth, reducedHeight];
  let smallestDelta = Number.POSITIVE_INFINITY;

  for (let h = 1; h <= MAX_COMPONENT; h++) {
    const w = Math.min(MAX_COMPONENT, Math.max(1, Math.round(targetRatio * h)));
    const delta = Math.abs(w / h - targetRatio);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      bestPair = [w, h];
    }
  }

  return `≈${bestPair[0]}:${bestPair[1]}`;
}

/**
 * Parse Wikimedia API response and extract image metadata
 */
export function parseWikimediaResponse(
  apiResponse: WikimediaApiResponse,
  params: SearchImagesInput
): SearchResult {
  // Check for API errors
  if (apiResponse.error) {
    throw new Error(`Wikimedia API error: ${apiResponse.error.info}`);
  }

  // Check if we have results
  if (!apiResponse.query?.pages || apiResponse.query.pages.length === 0) {
    return {
      images: [],
      hasMore: false,
    };
  }

  const rawPages = apiResponse.query.pages;

  // sort pages by index
  rawPages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  // Apply offset and limit
  const { offset, limit } = params;
  const startIndex = Math.min(offset, rawPages.length);
  const endIndex = Math.min(offset + limit, rawPages.length);

  // Check if there are more results (limit + 1)
  const hasMore = rawPages.length > offset + limit;

  // Slice to get the requested page (excluding the +1 item)
  const slicedPages = rawPages.slice(startIndex, endIndex);

  // Parse each page into ImageMetadata
  const images: ImageMetadata[] = [];
  for (const page of slicedPages) {
    if (!page.imageinfo || page.imageinfo.length === 0) {
      continue;
    }
    const info = page.imageinfo[0];
    if (!info) continue;

    const extmetadata = info.extmetadata;

    // Require essential fields
    if (!info.thumburl || !info.width || !info.height) {
      continue;
    }

    // Build license object
    const license: {
      name?: string;
      usageTerms?: string;
      url?: string;
    } = {};

    if (extmetadata?.LicenseShortName?.value) {
      const truncated = truncateString(extmetadata.LicenseShortName.value, 100);
      if (truncated) license.name = truncated;
    } else if (extmetadata?.License?.value) {
      const truncated = truncateString(extmetadata.License.value, 100);
      if (truncated) license.name = truncated;
    }

    if (extmetadata?.UsageTerms?.value) {
      const truncated = truncateString(
        stripHtml(extmetadata.UsageTerms.value),
        500
      );
      if (truncated) license.usageTerms = truncated;
    }

    if (extmetadata?.LicenseUrl?.value) {
      license.url = extmetadata.LicenseUrl.value;
    }

    // Build the image metadata object
    const imageMetadata: ImageMetadata = {
      index: page.index ?? 0,
      url: info.thumburl,
      width: info.width,
      height: info.height,
      aspectRatio: getAspectRatio(info.width, info.height),
      descriptionurl: info.descriptionshorturl ?? "",
    };

    // Add optional fields
    if (info.size !== undefined) {
      imageMetadata.size = info.size;
    }

    if (extmetadata?.ObjectName?.value) {
      const truncated = truncateString(extmetadata.ObjectName.value, 500);
      if (truncated) imageMetadata.caption = truncated;
    }

    /* Commenting out category to reduce token usage
    if (extmetadata?.Categories?.value) {
      const truncated = truncateString(extmetadata.Categories.value, 500);
      if (truncated) imageMetadata.category = truncated;
    } */

    if (extmetadata?.DateTimeOriginal?.value) {
      const truncated = truncateString(
        stripHtml(extmetadata.DateTimeOriginal.value),
        500
      );
      if (truncated) imageMetadata.date = truncated;
    }

    if (extmetadata?.ImageDescription?.value) {
      const truncated = truncateString(
        stripHtml(extmetadata.ImageDescription.value),
        500
      );
      if (truncated) imageMetadata.description = truncated;
    }

    if (extmetadata?.Credit?.value) {
      const truncated = truncateString(
        stripHtml(extmetadata.Credit.value),
        500
      );
      if (truncated) imageMetadata.credit = truncated;
    }

    if (extmetadata?.Artist?.value) {
      const truncated = truncateString(
        stripHtml(extmetadata.Artist.value),
        500
      );
      if (truncated) imageMetadata.artist = truncated;
    }

    if (Object.keys(license).length > 0) {
      imageMetadata.license = license;
    }

    images.push(imageMetadata);
  }

  const result: SearchResult = {
    images,
    hasMore,
  };

  if (hasMore) {
    result.nextOffset = offset + limit;
  }

  return result;
}

/**
 * Calculate the appropriate thumbnail width based on original dimensions
 * to ensure max dimension is THUMBNAIL_SIZE (e.g. 256px)
 */
function calculateThumbnailWidth(width: number, height: number): number {
  if (height > width) {
    const scaleFactor = THUMBNAIL_SIZE / height;
    // resulting width
    return Math.round(width * scaleFactor);
  }

  return THUMBNAIL_SIZE;
}

/**
 * Extract the width parameter from a Wikimedia thumbnail URL
 * and replace it with a new width value
 */
function replaceUrlWidth(url: string, newWidth: number): string {
  // Wikimedia URLs have format like e.g.: .../256px-filename.jpg
  return url.replace(/\/(\d+)px-/, `/${newWidth}px-`);
}

/**
 * Generate thumbnail composite image from multiple images
 * Creates a 3-column grid with up to MAX_IMAGES_IN_COMPOSITE images
 * with index numbers overlaid on each thumbnail
 */
export async function generateThumbnailComposite(
  images: ImageMetadata[]
): Promise<string> {
  const limitedImages = images.slice(0, MAX_IMAGES_IN_COMPOSITE);

  if (limitedImages.length === 0) {
    return "";
  }

  // Grid configuration
  const COLUMNS = 3;
  const SPACING = 10;

  // Calculate grid dimensions
  const rows = Math.ceil(limitedImages.length / COLUMNS);
  const canvasWidth = COLUMNS * THUMBNAIL_SIZE + (COLUMNS + 1) * SPACING;
  const canvasHeight = rows * THUMBNAIL_SIZE + (rows + 1) * SPACING;

  // Fetch and process images
  const imageBuffers: Array<{ buffer: Buffer; index: number } | null> =
    await Promise.all(
      limitedImages.map(async (img, index) => {
        try {
          // Calculate appropriate width for this image
          const thumbnailWidth = calculateThumbnailWidth(img.width, img.height);

          // Adjust URL if needed
          const fetchUrl = replaceUrlWidth(img.url, thumbnailWidth);

          // Fetch the image
          const response = await fetch(fetchUrl, {
            headers: {
              "User-Agent":
                "wikimedia-image-search-mcp/1.0.0 (https://github.com/yanexr/wikimedia-image-search-mcp)",
            },
          });

          if (!response.ok) {
            console.error(
              `Failed to fetch image ${index + 1}: ${response.status}`
            );
            return null;
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Resize image to fit in block while maintaining aspect ratio
          const resizedBuffer = await sharp(buffer)
            .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
              fit: "inside",
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .toBuffer();

          return { buffer: resizedBuffer, index };
        } catch (error) {
          console.error(`Error processing image ${index + 1}:`, error);
          return null;
        }
      })
    );

  // Filter out failed images
  const validImages = imageBuffers.filter(
    (img): img is { buffer: Buffer; index: number } => img !== null
  );

  if (validImages.length === 0) {
    return "";
  }

  // Create composite image layers
  const compositeInputs: Array<{ input: Buffer; top: number; left: number }> =
    [];

  for (const { buffer, index } of validImages) {
    const row = Math.floor(index / COLUMNS);
    const col = index % COLUMNS;

    const top = row * THUMBNAIL_SIZE + (row + 1) * SPACING;
    const left = col * THUMBNAIL_SIZE + (col + 1) * SPACING;

    compositeInputs.push({
      input: buffer,
      top,
      left,
    });
  }

  // Create index number overlays using SVG
  const textOverlays: Array<{ input: Buffer; top: number; left: number }> =
    validImages.map(({ index }) => {
      const row = Math.floor(index / COLUMNS);
      const col = index % COLUMNS;

      const top = row * THUMBNAIL_SIZE + (row + 1) * SPACING + 5; // 5px from top
      const left = col * THUMBNAIL_SIZE + (col + 1) * SPACING + 5; // 5px from left

      const svg = `
      <svg width="40" height="30">
        <text 
          x="20" 
          y="20" 
          text-anchor="middle" 
          font-family="Arial, sans-serif" 
          font-size="20" 
          font-weight="bold" 
          fill="white" 
          stroke="black" 
          stroke-width="2"
          paint-order="stroke">
          ${index + 1}
        </text>
      </svg>
    `;

      return {
        input: Buffer.from(svg),
        top,
        left,
      };
    });

  // Create blank white canvas and composite all images with text overlays
  const compositeImage = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([...compositeInputs, ...textOverlays])
    .jpeg({ quality: 90 })
    .toBuffer();

  return compositeImage.toString("base64");
}
