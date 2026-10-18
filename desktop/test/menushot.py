# Screenshot of the dev app's open popup menu (and any open submenu), then
# cancel it, without touching the mouse or keyboard.
#   python menushot.py out.png [--keep]
import ctypes, sys, time
from ctypes import wintypes
from PIL import Image
u, g = ctypes.windll.user32, ctypes.windll.gdi32
u.SetProcessDPIAware()
owner = u.FindWindowW("PaperNotesDevWindow", None)
menus = []
@ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
def cb(h, _):
    c = ctypes.create_unicode_buffer(64); u.GetClassNameW(h, c, 64)
    if c.value == "#32768" and u.IsWindowVisible(h): menus.append(h)
    return True
for _ in range(30):
    u.EnumWindows(cb, 0)
    if menus: break
    time.sleep(0.1)
if not menus: print("no menu open"); sys.exit(1)

def grab(h):
    r = wintypes.RECT(); u.GetWindowRect(h, ctypes.byref(r))
    w, ht = r.right - r.left, r.bottom - r.top
    wdc = u.GetWindowDC(h); mdc = g.CreateCompatibleDC(wdc); bmp = g.CreateCompatibleBitmap(wdc, w, ht)
    g.SelectObject(mdc, bmp); u.PrintWindow(h, mdc, 0)
    buf = ctypes.create_string_buffer(w * ht * 4)
    class BIH(ctypes.Structure):
        _fields_ = [("biSize", wintypes.DWORD), ("biWidth", ctypes.c_long), ("biHeight", ctypes.c_long),
                    ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                    ("biSizeImage", wintypes.DWORD), ("a", ctypes.c_long), ("b", ctypes.c_long), ("c", wintypes.DWORD), ("d", wintypes.DWORD)]
    bi = BIH(); bi.biSize = ctypes.sizeof(BIH); bi.biWidth = w; bi.biHeight = -ht; bi.biPlanes = 1; bi.biBitCount = 32
    g.GetDIBits(mdc, bmp, 0, ht, buf, ctypes.byref(bi), 0)
    g.DeleteObject(bmp); g.DeleteDC(mdc); u.ReleaseDC(h, wdc)
    return r.left, r.top, Image.frombuffer("RGBA", (w, ht), buf, "raw", "BGRA", 0, 1).convert("RGB")

shots = [grab(h) for h in menus]
x0 = min(s[0] for s in shots); y0 = min(s[1] for s in shots)
W = max(s[0] + s[2].width for s in shots) - x0; H = max(s[1] + s[2].height for s in shots) - y0
out = Image.new("RGB", (W, H), (60, 60, 60))
for x, y, im in reversed(shots): out.paste(im, (x - x0, y - y0))
out.save(sys.argv[1]); print("saved", out.size, len(shots), "menu(s)")
if "--keep" not in sys.argv:
    u.PostMessageW(owner, 0x001F, 0, 0)   # WM_CANCELMODE
