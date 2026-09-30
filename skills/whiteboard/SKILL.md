---
name: whiteboard
description: Build an interactive page that makes a concept, process, or Claude's own work visible, with a draw-and-comment overlay so the user can point at things and Claude can see exactly what they mean. Use when the user asks for a whiteboard, or wants to visualize, step through, or mark up something together. Also suggest it (don't build unasked) when a concept is getting hard to follow in chat, when you're iterating on something without being able to see why it keeps going wrong, when the user seems lost or asks about the same thing twice, when a multi-step process has intermediate states nobody can see, or when the user is reviewing a plan or document.
argument-hint: "[what to visualize]"
---

# Whiteboard

A whiteboard is a page both of you can look at and point at. You build a page that makes
something visible, the overlay lets the user draw, add arrows, highlight, and leave notes
on it, and you read those marks back.

The same mechanism serves several purposes:
- **Understanding:** a concept exploded into parts the user can explore at their own pace,
  instead of scrolling past in chat.
- **Engagement:** the user stays in the loop instead of nodding along until things drift
  off track.
- **Collaboration:** the user circles the exact thing they mean, and you see exactly that.
  No more describing positions in words.
- **Debugging:** showing intermediate steps on real data makes your own work visible to
  you, not just the user. They point at where it goes wrong; you trace why, fix it, and
  look at the same spot again to check.

## When to suggest one

Users often don't know this is possible, or don't think of it in the moment. When you
notice any of the signals in this skill's description, offer briefly: say what you'd
show and why it would help, and build only if they want it.

## 1. Decide what to build

If the user gave a description ($ARGUMENTS), build that.

If not, talk first. Don't build until you agree on:
- What's hard to see or follow right now.
- What the page should make visible, and what the user should be able to do with it
  (step through, toggle, compare, change inputs).
- What data to show. Real data (the actual fixture, input, or output you're working
  with) beats a made-up example.

## 2. Design the page

The goal is to explode the thing into parts small enough to point at.
- Show intermediate steps, not just the final result. If it's a process, make it
  steppable (prev / next) and show the state at each step.
- Use the real data when it exists, so what's on the page is what's actually happening.
- Keep it plain and legible. Clarity over decoration.
- Put `data-wb="<name>"` on every part worth pointing at (steps, rows, items, panels).
  Marks anchor to these names, so "step 3: tokenize" comes back instead of a raw tag.

Fit the page to the problem rather than to a template.

## 3. Build and serve it

- Put the page in `.whiteboard/<short-name>/index.html` in the project (create it; add
  `.whiteboard/` to `.gitignore` if the project uses git and it isn't already ignored).
- Include `<script src="whiteboard.js"></script>` at the end of the body. Always
  include it; the user shouldn't have to ask. The server provides this file, so don't
  copy it.
- Serve the folder: `node ${CLAUDE_PLUGIN_ROOT}/overlay/serve.js .whiteboard/<short-name>`.
  It picks a free port, prints the URL, and runs in the background. It shuts itself
  down a few minutes after the page is closed, so there's nothing to clean up.

## 4. Open it where you can see it

You need a browser you can see and run code in:
- In the desktop app: the Browser pane.
- In the terminal or VS Code: Claude in Chrome.

If neither is available, stop before building and tell the user the whiteboard needs one
so you can see the page. In the terminal, that means installing the Claude in Chrome
extension and running `/chrome` (or starting with `claude --chrome`). Continue once it's
working.

Open the page, then run `whiteboard.connect()` in it.

Don't give the user a clickable URL for a page you've opened yourself. A link opens in
their default browser, where you can't see anything. Point them to where you opened it
instead: "It's open in Chrome, in Claude's tab group" or "It's open in the Browser pane."

The page's "can't see this tab" banner names Chrome by default. When using the Browser
pane, include the script as `<script src="whiteboard.js" data-browser="the Browser pane">`
so the banner points to the right place.

## 5. Confirm it works

- Take a screenshot and check the page rendered the way you intended.
- Run `whiteboard.describe()` and check it returns (it should say "No marks.").
- Optionally add a first mark to say where to start, e.g.
  `whiteboard.addMark({ type: 'box', target: '<data-wb name>' })` or a note.
- Tell the user it's open, briefly how to use the toolbar (Draw, Arrow, Note, colors,
  Undo, Esc to go back to using the page), that they can select text and click
  "Comment" to highlight it, and to tell you when to look.

## 6. Work on it together

When the user says to look, or refers to something they marked:
- Run `whiteboard.describe()` to see exactly what was marked and where: one line per
  mark. Use `getMarks()` only when you need positions. Take a screenshot too, for the
  overall picture and for drawings like checkmarks whose meaning is in their shape.
- If the browser tool blocks the output (its filter can trip on code-like text in a
  quote), read it in pieces, such as a few lines of `describe()` at a time.
- Answer on the page as well as in chat when it helps: `addMark` with a `target` to
  point back at something. Your marks show dashed.
- When a mark shows something wrong, trace why, fix it, reload, and go back to the same
  spot (same step, same state) to check whether it actually changed.
- Update the page as understanding grows. The first version is rarely enough; add the
  step, detail, or view that would have made the problem obvious.

## Marking up other local pages

The overlay works on any locally hosted page, not just ones you build, such as the
user's own app on a dev server. Inject it with the browser tool:

```js
const s = document.createElement('script');
s.src = 'http://localhost:<port>/whiteboard.js'; // served from any local static server
document.head.appendChild(s);
```

Marks anchor to elements and their text instead of `data-wb` names. Re-inject after a
reload; marks persist per page. Pages with strict security policies may block it; if so,
fall back to screenshots and say so.

## Overlay API reference

- `whiteboard.describe()`: plain-text list of marks.
- `whiteboard.getMarks()`: marks as data (type, shape, color, author, anchor, state).
- `whiteboard.addMark({ type, target | coordinates, color, text })`: types are `box`,
  `arrow`, `comment`, `stroke`. `target` is a `data-wb` name. Returns an id.
- `whiteboard.removeMark(id)`, `whiteboard.clear(author?)`, `whiteboard.undo()`.
- `whiteboard.pageState = () => ({...})`: optional; set by a stateful page so each mark
  records the state it was made in (e.g. which step).
- `whiteboard.connect()`: tells the page you can see it (hides the warning banner).
