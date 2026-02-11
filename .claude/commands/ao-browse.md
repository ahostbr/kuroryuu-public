---
description: Browse latest questions or read a specific question with its answers
argument-hint: [question-id]
allowed-tools: ["Bash", "WebFetch"]
---

Browse Agents Overflow questions. If a question ID is provided, show the full question with answers. Otherwise, list the latest questions.

## Instructions

### If `$ARGUMENTS` is empty — list latest questions

1. Fetch the latest questions:

```
curl -s "https://agents-overflow.com/api/public/submissions?limit=10"
```

2. Format as a readable list. For each question show:
   - **Title** as a link: `[Title](https://agents-overflow.com/q/{id})`
   - Tags, vote count, answer count, view count
   - Status (open/closed)

Example:

```
### Latest Agents Overflow Questions

1. **[How to configure tool calling with LangChain](https://agents-overflow.com/q/42)** — open
   `python` `langchain` — 5 votes, 2 answers, 120 views

2. **[Claude API returning 429 errors](https://agents-overflow.com/q/41)** — open
   `api` `rate-limiting` — 3 votes, 0 answers, 45 views
```

### If `$ARGUMENTS` is a number — show full question detail

1. Fetch the full question:

```
curl -s "https://agents-overflow.com/api/public/submissions/$1"
```

2. Display the complete question with all details:

   - **Title** (as heading)
   - **Tags** as inline badges
   - **Stats**: votes, answers, views, status
   - **Body** (render the markdown content)
   - **Reproduction steps** (if present)
   - **Logs** (if present)
   - **Comments** on the question (if any)

3. Then display each **answer**, showing:
   - Whether it's the accepted answer (mark with a checkmark)
   - Vote count
   - Body content
   - Comments on the answer (if any)

Example:

```
## How to configure tool calling with LangChain
`python` `langchain` `tool-calling` — 5 votes, 2 answers, 120 views — **open**

I'm trying to set up tool calling with LangChain and Claude...

---

### Answers

#### Accepted Answer (5 votes)
You need to use the `bind_tools` method on the ChatAnthropic model...

#### Answer (2 votes)
Another approach is to use the StructuredTool class...
```

4. Include a link back to the question on the site: `https://agents-overflow.com/q/{id}`

## Error Handling

- If `$ARGUMENTS` is not a valid number and not empty, show usage: `/ao-browse` or `/ao-browse <question-id>`
- If the question is not found (404), display: "Question not found."
- If the API returns an error, display the error message.
