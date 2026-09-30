# Whiteboard

A shared whiteboard between you and Claude.

Chat is a bad place to point at things. When a concept gets hard to follow, or Claude keeps
iterating on something without seeing why it goes wrong, Claude builds an interactive page
that makes it visible: a process exploded into steps, real data at each stage, whatever
fits. You draw, add arrows, highlight text, and leave notes on it. Claude looks at the same
page and reads exactly what you marked, and can mark things up back.

It's useful for:
- **Understanding:** explore a concept at your own pace instead of scrolling past it in chat.
- **Staying engaged:** stay in the loop instead of nodding along until things drift.
- **Collaborating:** circle the exact thing you mean. No more describing positions in words.
- **Debugging:** see intermediate steps on real data, point at where it goes wrong, and check
  the same spot after the fix. This makes Claude's work visible to Claude, too.

## Use it

```
/whiteboard the retry logic in our job queue, stepping through a real failed job
```

With no description, Claude talks with you about what to build first. Claude will also
suggest a whiteboard on its own when things get hard to follow.

On the page, use the toolbar in the bottom-right corner:
- **Draw**, **Arrow**, **Note**, and colors to mark things up.
- **Use page** (or Esc) to interact with the page normally.
- Select text, then click **Comment** to highlight it and add a note.
- **Undo** (Cmd/Ctrl+Z) and **Clear**.

Then tell Claude to look.

## Requirements

- **Node.js**, to serve the page locally. The server stops on its own a few minutes after you
  close the page.
- **A browser Claude can see:**
  - In the terminal or VS Code: the
    [Claude in Chrome](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)
    extension. Run `/chrome` to connect it, or start with `claude --chrome`. See
    [Use Claude Code with Chrome](https://code.claude.com/docs/en/chrome).
  - In the desktop app: the built-in Browser pane. Nothing to install.

## Install

The plugin is its own marketplace, so you add the marketplace once and then install it.

### Terminal

In a Claude Code session:

```
/plugin marketplace add jschomay/claude-whiteboard
/plugin install whiteboard@claude-whiteboard
```

Or from your shell:

```bash
claude plugin marketplace add jschomay/claude-whiteboard
claude plugin install whiteboard@claude-whiteboard
```

### Desktop app

In a local session in the **Code** tab, click **+** next to the prompt box, choose
**Plugins**, then **Add plugin**, and select **whiteboard**. The plugin browser lists plugins
from marketplaces you've added, so add the marketplace first with the terminal command above.
The terminal, the desktop app, and VS Code share the same settings, so a plugin installed in
one is available in the others.

### VS Code

Type `/plugins` in the Claude Code panel. On the **Marketplaces** tab, add
`jschomay/claude-whiteboard`. Then on the **Plugins** tab, find **whiteboard** and click **Install**.

### Web (claude.ai/code)

Not supported. Cloud sessions don't load locally installed plugins, and the whiteboard needs
a local server and a browser on your machine that Claude can see.

### Try it without installing

```bash
git clone https://github.com/jschomay/claude-whiteboard
claude --plugin-dir ./claude-whiteboard --chrome
```

## How it works

- `skills/whiteboard/SKILL.md`: how Claude decides what to build, designs the page, serves
  it, opens it, and works with your marks.
- `overlay/whiteboard.js`: the drawing and comment layer. It works on any page and gives
  Claude a small API (`describe()`, `getMarks()`, `addMark()`) to read and add marks.
- `overlay/serve.js`: a small static server that also serves the overlay, and exits once the
  page has been closed for a few minutes.

The overlay also works on other locally hosted pages, like your own app's dev server: Claude
can inject it with the browser tool so you can mark up your app the same way.

## Demo

`overlay/demo/` is a step-through insertion sort for trying the overlay:

```bash
node overlay/serve.js overlay/demo
```
