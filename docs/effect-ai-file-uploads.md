# Uploading Files to Anthropic Models with @effect/ai v4 Beta

All file uploads use `Prompt.makePart("file", ...)` from `effect/unstable/ai`. The Anthropic provider dispatches on `mediaType` to build the correct API payload (image block vs. document block).

## Image Upload

```ts
import { Prompt } from "effect/unstable/ai";

// From a URL
const imageFromUrl = Prompt.makePart("file", {
    mediaType: "image/jpeg",
    fileName: "photo.jpg",
    data: new URL("https://example.com/photo.jpg"),
});

// From base64
const imageFromBase64 = Prompt.makePart("file", {
    mediaType: "image/png",
    fileName: "screenshot.png",
    data: "iVBORw0KGgo...", // base64 string
});

// From bytes
const imageFromBytes = Prompt.makePart("file", {
    mediaType: "image/jpeg",
    data: new Uint8Array([
        /* ... */
    ]),
});
```

## PDF Upload (with optional citations)

```ts
const pdfPart = Prompt.makePart("file", {
    mediaType: "application/pdf",
    fileName: "report.pdf",
    data: pdfBytes, // Uint8Array, base64 string, or URL
    // Anthropic-specific options:
    anthropic: {
        cacheControl: { type: "ephemeral" },
        citations: { enabled: true },
        documentTitle: "Q4 Financial Report",
        documentContext: "Internal financial report for fiscal Q4 2025",
    },
});
```

The Anthropic provider automatically enables the `pdfs-2024-09-25` beta flag when it sees `application/pdf` or `text/plain` media types.

## Plain Text File Upload

```ts
const textFilePart = Prompt.makePart("file", {
    mediaType: "text/plain",
    fileName: "log.txt",
    data: "Contents of the log file...",
});
```

## Building a Multimodal Message

Combine text and file parts in a single user message:

```ts
const message = Prompt.makeMessage("user", {
    content: [
        Prompt.makePart("text", { text: "Summarize the key findings in this PDF" }),
        Prompt.makePart("file", {
            mediaType: "application/pdf",
            fileName: "report.pdf",
            data: pdfBytes,
            anthropic: { citations: { enabled: true } },
        }),
    ],
});
```

## FilePart Type Shape

```ts
interface FilePart {
    readonly type: "file";
    readonly mediaType: string; // e.g. "image/jpeg", "application/pdf", "text/plain"
    readonly fileName?: string;
    readonly data: string | Uint8Array | URL; // base64, bytes, or URL
    readonly options: {
        readonly anthropic?: {
            readonly cacheControl?: { type: "ephemeral" } | null;
            readonly citations?: { enabled: boolean } | null;
            readonly documentTitle?: string | null;
            readonly documentContext?: string | null;
        } | null;
    };
}
```

## Supported Media Types (Anthropic)

| Media Type        | Anthropic Block Type | Notes                                                |
| ----------------- | -------------------- | ---------------------------------------------------- |
| `image/*`         | `image`              | Any image format; `image/*` defaults to `image/jpeg` |
| `application/pdf` | `document`           | Auto-enables PDF beta; supports citations            |
| `text/plain`      | `document`           | Supports citations                                   |

## Anthropic-Specific Features

- **Citations**: When enabled on PDF/text parts, the response may include `DocumentSourcePart` entries with character or page location metadata pointing back to the source content.
- **Cache control**: `{ type: "ephemeral" }` tells Anthropic to cache the file content for reuse across turns, useful for large PDFs you'll ask multiple questions about.
- **Document metadata**: `documentTitle` and `documentContext` provide additional context to the model without being cited.
- **Data formats**: The `data` field accepts `string` (base64), `Uint8Array`, or `URL`. The provider auto-detects whether to send a URL reference or base64-encode the content.
