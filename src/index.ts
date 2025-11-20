#!/usr/bin/env node

/**
 * (Unofficial) Wikimedia Image Search MCP Server
 *
 * This MCP (Model Context Protocol) server enables AI assistants to search for images on Wikimedia
 * Commons. It provides detailed metadata and optional thumbnail composites to help AI models visually
 * compare results.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SearchImagesInputSchema, type SearchImagesInput } from "./schemas.js";
import { CHARACTER_LIMIT, THUMBNAIL_SIZE } from "./constants.js";
import type { SearchResult } from "./types.js";
import yaml from "js-yaml";
import {
  fetchWikimediaImages,
  parseWikimediaResponse,
  generateThumbnailComposite,
} from "./wikimedia-api.js";

const server = new McpServer({
  name: "wikimedia-image-search",
  version: "1.0.0",
});

/**
 * Format search results into a llm-friendly text response
 */
export function formatSearchResults(result: SearchResult): string {
  const lines: string[] = [];

  if (result.images.length === 0) {
    lines.push(
      "No images found matching your query. Try different search query or change the license filter to 'all'."
    );
    return lines.join("\n");
  }

  lines.push(
    `\nEach result contains: index, url (url to fetch the image, replace ${THUMBNAIL_SIZE}px with desired width up to the original image width), size (bytes), width, height, descriptionurl (webpage link), and optional: caption, date, description, credit, artist, license (name, usageTerms, url).`
  );
  lines.push(
    `\nShowing ${result.images.length} result${
      result.images.length !== 1 ? "s" : ""
    }:\n`
  );
  lines.push(yaml.dump(result.images, { indent: 2, lineWidth: 120 }));

  if (result.hasMore) {
    lines.push(
      `\nIf nothing found what you're looking for, try a different query or use offset=${result.nextOffset} to see more results.`
    );
  } else {
    lines.push("\nEnd of results.");
  }
  lines.push(
    `\nTo download images: use the image URL and replace '${THUMBNAIL_SIZE}px' with your desired width (up to original width).`
  );

  lines.push(
    "\nCompare the images in the search results to choose the most suitable for your task. You may fetch the image(s) using the fetch or download tool (if available), report your findings or use otherwise as needed."
  );
  return lines.join("\n");
}

/**
 * Search for images using the Wikimedia Commons API
 */
async function searchWikimediaImages(
  params: SearchImagesInput
): Promise<SearchResult> {
  try {
    const apiResponse = await fetchWikimediaImages(params);
    const searchResult = parseWikimediaResponse(apiResponse, params);
    return searchResult;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to search Wikimedia Commons: ${errorMessage}`);
  }
}

/**
 * Register the wikimedia_search_images tool
 */
server.registerTool(
  "wikimedia_search_images",
  {
    title: "Search Wikimedia Commons Images",
    description:
      "Search for images on Wikimedia Commons with metadata including download URLs and optional thumbnail composite image for visual comparison. Use results to e.g. fetch full images that are relevant for your task.",
    inputSchema: SearchImagesInputSchema as any,
  },
  async (args: { [key: string]: any }) => {
    const params = SearchImagesInputSchema.parse(args);
    try {
      // Search Wikimedia Commons
      const searchResult = await searchWikimediaImages(params);

      // Check if no results found
      if (searchResult.images.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No images found matching your query. Try different search terms or change the license filter to 'all'.",
            },
          ],
        };
      }

      // Format the text response
      const textResponse = formatSearchResults(searchResult);

      // Check character limit
      if (textResponse.length > CHARACTER_LIMIT) {
        const truncatedResult = {
          ...searchResult,
          images: searchResult.images.slice(
            0,
            Math.floor(searchResult.images.length / 2)
          ),
        };

        const truncatedText = formatSearchResults(truncatedResult);

        const warningMessage = `\n\n⚠️ **Response Truncated**: Original response exceeded ${CHARACTER_LIMIT} characters. Showing first ${truncatedResult.images.length} results. Use smaller limit to get non-truncated results.`;

        return {
          content: [
            {
              type: "text" as const,
              text: truncatedText + warningMessage,
            },
          ],
        };
      }

      // Prepare response content
      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string; mediaType: string }
      > = [
        {
          type: "text" as const,
          text: textResponse,
        },
      ];

      // Add thumbnail composite image if requested
      if (params.include_thumbnails && searchResult.images.length > 0) {
        const thumbnailComposite = await generateThumbnailComposite(
          searchResult.images
        );
        if (thumbnailComposite.length > 0) {
          content.push({
            type: "image" as const,
            data: thumbnailComposite,
            mimeType: "image/jpeg",
            mediaType: "image/jpeg",
          });
        }
      }

      return { content };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching Wikimedia Commons: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Main function - Initialize transport and connect server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
