# whiteboard plugin — plan

## Idea
A shared whiteboard between human and agent. Claude builds an interactive page that
makes a concept / process / its own work visible, the page gets a draw + comment
overlay, and Claude views the tab (Claude in Chrome) so the human can point at things
and Claude can see exactly what they mean — and mark things up back.

Same mechanism serves several uses: visualization, human engagement, higher-fidelity
human<>agent collaboration, high-fidelity debugging (step through real fixtures, point
at where it goes wrong, fix, re-look at the same spot).

## Layers
1. Overlay (shipped code): draw in colors, arrows, anchored comments; readable by
   Claude as data (`window.whiteboard.getMarks()`) as well as visually; Claude can add
   marks too.
2. `/whiteboard [description]` skill: general-purpose design guidance + cookbook of
   example use cases (not overfit to any one). No description → discuss what to build
   first. Save/serve page, include overlay automatically, open where Claude can see it
   (Claude in Chrome preferred; fallback: explain installing a playwright-style
   plugin), confirm it's visible, optionally start with a mark showing where to focus.
3. Triggers (later): learn from real use. Note each time the whiteboard was reached
   for, or wished for, and what was happening just before.

## Status
- [x] overlay (draw, arrow, notes, colors, undo, label anchors, page state; agent API: getMarks/describe/addMark)
- [x] skill (skills/whiteboard/SKILL.md, reviewed on the whiteboard itself)
- [x] cookbook (dropped)
- [x] plugin manifest + single-plugin marketplace (validated; loads with --plugin-dir)
- [x] README with install for terminal, desktop, VS Code (web not supported)
- [ ] git repo + push to GitHub (README assumes jschomay/claude-whiteboard)
- [ ] triggers: collect real examples of when a whiteboard was reached for or wished for
