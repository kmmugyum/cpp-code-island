<p align="right"><a href="./README.md">한국어</a> | <b>English</b></p>

# C++ Code Island: Robot Recovery Team

A pixel-art puzzle game for C++ beginners. You run code one line at a time and watch robots and facilities react, so you learn what each statement does and when to use it. The missions follow the lecture order of MIT OpenCourseWare [6.096 Introduction to C++](https://ocw.mit.edu/courses/6-096-introduction-to-c-january-iap-2011/).

**[Play now](https://kmmugyum.github.io/cpp-code-island/?lang=en)** (runs in the browser, nothing to install)

![Desktop: mission 1-3 Share the Power, mid-run](./images/en-screenshot-desktop.png)

## What the game does

You repair a broken island with C++. Every time a line runs, the game highlights three things together: the line being executed, the objects in the scene it affected, and the values that changed in the variable table.

- **Changed vs. read-only.** Running `double share = 1.0 * total / robots;` fills the robots' batteries (`share`), while the generator (`total`) and the robot count (`robots`) are only marked as *read*.
- **Output doesn't change state.** A `cout` line updates the output screen only; nothing else in the scene moves.
- **Predict before you run.** Pick what `5 / 2` and `5 / 2.0` will print, then run them and compare.
- **Re-check with other inputs.** An answer that only fits the first input (e.g. `total / 2.0`) is exposed when the generator or robot count changes.
- **Jump straight to the fix.** On a wrong answer, focus moves to the blank or code line that caused it.

<p align="center"><img src="./images/en-scene-base.png" width="480" alt="Mission 1-4 Power Up the Base: energy changed, usage read"></p>

## Missions

Each MIT 6.096 lecture is one zone of the island. Every chapter has 4 core missions, and finishing all of them unlocks the next chapter. Tutors can skip ahead with **Unlock all chapters** in Record or `?unlock=all`. The lecture notes' optional challenges (recursion, overloading, `friend`, macros, and so on) are not included yet.

| Chapter · zone | Missions | Covers |
|---|---|---|
| 1 Starting Base | Startup Sequence, Send a Signal, Share the Power, Power Up the Base | build steps, `main`, `cout`/`cin`, integer vs. floating-point division |
| 2 Automatic Doors and Routes | Power Check Door, Route Selection, Charging Station, Connect the Route | `if/else` boundaries, `switch` and `break`, `while`/`do-while`, `for` iteration counts |
| 3 Command Workshop | Extract a Command, Return the Result, Connect the Call, Charge the Real Battery | extracting functions, `return`, declaration vs. definition, pass by value vs. reference |
| 4 Parts Warehouse | Find the Warehouse Slot, Count the Inventory, Warehouse Map, Repair the Character Signal | indexes, array loops, 2D arrays, `'\0'` and `<cctype>` |
| 5 Wiring Room | Connect an Address, Repair the Connected Battery, Find the Missing Connection, Move the Connection | `&` and `*`, pointers to the same target, `nullptr` checks, pointer arithmetic |
| 6 Robot Assembly | Robot Blueprint, Robot Commands, Factory Settings, Protected Energy | classes and objects, member function `a.charge(20)`, constructors and copy initialization, `private` |
| 7 Specialist Robot Training Ground | Build a Common Robot, What Is a Battery?, Dispatch a Work Command, Work Contract | inheritance vs. composition, `virtual` and dynamic dispatch, pure virtual functions |
| 8 Resource Depot | Temporary Workshop, Borrow a Resource, Resource Return Inspection, The Broken Copy | object lifetime, `new`/`delete`, `new[]`/`delete[]`, shallow vs. deep copy |
| 9 General Workshop | Generic Calculator, Generic Parts Box, Parts Sorter, Resource Combiner | function and class templates, `std::set`, `sort`/`binary_search`, `operator+` |
| 10 Central Control | Records Archive, Control Input, Central Manager, Final Restoration | `ofstream`/`ifstream`, `getline` and `enum`, `const` member functions, exceptions |

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Run / pause | Run button in the bottom bar | `K` |
| Step forward / back | Step, Back | `N` / `B` |
| Reset to the start | Reset | `R` |
| Fill a blank | Tap a ▢ in the code, then pick a code card below | `Tab` to move, `Enter` to pick |
| Run after editing (1-4) | Run button | `Ctrl`/`⌘` + `Enter` |

No action requires dragging. On phones the screen is split into [Scene / Code / Result] tabs. Sound is off by default, and reduced motion follows both your OS setting and the top-bar button. Switch between Korean and English with the language button in the top bar or with `?lang=en` / `?lang=ko` in the URL.

<p align="center"><img src="./images/en-screenshot-mobile.png" width="300" alt="Mobile: Scene tab"></p>

## Progress and records

Progress is saved in your browser's storage. There is no server, so to share it with a tutor, download the progress file (`.json`) or the tutor summary (`.txt`) from **Record** in the top bar. The record keeps mission completion separate from the apply check (trying other inputs), along with the last hint level opened, error types, and the learner's one-line explanation.

## Not a real C++ compiler

The in-game runner is an educational simulator, not a real C++ compiler. It covers mission-relevant subsets of control flow, functions, arrays, pointers, classes, memory, templates, files, and exceptions; some C++ syntax is not supported. Undefined behavior such as reading an uninitialized variable never shows a made-up value; the simulator stops and explains instead.

Every code-card combination and test input used in the missions (657 programs) was compared with `clang++` (C++17): compile errors, link errors, whether the program runs, its output, and written files all match. The 29 programs with undefined behavior or printed memory addresses are left out of the output comparison. To re-check, run `node scripts/crosscheck.mjs` (requires clang++).

## Development

Requires Node.js 22 or later (no external packages).

```bash
git clone https://github.com/kmmugyum/cpp-code-island.git
cd cpp-code-island
npm test          # simulator and mission grading tests
npm run build     # bundle everything into dist/cpp-code-island.html
```

While developing, open `src/index.html` directly in a browser. `npm run build` produces `dist/cpp-code-island.html`, a single file with all CSS, scripts, and graphics inside, so you can share just that one file.

```
src/
  cppsim.js     educational C++ simulator (tokenizer, parser, step-by-step trace)
  missions.js   chapter registry, grading helpers and localized mission lookup
  missions/     chapter mission data and checks
  i18n.js       Korean/English UI strings
  pixel.js      palette, sprites, 3x5 pixel font, icons
  scene.js      integer-scale canvas scene engine and per-mission scenes
  sfx.js        WebAudio sound effects
  app.js        UI, run controls, progress storage
tests/          node:test tests
scripts/        clang++ cross-check script (development only)
build.mjs       single-file HTML bundler
```

The scene is drawn only from the current execution step and the time since that step started. Rapid clicking, stepping back, resetting, or switching missions never leaves the picture out of sync with the trace.

## Credits and license

- Code: [MIT License](./LICENSE)
- Lectures: MIT OpenCourseWare, *6.096 Introduction to C++*, January IAP 2011, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The lecture files are not included in this repository. The in-game "Lecture" panel quotes short passages from the lecture notes with attribution. This game is an independent learning design based on the course; it is not made or endorsed by MIT.
- Graphics and sound: no external image or audio files. Everything is drawn and synthesized in code (`src/pixel.js`, `src/sfx.js`). Colors come from the [Sweetie 16](https://lospec.com/palette-list/sweetie-16) palette by GrafxKid.
