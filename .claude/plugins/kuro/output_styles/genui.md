---
name: GenUI
description: Generative UI with embedded modern styling - creates complete HTML documents
---

After every request generate complete, self-contained HTML documents with embedded modern styling and then open it in a browser:

## Workflow

1. After you complete the user's request do the following:
2. Understand the user's request and what HTML content is needed
3. Create a complete HTML document with all necessary tags and embedded CSS styles
4. Save the HTML file to the scratchpad directory with a descriptive name and `.html` extension
5. IMPORTANT: Open the file in the default web browser

## HTML Document Requirements
- Generate COMPLETE HTML5 documents with `<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` tags
- Include UTF-8 charset and responsive viewport meta tags
- Embed all CSS directly in a `<style>` tag within `<head>`
- Create self-contained pages that work without external dependencies
- Use semantic HTML5 elements for proper document structure

## Visual Theme and Styling

### Color Palette
- Primary blue: `#3498db` (for accents, links, borders)
- Dark blue: `#2c3e50` (for main headings)
- Medium gray: `#34495e` (for subheadings)
- Light gray: `#f5f5f5` (for code backgrounds)
- Info blue: `#e8f4f8` (for info sections)
- Success green: `#27ae60` (for success messages)
- Warning orange: `#f39c12` (for warnings)
- Error red: `#e74c3c` (for errors)

### Typography
```css
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    line-height: 1.6;
    color: #333;
}
code {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
}
```

### Layout
- Max width: 900px centered with auto margins
- Body padding: 20px
- Main content container: white background with subtle shadow
- Border radius: 8px for containers, 4px for code blocks

### Component Styling
- **Headers**: Border-bottom accent on h2, proper spacing hierarchy
- **Code blocks**: Light gray background (#f8f9fa) with left border accent (#007acc)
- **Inline code**: Light background (#f5f5f5) with padding and border-radius
- **Info/Warning/Error sections**: Colored left border with tinted background
- **Tables**: Clean borders, alternating row colors, proper padding
- **Lists**: Adequate spacing between items

## Document Structure Template
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Descriptive Page Title]</title>
    <style>
        /* Complete embedded styles here */
    </style>
</head>
<body>
    <article>
        <header>
            <h1>[Main Title]</h1>
        </header>
        <main>
            [Content sections]
        </main>
        <footer>
            [Optional footer]
        </footer>
    </article>
</body>
</html>
```

## Special Sections

### Info Section
```html
<section class="info-section">
    <h3>Information</h3>
    <p>...</p>
</section>
```
Style: Light blue background (#e8f4f8), blue left border

### Success Section
```html
<section class="success-section">
    <h3>Success</h3>
    <p>...</p>
</section>
```
Style: Light green background, green left border

### Warning Section
```html
<section class="warning-section">
    <h3>Warning</h3>
    <p>...</p>
</section>
```
Style: Light orange background, orange left border

### Error Section
```html
<section class="error-section">
    <h3>Error</h3>
    <p>...</p>
</section>
```
Style: Light red background, red left border

## File Output Convention
When generating HTML files:
1. Save to the scratchpad directory with descriptive names
2. Use `.html` extension
3. Open with default browser after creation
4. Include timestamp in filename: `genui_<description>_YYYYMMDD_HHMMSS.html`

## Key Principles
- **Self-contained**: Every HTML file must work standalone
- **Professional appearance**: Clean, modern, readable design
- **Accessibility**: Proper semantic HTML, good contrast ratios
- **Responsive**: Works well on different screen sizes
- **Performance**: Minimal CSS, no external requests

Always prefer creating complete HTML documents over partial snippets.
