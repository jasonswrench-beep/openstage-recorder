# The editing screens: preview, timeline and clip list

The editor of OpenStage Capture, so far as a package of its own with a demo page. It has three screens on one edit, which always make the same changes:

* **The clip list** (stories C1 and C2): a table of everything in an edit, with keyboard commands to split, trim, delete, join, move, rename and set exact values, each result said in words.
* **The timeline** (story C3): the tracks and their clips along a time axis, with a playhead, a zoom, start and end grips that are real sliders, and mouse dragging. Escape cancels a drag, and a whole drag is one undo step.
* **The preview** (story C4's picture, and playing): the picture of the edit at the playhead, with the overlays and the zoom, and the sound, and a way to play it.

It sits on the edit model in [`../capture-edit/`](../capture-edit/) and does not duplicate any of its rules: what a command does, the sentence that says so, how far a grip can go, and what plays at a moment all come from there.

**Nothing in this package has been heard with a screen reader, and the timeline must not ship until it has been (story C3).** It has been tested by scripts, and checked in a real browser by a script that reads the same information a screen reader is given (roles, names, states, focus) and drives everything with the keyboard and the mouse. How NVDA, Narrator, JAWS or VoiceOver actually speak it is not known until someone listens. The checklist for that is below.

## Try it (Windows)

Double-click **`capture\OPEN TIMELINE DEMO.bat`**. It opens a page in your browser with a made-up lesson (a screen recording cut into three clips, the voice and webcam cut the same way, two overlays and a zoom). It records nothing, and changes nothing on your computer unless you choose Save; the page is served only to your own computer and stops when you close the window. It needs Node.js 22.13 or newer, and a recent Edge or Chrome for the best results.

Things to try, with the keyboard only:

1. Press **Tab** until the timeline takes focus. **Left** and **Right** choose the clip before or after in the track; **Up** and **Down** choose the clip in the track above or below.
2. Press **.** (period) a few times to move the playhead 0.1 second (**,** goes back; **Page Up** and **Page Down** move it 5 seconds). Press **S** to split the chosen clip at the playhead.
3. Press **Tab** to reach the clip's **start grip** and **end grip**. Press **Right** a few times: it moves 0.1 second each time. Wait half a second, then press **Ctrl+Z**: the whole run of presses is undone as one step. **Escape** puts a grip back.
4. Press **Space** to play. The preview shows the pictures and overlays, and the playhead moves. **Space** again pauses. (The made-up lesson has no recordings, so the pictures are labelled stand-ins.)
5. **Shift+Right** adds the next clip to the choice; **Ctrl+Right** moves without changing the choice, and **Ctrl+Space** adds or removes the clip you are on. **Delete** deletes every chosen clip, and one **Ctrl+Z** brings them all back.
6. **F6** moves between the preview, the timeline and the clip list. **Enter** on a clip goes to its name, times, track, volume and fades in the clip list.
7. With the mouse: drag a clip to move it; drag it onto another track that takes it to move it there; drag a grip to trim; click the ruler to put the playhead there. **Escape** during a drag calls it off.

**Open an edit file** opens an `edit.json`. **Open a recording folder** opens a folder made by OpenStage Capture (the one that ends in `.capture`): if it holds an `edit.json` that is opened, otherwise a first edit is made from its takes, and the preview plays the real recordings. **Save** (or Ctrl+S) writes the edit into the recording folder, or into the file that was opened; where the browser has no file pickers it hands back a download instead. **Save a copy** always asks where.

Add `?rows=cells` to the page address to have the clip list's rows read by their cells instead of as sentences (to compare with a screen reader). Add `?long=1` for a one hour recording cut into 720 clips, to see that it stays quick.

## The layout

The picture is large at the top, with its play controls above it, and the timeline is under it, in the manner of a video editor. The clip list and its form are in a panel at the side that opens from the **Properties and clip list** button (closed when the editor starts, so the picture and the timeline have the room; the demo page starts with it open, and `?list=closed` shows the real editor's start). Nothing scrolls the whole page: the picture takes what is left, and the timeline and the panel scroll inside their own boxes. F6, Enter on a clip and the button all open the panel first, so focus is never sent to something that is hidden, and Tab and the button always close it again. The hints that the timeline's controls point to are kept in the page for a screen reader and are written out under Keyboard shortcuts. The callout gallery is a column of buttons at the left of the picture, so it costs width and not height. The line of announcements is a fixed three lines (it scrolls, and shows the whole sentence on hover, if one is longer), so a long sentence never makes the picture and the timeline jump. Below 52 rem wide the panel goes under the timeline and the gallery goes under the picture, in a row that wraps.

## What it does

* **The clip list.** A table (`grid`) with a caption, column headers, and one row for every clip, overlay and zoom: Name, Track, Type, Start, Length, End, State. A form for the row you are on: name, start, length, end, track, volume, fade in, fade out, muted. Rows can be chosen several at a time.
* **The timeline.** A track for each of the edit's tracks, with each clip a block along a ruler. The playhead is a slider on the ruler. Zoom in and out (up to 400 pixels for each second) or show the whole edit; only the marks in view are drawn, so an hour-long recording stays quick. An empty track can be added, to move clips onto.
* **The tool bar** above the tracks: Undo, Redo, Copy, Paste, Split, Delete and Delete, close gap, Mark start, Mark end, Remove stretch, Remove and close gap, Clear marks, Snap, Add track and Tracks, each a button with a small drawing and its name, the same commands as the keys. The bar is one Tab stop, and Left, Right, Home and End move along it. A tool that cannot do anything now (Undo with nothing to undo, Paste with nothing copied) is dimmed (`aria-disabled`, not `disabled`), stays in the bar, and says why when pressed. Undo and Redo say what they would undo or redo in their hover text.
* **Copy and paste** (Ctrl+C, Ctrl+V, the buttons in the bar and in the clip list). Copy takes a snapshot of the chosen clips, overlays or zooms and changes nothing. Paste puts copies in so that the earliest begins at the playhead and the rest keep their distance from it, each on the track it came from, or on another track of the same kind if its own has no room. It is all or nothing: if any copy has nowhere to go, nothing is pasted and the sentence says which one and what is in the way. The pasted rows become the choice and the playhead moves to where they end, so pasting again lays another copy right after. One paste is one undo step. What was copied is kept inside the editor, not on the computer's clipboard, so it never mixes with text copied elsewhere and is gone when the editor is closed.
* **Removing a stretch of time** (I, O, X, Shift+X, Alt+X). Put the playhead where the stretch starts and press **I**, then where it ends and press **O**. The stretch is shown as a shaded band over every track with a dashed edge at each end, and written out in words under the timeline. **X** removes it and leaves a gap; **Shift+X** removes it and moves everything after it earlier, so the cut closes. It is cut from every track at once, picture and sound together. A clip that crosses an edge is cut there. An overlay or zoom inside the stretch goes; one that crosses an edge is shortened to it; one that spans the whole stretch gets shorter when the gap is closed and is cut in two when it is left; a piece shorter than 0.1 second is dropped, and the sentence says how many of each. It is one undo step, the marks are cleared, and the playhead goes to the cut. **Alt+X** clears the marks without touching the edit. The marks belong to the screen, not the edit: they are not an undo step and are not saved.
* **Snapping.** A drag with the mouse jumps to the playhead, to the start or end of any clip, overlay or zoom that is not being dragged, to the start and the end of the edit and to the marks of a stretch, when an edge of what is dragged comes within 8 pixels of it. A line shows what it jumped to. It starts on; the **Snap** button or **N** turns it off for good, and holding **Alt** turns it off for one drag. Keys are never snapped: a key is an exact step. Snapping never takes a drag past a limit.
* **Moving several together.** With several clips, overlays or zooms chosen, dragging one of them moves them all by the same amount, as one undo step ("Moved 3 things 6.5 seconds later."). The drag stops where the first of them would be refused (nothing before the start, no clip into another one that is not chosen, no zoom past a zoom that is not chosen). A group cannot be dropped on another track. The Start box in the form still moves one at a time.
* **Renaming and deleting a track.** The **Tracks** button opens a menu with Rename and Delete for every track. Rename opens a small form in the panel; an empty name is refused. Delete takes an empty track at once; one with clips, overlays or zooms on it asks first, in words, in the same place ("Deleting the track deletes them too. Undo brings the track back.") and has a Cancel. Both are one undo step.
* **The zoom slider** beside the tool bar: a slider from the whole edit to as far in as it goes, in even steps (each step is the same factor), that says in words how much time fits across the timeline. Zoom out, Zoom in and Show the whole edit are buttons beside it, and the keys +, - and 0 still work.
* **Pictures along the clips** of a screen, a webcam or an imported video: small pictures of the recording at that moment, only for the part in view, made by seeking a hidden video and drawing it on a canvas (the way the steps feature grabs pictures). They are decoration: hidden from a screen reader, which has the clip's name and sentence, and if the web view will not hand a picture over, or a recording cannot be read, the clip is shown as it was, with no message. The name sits on its own solid patch at the top left so it stays readable. Sound clips have no picture (a waveform is not built).
* **The callout gallery** under the picture: Text, Title, Lower third, Highlight box, Circle, Arrow, Blur and Cover, each put in at the playhead with a sensible size, place and colours, three seconds long (shorter if the edit ends sooner), on the first Overlays track (one is added if there is none). **Zoom on a part** adds a zoom of the middle of the picture. The new row is chosen and the Properties panel opens with focus in the box that needs filling in (the words, the alt text, the zoom's description). The bar is one Tab stop; Left, Right, Home and End move along it.
* **The form for an overlay or zoom** (in the Properties panel, above the clip list): name; for text, its words, size, colours, bold and alignment; for a shape, its kind and colours; for an arrow, where it starts and points; for a cover, its colour; for a zoom, what it shows and how long it takes to move in and out; for every one with a rectangle, its place as percentages of the picture (Left, Top, Width, Height, or one Size for a zoom, which keeps the picture's shape). Shapes and arrows ask for alt text or "only decoration", and a zoom for its description, because the edit needs them. Colours are chosen from a short list of names.
* **Working on the picture.** The chosen overlay or zoom has a frame over the picture: drag it to move it, drag its corner to resize it. With the keyboard, the frame takes focus; the arrow keys move it 1 percent (Shift 5), Alt with the arrow keys resizes it, Ctrl+Z and Ctrl+Y undo and redo, Escape leaves it. **Draw a zoom** (a button in the gallery) lets you drag a rectangle on the picture to make a zoom of that part; the rectangle is always the picture's shape. A drag is one change and one undo step; Escape during it puts everything back. Arrows are placed and changed with the form (their ends as percentages), not by dragging.
* **The commands**, from the keyboard in both the timeline and the list, and as buttons in the list: split at the playhead (the chosen clip, or every track), trim the start or end to the playhead, delete (leave a gap, or close it), join with the next clip, move earlier or later in the track, copy and paste, mute, undo, redo, play and pause, and "describe what is at the playhead" (story C4, on request). Split, trim, delete and mute act on every chosen clip as one undo step; the others ask for one.
* **The preview.** The pictures in track order (the webcam in the bottom right corner unless it says where), blur, blackout, shapes and arrows that zoom with the picture, text that does not, and the zoom moving along the exporter's curve (or cutting, for reduced motion). The sound of every microphone, computer-sound and sound-file clip, at the volume and fades set. A screen recording's own sound is not played, because the exporter does not use it.
* **Moving to another track.** A drag onto another track, or the Track box in the form, moves a clip, overlay or zoom to a track that takes it, keeping its time. A track that does not take it, or a clip already there, is explained in words.
* **Files.** Open and save an edit file, and open a recording folder. Unsaved changes are shown and asked about before leaving the page.
* Every result is a plain sentence, shown in one line at the top and read aloud through a polite live region that the three screens share.

## What it does not do yet

A captions track on the timeline (captions are written after the video exists, in their own dialog in OpenStage, because the words come from the sound of the finished video; the timeline would only show a track nobody can edit); effects from the cursor and clicks (the exporter has to draw them and the edit file needs somewhere to say so, which is the recorder's work: see `ROADMAP.md`); a waveform for sound clips; an export button on this standalone page (the exporter is `openstage-capture render --project <folder> --out lesson.mp4`, which reads the `edit.json` that Save writes into the recording folder; inside OpenStage the recording editor has **Make a video from this edit**); and saving into the project automatically. Not yet tried: playing a real `screen.mp4` made by the recorder (the check plays WebM files, because the browser it uses cannot play MP4), on Windows, in Edge.

## Accessibility: what changed, in the terms the project asks for

**Keyboard access.** Every command is available from the keyboard and as a button, and every change that can be made with the mouse can be made without it: a drag by a key held on a grip or by the Start and Length boxes, a move to another track by the Track box, a range of clips by Shift and the arrow keys, clips that are not next to each other by Ctrl and the arrow keys with Ctrl+Space, the playhead by its keys or its box, the zoom by its keys, its slider or its buttons. Nothing is disabled (a disabled button leaves the Tab order, and takes keyboard focus with it); a command that cannot be done says why instead. The tool bar dims the tools that cannot be used now with `aria-disabled`, which a screen reader announces as unavailable while the button stays where it is. Letter keys (S, B, E, J, M, D) and Space work only when a clip, a row, a grip or the playhead has focus, never inside a text box, so they cannot get in the way of typing. Ctrl+Z inside a text box undoes the typing, not the edit.

**No keyboard trap.** Tab and Shift+Tab always move on. Escape in a text box puts the old text back, and if there is nothing to put back, returns to the list or the timeline. Escape on a grip, or during a mouse drag, cancels it. When the last row is deleted, focus goes to the "no clips" message instead of being lost. A mouse drag never has to be finished with the mouse.

**Focus order.** The line of announcements, the preview (its controls), the timeline (the tool bar as one stop, the zoom buttons and slider, the playhead time box and its buttons, the playhead, the clips as one stop, then the start and end grips of the chosen clip), the clip list (the table as one stop, the command buttons, the form), the keyboard shortcuts. After a command that redraws a screen, focus is put back on the clip or row that had it. A key held on a grip ends the step when the focus leaves the grip.

**Screen reader output.**
* The list is a `grid`; each row has its sentence as its name ("Add an assignment, screen on the Screen track, starts at 30 seconds, 30 seconds long, ends at 1 minute."), and its cells keep the column headers. (`?rows=cells` reads the cells instead.)
* The timeline's clips are one `listbox` of `option`s grouped by track (`group`, named "Screen track, 3 clips"), each named by the same sentence and with its position in the track. The chosen clips are `aria-selected`.
* The playhead is a `slider` whose spoken value says where it is and how that relates to the chosen clip ("1 minute 12.4 seconds, 12.4 seconds into "Add an assignment""). The start and end grips are `slider`s named "Start of "Add an assignment"" with a spoken value ("starts at 30 seconds, 30 seconds long"), and with the range the edit allows as their minimum and maximum.
* Results go to a `status` live region, filled about 60 ms after the change so that a screen reader's own announcement of a change of focus is not talked over. A slider's value is read as it changes, so the line is not used for it as well. A value that is refused is marked `aria-invalid`, with the reason beside it.
* **While it plays, nothing is announced** except starting ("Playing from 1 minute 28.5 seconds."), pausing, and reaching the end, and the playhead slider's value is not changed sixty times a second; it is told where the playhead is when it stops. The picture has the name "Preview of the edit at 13 seconds"; what is showing is said on request (D, or the Describe button), and kept on the page as text.

**Looking at it.** The main text and controls (the page, the line of announcements, hints, headers, rows, buttons, key labels, boxes, error text, the track names, the clips of the five kinds of track in the demo, the marks of the ruler) have at least 4.5:1 contrast in light and dark colours (checked by script). Windows high contrast (forced colours) uses the system colours. Text can be enlarged to 200% at 320 pixels wide without the page scrolling sideways (the table and the timeline scroll inside their own boxes). A track is never told apart by colour alone: its name and kind are written at the start of its lane. The chosen clips have a thick outline, the one with the focus a thicker edge; muted clips are hatched and say "muted"; the playhead is a line. A zoom in the preview can be turned into a cut ("reduced motion"), which starts on if the computer asks for reduced motion. Nothing else moves except playing, which the author starts and can pause (Space), and no sound plays until they do.

**Text that is meant to be read, and audio.** The sentences this adds are read by a screen reader. It has no narration of its own yet. The picture of the preview has its description on request, but no audio description track is made from it yet. A way to give the sentences audio when the editor is part of OpenStage is not built.

## Please listen to this with a screen reader

What to check, and what to tell me. The first two matter most, because they decide how the screens are read.

1. **Rows.** In the clip list, press Down. Is the whole row sentence read, once? Then add `?rows=cells` to the end of the page address, reload, and press Down again: which is clearer, the sentence or the cells with their column names?
2. **The timeline's clips.** Tab to the timeline and press Right and Down. Is each clip read as its sentence, with its track and its place ("2 of 3")? Does NVDA stay in focus mode on the clips, so the arrow keys work, or do they have to be passed on by hand?
3. **The grips.** Tab to a grip and press Right three times. Is the value read each time ("starts at 30.1 seconds ...") and only once?
4. **Playing.** Press Space. Is "Playing from ..." read, and then quiet until you press Space again ("Paused at ...")? Does the slider say where the playhead is after it stops?
5. **A command.** Choose a clip, put the playhead inside it, press S. Is "Clip split at ..." read in full, or is it cut off by the clip being read again?
6. **Delete several.** Shift+Right to choose three clips, press Delete. Are the result and the newly chosen clip both heard, in a sensible order?
7. **A wrong time.** Type `soon` into a time box and press Enter. Is the reason read, and is the box announced as invalid?
8. **F6.** Does it say where it arrived, and is the preview's Play button a sensible first stop?
9. **Opening.** Open a recording folder. Is what was opened, and what was left out, said clearly?
10. **High contrast.** Turn on a Windows contrast theme (left Alt+left Shift+Print Screen). Can you still see which clips are chosen, the grips, and where the playhead is?

## Choices that could have gone the other way

I made these so the work could go on. Each is one small change to reverse; tell me if you want any different.

**The clip list** (from the first part)

1. **Exact values are edited in a form under the list, not inside the table's cells.** Screen readers handle editing inside cells much less reliably. Cost: one extra step (press Enter on a row).
2. **The list moves by row, not by cell.** Left and Right move the playhead instead of moving between cells.
3. **Each row is read as one sentence** rather than as cells. `?rows=cells` shows the other way, for comparing.
4. **Delete leaves a gap; Shift+Delete closes it.** The requirements say the author chooses every time, so both are named buttons. Which key does which is my choice. Undo brings either back.
5. **Single letters as shortcuts** (S split, Shift+S split every track, B trim the beginning, E trim the end, J join, M mute, D describe, Space play), only when a clip, row, grip or the playhead has focus.
6. **Split acts on the chosen clip only, and refuses if the playhead is not inside it.** Shift+S splits every track at the playhead instead, so picture and sound are cut together.
7. **After a split the choice stays on the first piece. After a delete it goes to the row that took the place** (or the one before, if it was the last).
8. **The playhead stays inside the edit.** A time typed past the end goes to the end, and says so.
9. **A typed time is applied when you press Enter or leave the box.**
10. **Nothing is disabled.** A command that cannot be done says why.

**The timeline and choosing several**

11. **The clips are one listbox, grouped by track, with one Tab stop**, so ten tracks of clips are not hundreds of stops. Left and Right go along a track, Up and Down across tracks.
12. **Only the chosen clip has grips** (two more Tab stops), not every clip. Every clip's start and end can also be set in the form, or dragged.
13. **A key held on a grip is one undo step.** It ends half a second after the last key press, or at once on any other command or when the focus leaves the grip.
14. **The playhead keys from the clips are comma and period** (0.1 second, with Shift 1 second) and Page Up and Page Down (5 seconds), because Left and Right choose clips. On the ruler itself and in the list, the playhead keys are the arrow keys as in OpenStage's Timeline.
15. **Ctrl with the arrow keys moves without changing the choice, and Ctrl+Space adds or removes the clip you are on**, the usual way to choose clips that are not next to each other. Shift with the arrow keys chooses a range. A choice always keeps at least one row.
16. **With several chosen, split, trim, delete and mute act on all of them as one undo step; everything else asks for one.** Moving several chosen clips together by dragging is described at 52.
17. **A drag lands on tidy times** (the nearest 0.01 second) and is kept inside what the edit allows (not into its neighbour, not past its recording). Snapping is described at 51. A zoom stops at the zoom before and after it, though the edit model would let it jump over them.
18. **A drag that ends over another track moves the clip there, in the same undo step**, and if that track does not take it, says why and leaves it on its own track. Where nothing else stops it, a clip can be moved or made longer up to 10 minutes past the end of the edit.
19. **Zoom goes by halves and doubles**, from the whole edit to 400 pixels a second, and keeps the playhead where it is on the screen.

**The preview, playing, and files**

20. **The recordings' own sound is not played from a screen or webcam clip**, because the exporter does not use it: sound comes from the microphone and computer-sound clips. If you would rather the preview used the screen recording's mix, the exporter has to change too.
21. **Playing is the playhead's clock**: each recording is moved only when it has drifted more than 0.3 second, so it does not stutter. Playing from the end starts again from the start.
22. **While it plays, a screen reader is not told the playhead's value**; it is told when it stops. The rows of the list are marked a few times a second, not sixty.
23. **Opening a recording folder that has an `edit.json` opens that edit** and does not add takes made since. One that has none gets a first edit made from its finished takes, laid one after another, with a track each for the screen, the webcam, the microphone and the computer's sound.
24. **Save writes `edit.json` into the recording folder** (where the browser lets a page write to a folder it was given, as Edge and Chrome do), otherwise into the file that was opened, otherwise a download. A copy always asks.
25. **The text in the preview is drawn with the browser's fonts**, so line breaks can differ a little from the exported video. The exported video is what counts.

**The tool bar, copy and paste, the zoom slider and the pictures** (2026-10-17)

26. **The tool bar has short names with small drawings** (Undo, Redo, Copy, Paste, Split, Delete, Delete, close gap) rather than drawings alone, so a name is always on the screen and the button's spoken name is what is written on it. Its hover text gives the full command and key.
27. **Copy and paste keep their own store inside the editor, not the computer's clipboard.** Cost: you cannot paste a clip into another recording's editor window. Benefit: a clip is never confused with text, and nothing private is left on the clipboard.
28. **Paste puts the copy at the playhead and moves the playhead to its end**, so pressing it twice makes two copies in a row. The alternative is leaving the playhead, so a second paste would be refused for overlapping the first.
29. **Paste goes on the same kind of track when its own is taken, and refuses (changing nothing) when no track has room.** It never adds a track by itself.
30. **A tool that cannot be used is dimmed, not disabled,** to keep the "nothing is disabled" rule (a disabled button leaves the Tab order). The same for the zoom slider on an edit too short to zoom.
31. **The zoom slider is even in factor, not in time:** halfway along is halfway in the way the + and - keys feel. Keyboard steps on it are 1 of 100 (Page Up and Page Down 10).
32. **Pictures are made only for the clips in view,** from the middle of each stretch, rounded to a tidy moment so a little scrolling or zooming reuses them (up to 400 are kept), newest request first. A recording that cannot be read gets no pictures and no message.
33. **A lane is 3 rem tall (it was 2.6)** so the pictures are big enough to mean something, and a track's name stays on one line with the whole name in its hover text and its spoken name.
34. **The playhead time box is left alone while you are in it, even while playing.** Before, each frame put the playing time back, so a time could not be typed while the edit played (found by the browser check failing one run in three). Leaving the box now updates it, and text you did not change is never entered, so leaving the box cannot put the playhead back.

**The callout gallery, the form and working on the picture** (2026-10-17)

35. **A callout is added at the playhead, three seconds long, and chosen.** The alternative is asking for the length first; adding straight away and then changing the length in the form is quicker. A callout that would run past the end of the edit is shortened; one at the very end is refused.
36. **Highlight boxes, circles and arrows are added without alt text and the sentence says it is still needed,** because the edit's rule is that a shape needs alt text or "only decoration". The form opens with focus on that box. Nothing is invented for the author.
37. **A zoom is always the picture's shape.** A rectangle drawn or typed that is not is made square in the picture's own units (the larger side is used) and the sentence says so. The alternative is allowing any shape, which the export does not do.
38. **A zoom that overlaps another goes on a new Zoom track** (a zoom track cannot hold two at once). This is the one place a track is added without being asked, and the sentence says it.
39. **Colours come from a short list of names,** not typed codes, so no one has to know what #FFD400 is. A colour from an older edit that is not on the list is kept and shown as "Custom" with its code. Typing any colour is not built yet; say if you need it.
40. **A drag changes the edit once, when you let go.** The frame follows the pointer meanwhile. The alternative, changing the edit on every movement, would make one drag many undo steps.
41. **The frame sits beside the picture, not in it.** The picture is one image to a screen reader with no parts of its own, so the frame (which must be reachable by keyboard) is in a layer laid over it.
42. **Drawing a zoom is for the mouse, and says so,** with Zoom on a part and the form as the keyboard way. Arrows are not dragged on the picture; their ends are typed as percentages.
43. **The gallery is a column beside the picture, not a row under it,** and the announcement line has a fixed height. Both are to give the picture the height; a row under it and a line that grew with each sentence made the picture small and made it jump (found when a drawing check clicked in the wrong place because the picture moved). The cost is a three-line limit on what is shown, though all of it is spoken.
44. **A transition changes the picture only, and is added per cut.** T (or the Arrives with box) gives a cross-fade where a picture comes before and a fade at the very start; the form has Arrives with and Leaves with, with a length each. The alternative, a default for every cut, was declined. A preview cannot blend two parts of one recording (one video would have to show two places), so it shows a cut there; between different recordings it holds the last picture of the clip before.
45. **Files are brought in by three buttons (Picture, Video, Sound from a file), in the callout bar, at the playhead.** The program that can open files does the choosing and copying and hands back what the edit needs; here there is no file dialog, so the buttons are left out in a plain browser unless the demo is started with `?files=fake`. The new clip's form opens with focus on what it still needs: the alt text of a picture, or the captions box of a video or sound. The alternative, one button with a menu, was left out to keep each choice one key press away.
46. **The timeline header is one row, and Add track is a menu button in the tool bar.** The track-kind box and its button took a second row and the timeline's own Describe button repeated the one beside the picture, so both went (D and the picture's button remain). The menu button is part of the tool bar's single Tab stop; Enter or Down opens it, Up and Down choose, Escape closes and returns focus.
47. **The gallery wraps into columns when the window is short, and the Properties panel has a splitter.** The buttons keep their order, so Up and Down still read them in turn. The splitter is a focusable separator with a value: Left widens the panel, Right narrows it, Shift takes bigger steps, Home and End go to the ends, and the new width is spoken. It can also be dragged. Alternative left out: remembering the width between sessions (not asked for).

**Removing a stretch, snapping, moving several together, and tracks**

48. **A stretch is marked with I and O at the playhead, not by dragging across the ruler.** The keys are exact, work without a mouse and say the times; a drag across the ruler would need a second way for the keyboard. Marking a start at or after the end mark clears the end. Alternative: also drag on the ruler; it can be added on top.
49. **X leaves the gap and Shift+X closes it; there is no default.** The same two as Delete and Shift+Delete, because the edit model gives no default for either, and for the same reason.
50. **A stretch is always cut from every track.** So a cut can never put picture and sound out of step. The edit model can cut from chosen tracks only (`deleteRange` takes them); a screen for that is not built. Alternative: cut from the tracks of the chosen clips.
51. **Snapping starts on, is for the mouse only, reaches 8 pixels, and Alt turns it off for one drag.** The same as the slide editor's. The times it jumps to are the playhead, 0, the end of the edit, the marks and the edges of every row not being dragged. Alternative: off until switched on; or a different reach.
52. **Dragging one of several chosen clips moves all of them.** The choice is kept, and the group stops where its first member would be refused. Before this a drag collapsed the choice to the clip dragged. Alternative: keep that, and move the group only with a key. A group cannot be dropped on another track (it would mix up which goes where).
53. **A track with things on it is deleted only after a plain question in the panel**, and Undo brings it all back; an empty one is deleted at once. Alternative: refuse unless it is empty (the edit model does, until told otherwise).
54. **A piece of an overlay or zoom shorter than 0.1 second is dropped** when a stretch is removed, and the sentence says how many. The alternative is to refuse the whole removal; it would make a cut through a short overlay impossible without first deleting the overlay.

## For developers

```
src/session.ts          the logic: choice, playhead, every command and its sentence, drags, playing. No screen; tested with Node alone.
src/geometry.ts         the timeline's arithmetic: scale, zoom steps, ruler marks, pointer to time, arrow-key navigation
src/commands.ts         the commands and their keys, in one table that both screens use
src/snap.ts             snapping: the nearest time that matters within reach (pure arithmetic)
src/thumbnails.ts       small pictures of a recording at a moment, for the strips on the clips; fails quietly
src/panel.ts            the clip list on screen: plain DOM, no libraries
src/timeline-panel.ts   the timeline on screen
src/preview-panel.ts    the preview and playing
src/picture-edit.ts     the frame and drawing a zoom on the picture, with the keys that do the same
src/callout-panel.ts    the callout gallery bar
src/item-form.ts        the form for the chosen overlay or zoom
src/editor.ts           the three together, with F6
src/announcer.ts        the one line of announcements they share
src/project.ts          opening a recording folder: read capture.json and the takes, make the edit, reach the media
src/sample.ts           the made-up lesson for the demo and the tests, and the one hour edit
src/*.css               styles (colour tokens, dark mode, forced colours, 200% text)
demo/                   the demo page; serve.mjs takes the types out of the TypeScript as the browser asks for it; files.ts opens and saves
tools/browser-check.mjs a developer check in real Chromium (needs Playwright; not part of the package); make-fixture.mjs makes a test recording (needs ffmpeg)
test/                   Node's own test runner
```

```
npx tsc -p .                       type check (TypeScript 5.8 or newer, @types/node); clean on 2026-10-17 with TypeScript 6.0.3
node --test "test/*.test.ts"       the tests
node tools/browser-check.mjs       the browser check: PLAYWRIGHT_DIR=<folder of an installed playwright>
node demo/serve.mjs --open         the demo
```

No runtime dependencies. TypeScript with erasable syntax only (it runs under Node's type stripping and in the demo). The panels are written the way OpenStage's own Timeline panel is, so they can be joined when the editor is part of OpenStage. The folder and file pickers of Chrome and Edge are used where they exist (`?pickers=input` turns them off); the check reaches only the fallback, so the pickers themselves are untested.
