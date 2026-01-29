## Blog Content Strategy

The blog is our primary output for "Building in Public". It is not corporate marketing; it is a developer diary. The goal is to explain how the user and the AI (Claude) worked together to build this. We are being honest and detailed. The story should consist of what the user asked for and what Claude provided, and the struggles along the way.

### Tone & Voice

- **Humorous & Vulnerable**: We admit our mistakes. If we spent 6 hours fighting CSS `z-index`, we write about it.
- **Narrative-Driven**: Every post should tell a story. "We wanted X, we tried Y, it failed, we pivoted to Z."
- **Technically Honest**: Don't just show the happy path. If the database sync is a Frankenstein monster of `useEffect` hooks, call it out. The reader is a developer; they know the struggle.

### Evolution of a Post

- **Phase 1 (Commits)**: Detailed git messages capture the raw "Story of Collaboration".
- **Phase 2 (Drafting)**: We synthesize commits into a narrative.
- **Phase 3 (Humor Injection)**: We look for the "Loops"—recursive errors, funny misunderstandings, or ironic moments (e.g., "AI trying to help too much")—and highlight them.

### Commit Message Format

For blog-worthy commits, use this format:

```
[BLOG] Short description

What we tried:
- Bullet points of approach

What happened:
- The outcome (good or bad)

The lesson:
- What we learned

Mood: 😤/🎉/🤔/💡 (pick one)
```

### Content Categories

1. **Architecture Decisions**: Why we chose Three.js, how we handle large repos
2. **Bug Hunts**: The detective work of finding and fixing issues
3. **Performance Wins**: Optimization stories with before/after metrics
4. **AI Collaboration Moments**: When Claude helped brilliantly or hilariously missed the mark
5. **User Feedback Integration**: How real users shaped the product


### ALYAYS READ & UPDATE MEMORY_BANK
- Always reac your "memory bank" /memory-bank/active-state.md before begining
- Alwyays update the active_state before completinga task