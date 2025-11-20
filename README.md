# Wikimedia Image Search MCP Server

This MCP (Model Context Protocol) server enables AI assistants to search for images on Wikimedia Commons. It provides detailed metadata and optional thumbnail composites to help AI models visually compare results.

## Overview

This server is designed to give AI assistants "eyes" when searching for visual content. Instead of guessing based on filenames or text descriptions alone, the AI can retrieve a structured list of image metadata and a composite image containing thumbnails of the search results.

This capability is particularly useful when an AI assistant needs to:
- Find suitable images for creating websites, articles, or presentations.
- Select images for educational materials or books.
- Verify the visual content of an image before recommending it.
- Compare multiple images to choose the most relevant one for a specific context.

By providing both metadata (license, author, description, dimensions) and a visual preview, the AI can make informed decisions about which images to use or download.

## Setup

### Prerequisites
- **Node.js**: Version 18 or higher.
- **MCP Client**: A compatible client such as VS Code, Cursor, Claude Code, Windsurf, Cline, Claude Desktop...

### Installation

To use this server, configure your MCP client to run it using `npx`.

<details>
<summary>VS Code</summary>

Add the following configuration to your MCP settings file (typically located at `%APPDATA%\Code\User\globalStorage\mcp-servers.json` on Windows or `~/Library/Application Support/Code/User/globalStorage/mcp-servers.json` on macOS).

```json
{
  "mcpServers": {
    "wikimedia-image-search": {
      "command": "npx",
      "args": [
        "-y",
        "wikimedia-image-search-mcp"
      ]
    }
  }
}
```
</details>

<details>
<summary>Cursor</summary>

Go to **Cursor Settings** > **MCP** > **Add new MCP Server**.
- **Name**: wikimedia-image-search
- **Type**: command
- **Command**: `npx -y wikimedia-image-search-mcp`

Alternatively, edit your `.cursor/mcp.json` file:

```json
{
  "mcpServers": {
    "wikimedia-image-search": {
      "command": "npx",
      "args": [
        "-y",
        "wikimedia-image-search-mcp"
      ]
    }
  }
}
```
</details>

<details>
<summary>Claude Desktop</summary>

Edit your `claude_desktop_config.json` file (typically located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS).

```json
{
  "mcpServers": {
    "wikimedia-image-search": {
      "command": "npx",
      "args": [
        "-y",
        "wikimedia-image-search-mcp"
      ]
    }
  }
}
```
</details>

<details>
<summary>Claude Code</summary>

Run the following command in your terminal:

```bash
claude mcp add wikimedia-image-search -- npx -y wikimedia-image-search-mcp
```
</details>

## Tool Usage

This server exposes a single tool: `wikimedia_search_images`.

### Tool Schema

The tool accepts the following parameters:
- **query** (string, required): The search terms (e.g., "sunset ocean", "eiffel tower").
- **limit** (number, optional): Maximum number of results to return (default: 9, max: 50).
- **offset** (number, optional): Number of results to skip for pagination.
- **license** (string, optional): Filter by license. Options: `"all"` (default) or `"no_restrictions"` (CC0/Public Domain).
- **include_thumbnails** (boolean, optional): Whether to generate and return a composite image of thumbnails (default: `true`).

### How It Works

1.  **Fetching**: The tool queries the Wikimedia Commons API using the provided search terms and filters. It retrieves raw JSON data containing image URLs, metadata, and license information.
2.  **Processing**: The raw JSON response is parsed and transformed into a clean, structured list of `ImageMetadata` objects.
3.  **Formatting**:
    -   **Text**: The metadata list is converted into a YAML-formatted string. This provides the AI with a readable, structured text overview of the results (including file size, dimensions, author, and license).
    -   **Visual**: If `include_thumbnails` is true, the tool downloads the thumbnail for each result. It then uses the `sharp` library to composite these thumbnails into a single grid image, with index numbers overlaid on each image.
4.  **Response**: The tool returns a multi-content message containing the YAML text and the composite image (MIME type `image/jpeg`).

You can view examples of the output files in the `test-output/` directory:
-   [wikimediaSearchResults.json](https://github.com/yanexr/wikimedia-image-search-mcp/blob/main/test-output/wikimediaSearchResults.json): The raw JSON response from the Wikimedia API.
-   [formattedSearchResults.txt](https://github.com/yanexr/wikimedia-image-search-mcp/blob/main/test-output/formattedSearchResults.txt): The YAML-formatted text response.
-   [thumbnailComposite.jpeg](https://github.com/yanexr/wikimedia-image-search-mcp/blob/main/test-output/thumbnailComposite.jpeg): The generated visual grid of search results.

## Demonstration

<video src="https://github.com/yanexr/wikimedia-image-search-mcp/raw/main/demo.webm" controls="controls" style="max-width: 100%;">
  <a href="https://github.com/yanexr/wikimedia-image-search-mcp/raw/main/demo.webm">Watch the demo video</a>
</video>

[Located on GitHub](https://github.com/yanexr/wikimedia-image-search-mcp/raw/main/demo.webm)

## Development

To contribute to this project or run it locally from source:

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yanexr/wikimedia-image-search-mcp.git
    cd wikimedia-image-search-mcp
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    pnpm install
    ```

3.  **Build the project**:
    ```bash
    npm run build
    # or
    pnpm run build
    ```

4.  **Local Configuration**:
    To test the server locally with an MCP client, point the configuration to your built file.

    ```json
    {
      "mcpServers": {
        "wikimedia-local": {
          "command": "node",
          "args": [
            "C:/path/to/wikimedia-image-search-mcp/dist/index.js"
          ]
        }
      }
    }
    ```

5. **Testing and Debugging**:
   You can use the MCP Inspector to test the server interactively:
    ```bash
    npm run inspect
    # or
    pnpm run inspect
    ```
