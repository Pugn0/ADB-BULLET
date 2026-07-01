# ⚡ ADB Bullet

**ADB Bullet** is a no-code Android automation framework inspired by OpenBullet and Node-RED. Build automation flows visually by connecting blocks — no coding required.

![ADB Bullet UI](https://raw.githubusercontent.com/Pugn0/ADB-BULLET/main/docs/preview.png)

## Features

- **Visual Flow Editor** — drag and drop blocks onto a canvas and connect them
- **Built-in Inspector** — capture a live screenshot of your Android device, click any element to create a block automatically
- **Bots** — save flows as named bots, run them directly from the bots page
- **12+ Block Types** — launch apps, click text, fill fields, parse elements, set variables, conditionals, and more
- **ADB Pure** — no extra dependencies beyond Android SDK; uses `uiautomator dump` under the hood (same approach as UIAutomatorViewer)
- **MeMU Support** — optional MeMU emulator integration

## Block Types

| Block | Description |
|---|---|
| Launch App | Opens an app by package name |
| Open URL | Opens a URL in the browser |
| Close App | Force-stops an app |
| Click Text | Finds text on screen and clicks it |
| Input Text | Taps a field and types text |
| Fill Field | Clicks the Nth EditText and types |
| Swipe | Swipes in a direction |
| Parse Element | Captures an element attribute into a variable |
| Wait Text | Waits until text appears on screen |
| If Text Present | Conditional branch |
| Wait | Pauses for N seconds |
| Keycode | Sends an Android keycode (BACK, HOME, ENTER…) |
| Back | Presses the Android back button |
| Set Variable | Sets a variable for use in later blocks |

## Requirements

- Python 3.10+
- Node.js 18+
- Android SDK Platform Tools (`adb` in PATH)
- Android device or emulator with USB debugging enabled

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/Pugn0/ADB-BULLET.git
cd ADB-BULLET

# 2. Install Python dependencies
pip install fastapi uvicorn pillow numpy

# 3. Install frontend dependencies
cd frontend
npm install
cd ..
```

## Running

### Option A — Quick start (Windows)
Double-click `iniciar.bat`. It starts both the API and the frontend automatically.

### Option B — Manual

```bash
# Terminal 1 — API
python api.py

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Then open `http://localhost:5173` in your browser.

The API runs at `http://127.0.0.1:8000`. Interactive docs at `http://127.0.0.1:8000/docs`.

## Usage

1. Connect an Android device via USB (or start an emulator)
2. Enable **USB Debugging** on the device
3. Open `http://localhost:5173`
4. Click **📱 Inspector** to capture the device screen and inspect elements
5. Click any element on the screenshot to create a block
6. Drag additional blocks from the left sidebar onto the canvas
7. Connect blocks by dragging from the bottom handle of one to the top handle of the next
8. Click **💾 Salvar** to save the flow as a named bot
9. Click **🤖 Bots** to view, run, or edit your saved bots

## Project Structure

```
ADB-BULLET/
├── api.py                  # FastAPI server — all HTTP endpoints
├── engine.py               # NoCodeEngine — executes block flows
├── device_session.py       # ADB wrapper (screenshot, tap, type, uiautomator dump)
├── device_registry.py      # Thread-safe cache of DeviceSession instances
├── iniciar.bat             # Windows launcher
└── frontend/
    └── src/
        ├── App.jsx         # Main UI — canvas, toolbar, bots page, modals
        ├── FlowNode.jsx    # React Flow node component
        ├── Inspector.jsx   # Device inspector panel
        ├── blockDefs.js    # Block definitions (fields, labels, colors)
        ├── flowExport.js   # Canvas → JSON flow serializer
        └── index.css       # Styles
```

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/devices` | List connected ADB devices |
| POST | `/api/device/inspect` | Capture screenshot + UI hierarchy |
| GET | `/api/device/current_app` | Get foreground app package/activity |
| POST | `/api/flow/run` | Execute a flow on a device |

## Contributing

Contributions are welcome! Here is how to get started:

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/ADB-BULLET.git
cd ADB-BULLET
```

### 2. Create a branch

```bash
git checkout -b feat/my-new-block
```

Use a descriptive prefix:
- `feat/` — new feature or block
- `fix/` — bug fix
- `docs/` — documentation only
- `refactor/` — code cleanup with no behavior change

### 3. Make your changes

**Adding a new block** involves two files:

**`frontend/src/blockDefs.js`** — define the block UI:
```js
{
  type: 'BLOCK_MY_BLOCK',
  label: 'My Block',
  icon: '🔧',
  color: '#6366f1',
  desc: 'Short description shown in the sidebar',
  fields: [
    { key: 'my_param', label: 'Parameter', type: 'text', default: '', placeholder: 'value' },
  ],
}
```

**`engine.py`** — implement the block logic:
```python
@staticmethod
def BLOCK_MY_BLOCK(props: dict, engine: "NoCodeEngine") -> None:
    value = _resolve(props["my_param"], engine.variables)
    # your logic here using engine.session (ADB) or engine.variables
    log.info("BLOCK_MY_BLOCK: done.")
```

The method name must match `BLOCK_` + the `type` field exactly.

### 4. Test your changes

```bash
# Start the API
python api.py

# Start the frontend (in another terminal)
cd frontend && npm run dev
```

Open `http://localhost:5173`, build a flow with your new block, and run it against a device.

### 5. Submit a Pull Request

- Keep PRs focused — one feature or fix per PR
- Write a clear PR description explaining what the block does and why it is useful
- Include a screenshot or short description of how to test it

### Code Style

- **Python**: follow PEP 8; use type hints where practical; add a one-line docstring to new engine methods
- **JavaScript/JSX**: match the existing style (no semicolons lint enforced, single quotes, 2-space indent)
- **No unnecessary dependencies** — the project intentionally stays lean

### Reporting Issues

Open an issue on [GitHub Issues](https://github.com/Pugn0/ADB-BULLET/issues) with:
- Android version and device/emulator model
- Steps to reproduce
- Expected vs actual behavior
- Any error messages from the API terminal or browser console

## License

MIT — free to use, modify, and distribute.
