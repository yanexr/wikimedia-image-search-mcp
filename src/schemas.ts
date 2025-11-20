import { z } from "zod";

export const SearchImagesInputSchema = z.object({
  query: z.string()
    .min(1, "Query must be at least 1 character")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search query. Note: Wikimedia uses strict keyword matching, not semantic search. Use common, fewer terms for more results."),
  
  limit: z.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit cannot exceed 50")
    .default(9)
    .describe("Maximum number of results to return (1-50). 12 or fewer is recommended, especially if including thumbnails is enabled."),
  
  offset: z.number()
    .int("Offset must be an integer")
    .min(0, "Offset cannot be negative")
    .default(0)
    .describe("Number of results to skip for pagination"),
  
  license: z.enum(["no_restrictions", "all"])
    .default("all")
    .describe("Filter images by license type: 'no_restrictions' for CC0/public domain only, 'all' for any license"),
  
  include_thumbnails: z.boolean()
    .default(true)
    .describe("If true, returns an additional composite image so you can visually view and compare the results. Set to false to save processing time or if you're unable to view images."),
}).strict();

export type SearchImagesInput = z.infer<typeof SearchImagesInputSchema>;
