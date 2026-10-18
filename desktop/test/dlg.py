# Answers PaperNotes' own task dialog by sending it TDM_CLICK_BUTTON, so no
# global clicks or keys are involved.   python dlg.py <button id> [screenshot.png]
import ctypes, sys, time
from ctypes import wintypes
u = ctypes.windll.user32
owner = u.FindWindowW("PaperNotesDevWindow", None)
found = []
@ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
def cb(h, _):
    c = ctypes.create_unicode_buffer(64); u.GetClassNameW(h, c, 64)
    if c.value == "#32770" and u.GetWindow(h, 4) == owner and u.IsWindowVisible(h): found.append(h)
    return True
for _ in range(30):
    u.EnumWindows(cb, 0)
    if found: break
    time.sleep(0.2)
if not found: print("no dialog"); sys.exit(1)
h = found[0]
t = ctypes.create_unicode_buffer(256); u.GetWindowTextW(h, t, 256)
if len(sys.argv) > 2:
    from PIL import ImageGrab
    u.SetProcessDPIAware(); r = wintypes.RECT(); u.GetWindowRect(h, ctypes.byref(r))
    ImageGrab.grab(bbox=(r.left, r.top, r.right, r.bottom), all_screens=True).save(sys.argv[2])
u.SendMessageW(h, 0x0400 + 102, int(sys.argv[1]), 0)   # TDM_CLICK_BUTTON
print("answered", t.value)
