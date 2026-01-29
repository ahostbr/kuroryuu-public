---
description: Search Kuroryuu RAG index
argument-hint: [query]
allowed-tools: Read
---

Search the Kuroryuu RAG (Retrieval Augmented Generation) index for relevant context.

## Steps

1. **Extract query**:
   Use `$ARGUMENTS` as the search query.
   If empty, ask what to search for.

2. **Call k_rag MCP tool**:
   ```
   k_rag(
     action="search",
     query="<query>",
     top_k=5
   )
   ```

3. **Process results**:
   - Extract relevant chunks
   - Note source files and line numbers
   - Summarize findings

4. **Present results**:
   For each result:
   - Source file path
   - Relevance score
   - Content snippet
   - Context around match

## Gateway Alternative

POST to `http://127.0.0.1:8200/v1/rag/search`:
```json
{
  "query": "<query>",
  "top_k": 5,
  "filters": {}
}
```

## Advanced Options

- `top_k` - Number of results (default: 5)
- `filters` - Filter by file type, path, etc.
- `threshold` - Minimum relevance score

## Usage Examples

- `/k-rag how does authentication work` - Search for auth-related code
- `/k-rag PTY session management` - Find PTY handling code
- `/k-rag checkpoint save` - Find checkpoint implementation

## Index Management

To update the RAG index:
```
k_rag(action="index", paths=["src/", "apps/"])
```

Index is stored at: `ai/rag_index/`
