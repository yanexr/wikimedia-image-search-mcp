import { describe, it, expect } from "@jest/globals";
import { writeFileSync, mkdirSync } from "fs";
import { THUMBNAIL_SIZE } from "../constants.js";
import { join } from "path";
import {
  buildWikimediaApiUrl,
  fetchWikimediaImages,
  parseWikimediaResponse,
  generateThumbnailComposite,
} from "../wikimedia-api.js";
import type { SearchImagesInput } from "../schemas.js";
import type { ImageMetadata } from "../types.js";
import { formatSearchResults } from "../index.js";

const OUTPUT_DIR = join(process.cwd(), "test-output");

// Create output directory if it doesn't exist
try {
  mkdirSync(OUTPUT_DIR, { recursive: true });
} catch (error) {
  // Directory already exists
}

describe("wikimedia-api", () => {
  describe("buildWikimediaApiUrl", () => {
    it("should build basic search URL with required parameters", () => {
      const params: SearchImagesInput = {
        query: "cats",
        limit: 10,
        offset: 0,
        license: "all",
        include_thumbnails: false,
      };

      const url = buildWikimediaApiUrl(params);

      expect(url).toContain("action=query");
      expect(url).toContain("generator=search");
      expect(url).toContain("gsrsearch=cats");
      expect(url).toContain("gsrlimit=11"); // limit + 1
      expect(url).toContain("prop=imageinfo");
    });

    it("should include CC0 filter when license is no_restrictions", () => {
      const params: SearchImagesInput = {
        query: "landscape",
        limit: 5,
        offset: 0,
        license: "no_restrictions",
        include_thumbnails: false,
      };

      const url = buildWikimediaApiUrl(params);

      expect(url).toContain("haswbstatement");
      expect(url).toContain("P275");
      expect(url).toContain("Q6938433");
    });

    it("should handle offset and limit correctly", () => {
      const params: SearchImagesInput = {
        query: "mountains",
        limit: 20,
        offset: 10,
        license: "all",
        include_thumbnails: false,
      };

      const url = buildWikimediaApiUrl(params);

      expect(url).toContain("gsrlimit=31"); // offset + limit + 1
    });

    it("should cap at MAX_API_LIMIT (50)", () => {
      const params: SearchImagesInput = {
        query: "test",
        limit: 50,
        offset: 10,
        license: "all",
        include_thumbnails: false,
      };

      const url = buildWikimediaApiUrl(params);

      expect(url).toContain("gsrlimit=50"); // capped at 50
    });
  });

  describe("parseWikimediaResponse", () => {
    it("should handle empty results", () => {
      const apiResponse = {
        query: {
          pages: [],
        },
      };

      const params: SearchImagesInput = {
        query: "nonexistent",
        limit: 10,
        offset: 0,
        license: "all",
        include_thumbnails: false,
      };

      const result = parseWikimediaResponse(apiResponse, params);

      expect(result.images).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should parse valid image results", () => {
      const apiResponse = {
        query: {
          pages: [
            {
              pageid: 123,
              index: 0,
              title: "File:Test.jpg",
              imageinfo: [
                {
                  thumburl: `https://example.com/${THUMBNAIL_SIZE}px-Test.jpg`,
                  size: 102400,
                  width: 800,
                  height: 600,
                  url: "https://example.com/Test.jpg",
                  descriptionurl: "https://example.com/File:Test.jpg",
                  mime: "image/jpeg",
                  extmetadata: {
                    ObjectName: { value: "Test Image" },
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                  },
                },
              ],
            },
          ],
        },
      };

      const params: SearchImagesInput = {
        query: "test",
        limit: 10,
        offset: 0,
        license: "all",
        include_thumbnails: false,
      };

      const result = parseWikimediaResponse(apiResponse, params);

      expect(result.images.length).toBe(1);
      expect(result.images[0]?.url).toBe(
        `https://example.com/${THUMBNAIL_SIZE}px-Test.jpg`
      );
      expect(result.images[0]?.width).toBe(800);
      expect(result.images[0]?.height).toBe(600);
      expect(result.images[0]?.caption).toBe("Test Image");
      expect(result.images[0]?.license?.name).toBe("CC BY-SA 4.0");
    });

    it("should detect hasMore correctly", () => {
      const pages = Array.from({ length: 11 }, (_, i) => ({
        pageid: i,
        index: i,
        title: `File:Test${i}.jpg`,
        imageinfo: [
          {
            thumburl: `https://example.com/${THUMBNAIL_SIZE}px-Test${i}.jpg`,
            width: 800,
            height: 600,
            descriptionurl: `https://example.com/File:Test${i}.jpg`,
          },
        ],
      }));

      const apiResponse = { query: { pages } };

      const params: SearchImagesInput = {
        query: "test",
        limit: 10,
        offset: 0,
        license: "all",
        include_thumbnails: false,
      };

      const result = parseWikimediaResponse(apiResponse, params);

      expect(result.images.length).toBe(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(10);
    });
  });

  describe("fetchWikimediaImages", () => {
    it("should fetch and format search results with output files", async () => {
      const params: SearchImagesInput = {
        query: "cat",
        limit: 12,
        offset: 0,
        license: "all",
        include_thumbnails: true,
      };

      // Fetch from API
      const apiResponse = await fetchWikimediaImages(params);

      // Save raw API response
      writeFileSync(
        join(OUTPUT_DIR, "wikimediaSearchResults.json"),
        JSON.stringify(apiResponse, null, 2)
      );

      // Parse response
      const searchResult = parseWikimediaResponse(apiResponse, params);

      // Save parsed search results
      writeFileSync(
        join(OUTPUT_DIR, "parsedSearchResults.json"),
        JSON.stringify(searchResult, null, 2)
      );

      // format parsed results
      const formattedResults = formatSearchResults(searchResult);

      // Save formatted results
      writeFileSync(
        join(OUTPUT_DIR, "formattedSearchResults.txt"),
        formattedResults
      );

      // Generate and save thumbnail composite if images exist
      if (searchResult.images.length > 0) {
        const thumbnailComposite = await generateThumbnailComposite(
          searchResult.images
        );
        const imageBuffer = Buffer.from(thumbnailComposite, "base64");

        writeFileSync(join(OUTPUT_DIR, "thumbnailComposite.jpeg"), imageBuffer);
      }

      expect(searchResult.images.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe("generateThumbnailComposite", () => {
    it("should return empty string for empty array", async () => {
      const composite = await generateThumbnailComposite([]);

      expect(composite).toBeDefined();
      expect(composite.length).toBe(0);
    });

    it("should generate composite from mock images", async () => {
      const mockImages: ImageMetadata[] = [
        {
          index: 0,
          url: `https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/${THUMBNAIL_SIZE}px-Cat03.jpg`,
          width: 800,
          height: 600,
          aspectRatio: "4:3",
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Cat03.jpg",
        },
      ];

      const composite = await generateThumbnailComposite(mockImages);

      expect(composite).toBeDefined();
      expect(composite.length).toBeGreaterThan(0);
    }, 20000);
  });
});
