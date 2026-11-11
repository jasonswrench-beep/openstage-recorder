// SPDX-License-Identifier: Apache-2.0 AND ISC
// Made by tools/make_ui_icons.py in the OpenStage Author repository, from its design/icons.json (the suite's one list of icons):
// do not edit by hand. Change that list and run the tool there with --recorder pointing at this file.
// The icons of the Recorder's own buttons, tabs and menus: Lucide 1.56.0, kept as their drawn shapes, drawn as lines in the
// colour of the words around them, and hidden from screen readers (the words beside an icon, or a button's name, say what it is).
//
// ISC License
//
// Copyright (c) 2026 Lucide Icons and Contributors
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
// ---
//
// The following Lucide icons are derived from the Feather project:
//
// airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
//
// The MIT License (MIT) (for the icons listed above)
//
// Copyright (c) 2013-present Cole Bemis
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

type Shape = { readonly tag: string } & Readonly<Record<string, string | number>>;

export const UI_ICONS = {
  "app-window": [{"tag":"rect","x":2,"y":4,"width":20,"height":16,"rx":2},{"tag":"path","d":"M10 4v4"},{"tag":"path","d":"M2 8h20"},{"tag":"path","d":"M6 4v4"}],
  "arrow-left": [{"tag":"path","d":"m12 19-7-7 7-7"},{"tag":"path","d":"M19 12H5"}],
  "arrow-left-to-line": [{"tag":"path","d":"M3 19V5"},{"tag":"path","d":"m13 6-6 6 6 6"},{"tag":"path","d":"M7 12h14"}],
  "arrow-right": [{"tag":"path","d":"M5 12h14"},{"tag":"path","d":"m12 5 7 7-7 7"}],
  "arrow-right-to-line": [{"tag":"path","d":"M17 12H3"},{"tag":"path","d":"m11 18 6-6-6-6"},{"tag":"path","d":"M21 5v14"}],
  "blend": [{"tag":"circle","cx":15,"cy":9,"r":7},{"tag":"circle","cx":9,"cy":15,"r":7}],
  "bookmark-plus": [{"tag":"path","d":"M12 7v6"},{"tag":"path","d":"M15 10H9"},{"tag":"path","d":"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"}],
  "brackets": [{"tag":"path","d":"M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3"},{"tag":"path","d":"M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"}],
  "check": [{"tag":"path","d":"M20 6 9 17l-5-5"}],
  "chevron-down": [{"tag":"path","d":"m6 9 6 6 6-6"}],
  "circle-check": [{"tag":"circle","cx":12,"cy":12,"r":10},{"tag":"path","d":"m16 9-5.5 5.5L8 12"}],
  "circle-dot": [{"tag":"circle","cx":12,"cy":12,"r":1},{"tag":"circle","cx":12,"cy":12,"r":10}],
  "circle-question-mark": [{"tag":"circle","cx":12,"cy":12,"r":10},{"tag":"path","d":"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"},{"tag":"path","d":"M12 17h.01"}],
  "clipboard-copy": [{"tag":"rect","width":8,"height":4,"x":8,"y":2,"rx":1,"ry":1},{"tag":"path","d":"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"},{"tag":"path","d":"M16 4h2a2 2 0 0 1 2 2v4"},{"tag":"path","d":"M21 14H11"},{"tag":"path","d":"m15 10-4 4 4 4"}],
  "clipboard-paste": [{"tag":"path","d":"M11 14h10"},{"tag":"path","d":"M16 4h2a2 2 0 0 1 2 2v1.344"},{"tag":"path","d":"m17 18 4-4-4-4"},{"tag":"path","d":"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113"},{"tag":"rect","x":8,"y":2,"width":8,"height":4,"rx":1}],
  "copy": [{"tag":"rect","width":14,"height":14,"x":8,"y":8,"rx":2,"ry":2},{"tag":"path","d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}],
  "droplets": [{"tag":"path","d":"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"},{"tag":"path","d":"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"}],
  "ellipsis": [{"tag":"circle","cx":12,"cy":12,"r":1},{"tag":"circle","cx":19,"cy":12,"r":1},{"tag":"circle","cx":5,"cy":12,"r":1}],
  "eraser": [{"tag":"path","d":"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"},{"tag":"path","d":"m5.082 11.09 8.828 8.828"}],
  "eye-off": [{"tag":"path","d":"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"},{"tag":"path","d":"M14.084 14.158a3 3 0 0 1-4.242-4.242"},{"tag":"path","d":"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"},{"tag":"path","d":"m2 2 20 20"}],
  "file-video-camera": [{"tag":"path","d":"M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2"},{"tag":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"tag":"path","d":"m10 17.843 3.033-1.755a.64.64 0 0 1 .967.56v4.704a.65.65 0 0 1-.967.56L10 20.157"},{"tag":"rect","width":7,"height":6,"x":3,"y":16,"rx":1}],
  "file-volume": [{"tag":"path","d":"M4 11.55V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-1.95"},{"tag":"path","d":"M14 2v5a1 1 0 0 0 1 1h5"},{"tag":"path","d":"M12 15a5 5 0 0 1 0 6"},{"tag":"path","d":"M8 14.502a.5.5 0 0 0-.826-.381l-1.893 1.631a1 1 0 0 1-.651.243H3.5a.5.5 0 0 0-.5.501v3.006a.5.5 0 0 0 .5.501h1.129a1 1 0 0 1 .652.243l1.893 1.633a.5.5 0 0 0 .826-.38z"}],
  "film": [{"tag":"rect","width":18,"height":18,"x":3,"y":3,"rx":2},{"tag":"path","d":"M7 3v18"},{"tag":"path","d":"M3 7.5h4"},{"tag":"path","d":"M3 12h18"},{"tag":"path","d":"M3 16.5h4"},{"tag":"path","d":"M17 3v18"},{"tag":"path","d":"M17 7.5h4"},{"tag":"path","d":"M17 16.5h4"}],
  "flask-conical": [{"tag":"path","d":"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"},{"tag":"path","d":"M6.453 15h11.094"},{"tag":"path","d":"M8.5 2h7"}],
  "folder-input": [{"tag":"path","d":"M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"},{"tag":"path","d":"M2 13h10"},{"tag":"path","d":"m9 16 3-3-3-3"}],
  "folder-open": [{"tag":"path","d":"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"}],
  "image-down": [{"tag":"path","d":"M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"},{"tag":"path","d":"m14 19 3 3v-5.5"},{"tag":"path","d":"m17 22 3-3"},{"tag":"circle","cx":9,"cy":9,"r":2}],
  "info": [{"tag":"circle","cx":12,"cy":12,"r":10},{"tag":"path","d":"M12 16v-4"},{"tag":"path","d":"M12 8h.01"}],
  "keyboard": [{"tag":"path","d":"M10 8h.01"},{"tag":"path","d":"M12 12h.01"},{"tag":"path","d":"M14 8h.01"},{"tag":"path","d":"M16 12h.01"},{"tag":"path","d":"M18 8h.01"},{"tag":"path","d":"M6 8h.01"},{"tag":"path","d":"M7 16h10"},{"tag":"path","d":"M8 12h.01"},{"tag":"rect","width":20,"height":16,"x":2,"y":4,"rx":2}],
  "link": [{"tag":"path","d":"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"},{"tag":"path","d":"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}],
  "list-checks": [{"tag":"path","d":"M13 5h8"},{"tag":"path","d":"M13 12h8"},{"tag":"path","d":"M13 19h8"},{"tag":"path","d":"m3 17 2 2 4-4"},{"tag":"path","d":"m3 7 2 2 4-4"}],
  "magnet": [{"tag":"path","d":"m12 15 4 4"},{"tag":"path","d":"M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"},{"tag":"path","d":"m5 8 4 4"}],
  "message-square": [{"tag":"path","d":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"}],
  "message-square-text": [{"tag":"path","d":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"},{"tag":"path","d":"M7 11h10"},{"tag":"path","d":"M7 15h6"},{"tag":"path","d":"M7 7h8"}],
  "mic": [{"tag":"path","d":"M12 19v3"},{"tag":"path","d":"M19 10v2a7 7 0 0 1-14 0v-2"},{"tag":"rect","x":9,"y":2,"width":6,"height":13,"rx":3}],
  "monitor": [{"tag":"rect","width":20,"height":14,"x":2,"y":3,"rx":2},{"tag":"line","x1":8,"x2":16,"y1":21,"y2":21},{"tag":"line","x1":12,"x2":12,"y1":17,"y2":21}],
  "mouse-pointer-2": [{"tag":"path","d":"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}],
  "mouse-pointer-click": [{"tag":"path","d":"M14 4.1 12 6"},{"tag":"path","d":"m5.1 8-2.9-.8"},{"tag":"path","d":"m6 12-1.9 2"},{"tag":"path","d":"M7.2 2.2 8 5.1"},{"tag":"path","d":"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"}],
  "pause": [{"tag":"rect","x":14,"y":3,"width":5,"height":18,"rx":1},{"tag":"rect","x":5,"y":3,"width":5,"height":18,"rx":1}],
  "pencil": [{"tag":"path","d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"},{"tag":"path","d":"m15 5 4 4"}],
  "play": [{"tag":"path","d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"}],
  "redo-2": [{"tag":"path","d":"m15 14 5-5-5-5"},{"tag":"path","d":"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"}],
  "rotate-ccw": [{"tag":"path","d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"},{"tag":"path","d":"M3 3v5h5"}],
  "save": [{"tag":"path","d":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"},{"tag":"path","d":"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"},{"tag":"path","d":"M7 3v4a1 1 0 0 0 1 1h7"}],
  "scissors": [{"tag":"circle","cx":6,"cy":6,"r":3},{"tag":"path","d":"M8.12 8.12 12 12"},{"tag":"path","d":"M20 4 8.12 15.88"},{"tag":"circle","cx":6,"cy":18,"r":3},{"tag":"path","d":"M14.8 14.8 20 20"}],
  "search": [{"tag":"path","d":"m21 21-4.34-4.34"},{"tag":"circle","cx":11,"cy":11,"r":8}],
  "settings": [{"tag":"path","d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"},{"tag":"circle","cx":12,"cy":12,"r":3}],
  "shield-check": [{"tag":"path","d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"},{"tag":"path","d":"m9 12 2 2 4-4"}],
  "sliders-horizontal": [{"tag":"path","d":"M10 5H3"},{"tag":"path","d":"M12 19H3"},{"tag":"path","d":"M14 3v4"},{"tag":"path","d":"M16 17v4"},{"tag":"path","d":"M21 12h-9"},{"tag":"path","d":"M21 19h-5"},{"tag":"path","d":"M21 5h-7"},{"tag":"path","d":"M8 10v4"},{"tag":"path","d":"M8 12H3"}],
  "split": [{"tag":"path","d":"M16 3h5v5"},{"tag":"path","d":"M8 3H3v5"},{"tag":"path","d":"M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"},{"tag":"path","d":"m15 9 6-6"}],
  "square": [{"tag":"rect","width":18,"height":18,"x":3,"y":3,"rx":2}],
  "square-dashed": [{"tag":"path","d":"M5 3a2 2 0 0 0-2 2"},{"tag":"path","d":"M19 3a2 2 0 0 1 2 2"},{"tag":"path","d":"M21 19a2 2 0 0 1-2 2"},{"tag":"path","d":"M5 21a2 2 0 0 1-2-2"},{"tag":"path","d":"M9 3h1"},{"tag":"path","d":"M9 21h1"},{"tag":"path","d":"M14 3h1"},{"tag":"path","d":"M14 21h1"},{"tag":"path","d":"M3 9v1"},{"tag":"path","d":"M21 9v1"},{"tag":"path","d":"M3 14v1"},{"tag":"path","d":"M21 14v1"}],
  "timer": [{"tag":"line","x1":10,"x2":14,"y1":2,"y2":2},{"tag":"line","x1":12,"x2":15,"y1":14,"y2":11},{"tag":"circle","cx":12,"cy":14,"r":8}],
  "trash": [{"tag":"path","d":"M10 11v6"},{"tag":"path","d":"M14 11v6"},{"tag":"path","d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"},{"tag":"path","d":"M3 6h18"},{"tag":"path","d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}],
  "triangle-alert": [{"tag":"path","d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"},{"tag":"path","d":"M12 9v4"},{"tag":"path","d":"M12 17h.01"}],
  "undo-2": [{"tag":"path","d":"M9 14 4 9l5-5"},{"tag":"path","d":"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}],
  "volume-2": [{"tag":"path","d":"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"},{"tag":"path","d":"M16 9a5 5 0 0 1 0 6"},{"tag":"path","d":"M19.364 18.364a9 9 0 0 0 0-12.728"}],
  "volume-x": [{"tag":"path","d":"M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z"},{"tag":"path","d":"m16.5 14.5 5-5"},{"tag":"path","d":"m16.5 9.5 5 5"}],
  "webcam": [{"tag":"circle","cx":12,"cy":10,"r":8},{"tag":"circle","cx":12,"cy":10,"r":3},{"tag":"path","d":"M7 22h10"},{"tag":"path","d":"M12 22v-4"}],
  "x": [{"tag":"path","d":"M18 6 6 18"},{"tag":"path","d":"m6 6 12 12"}],
  "zap": [{"tag":"path","d":"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"}],
  "zoom-in": [{"tag":"circle","cx":11,"cy":11,"r":8},{"tag":"line","x1":21,"x2":16.65,"y1":21,"y2":16.65},{"tag":"line","x1":11,"x2":11,"y1":8,"y2":14},{"tag":"line","x1":8,"x2":14,"y1":11,"y2":11}],
} as const satisfies Record<string, readonly Shape[]>;

export type UiIconName = keyof typeof UI_ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/** An icon, drawn in the colour of the words beside it and hidden from screen readers. */
export function uiIcon(doc: Document, name: UiIconName): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  for (const [k, v] of [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["focusable", "false"], ["aria-hidden", "true"], ["class", "ui-icon"]] as const) svg.setAttribute(k, v);
  for (const shape of UI_ICONS[name] as readonly Shape[]) {
    const part = doc.createElementNS(SVG_NS, shape.tag);
    for (const [key, value] of Object.entries(shape)) if (key !== "tag") part.setAttribute(key, String(value));
    svg.appendChild(part);
  }
  return svg;
}
