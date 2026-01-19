---
title: File Uploads
description: Upload files using the @./path syntax in @t-req/core
---

@t-req/core supports file uploads through the `@./path` syntax in form data.

## Basic File Upload

```http
POST https://api.example.com/upload

file = @./documents/report.pdf
```

The file path is relative to the `.http` file location. @t-req/core automatically:
- Reads the file content
- Detects the MIME type from the extension
- Sets `Content-Type: multipart/form-data`

## Custom Filename

Override the filename sent to the server:

```http
POST https://api.example.com/upload

document = @./temp/abc123.pdf | quarterly-report.pdf
```

The server receives the file as `quarterly-report.pdf` instead of `abc123.pdf`.

:::caution[Pipe Syntax Spacing]
Spaces around the `|` are **required** for custom filename syntax:

```http
# ✓ Correct - spaces around |
file = @./document.pdf | custom-name.pdf

# ✗ Incorrect - no spaces around |
file = @./document.pdf|custom-name.pdf
```

Without spaces, the pipe is treated as part of the filename.
:::

## Multiple Files

Upload multiple files in one request:

```http
POST https://api.example.com/upload

avatar = @./images/photo.jpg
resume = @./documents/cv.pdf
cover_letter = @./documents/cover.docx
```

## Files with Form Fields

Combine file uploads with text fields:

```http
POST https://api.example.com/documents

title = Quarterly Report
description = Q4 2025 financial summary
category = finance
document = @./reports/q4-2025.pdf
```

## Using Variables in Paths

File paths support variable interpolation:

```http
POST https://api.example.com/upload

document = @./{{uploadDir}}/{{filename}}
```

```typescript
const client = createClient({
  io: createNodeIO(),
  variables: {
    uploadDir: 'reports/2025',
    filename: 'q4-summary.pdf',
  },
});
```

## Binary File Upload (Raw Body)

For APIs expecting raw binary data, use the file reference syntax:

```http
PUT https://api.example.com/files/image.png
Content-Type: image/png

< ./images/photo.png
```

This sends the raw file content as the request body.

## Programmatic File Uploads

For dynamic file handling, prepare the form data yourself:

```typescript
const client = createClient();

// Build FormData manually
const formData = new FormData();
formData.append('title', 'My Document');
formData.append('file', new Blob([fileContent]), 'document.pdf');

// Use runString with interpolated body
const httpContent = `
POST https://api.example.com/upload
Content-Type: multipart/form-data

`;

// For complex scenarios, you might need to use fetch directly
const response = await fetch('https://api.example.com/upload', {
  method: 'POST',
  body: formData,
});
```

## File Type Detection

@t-req/core infers MIME types from file extensions:

| Extension | MIME Type |
|-----------|-----------|
| `.pdf` | `application/pdf` |
| `.json` | `application/json` |
| `.xml` | `application/xml` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.txt` | `text/plain` |
| `.html` | `text/html` |
| `.css` | `text/css` |
| `.js` | `application/javascript` |
| `.zip` | `application/zip` |

For unknown extensions, `application/octet-stream` is used.

## Large File Considerations

For very large files:

1. **Memory**: The entire file is loaded into memory. For huge files, consider streaming APIs.
2. **Timeout**: Increase the timeout for slow uploads:

```typescript
const response = await client.run('./upload.http', {
  timeout: 300000, // 5 minutes
});
```

3. **Progress**: @t-req/core doesn't currently support upload progress events. For progress tracking, use `fetch` directly with `ReadableStream`.

## Error Handling

Handle file-related errors:

```typescript
try {
  await client.run('./upload.http');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('File not found');
  } else if (error.code === 'EACCES') {
    console.error('Permission denied');
  } else {
    throw error;
  }
}
```
