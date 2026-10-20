# Changelog

PaperNotes follows [semantic versioning](https://semver.org). Each `## x.y.z` section below becomes the notes of that GitHub release, and the app shows them in its update panel.

## 2.5.0

Mark up your PDFs right inside PaperNotes (ง •̀_•́)ง

- **A PDF reader that edits**: PDFs now open in PaperNotes' own reader, filling the tab. Highlight text, draw with a pen (any colour and size), add text, pictures and your signature (sign once with the mouse or a pen, reuse it after). Undo and redo, zoom, find, and it remembers the page you were on.
- **Your marks go into the PDF itself**, as ordinary PDF annotations, so they show up in Edge, Acrobat and on your phone too. Edits save themselves a moment after you stop.
- **Nothing is lost**: the first time a PDF is changed, PaperNotes keeps the file as it was (in `.papernotes/originals`), and More, then "Restore the original PDF" puts it back.
- **Sticky notes on PDFs** are pinned to a spot on a page and stay there at any zoom. Pick the sticky tool and click where it goes. Claude can read them like the ones on your notes.

## 2.4.0

Notes that write like Obsidian, a slash menu like Notion, diagrams in seconds, and a lot of fonts (｀・ω・´)ゞ Thanks to the friends who asked for these.

- **Obsidian-style callouts**: all of Obsidian's types (info, tip, success, question, warning, danger, bug, example, quote and their aliases) next to PaperNotes' own, each with an icon. Text after `> [!type]` is the title, and `> [!faq]-` makes a box that opens on click.
- **Embeds**: `![[Note]]`, `![[Note#Section]]` or `![[Note#^block]]` shows that part of another note right inside this one; `![[picture.png|400]]`, videos, audio and `![[slides.pdf#page=3]]` work too.
- **Hover a link** to another note to preview it, and every note now lists the notes that link to it at the bottom.
- **Tick tasks while reading**: the note is saved with the change. New task states too: `[/]` doing, `[-]` cancelled, `[>]` moved on, `[?]`, `[!]`, `[*]`.
- **#tags** in your text (click one to search), `%% hidden comments %%`, coloured highlights (`==g:green==`), block links (`[[Note#^name]]`), `[[#Heading]]` in the same note, file names on code blocks (` ```c title="blink.c" `).
- **Easy diagrams**: ` ```tree ` turns an indented list into a tree (click a box to fold it), and ` ```flow ` turns one step per line into a flowchart, with decisions, labelled arrows and loops. No diagram language to learn, and Claude knows how to write them for you.
- **The "/" menu in the editor**: type `/` for headings, lists, to-dos, every callout, toggles, tables, maths, trees, flowcharts, embeds and more. `[[` suggests your notes (and their headings after `#`), and Ctrl+B, Ctrl+I and Ctrl+Shift+H format text.
- **83 fonts for your notes**: Default (the font Notion and Obsidian use), PaperDesign's own (Paper Serif, Paper Book, Paper Press, Paper Pen…), Word's (Aptos, Calibri, Cambria, Times New Roman…), reading serifs, clean sans, easier-to-read fonts (Atkinson Hyperlegible, Lexend, OpenDyslexic), handwriting, and monospace. Pick separate fonts for headings and code, and the line spacing. 49 of them ship with PaperNotes, so they look the same on every PC.
- **A Custom theme**: start from any theme and pick your own accent and highlighter colour, with a live preview in light and dark.
- **Drag and drop in the Notes panel**: drop files or whole folders from Explorer onto a folder to copy them in (onto the Notes header for the top level), drop text from a browser to make a note of it, and drag notes and folders between folders to move them. Their stickies, marks and tabs go with them, and nothing is ever overwritten. Drop a note into the editor to link to it. Drag a note out onto the desktop, into Explorer or into an email to copy it there (the note stays where it is).
- **VS Code for the web in a tab** (the `<>` button at the top, or Ctrl+K "VS Code"): vscode.dev right inside PaperNotes, with **Claude beside it** in the side pane, set up for coding, and **Save code as a note** to keep a snippet in My notes. Back, forward and an address bar too; it stays open while you use other tabs.
- **Open in new window**: right-click a tab (or a note in the tree) to give it a window of its own, for a second screen. It is a second view of your notes; the main window keeps everything PaperNotes remembers.

## 2.3.0

The first public release (ﾉ◕ヮ◕)ﾉ

- **One-click updates.** PaperNotes checks its GitHub releases twice a day. When there's a newer version, an Update button appears at the top: it saves everything, installs the new version and opens again. Your notes and settings are never touched.
- **15 themes**, each with a light and a dark version: Paper, Sakura, Ocean, Deep Ocean, Darker, Gruvbox, Solarized, Nord, Dracula, Catppuccin, Tokyo Night, Rose Pine, Everforest, Kanagawa, One.
- **Right-click in a note**: copy as a quote, flashcard, sticky note, reminder, add to Inbox, ask Claude (explain, simpler, quiz me), search Google, YouTube, Wikipedia or Scholar, read aloud.
- **Pomodoro** in the status bar: study, break and rounds, pause and resume, presets, a chime and notifications.
- **Music player** for your Music folder: tags and cover art in any language, a mini player in the status bar, Windows media keys.
- **Profile**: your picture, your details (and what Claude should know about you), study stats, a year of study days, badges.
- **Relax mode**: a tab that is just a calm animation. Bring your own video, or enjoy the night sky.
- **Study time counts only real studying**, and the semester week reads Wk 1, Wk 2 and so on.
- **T^T**. Press it.
