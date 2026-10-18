# Screenshot of just the PaperNotes window, via PrintWindow: other windows on
# top of it don't matter, and nothing is clicked or brought to the front.
#   python appshot.py out.png [scale]
import ctypes, sys
from ctypes import wintypes
from PIL import Image
u, g = ctypes.windll.user32, ctypes.windll.gdi32
u.SetProcessDPIAware()
h = u.FindWindowW("PaperNotesDevWindow", None)
if not h: print("PaperNotes window not found"); sys.exit(1)
r = wintypes.RECT(); u.GetWindowRect(h, ctypes.byref(r))
w, ht = r.right - r.left, r.bottom - r.top
wdc = u.GetWindowDC(h); mdc = g.CreateCompatibleDC(wdc); bmp = g.CreateCompatibleBitmap(wdc, w, ht)
g.SelectObject(mdc, bmp)
u.PrintWindow(h, mdc, 2)   # PW_RENDERFULLCONTENT: includes the WebView2 surface
class BIH(ctypes.Structure):
    _fields_ = [("biSize", wintypes.DWORD), ("biWidth", ctypes.c_long), ("biHeight", ctypes.c_long),
                ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD), ("a", ctypes.c_long), ("b", ctypes.c_long), ("c", wintypes.DWORD), ("d", wintypes.DWORD)]
bi = BIH(); bi.biSize = ctypes.sizeof(BIH); bi.biWidth = w; bi.biHeight = -ht; bi.biPlanes = 1; bi.biBitCount = 32
buf = ctypes.create_string_buffer(w * ht * 4)
g.GetDIBits(mdc, bmp, 0, ht, buf, ctypes.byref(bi), 0)
img = Image.frombuffer("RGBA", (w, ht), buf, "raw", "BGRA", 0, 1).convert("RGB")
g.DeleteObject(bmp); g.DeleteDC(mdc); u.ReleaseDC(h, wdc)
if len(sys.argv) > 2: img = img.resize((int(w * float(sys.argv[2])), int(ht * float(sys.argv[2]))))
img.save(sys.argv[1]); print("saved", img.size)
