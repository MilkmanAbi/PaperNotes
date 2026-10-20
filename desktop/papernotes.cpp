// PaperNotes for Windows: one native window around the PaperNotes web app.
//
// The app (Vite's dist/) and the notes folder are served from one origin,
// https://papernotes.example/, through WebResourceRequested:
//   /content/<path>   -> the notes folder (Documents\PaperNotes by default)
//   everything else   -> the app files next to this exe (app\)
// One origin means fetch(), iframes and relative links behave exactly as they
// do on the website, and the web code needs no special paths.
//
// Everything the browser cannot do (list folders, write, rename, recycle,
// open in the default app, native menus and dialogs, watch for changes) goes
// through a small message bridge: the page posts "id\x1Fcmd\x1Farg…" and gets
// {"id":…,"ok":…,"result":…} back. Events the page did not ask for
// (folder changed, window closing) arrive as {"event":…}.
//
// Paths: notes can sit deeper than MAX_PATH once they are in
// OneDrive\Documents, so every file call goes through Long(), which adds the
// \\?\ prefix. Shell calls (open, reveal, recycle) can't take that prefix and
// fall back to the 8.3 short path when a path is too long for them.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shobjidl.h>
#include <windowsx.h>
#include <wincrypt.h>
#include <commctrl.h>
#include <dwmapi.h>
#include <wrl.h>
#include <urlmon.h>
#include <bcrypt.h>
#include <algorithm>
#include <atomic>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include "WebView2.h"
#include "resource.h"

#pragma comment(lib, "user32")
#pragma comment(lib, "gdi32")
#pragma comment(lib, "shell32")
#pragma comment(lib, "shlwapi")
#pragma comment(lib, "ole32")
#pragma comment(lib, "oleaut32")
#pragma comment(lib, "advapi32")
#pragma comment(lib, "dwmapi")
#pragma comment(lib, "comctl32")
#pragma comment(lib, "crypt32")
#pragma comment(lib, "urlmon")
#pragma comment(lib, "bcrypt")
#pragma comment(lib, "WebView2LoaderStatic")

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

static const wchar_t* kClass = L"PaperNotesWindow";   // "PaperNotesDevWindow" for /dev
static const wchar_t* kOrigin = L"https://papernotes.example/";
static const wchar_t* kRegKey = L"Software\\PaperNotes";   // "Software\\PaperNotes\\Dev" for /dev
static const wchar_t* kVersion = L"" PN_VERSION_W;

// WM_APP_QUIT is 0x8004: the installer posts it to close a running copy.
enum : UINT { WM_APP_CHANGED = WM_APP + 1, WM_APP_TRAY, WM_APP_SHOW, WM_APP_QUIT, WM_APP_PTY, WM_APP_REPLY };
enum : UINT_PTR { TIMER_CHANGED = 1, TIMER_BACKUP, TIMER_CLOSE };

static HWND g_hwnd;
static ComPtr<ICoreWebView2Environment> g_env;
static ComPtr<ICoreWebView2Controller> g_controller;
static ComPtr<ICoreWebView2> g_view;
static std::wstring g_exeDir, g_appDir, g_notesDir, g_dataDir;
static bool g_dev = false;
static bool g_dirty = false;
static std::wstring g_dirtyName;
static bool g_quitting = false;
static void WatchLoop();
static std::wstring MusicDir();
static std::thread g_watcher;
static std::atomic<bool> g_watchStop{false};
static HANDLE g_watchDir = INVALID_HANDLE_VALUE;

// ── more than one window ────────────────────────────────────────────────
// A tab can pop out into a window of its own, and a tab can hold a website
// (VS Code for the web) in a WebView of its own. A popped-out page numbers
// its requests from <window> × 10^9, so every reply, even a late one from a
// worker thread, finds the page that asked.
struct AppWindow {
    HWND hwnd = nullptr;
    ComPtr<ICoreWebView2Controller> ctl;
    ComPtr<ICoreWebView2> view;
    bool dirty = false;
    std::wstring dirtyName;
};
static std::map<int, AppWindow> g_wins;      // window number (1, 2, …) -> its window
static int g_winSeq = 0;
static const long long kWinIds = 1000000000LL;
static const wchar_t* kPopClass = L"PaperNotesPopWindow";
static HWND g_cmdHwnd = nullptr;             // the window whose page sent the command being handled
static int WindowOfId(const std::wstring& id) { return (int)(_wtoll(id.c_str()) / kWinIds); }

// A website in a tab: a WebView of its own, a child of the main window,
// placed over the tab by the page. It has no line to the host.
struct WebPane {
    HWND box = nullptr;   // its own child window, kept above the app's page
    ComPtr<ICoreWebView2Controller> ctl;
    ComPtr<ICoreWebView2> view;
    RECT bounds{};
    bool visible = false;
};
static const wchar_t* kPaneClass = L"PaperNotesWebPane";
static std::map<std::wstring, WebPane> g_panes;   // the tab's key -> its website

// ── strings ─────────────────────────────────────────────────────────────
static std::wstring Widen(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    std::wstring w(n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), w.data(), n);
    return w;
}
static std::string Narrow(const std::wstring& w) {
    if (w.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), n, nullptr, nullptr);
    return s;
}
static std::wstring Json(const std::wstring& s) {
    std::wstring o = L"\"";
    for (wchar_t c : s) {
        switch (c) {
            case L'"': o += L"\\\""; break;
            case L'\\': o += L"\\\\"; break;
            case L'\n': o += L"\\n"; break;
            case L'\r': o += L"\\r"; break;
            case L'\t': o += L"\\t"; break;
            default:
                if (c < 0x20) { wchar_t b[8]; swprintf_s(b, L"\\u%04x", c); o += b; }
                else o += c;
        }
    }
    return o + L"\"";
}

// ── paths ───────────────────────────────────────────────────────────────
static std::wstring Long(const std::wstring& p) {
    if (p.rfind(L"\\\\?\\", 0) == 0) return p;
    if (p.rfind(L"\\\\", 0) == 0) return L"\\\\?\\UNC\\" + p.substr(2);
    return L"\\\\?\\" + p;
}
// For shell APIs that cannot take \\?\: the path itself when it fits,
// otherwise its 8.3 short form (which keeps it under MAX_PATH).
static std::wstring ShellPath(const std::wstring& p) {
    if (p.size() < MAX_PATH - 12) return p;
    std::wstring buf(32768, L'\0');
    DWORD n = GetShortPathNameW(Long(p).c_str(), buf.data(), (DWORD)buf.size());
    if (!n || n >= buf.size()) return p;
    buf.resize(n);
    if (buf.rfind(L"\\\\?\\", 0) == 0) buf = buf.substr(4);
    return buf;
}
// A content-relative path ("a/b c.md") checked and turned into a full path
// under `root`. Refuses anything that could climb out of it.
static bool Resolve(const std::wstring& root, const std::wstring& rel, std::wstring& out) {
    std::wstring r = rel;
    for (auto& c : r) if (c == L'/') c = L'\\';
    while (!r.empty() && r[0] == L'\\') r.erase(0, 1);
    size_t start = 0;
    while (start <= r.size()) {
        size_t end = r.find(L'\\', start);
        std::wstring seg = r.substr(start, end == std::wstring::npos ? std::wstring::npos : end - start);
        if (seg == L".." || seg == L"." || seg.find(L':') != std::wstring::npos) return false;
        if (end == std::wstring::npos) break;
        start = end + 1;
    }
    out = r.empty() ? root : root + L"\\" + r;
    return true;
}
static bool Exists(const std::wstring& p, bool* isDir = nullptr) {
    DWORD a = GetFileAttributesW(Long(p).c_str());
    if (a == INVALID_FILE_ATTRIBUTES) return false;
    if (isDir) *isDir = (a & FILE_ATTRIBUTE_DIRECTORY) != 0;
    return true;
}
static bool MakeDirs(const std::wstring& p) {
    if (Exists(p)) return true;
    size_t cut = p.find_last_of(L'\\');
    if (cut != std::wstring::npos && cut > 2) MakeDirs(p.substr(0, cut));
    return CreateDirectoryW(Long(p).c_str(), nullptr) || GetLastError() == ERROR_ALREADY_EXISTS;
}
static std::wstring Parent(const std::wstring& p) {
    size_t cut = p.find_last_of(L'\\');
    return cut == std::wstring::npos ? p : p.substr(0, cut);
}
static std::wstring ErrorText(DWORD e = GetLastError()) {
    wchar_t* msg = nullptr;
    FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                   nullptr, e, 0, (LPWSTR)&msg, 0, nullptr);
    std::wstring s = msg ? msg : L"Unknown error";
    if (msg) LocalFree(msg);
    while (!s.empty() && (s.back() == L'\n' || s.back() == L'\r' || s.back() == L'.')) s.pop_back();
    return s;
}

// ── registry ────────────────────────────────────────────────────────────
static DWORD RegGetDword(const wchar_t* name, DWORD def) {
    DWORD v = def, sz = sizeof(v);
    RegGetValueW(HKEY_CURRENT_USER, kRegKey, name, RRF_RT_REG_DWORD, nullptr, &v, &sz);
    return v;
}
static void RegSetDword(const wchar_t* name, DWORD v) {
    RegSetKeyValueW(HKEY_CURRENT_USER, kRegKey, name, REG_DWORD, &v, sizeof(v));
}
static std::wstring RegGetString(const wchar_t* name) {
    wchar_t buf[2048];
    DWORD sz = sizeof(buf);
    if (RegGetValueW(HKEY_CURRENT_USER, kRegKey, name, RRF_RT_REG_SZ, nullptr, buf, &sz) != ERROR_SUCCESS) return {};
    return buf;
}

// ── own writes are not "changes" ────────────────────────────────────────
// The watcher sees every write the app makes. Those are remembered for a few
// seconds and filtered out, so saving a note never triggers a refresh.
static std::mutex g_ownMx;
static std::map<std::wstring, ULONGLONG> g_own;
static void MarkOwn(const std::wstring& full) {
    std::lock_guard<std::mutex> l(g_ownMx);
    std::wstring k = full;
    for (auto& c : k) if (c == L'/') c = L'\\';
    CharLowerBuffW(k.data(), (DWORD)k.size());
    ULONGLONG now = GetTickCount64();
    g_own[k] = now;
    // Creating or replacing a file also bumps its folder's write time.
    size_t cut = k.find_last_of(L'\\');
    if (cut != std::wstring::npos) g_own[k.substr(0, cut)] = now;
}
static bool IsOwn(const std::wstring& full) {
    std::lock_guard<std::mutex> l(g_ownMx);
    std::wstring k = full;
    for (auto& c : k) if (c == L'/') c = L'\\';
    CharLowerBuffW(k.data(), (DWORD)k.size());
    auto it = g_own.find(k);
    return it != g_own.end() && GetTickCount64() - it->second < 4000;
}

// ── talking to the page ─────────────────────────────────────────────────
static void Post(const std::wstring& json) {
    if (g_view) g_view->PostWebMessageAsJson(json.c_str());
}
// Events every window should hear (the notes changed on disk).
static void PostAll(const std::wstring& json) {
    Post(json);
    for (auto& [n, w] : g_wins)
        if (w.view) w.view->PostWebMessageAsJson(json.c_str());
}
static void Reply(const std::wstring& id, bool ok, const std::wstring& resultJson) {
    std::wstring json = L"{\"id\":" + id + L",\"ok\":" + (ok ? L"true" : L"false") + L"," +
                        (ok ? L"\"result\":" + resultJson : L"\"error\":" + resultJson) + L"}";
    int w = WindowOfId(id);
    if (!w) { Post(json); return; }
    auto it = g_wins.find(w);
    if (it != g_wins.end() && it->second.view) it->second.view->PostWebMessageAsJson(json.c_str());
}

// ── serving ─────────────────────────────────────────────────────────────
static const wchar_t* Mime(const std::wstring& path) {
    const wchar_t* ext = PathFindExtensionW(path.c_str());
    static const struct { const wchar_t* e; const wchar_t* m; } map[] = {
        {L".html", L"text/html; charset=utf-8"}, {L".htm", L"text/html; charset=utf-8"},
        {L".js", L"text/javascript; charset=utf-8"}, {L".mjs", L"text/javascript; charset=utf-8"},
        {L".css", L"text/css; charset=utf-8"}, {L".json", L"application/json; charset=utf-8"},
        {L".md", L"text/markdown; charset=utf-8"}, {L".markdown", L"text/markdown; charset=utf-8"},
        {L".txt", L"text/plain; charset=utf-8"}, {L".csv", L"text/csv; charset=utf-8"},
        {L".svg", L"image/svg+xml"}, {L".png", L"image/png"}, {L".jpg", L"image/jpeg"},
        {L".jpeg", L"image/jpeg"}, {L".gif", L"image/gif"}, {L".webp", L"image/webp"},
        {L".avif", L"image/avif"}, {L".bmp", L"image/bmp"}, {L".ico", L"image/x-icon"},
        {L".pdf", L"application/pdf"}, {L".mp4", L"video/mp4"}, {L".m4v", L"video/mp4"},
        {L".webm", L"video/webm"}, {L".mov", L"video/quicktime"}, {L".mp3", L"audio/mpeg"},
        {L".wav", L"audio/wav"}, {L".ogg", L"audio/ogg"}, {L".m4a", L"audio/mp4"},
        {L".flac", L"audio/flac"}, {L".opus", L"audio/ogg"}, {L".oga", L"audio/ogg"}, {L".aac", L"audio/aac"},
        {L".woff2", L"font/woff2"}, {L".woff", L"font/woff"}, {L".ttf", L"font/ttf"},
        {L".wasm", L"application/wasm"},
        {L".xml", L"text/xml; charset=utf-8"},
    };
    for (auto& m : map) if (!_wcsicmp(ext, m.e)) return m.m;
    // Source files show as text when opened directly; everything else is a download.
    return L"application/octet-stream";
}

static std::wstring PercentDecode(const std::wstring& s) {
    std::string bytes;
    for (size_t i = 0; i < s.size(); i++) {
        wchar_t c = s[i];
        if (c == L'%' && i + 2 < s.size() && iswxdigit(s[i + 1]) && iswxdigit(s[i + 2])) {
            bytes += (char)wcstol(s.substr(i + 1, 2).c_str(), nullptr, 16);
            i += 2;
        } else {
            bytes += Narrow(std::wstring(1, c));
        }
    }
    return Widen(bytes);
}

static void Respond(ICoreWebView2WebResourceRequestedEventArgs* args, int status, const wchar_t* reason,
                    IStream* body, const std::wstring& headers) {
    ComPtr<ICoreWebView2WebResourceResponse> res;
    g_env->CreateWebResourceResponse(body, status, reason, headers.c_str(), &res);
    args->put_Response(res.Get());
}

static void Serve(ICoreWebView2WebResourceRequestedEventArgs* args) {
    ComPtr<ICoreWebView2WebResourceRequest> req;
    args->get_Request(&req);
    LPWSTR rawUri = nullptr;
    req->get_Uri(&rawUri);
    std::wstring uri = rawUri ? rawUri : L"";
    CoTaskMemFree(rawUri);

    std::wstring path = uri.substr(wcslen(kOrigin));
    size_t cut = path.find_first_of(L"?#");
    if (cut != std::wstring::npos) path.resize(cut);
    path = PercentDecode(path);

    std::wstring full;
    bool ok;
    if (path.rfind(L"content/", 0) == 0) ok = Resolve(g_notesDir, path.substr(8), full);
    else if (path.rfind(L"music/", 0) == 0) ok = Resolve(MusicDir(), path.substr(6), full);
    else if (path == L"relax/custom") { full = RegGetString(L"RelaxVideo"); ok = !full.empty(); }   // Relax mode, your own video
    else ok = Resolve(g_appDir, path.empty() ? L"index.html" : path, full);

    bool isDir = false;
    if (!ok || !Exists(full, &isDir) || isDir) {
        ComPtr<IStream> s;
        static const char msg[] = "Not found";
        s.Attach(SHCreateMemStream((const BYTE*)msg, sizeof(msg) - 1));
        Respond(args, 404, L"Not Found", s.Get(), L"Content-Type: text/plain; charset=utf-8\r\nCache-Control: no-store");
        return;
    }

    HANDLE f = CreateFileW(Long(full).c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                           nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) {
        ComPtr<IStream> s;
        std::string msg = Narrow(ErrorText());
        s.Attach(SHCreateMemStream((const BYTE*)msg.data(), (UINT)msg.size()));
        Respond(args, 500, L"Unreadable", s.Get(), L"Content-Type: text/plain; charset=utf-8\r\nCache-Control: no-store");
        return;
    }
    LARGE_INTEGER size{};
    GetFileSizeEx(f, &size);
    const long long total = size.QuadPart;

    // Video and audio seek with Range requests; answer those with just the
    // slice asked for (capped, the player asks again for more).
    long long from = 0, to = total - 1;
    bool ranged = false;
    ComPtr<ICoreWebView2HttpRequestHeaders> hdrs;
    req->get_Headers(&hdrs);
    LPWSTR range = nullptr;
    if (hdrs && SUCCEEDED(hdrs->GetHeader(L"Range", &range)) && range) {
        long long a = -1, b = -1;
        if (swscanf_s(range, L"bytes=%lld-%lld", &a, &b) >= 1 && a >= 0 && a < total) {
            from = a;
            to = (b >= a && b < total) ? b : total - 1;
            to = std::min(to, from + 8ll * 1024 * 1024 - 1);
            ranged = true;
        }
        CoTaskMemFree(range);
    }

    std::wstring headers = std::wstring(L"Content-Type: ") + Mime(full) +
                           L"\r\nCache-Control: no-store\r\nAccept-Ranges: bytes";
    ComPtr<IStream> body;
    if (ranged) {
        std::vector<BYTE> buf((size_t)(to - from + 1));
        LARGE_INTEGER at;
        at.QuadPart = from;
        SetFilePointerEx(f, at, nullptr, FILE_BEGIN);
        DWORD got = 0;
        ReadFile(f, buf.data(), (DWORD)buf.size(), &got, nullptr);
        CloseHandle(f);
        body.Attach(SHCreateMemStream(buf.data(), got));
        headers += L"\r\nContent-Range: bytes " + std::to_wstring(from) + L"-" + std::to_wstring(from + got - 1) +
                   L"/" + std::to_wstring(total) + L"\r\nContent-Length: " + std::to_wstring(got);
        Respond(args, 206, L"Partial Content", body.Get(), headers);
        return;
    }
    CloseHandle(f);
    if (FAILED(SHCreateStreamOnFileEx(Long(full).c_str(), STGM_READ | STGM_SHARE_DENY_NONE, 0, FALSE, nullptr, &body))) {
        ComPtr<IStream> s;
        static const char msg[] = "Unreadable";
        s.Attach(SHCreateMemStream((const BYTE*)msg, sizeof(msg) - 1));
        Respond(args, 500, L"Unreadable", s.Get(), L"Content-Type: text/plain; charset=utf-8\r\nCache-Control: no-store");
        return;
    }
    headers += L"\r\nContent-Length: " + std::to_wstring(total);
    Respond(args, 200, L"OK", body.Get(), headers);
}

// ── commands ────────────────────────────────────────────────────────────
static long long UnixTime(FILETIME ft) {
    ULARGE_INTEGER u;
    u.LowPart = ft.dwLowDateTime;
    u.HighPart = ft.dwHighDateTime;
    return (long long)(u.QuadPart / 10000000ULL) - 11644473600LL;
}

// Every file and folder under `root`, skipping dot-names (the page's walker
// skips them too; .papernotes holds the app's own data). Iterative.
static void ScanInto(const std::wstring& root, std::wstring& out, bool filesOnly, bool includeDot) {
    std::vector<std::wstring> stack{L""};
    bool first = true;
    while (!stack.empty()) {
        std::wstring rel = stack.back();
        stack.pop_back();
        std::wstring dir = rel.empty() ? root : root + L"\\" + rel;
        for (auto& c : dir) if (c == L'/') c = L'\\';   // \\?\ paths take backslashes only
        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileExW(Long(dir + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, nullptr,
                                    FIND_FIRST_EX_LARGE_FETCH);
        if (h == INVALID_HANDLE_VALUE) continue;
        do {
            std::wstring name = fd.cFileName;
            if (name == L"." || name == L"..") continue;
            if (name[0] == L'.' && !includeDot) continue;
            bool isDir = (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
            // Links could loop or leave the folder; OneDrive's own reparse
            // points (cloud files) are ordinary files and folders here.
            if ((fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) &&
                (fd.dwReserved0 == IO_REPARSE_TAG_SYMLINK || fd.dwReserved0 == IO_REPARSE_TAG_MOUNT_POINT)) continue;
            std::wstring r = rel.empty() ? name : rel + L"/" + name;
            if (isDir) stack.push_back(r);
            if (isDir && filesOnly) continue;
            ULARGE_INTEGER sz;
            sz.LowPart = fd.nFileSizeLow;
            sz.HighPart = fd.nFileSizeHigh;
            if (!first) out += L",";
            first = false;
            out += L"[" + Json(r) + (isDir ? L",1," : L",0,") + std::to_wstring(isDir ? 0 : sz.QuadPart) + L"," +
                   std::to_wstring(UnixTime(fd.ftLastWriteTime)) + L"]";
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
}

static bool WriteUtf8(const std::wstring& full, const std::string& data, std::wstring& err) {
    MakeDirs(Parent(full));
    std::wstring tmp = full + L".pn-tmp";
    MarkOwn(full);
    MarkOwn(tmp);
    HANDLE f = CreateFileW(Long(tmp).c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) { err = ErrorText(); return false; }
    DWORD wrote = 0;
    BOOL ok = WriteFile(f, data.data(), (DWORD)data.size(), &wrote, nullptr) && wrote == data.size();
    FlushFileBuffers(f);
    CloseHandle(f);
    if (!ok) { err = ErrorText(); DeleteFileW(Long(tmp).c_str()); return false; }
    // Replace in one step, so a crash mid-save never leaves half a note.
    if (!MoveFileExW(Long(tmp).c_str(), Long(full).c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        err = ErrorText();
        DeleteFileW(Long(tmp).c_str());
        return false;
    }
    return true;
}

/** Where the untouched copy of a PDF in the study folder is kept, once
 *  PaperNotes has changed it: .papernotes\originals\<same path>. */
static bool PdfOriginal(const std::wstring& full, std::wstring& out) {
    if (g_notesDir.empty() || full.size() <= g_notesDir.size() + 1 ||
        _wcsnicmp(full.c_str(), g_notesDir.c_str(), g_notesDir.size()) || full[g_notesDir.size()] != L'\\')
        return false;
    out = g_notesDir + L"\\.papernotes\\originals\\" + full.substr(g_notesDir.size() + 1);
    return true;
}

static int Ask(const std::wstring& title, const std::wstring& text, const std::vector<std::pair<int, std::wstring>>& buttons,
               PCWSTR icon = TD_WARNING_ICON) {
    std::vector<TASKDIALOG_BUTTON> b;
    for (auto& p : buttons) b.push_back({p.first, p.second.c_str()});
    TASKDIALOGCONFIG c{sizeof(c)};
    c.hwndParent = g_hwnd;
    c.dwFlags = TDF_ALLOW_DIALOG_CANCELLATION | TDF_POSITION_RELATIVE_TO_WINDOW;
    c.pszWindowTitle = L"PaperNotes";
    c.pszMainIcon = icon;
    c.pszMainInstruction = title.c_str();
    c.pszContent = text.c_str();
    c.cButtons = (UINT)b.size();
    c.pButtons = b.data();
    c.nDefaultButton = buttons.empty() ? 0 : buttons.front().first;
    int pressed = IDCANCEL;
    TaskDialogIndirect(&c, &pressed, nullptr, nullptr);
    return pressed;
}

static std::wstring BaseName(const std::wstring& rel) {
    size_t cut = rel.find_last_of(L"/\\");
    return cut == std::wstring::npos ? rel : rel.substr(cut + 1);
}

// Shell copy/recycle with Windows' own progress and conflict dialogs.
static HRESULT ShellOp(bool recycle, const std::vector<std::wstring>& sources, const std::wstring& destDir) {
    ComPtr<IFileOperation> op;
    HRESULT hr = CoCreateInstance(CLSID_FileOperation, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&op));
    if (FAILED(hr)) return hr;
    op->SetOwnerWindow(g_hwnd);
    op->SetOperationFlags(recycle ? (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOFX_RECYCLEONDELETE | FOFX_EARLYFAILURE)
                                  : (FOF_ALLOWUNDO | FOF_NOCONFIRMMKDIR));
    ComPtr<IShellItem> dest;
    if (!recycle) {
        hr = SHCreateItemFromParsingName(ShellPath(destDir).c_str(), nullptr, IID_PPV_ARGS(&dest));
        if (FAILED(hr)) return hr;
    }
    for (auto& s : sources) {
        ComPtr<IShellItem> item;
        hr = SHCreateItemFromParsingName(ShellPath(s).c_str(), nullptr, IID_PPV_ARGS(&item));
        if (FAILED(hr)) return hr;
        hr = recycle ? op->DeleteItem(item.Get(), nullptr) : op->CopyItem(item.Get(), dest.Get(), nullptr, nullptr);
        if (FAILED(hr)) return hr;
    }
    hr = op->PerformOperations();
    BOOL aborted = FALSE;
    op->GetAnyOperationsAborted(&aborted);
    return FAILED(hr) ? hr : (aborted ? HRESULT_FROM_WIN32(ERROR_CANCELLED) : S_OK);
}

// ── packs: one-file snapshots of notes ──────────────────────────────────
// Format in desktop/tools/pack.mjs. Used for the daily backups in
// <study folder>\.papernotes\backups\YYYY-MM-DD.pack: every .md note plus
// .papernotes\state.json. One file per day, so a backup is one atomic
// write and old ones are one delete each.
struct PackEntry {
    std::wstring rel;   // "/"-separated
    unsigned long long size, offset;
    long long mtime;
};

static bool ReadPack(const std::wstring& file, std::vector<PackEntry>& out) {
    out.clear();
    HANDLE f = CreateFileW(Long(file).c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
    if (f == INVALID_HANDLE_VALUE) return false;
    char magic[8] = {};
    unsigned count = 0;
    unsigned long long dataStart = 0;
    DWORD got = 0;
    bool ok = ReadFile(f, magic, 8, &got, nullptr) && got == 8 && memcmp(magic, "PNPACK1\0", 8) == 0 &&
              ReadFile(f, &count, 4, &got, nullptr) && ReadFile(f, &dataStart, 8, &got, nullptr) && dataStart > 20 &&
              dataStart < (1ull << 31);
    std::vector<char> index;
    if (ok) {
        index.resize((size_t)(dataStart - 20));
        ok = ReadFile(f, index.data(), (DWORD)index.size(), &got, nullptr) && got == index.size();
    }
    CloseHandle(f);
    if (!ok) return false;
    size_t at = 0;
    for (unsigned i = 0; i < count && at + 2 <= index.size(); i++) {
        unsigned short n = *(unsigned short*)&index[at];
        at += 2;
        if (at + n + 24 > index.size()) break;
        PackEntry e;
        e.rel = Widen(std::string(&index[at], n));
        at += n;
        memcpy(&e.size, &index[at], 8);
        memcpy(&e.mtime, &index[at + 8], 8);
        memcpy(&e.offset, &index[at + 16], 8);
        at += 24;
        out.push_back(std::move(e));
    }
    return true;
}

static bool InPack(const PackEntry& e, const std::wstring& prefix) {
    if (prefix.empty()) return true;
    if (e.rel.size() == prefix.size()) return _wcsicmp(e.rel.c_str(), prefix.c_str()) == 0;
    return e.rel.size() > prefix.size() && e.rel[prefix.size()] == L'/' &&
           _wcsnicmp(e.rel.c_str(), prefix.c_str(), prefix.size()) == 0;
}

// Write every packed file under `prefix` into `destRoot`, replacing what is
// there. Files that are not in the pack are left alone. Returns the count,
// or -1 if the pack could not be read.
static int PackExtract(const std::wstring& packFile, const std::vector<PackEntry>& entries, const std::wstring& prefix,
                       const std::wstring& destRoot) {
    HANDLE src = CreateFileW(Long(packFile).c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                             FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    if (src == INVALID_HANDLE_VALUE) return -1;
    std::vector<BYTE> buf(1 << 20);
    int n = 0;
    for (auto& e : entries) {
        if (!InPack(e, prefix)) continue;
        std::wstring out;
        if (!Resolve(destRoot, e.rel, out)) continue;
        MakeDirs(Parent(out));
        MarkOwn(out);
        HANDLE dst = CreateFileW(Long(out).c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (dst == INVALID_HANDLE_VALUE) continue;
        LARGE_INTEGER at;
        at.QuadPart = (LONGLONG)e.offset;
        SetFilePointerEx(src, at, nullptr, FILE_BEGIN);
        unsigned long long left = e.size;
        bool ok = true;
        while (left && ok) {
            DWORD want = (DWORD)std::min<unsigned long long>(left, buf.size()), got = 0, wrote = 0;
            ok = ReadFile(src, buf.data(), want, &got, nullptr) && got == want &&
                 WriteFile(dst, buf.data(), got, &wrote, nullptr) && wrote == got;
            left -= got;
        }
        ULARGE_INTEGER t;
        t.QuadPart = (unsigned long long)(e.mtime + 11644473600LL) * 10000000ULL;
        FILETIME ft{t.LowPart, t.HighPart};
        SetFileTime(dst, nullptr, nullptr, &ft);
        CloseHandle(dst);
        if (ok) n++;
    }
    CloseHandle(src);
    return n;
}

static bool IsNoteName(const std::wstring& name) {
    const wchar_t* ext = PathFindExtensionW(name.c_str());
    return !_wcsicmp(ext, L".md") || !_wcsicmp(ext, L".markdown") || !_wcsicmp(ext, L".mdx");
}

/** Every note in the study folder (not inside dot-folders), as rel paths. */
static void CollectNotes(std::vector<std::wstring>& out) {
    std::vector<std::wstring> stack{L""};
    while (!stack.empty()) {
        std::wstring rel = stack.back();
        stack.pop_back();
        std::wstring dir = rel.empty() ? g_notesDir : g_notesDir + L"\\" + rel;
        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileExW(Long(dir + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, nullptr, 0);
        if (h == INVALID_HANDLE_VALUE) continue;
        do {
            std::wstring name = fd.cFileName;
            if (name == L"." || name == L".." || name[0] == L'.') continue;
            if ((fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) &&
                (fd.dwReserved0 == IO_REPARSE_TAG_SYMLINK || fd.dwReserved0 == IO_REPARSE_TAG_MOUNT_POINT)) continue;
            std::wstring r = rel.empty() ? name : rel + L"\\" + name;
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) stack.push_back(r);
            // Cloud-only files would be downloaded just to be backed up; skip them.
            else if (IsNoteName(name) && !(fd.dwFileAttributes & FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS)) out.push_back(r);
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
}

static std::wstring BackupDir() { return g_notesDir + L"\\.papernotes\\backups"; }

static std::wstring Today() {
    SYSTEMTIME st;
    GetLocalTime(&st);
    wchar_t b[16];
    swprintf_s(b, L"%04d-%02d-%02d", st.wYear, st.wMonth, st.wDay);
    return b;
}

/** Write today's snapshot (replacing an earlier one from today) and keep
 *  the newest 14. Returns the number of files in it, or -1. */
static int MakeBackup(unsigned long long* bytesOut = nullptr) {
    if (g_notesDir.empty()) return -1;
    std::vector<std::wstring> rels;
    CollectNotes(rels);
    std::wstring stateRel = L".papernotes\\state.json";
    if (Exists(g_notesDir + L"\\" + stateRel)) rels.push_back(stateRel);

    struct Item { std::string name; std::wstring full; unsigned long long size; long long mtime; };
    std::vector<Item> items;
    for (auto& r : rels) {
        WIN32_FILE_ATTRIBUTE_DATA fa{};
        std::wstring full = g_notesDir + L"\\" + r;
        if (!GetFileAttributesExW(Long(full).c_str(), GetFileExInfoStandard, &fa)) continue;
        std::wstring slash = r;
        for (auto& c : slash) if (c == L'\\') c = L'/';
        items.push_back({Narrow(slash), full, ((unsigned long long)fa.nFileSizeHigh << 32) | fa.nFileSizeLow, UnixTime(fa.ftLastWriteTime)});
    }

    std::vector<char> head(20);
    memcpy(head.data(), "PNPACK1\0", 8);
    unsigned count = (unsigned)items.size();
    memcpy(&head[8], &count, 4);
    size_t indexBytes = 0;
    for (auto& it : items) indexBytes += 2 + it.name.size() + 24;
    unsigned long long dataStart = 20 + indexBytes, offset = dataStart;
    memcpy(&head[12], &dataStart, 8);
    for (auto& it : items) {
        unsigned short n = (unsigned short)it.name.size();
        head.insert(head.end(), (char*)&n, (char*)&n + 2);
        head.insert(head.end(), it.name.begin(), it.name.end());
        head.insert(head.end(), (char*)&it.size, (char*)&it.size + 8);
        head.insert(head.end(), (char*)&it.mtime, (char*)&it.mtime + 8);
        head.insert(head.end(), (char*)&offset, (char*)&offset + 8);
        offset += it.size;
    }

    MakeDirs(BackupDir());
    std::wstring out = BackupDir() + L"\\" + Today() + L".pack";
    std::wstring tmp = out + L".tmp";
    MarkOwn(out);
    MarkOwn(tmp);
    HANDLE f = CreateFileW(Long(tmp).c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) return -1;
    DWORD wrote = 0;
    bool ok = WriteFile(f, head.data(), (DWORD)head.size(), &wrote, nullptr) != 0;
    std::vector<BYTE> buf(1 << 20);
    for (auto& it : items) {
        HANDLE src = CreateFileW(Long(it.full).c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
        unsigned long long left = it.size;
        while (ok && left) {
            DWORD want = (DWORD)std::min<unsigned long long>(left, buf.size()), got = 0;
            if (src == INVALID_HANDLE_VALUE || !ReadFile(src, buf.data(), want, &got, nullptr) || !got) {
                // A file that shrank or vanished mid-backup: pad, so offsets stay right.
                memset(buf.data(), 0, want);
                got = want;
            }
            ok = WriteFile(f, buf.data(), got, &wrote, nullptr) && wrote == got;
            left -= got;
        }
        if (src != INVALID_HANDLE_VALUE) CloseHandle(src);
    }
    CloseHandle(f);
    if (!ok || !MoveFileExW(Long(tmp).c_str(), Long(out).c_str(), MOVEFILE_REPLACE_EXISTING)) {
        DeleteFileW(Long(tmp).c_str());
        return -1;
    }
    if (bytesOut) *bytesOut = offset;

    // Keep the newest 14.
    std::vector<std::wstring> packs;
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW(Long(BackupDir() + L"\\*.pack").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, nullptr, 0);
    if (h != INVALID_HANDLE_VALUE) {
        do packs.push_back(fd.cFileName); while (FindNextFileW(h, &fd));
        FindClose(h);
    }
    std::sort(packs.begin(), packs.end());
    for (size_t i = 0; i + 14 < packs.size(); i++) {
        MarkOwn(BackupDir() + L"\\" + packs[i]);
        DeleteFileW(Long(BackupDir() + L"\\" + packs[i]).c_str());
    }
    return (int)items.size();
}

static void BackupIfDue() {
    if (g_notesDir.empty() || !Exists(g_notesDir)) return;
    if (!Exists(BackupDir() + L"\\" + Today() + L".pack")) MakeBackup();
}

// ── Claude Code ─────────────────────────────────────────────────────────
static std::wstring Which(const wchar_t* exe) {
    wchar_t buf[MAX_PATH * 2];
    if (SearchPathW(nullptr, exe, nullptr, ARRAYSIZE(buf), buf, nullptr)) return buf;
    return {};
}

static std::wstring FindClaude() {
    PWSTR prof = nullptr;
    SHGetKnownFolderPath(FOLDERID_Profile, 0, nullptr, &prof);
    std::wstring home = prof ? prof : L"";
    CoTaskMemFree(prof);
    for (auto p : {home + L"\\.local\\bin\\claude.exe", home + L"\\AppData\\Roaming\\npm\\claude.cmd"})
        if (Exists(p)) return p;
    std::wstring w = Which(L"claude.exe");
    if (w.empty()) w = Which(L"claude.cmd");
    return w;
}

static std::wstring FindNode() {
    std::wstring n = Which(L"node.exe");
    if (n.empty() && Exists(L"C:\\nvm4w\\nodejs\\node.exe")) n = L"C:\\nvm4w\\nodejs\\node.exe";
    if (n.empty() && Exists(L"C:\\Program Files\\nodejs\\node.exe")) n = L"C:\\Program Files\\nodejs\\node.exe";
    return n;
}

static std::wstring Quote(const std::wstring& s) { return L"\"" + s + L"\""; }

/** Run a console program hidden and wait for it. Returns its exit code, or -1. */
static int RunHidden(const std::wstring& exe, const std::wstring& args, DWORD waitMs = 60000) {
    std::wstring cmd = Quote(exe) + L" " + args;
    if (exe.size() > 4 && !_wcsicmp(exe.c_str() + exe.size() - 4, L".cmd")) cmd = L"cmd.exe /d /c \"" + cmd + L"\"";
    STARTUPINFOW si{sizeof(si)};
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr,
                        g_notesDir.empty() ? nullptr : g_notesDir.c_str(), &si, &pi)) return -1;
    DWORD code = (DWORD)-1;
    if (WaitForSingleObject(pi.hProcess, waitMs) == WAIT_OBJECT_0) GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return (int)code;
}

static std::wstring ClaudeConfigText() {
    PWSTR prof = nullptr;
    SHGetKnownFolderPath(FOLDERID_Profile, 0, nullptr, &prof);
    std::wstring file = std::wstring(prof ? prof : L"") + L"\\.claude.json";
    CoTaskMemFree(prof);
    HANDLE f = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
    if (f == INVALID_HANDLE_VALUE) return {};
    LARGE_INTEGER sz{};
    GetFileSizeEx(f, &sz);
    std::string data((size_t)std::min<LONGLONG>(sz.QuadPart, 64ll << 20), '\0');
    DWORD got = 0;
    ReadFile(f, data.data(), (DWORD)data.size(), &got, nullptr);
    CloseHandle(f);
    data.resize(got);
    return Widen(data);
}

/** Open Claude Code in a terminal in the study folder, with a first prompt. */
static bool LaunchClaude(const std::wstring& prompt, std::wstring& err) {
    std::wstring claude = FindClaude();
    if (claude.empty()) { err = L"Claude Code isn't installed (or isn't on PATH)."; return false; }
    // Quotes and semicolons would end the argument (or, for Windows Terminal, the command).
    std::wstring p;
    for (wchar_t c : prompt) p += (c == L'"' ? L'\'' : c == L';' ? L',' : (c == L'\n' || c == L'\r') ? L' ' : c);
    std::wstring wt = Which(L"wt.exe");
    if (!wt.empty()) {
        std::wstring args = L"-w new -d " + Quote(g_notesDir) + L" --title \"Claude - PaperNotes\" " + Quote(claude) + L" " + Quote(p);
        if ((INT_PTR)ShellExecuteW(g_hwnd, nullptr, wt.c_str(), args.c_str(), g_notesDir.c_str(), SW_SHOWNORMAL) > 32) return true;
    }
    std::wstring args = L"/k \"" + Quote(claude) + L" " + Quote(p) + L"\"";
    if ((INT_PTR)ShellExecuteW(g_hwnd, nullptr, L"cmd.exe", args.c_str(), g_notesDir.c_str(), SW_SHOWNORMAL) > 32) return true;
    err = L"Could not open a terminal.";
    return false;
}

// ── startup ─────────────────────────────────────────────────────────────
static const wchar_t* kRunKey = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";

static bool RunAtLogin() {
    wchar_t buf[1024];
    DWORD sz = sizeof(buf);
    return RegGetValueW(HKEY_CURRENT_USER, kRunKey, L"PaperNotes", RRF_RT_REG_SZ, nullptr, buf, &sz) == ERROR_SUCCESS;
}

static void SetRunAtLogin(bool on) {
    if (on) {
        wchar_t exe[MAX_PATH * 2];
        GetModuleFileNameW(nullptr, exe, ARRAYSIZE(exe));
        std::wstring v = Quote(exe) + L" /login";
        RegSetKeyValueW(HKEY_CURRENT_USER, kRunKey, L"PaperNotes", REG_SZ, v.c_str(), (DWORD)((v.size() + 1) * sizeof(wchar_t)));
    } else {
        HKEY k;
        if (RegOpenKeyExW(HKEY_CURRENT_USER, kRunKey, 0, KEY_SET_VALUE, &k) == ERROR_SUCCESS) {
            RegDeleteValueW(k, L"PaperNotes");
            RegCloseKey(k);
        }
    }
}

// ── notification-area icon ──────────────────────────────────────────────
static NOTIFYICONDATAW g_tray{};
static UINT g_taskbarCreated = 0;

static void TrayAdd() {
    g_tray = {};
    g_tray.cbSize = sizeof(g_tray);
    g_tray.hWnd = g_hwnd;
    g_tray.uID = 1;
    g_tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP;
    g_tray.uCallbackMessage = WM_APP_TRAY;
    g_tray.hIcon = (HICON)LoadImageW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
                                     GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), 0);
    wcscpy_s(g_tray.szTip, L"PaperNotes");
    Shell_NotifyIconW(NIM_ADD, &g_tray);
    g_tray.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &g_tray);
}

static void TrayRemove() { Shell_NotifyIconW(NIM_DELETE, &g_tray); }

static void TrayNotify(const std::wstring& title, const std::wstring& text) {
    NOTIFYICONDATAW n = g_tray;
    n.uFlags = NIF_INFO;
    wcsncpy_s(n.szInfoTitle, title.c_str(), _TRUNCATE);
    wcsncpy_s(n.szInfo, text.c_str(), _TRUNCATE);
    n.dwInfoFlags = NIIF_USER | NIIF_LARGE_ICON;
    n.hBalloonIcon = (HICON)LoadImageW(GetModuleHandleW(nullptr), MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON, 64, 64, 0);
    Shell_NotifyIconW(NIM_MODIFY, &n);
}

static void ShowMain() {
    if (!IsWindowVisible(g_hwnd)) ShowWindow(g_hwnd, SW_SHOW);
    if (IsIconic(g_hwnd)) ShowWindow(g_hwnd, SW_RESTORE);
    SetForegroundWindow(g_hwnd);
}

// ── the study folder ────────────────────────────────────────────────────
static void StartWatcher();
static void StopWatcher();

/** Remember where the MCP server should look (it has no registry access). */
static void WriteFolderHint() {
    std::wstring f = g_dataDir + L"\\study-folder.txt";
    std::string data = Narrow(g_notesDir);
    HANDLE h = CreateFileW(f.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return;
    DWORD w = 0;
    WriteFile(h, data.data(), (DWORD)data.size(), &w, nullptr);
    CloseHandle(h);
}

static bool SetStudyFolder(std::wstring path) {
    while (path.size() > 3 && path.back() == L'\\') path.pop_back();
    bool isDir = false;
    if (!Exists(path, &isDir) || !isDir) return false;
    StopWatcher();
    g_notesDir = path;
    RegSetKeyValueW(HKEY_CURRENT_USER, kRegKey, L"NotesFolder", REG_SZ, path.c_str(), (DWORD)((path.size() + 1) * sizeof(wchar_t)));
    MakeDirs(g_notesDir + L"\\.papernotes\\inbox");
    WriteFolderHint();
    StartWatcher();
    if (g_view) g_view->Navigate((std::wstring(kOrigin) + L"index.html").c_str());
    return true;
}

// ── terminals (ConPTY) ──────────────────────────────────────────────────
// Each terminal is a Windows pseudo console running a shell (PowerShell,
// Command Prompt) or Claude Code in the study folder. Output is read on a
// thread, handed to the UI thread, and posted to the page, where xterm.js
// draws it; keystrokes come back base64-encoded (they can contain any
// byte, including the bridge's separators).
struct Pty {
    int id = 0;
    HPCON hpc = nullptr;
    HANDLE inWrite = nullptr, outRead = nullptr, process = nullptr;
    std::thread reader, waiter;
    std::atomic<bool> closing{false};
};
static std::mutex g_ptyMx;
static std::map<int, std::shared_ptr<Pty>> g_ptys;
static int g_ptySeq = 0;

struct PtyChunk { int id; std::string data; bool exited; DWORD code; };

static std::wstring Utf8ToW(const std::string& s) { return Widen(s); }

static void PtyReader(std::shared_ptr<Pty> p) {
    std::vector<char> buf(64 * 1024);
    std::string carry;   // an incomplete UTF-8 sequence from the last read
    for (;;) {
        DWORD got = 0;
        if (!ReadFile(p->outRead, buf.data(), (DWORD)buf.size(), &got, nullptr) || got == 0) break;
        std::string data = carry + std::string(buf.data(), got);
        // Hold back a trailing partial UTF-8 character for the next read.
        size_t keep = 0;
        for (size_t i = 1; i <= 3 && i <= data.size(); i++) {
            unsigned char c = (unsigned char)data[data.size() - i];
            if ((c & 0xC0) == 0x80) continue;                 // continuation byte
            size_t need = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1;
            if (need > i) keep = i;
            break;
        }
        carry = data.substr(data.size() - keep);
        data.resize(data.size() - keep);
        if (data.empty()) continue;
        PostMessageW(g_hwnd, WM_APP_PTY, 0, (LPARAM) new PtyChunk{p->id, std::move(data), false, 0});
    }
}

static std::wstring DefaultShell() {
    std::wstring pwsh = Which(L"pwsh.exe");
    if (!pwsh.empty()) return pwsh;
    wchar_t sys[MAX_PATH];
    GetSystemDirectoryW(sys, MAX_PATH);
    return std::wstring(sys) + L"\\WindowsPowerShell\\v1.0\\powershell.exe";
}

/** Start `cmdline` in a new pseudo console. Returns its id, or 0. */
static int PtyOpen(const std::wstring& cmdline, const std::wstring& cwd, short cols, short rows, std::wstring& err) {
    auto p = std::make_shared<Pty>();
    HANDLE inRead = nullptr, outWrite = nullptr;
    if (!CreatePipe(&inRead, &p->inWrite, nullptr, 0) || !CreatePipe(&p->outRead, &outWrite, nullptr, 0)) {
        err = ErrorText();
        return 0;
    }
    HRESULT hr = CreatePseudoConsole({cols, rows}, inRead, outWrite, 0, &p->hpc);
    CloseHandle(inRead);
    CloseHandle(outWrite);
    if (FAILED(hr)) { err = ErrorText(hr); CloseHandle(p->inWrite); CloseHandle(p->outRead); return 0; }

    SIZE_T attrSize = 0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &attrSize);
    std::vector<BYTE> attrBuf(attrSize);
    auto attrs = (LPPROC_THREAD_ATTRIBUTE_LIST)attrBuf.data();
    InitializeProcThreadAttributeList(attrs, 1, 0, &attrSize);
    UpdateProcThreadAttribute(attrs, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, p->hpc, sizeof(p->hpc), nullptr, nullptr);

    STARTUPINFOEXW si{};
    si.StartupInfo.cb = sizeof(si);
    si.lpAttributeList = attrs;
    PROCESS_INFORMATION pi{};
    // Tell programs where they are; Claude Code and scripts can use it.
    SetEnvironmentVariableW(L"PAPERNOTES_FOLDER", g_notesDir.c_str());
    SetEnvironmentVariableW(L"TERM_PROGRAM", L"PaperNotes");
    SetEnvironmentVariableW(L"COLORTERM", L"truecolor");
    std::wstring cmd = cmdline;
    BOOL ok = CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, FALSE, EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
                             nullptr, cwd.empty() ? nullptr : cwd.c_str(), &si.StartupInfo, &pi);
    DeleteProcThreadAttributeList(attrs);
    if (!ok) {
        err = ErrorText();
        ClosePseudoConsole(p->hpc);
        CloseHandle(p->inWrite);
        CloseHandle(p->outRead);
        return 0;
    }
    CloseHandle(pi.hThread);
    p->process = pi.hProcess;
    {
        std::lock_guard<std::mutex> l(g_ptyMx);
        p->id = ++g_ptySeq;
        g_ptys[p->id] = p;
    }
    p->reader = std::thread(PtyReader, p);
    p->waiter = std::thread([p] {
        WaitForSingleObject(p->process, INFINITE);
        DWORD code = 0;
        GetExitCodeProcess(p->process, &code);
        // Closing the console ends the output pipe, which ends the reader.
        ClosePseudoConsole(p->hpc);
        p->hpc = nullptr;
        if (p->reader.joinable()) p->reader.join();
        PostMessageW(g_hwnd, WM_APP_PTY, 0, (LPARAM) new PtyChunk{p->id, {}, true, code});
    });
    return p->id;
}

static std::shared_ptr<Pty> PtyGet(int id) {
    std::lock_guard<std::mutex> l(g_ptyMx);
    auto it = g_ptys.find(id);
    return it == g_ptys.end() ? nullptr : it->second;
}

static void PtyWrite(int id, const std::string& bytes) {
    auto p = PtyGet(id);
    if (!p) return;
    DWORD w = 0;
    WriteFile(p->inWrite, bytes.data(), (DWORD)bytes.size(), &w, nullptr);
}

static void PtyResize(int id, short cols, short rows) {
    auto p = PtyGet(id);
    if (p && p->hpc && cols > 0 && rows > 0) ResizePseudoConsole(p->hpc, {cols, rows});
}

static void PtyKill(int id) {
    auto p = PtyGet(id);
    if (!p || p->closing.exchange(true)) return;
    // Ends the process tree attached to the console; the waiter cleans up.
    TerminateProcess(p->process, 1);
}

/** On the UI thread: forward output to the page, tidy up after an exit. */
static void PtyDeliver(PtyChunk* c) {
    if (c->exited) {
        Post(L"{\"event\":\"ptyExit\",\"id\":" + std::to_wstring(c->id) + L",\"code\":" + std::to_wstring((int)c->code) + L"}");
        std::shared_ptr<Pty> p;
        {
            std::lock_guard<std::mutex> l(g_ptyMx);
            auto it = g_ptys.find(c->id);
            if (it != g_ptys.end()) { p = it->second; g_ptys.erase(it); }
        }
        if (p) {
            if (p->waiter.joinable()) p->waiter.detach();
            CloseHandle(p->inWrite);
            CloseHandle(p->outRead);
            CloseHandle(p->process);
        }
    } else {
        Post(L"{\"event\":\"pty\",\"id\":" + std::to_wstring(c->id) + L",\"data\":" + Json(Utf8ToW(c->data)) + L"}");
    }
    delete c;
}

static void PtyKillAll() {
    std::vector<std::shared_ptr<Pty>> all;
    {
        std::lock_guard<std::mutex> l(g_ptyMx);
        for (auto& kv : g_ptys) all.push_back(kv.second);
    }
    for (auto& p : all) {
        TerminateProcess(p->process, 1);
        if (p->waiter.joinable()) p->waiter.join();
    }
}

static std::string Base64Decode(const std::wstring& b64) {
    std::string in = Narrow(b64), out;
    DWORD n = 0;
    if (!CryptStringToBinaryA(in.c_str(), (DWORD)in.size(), CRYPT_STRING_BASE64, nullptr, &n, nullptr, nullptr)) return {};
    out.resize(n);
    CryptStringToBinaryA(in.c_str(), (DWORD)in.size(), CRYPT_STRING_BASE64, (BYTE*)out.data(), &n, nullptr, nullptr);
    out.resize(n);
    return out;
}

// ── libraries ───────────────────────────────────────────────────────────
static bool WriteIfMissing(const std::wstring& full, const std::string& text) {
    if (Exists(full)) return false;
    std::wstring err;
    return WriteUtf8(full, text, err);
}

static std::wstring DocsDir() {
    PWSTR docs = nullptr;
    SHGetKnownFolderPath(FOLDERID_Documents, 0, nullptr, &docs);
    std::wstring d = docs ? docs : L"";
    CoTaskMemFree(docs);
    return d;
}

/** True when the study folder has nothing in it but PaperNotes' own files. */
static bool LibraryEmpty() {
    if (g_notesDir.empty()) return false;
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW(Long(g_notesDir + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, nullptr, 0);
    if (h == INVALID_HANDLE_VALUE) return true;
    bool empty = true;
    do {
        std::wstring n = fd.cFileName;
        if (n == L"." || n == L".." || n[0] == L'.' || !_wcsicmp(n.c_str(), L"desktop.ini")) continue;
        empty = false;
        break;
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return empty;
}

static std::wstring MusicDir() {
    std::wstring d = RegGetString(L"MusicFolder");
    if (!d.empty() && Exists(d)) return d;
    PWSTR m = nullptr;
    SHGetKnownFolderPath(FOLDERID_Music, 0, nullptr, &m);
    d = m ? m : L"";
    CoTaskMemFree(m);
    return d;
}

static void ApplyChrome(HWND hwnd, bool dark, COLORREF caption, COLORREF text) {
    BOOL d = dark;
    DwmSetWindowAttribute(hwnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &d, sizeof(d));
    DwmSetWindowAttribute(hwnd, 35 /* DWMWA_CAPTION_COLOR */, &caption, sizeof(caption));
    DwmSetWindowAttribute(hwnd, 36 /* DWMWA_TEXT_COLOR */, &text, sizeof(text));
    // Context menus follow the page's theme rather than the system's.
    typedef int(WINAPI * SetPreferredAppModeFn)(int);
    typedef void(WINAPI * FlushMenuThemesFn)();
    static HMODULE ux = LoadLibraryExW(L"uxtheme.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (auto f = (SetPreferredAppModeFn)GetProcAddress(ux, MAKEINTRESOURCEA(135))) f(dark ? 2 : 3);
    if (auto f = (FlushMenuThemesFn)GetProcAddress(ux, MAKEINTRESOURCEA(136))) f();
    RegSetDword(L"Dark", dark);
    RegSetDword(L"Caption", caption);
}

static std::vector<std::wstring> Split(const std::wstring& s, wchar_t sep) {
    std::vector<std::wstring> out;
    size_t start = 0;
    for (;;) {
        size_t end = s.find(sep, start);
        out.push_back(s.substr(start, end == std::wstring::npos ? std::wstring::npos : end - start));
        if (end == std::wstring::npos) break;
        start = end + 1;
    }
    return out;
}

// ── updates ─────────────────────────────────────────────────────────────
// The page finds a newer release on GitHub; the host downloads it (only
// from this project's releases), checks it and runs it. See updater.js.
static const wchar_t* kReleaseUrl = L"https://github.com/MilkmanAbi/PaperNotes/releases/download/";

/** A reply that finishes on a worker thread, handed to the UI thread. */
struct AsyncReply { std::wstring id; bool ok; std::wstring json; };
/** Download progress for the page, also from the worker thread. */
struct ProgressEvent { unsigned long long done, total; };

static std::wstring UpdateDir() {
    wchar_t tmp[MAX_PATH];
    GetTempPathW(MAX_PATH, tmp);
    std::wstring d = tmp;
    if (!d.empty() && d.back() == L'\\') d.pop_back();
    return d + L"\\PaperNotes-update";
}

/** Reports progress about four times a second; nothing else. */
class UpdateProgress : public IBindStatusCallback {
    ULONGLONG last_ = 0;
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
        if (riid == IID_IUnknown || riid == IID_IBindStatusCallback) { *out = this; return S_OK; }
        *out = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return 1; }
    ULONG STDMETHODCALLTYPE Release() override { return 1; }
    HRESULT STDMETHODCALLTYPE OnStartBinding(DWORD, IBinding*) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE GetPriority(LONG*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE OnLowResource(DWORD) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnProgress(ULONG done, ULONG total, ULONG, LPCWSTR) override {
        ULONGLONG now = GetTickCount64();
        if (total && (now - last_ > 250 || done >= total)) {
            last_ = now;
            PostMessageW(g_hwnd, WM_APP_REPLY, 1, (LPARAM) new ProgressEvent{done, total});
        }
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE OnStopBinding(HRESULT, LPCWSTR) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE GetBindInfo(DWORD* flags, BINDINFO* info) override {
        *flags = BINDF_GETNEWESTVERSION | BINDF_NOWRITECACHE;   // never a stale copy
        (void)info;
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE OnDataAvailable(DWORD, DWORD, FORMATETC*, STGMEDIUM*) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnObjectAvailable(REFIID, IUnknown*) override { return S_OK; }
};

/** SHA-256 of a file as lowercase hex, or "" if it can't be read. */
static std::wstring Sha256File(const std::wstring& path) {
    HANDLE f = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    if (f == INVALID_HANDLE_VALUE) return L"";
    BCRYPT_ALG_HANDLE alg = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    std::wstring out;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) == 0 &&
        BCryptCreateHash(alg, &hash, nullptr, 0, nullptr, 0, 0) == 0) {
        std::vector<unsigned char> buf(1 << 16);
        DWORD n = 0;
        bool ok = true;
        while (ReadFile(f, buf.data(), (DWORD)buf.size(), &n, nullptr) && n) {
            if (BCryptHashData(hash, buf.data(), n, 0) != 0) { ok = false; break; }
        }
        unsigned char digest[32];
        if (ok && BCryptFinishHash(hash, digest, sizeof(digest), 0) == 0) {
            static const wchar_t* hex = L"0123456789abcdef";
            for (unsigned char b : digest) { out += hex[b >> 4]; out += hex[b & 15]; }
        }
    }
    if (hash) BCryptDestroyHash(hash);
    if (alg) BCryptCloseAlgorithmProvider(alg, 0);
    CloseHandle(f);
    return out;
}

// ── windows popped out of the main one ──────────────────────────────────
static void SetupAppView(ComPtr<ICoreWebView2> view, HWND owner);

static AppWindow* WindowOfHwnd(HWND h) {
    for (auto& [n, w] : g_wins)
        if (w.hwnd == h) return &w;
    return nullptr;
}

static LRESULT CALLBACK PopProc(HWND h, UINT msg, WPARAM w, LPARAM l) {
    AppWindow* self = WindowOfHwnd(h);
    switch (msg) {
        case WM_SIZE:
            if (self && self->ctl) {
                RECT rc;
                GetClientRect(h, &rc);
                self->ctl->put_Bounds(rc);
            }
            return 0;
        case WM_MOVE:
        case WM_MOVING:
            if (self && self->ctl) self->ctl->NotifyParentWindowPositionChanged();
            return 0;
        case WM_SETFOCUS:
            if (self && self->ctl) self->ctl->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
            return 0;
        case WM_GETMINMAXINFO: {
            UINT dpi = GetDpiForWindow(h);
            auto* mm = (MINMAXINFO*)l;
            mm->ptMinTrackSize = {MulDiv(420, dpi, 96), MulDiv(320, dpi, 96)};
            return 0;
        }
        case WM_CLOSE:
            // Unsaved work in this window's editor: the same question as the main window asks.
            if (self && self->dirty && self->view) {
                int r = Ask(L"Save your changes to “" + self->dirtyName + L"”?", L"If you don't save, the changes are lost.",
                            {{100, L"Save"}, {101, L"Don't save"}, {IDCANCEL, L"Cancel"}}, TD_INFORMATION_ICON);
                if (r == 100) { self->view->PostWebMessageAsJson(L"{\"event\":\"save-then-quit\"}"); return 0; }
                if (r != 101) return 0;
            }
            DestroyWindow(h);
            return 0;
        case WM_DESTROY:
            for (auto it = g_wins.begin(); it != g_wins.end(); ++it) {
                if (it->second.hwnd != h) continue;
                if (it->second.ctl) it->second.ctl->Close();
                g_wins.erase(it);
                break;
            }
            return 0;
    }
    return DefWindowProcW(h, msg, w, l);
}

/** A new window showing `hash` (a route like "#/My notes/Week 3.md"). */
static bool OpenWindow(const std::wstring& hash) {
    if (!g_env) return false;
    const int n = ++g_winSeq;
    RECT r;
    GetWindowRect(g_hwnd, &r);
    int ww = std::max(720, (int)(r.right - r.left) * 6 / 10), wh = std::max(520, (int)(r.bottom - r.top) * 85 / 100);
    int off = 40 * (1 + (int)g_wins.size() % 6);
    HWND h = CreateWindowExW(0, kPopClass, L"PaperNotes", WS_OVERLAPPEDWINDOW, r.left + off, r.top + off, ww, wh,
                             nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!h) return false;
    BOOL dark = RegGetDword(L"Dark", 0);
    COLORREF cap = RegGetDword(L"Caption", RGB(0xEF, 0xEB, 0xE4));
    DwmSetWindowAttribute(h, 20, &dark, sizeof(dark));
    DwmSetWindowAttribute(h, 35, &cap, sizeof(cap));
    g_wins[n].hwnd = h;
    ShowWindow(h, SW_SHOWNORMAL);
    std::wstring url = std::wstring(kOrigin) + L"index.html?window=" + std::to_wstring(n) + (hash.rfind(L"#", 0) == 0 ? hash : L"");
    g_env->CreateCoreWebView2Controller(
        h, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
               [n, url, cap](HRESULT hr, ICoreWebView2Controller* ctl) -> HRESULT {
                   auto it = g_wins.find(n);
                   if (FAILED(hr) || !ctl || it == g_wins.end()) return S_OK;
                   AppWindow& w = it->second;
                   w.ctl = ctl;
                   ctl->get_CoreWebView2(&w.view);
                   ComPtr<ICoreWebView2Controller2> ctl2;
                   if (SUCCEEDED(ctl->QueryInterface(IID_PPV_ARGS(&ctl2))))
                       ctl2->put_DefaultBackgroundColor({255, GetRValue(cap), GetGValue(cap), GetBValue(cap)});
                   RECT rc;
                   GetClientRect(w.hwnd, &rc);
                   ctl->put_Bounds(rc);
                   SetupAppView(w.view, w.hwnd);
                   w.view->Navigate(url.c_str());
                   return S_OK;
               }).Get());
    return true;
}

// ── websites in tabs ────────────────────────────────────────────────────
/** Every child of the main window clips its siblings, so the one on top
 *  (a website, when its tab is showing) is what you see. */
static void ClipSiblings() {
    for (HWND c = GetWindow(g_hwnd, GW_CHILD); c; c = GetWindow(c, GW_HWNDNEXT)) {
        LONG_PTR st = GetWindowLongPtrW(c, GWL_STYLE);
        if (!(st & WS_CLIPSIBLINGS)) SetWindowLongPtrW(c, GWL_STYLE, st | WS_CLIPSIBLINGS);
    }
}

static void PaneApply(WebPane& p) {
    if (!p.box) return;
    if (p.visible) {
        // Its own window, raised above the page's: two WebViews in one window
        // are siblings, and the later one is not always drawn on top.
        int w = p.bounds.right - p.bounds.left, h = p.bounds.bottom - p.bounds.top;
        SetWindowPos(p.box, HWND_TOP, p.bounds.left, p.bounds.top, w, h, SWP_SHOWWINDOW | SWP_NOACTIVATE);
        if (p.ctl) { p.ctl->put_Bounds({0, 0, w, h}); p.ctl->put_IsVisible(TRUE); }
    } else {
        if (p.ctl) p.ctl->put_IsVisible(FALSE);
        ShowWindow(p.box, SW_HIDE);
    }
}

/** Tell the page where its website is now: address, title, back/forward. */
static void PaneReport(const std::wstring& key) {
    auto it = g_panes.find(key);
    if (it == g_panes.end() || !it->second.view) return;
    auto& v = it->second.view;
    LPWSTR u = nullptr, t = nullptr;
    v->get_Source(&u);
    v->get_DocumentTitle(&t);
    BOOL back = FALSE, fwd = FALSE;
    v->get_CanGoBack(&back);
    v->get_CanGoForward(&fwd);
    Post(L"{\"event\":\"web\",\"key\":" + Json(key) + L",\"url\":" + Json(u ? u : L"") + L",\"title\":" + Json(t ? t : L"") +
         L",\"back\":" + (back ? L"true" : L"false") + L",\"forward\":" + (fwd ? L"true" : L"false") + L"}");
    CoTaskMemFree(u);
    CoTaskMemFree(t);
}

static bool PaneOpen(const std::wstring& key, const std::wstring& url) {
    if (!g_env) return false;
    auto existing = g_panes.find(key);
    if (existing != g_panes.end()) {
        if (existing->second.view) existing->second.view->Navigate(url.c_str());
        return true;
    }
    HWND box = CreateWindowExW(0, kPaneClass, L"", WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN, 0, 0, 0, 0, g_hwnd,
                               nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!box) return false;
    g_panes[key] = WebPane{};
    g_panes[key].box = box;
    ClipSiblings();
    HRESULT hr = g_env->CreateCoreWebView2Controller(
        box, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [key, url](HRESULT hr, ICoreWebView2Controller* ctl) -> HRESULT {
                        auto it = g_panes.find(key);
                        if (it == g_panes.end()) { if (ctl) ctl->Close(); return S_OK; }   // closed before it was ready
                        if (FAILED(hr) || !ctl) { DestroyWindow(it->second.box); g_panes.erase(it); return S_OK; }
                        WebPane& p = it->second;
                        p.ctl = ctl;
                        ctl->get_CoreWebView2(&p.view);
                        ComPtr<ICoreWebView2Settings> s;
                        p.view->get_Settings(&s);
                        s->put_AreDevToolsEnabled(g_dev);
                        s->put_IsStatusBarEnabled(FALSE);
                        // Keys belong to the site (VS Code wants Ctrl+P, Ctrl+Shift+P, F5…).
                        ComPtr<ICoreWebView2Settings3> s3;
                        if (SUCCEEDED(s.As(&s3))) s3->put_AreBrowserAcceleratorKeysEnabled(FALSE);
                        EventRegistrationToken t;
                        auto report = Callback<ICoreWebView2SourceChangedEventHandler>(
                            [key](ICoreWebView2*, ICoreWebView2SourceChangedEventArgs*) -> HRESULT { PaneReport(key); return S_OK; });
                        p.view->add_SourceChanged(report.Get(), &t);
                        p.view->add_DocumentTitleChanged(
                            Callback<ICoreWebView2DocumentTitleChangedEventHandler>(
                                [key](ICoreWebView2*, IUnknown*) -> HRESULT { PaneReport(key); return S_OK; }).Get(), &t);
                        p.view->add_HistoryChanged(
                            Callback<ICoreWebView2HistoryChangedEventHandler>(
                                [key](ICoreWebView2*, IUnknown*) -> HRESULT { PaneReport(key); return S_OK; }).Get(), &t);
                        PaneApply(p);
                        p.view->Navigate(url.c_str());
                        return S_OK;
                    }).Get());
    if (FAILED(hr)) { DestroyWindow(box); g_panes.erase(key); return false; }
    return true;
}

// ── dragging a file out ─────────────────────────────────────────────────
/** The file as Explorer itself would drag it (so its icon and every drop
 *  target work), offered as a copy only, plus `text` for places that take
 *  text, like an editor. Runs until the drop; returns what happened. */
static DWORD DragOut(const std::wstring& full, const std::wstring& text) {
    PIDLIST_ABSOLUTE pidl = ILCreateFromPathW(full.c_str());
    if (!pidl) return DROPEFFECT_NONE;
    ComPtr<IShellItem> item;
    HRESULT hr = SHCreateItemFromIDList(pidl, IID_PPV_ARGS(&item));
    ILFree(pidl);
    ComPtr<IDataObject> data;
    if (SUCCEEDED(hr)) hr = item->BindToHandler(nullptr, BHID_DataObject, IID_PPV_ARGS(&data));
    if (FAILED(hr) || !data) return DROPEFFECT_NONE;
    if (!text.empty()) {
        size_t bytes = (text.size() + 1) * sizeof(wchar_t);
        if (HGLOBAL g = GlobalAlloc(GMEM_MOVEABLE, bytes)) {
            memcpy(GlobalLock(g), text.c_str(), bytes);
            GlobalUnlock(g);
            FORMATETC fe{CF_UNICODETEXT, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
            STGMEDIUM sm{};
            sm.tymed = TYMED_HGLOBAL;
            sm.hGlobal = g;
            if (FAILED(data->SetData(&fe, &sm, TRUE))) GlobalFree(g);
        }
    }
    DWORD effect = DROPEFFECT_NONE;
    SHDoDragDrop(g_cmdHwnd ? g_cmdHwnd : g_hwnd, data.Get(), nullptr, DROPEFFECT_COPY | DROPEFFECT_LINK, &effect);
    return effect;
}

static void Command(const std::wstring& message) {
    auto a = Split(message, L'\x1F');
    if (a.size() < 2) return;
    const std::wstring& id = a[0];
    const std::wstring& cmd = a[1];
    auto arg = [&](size_t i) -> std::wstring { return i + 2 < a.size() ? a[i + 2] : L""; };
    auto fail = [&](const std::wstring& why) { Reply(id, false, Json(why)); };
    auto done = [&](const std::wstring& json = L"true") { Reply(id, true, json); };
    // Which window asked: the main one, or one popped out of it.
    const int win = WindowOfId(id);
    AppWindow* popped = nullptr;
    if (win) {
        auto it = g_wins.find(win);
        if (it == g_wins.end()) return;
        popped = &it->second;
    }
    g_cmdHwnd = popped ? popped->hwnd : g_hwnd;
    auto notePath = [&](size_t i, std::wstring& out) -> bool {
        if (g_notesDir.empty() || !Resolve(g_notesDir, arg(i), out)) { fail(L"That path is outside the study folder."); return false; }
        return true;
    };

    if (cmd == L"info") {
        // No study folder (first run, or the old one is gone): the page shows
        // the welcome screen and suggests Documents\PaperNotes if it exists.
        PWSTR docs = nullptr;
        SHGetKnownFolderPath(FOLDERID_Documents, 0, nullptr, &docs);
        std::wstring suggested = std::wstring(docs ? docs : L"") + L"\\PaperNotes";
        CoTaskMemFree(docs);
        if (!Exists(suggested)) suggested.clear();
        std::wstring missing = RegGetString(L"NotesFolder");
        if (!missing.empty() && Exists(missing)) missing.clear();
        done(L"{\"version\":" + Json(kVersion) + L",\"notesDir\":" + Json(g_notesDir) + L",\"suggested\":" + Json(suggested) +
             L",\"missing\":" + Json(missing) + L",\"docs\":" + Json(DocsDir()) + L",\"empty\":" + (LibraryEmpty() ? L"true" : L"false") + L",\"dev\":" + (g_dev ? L"true" : L"false") +
             L",\"window\":" + std::to_wstring(win) + L",\"features\":[\"windows\",\"web\",\"dragOut\",\"pdfEdit\"]}");
    } else if (cmd == L"scan") {
        std::wstring files, side;
        if (!g_notesDir.empty()) ScanInto(g_notesDir, files, false, false);
        std::wstring sideRoot = g_notesDir + L"\\.papernotes\\search-text";
        if (!g_notesDir.empty() && Exists(sideRoot)) ScanInto(sideRoot, side, true, true);
        done(L"{\"files\":[" + files + L"],\"side\":[" + side + L"]}");
    } else if (cmd == L"write") {
        std::wstring full, err;
        if (!notePath(0, full)) return;
        if (!WriteUtf8(full, Narrow(arg(1)), err)) return fail(err);
        WIN32_FILE_ATTRIBUTE_DATA fa{};
        GetFileAttributesExW(Long(full).c_str(), GetFileExInfoStandard, &fa);
        done(L"{\"size\":" + std::to_wstring(((long long)fa.nFileSizeHigh << 32) | fa.nFileSizeLow) +
             L",\"mtime\":" + std::to_wstring(UnixTime(fa.ftLastWriteTime)) + L"}");
    } else if (cmd == L"create") {
        // A new note: never overwrites.
        std::wstring full, err;
        if (!notePath(0, full)) return;
        if (Exists(full)) return fail(L"Something with that name is already there.");
        if (!WriteUtf8(full, Narrow(arg(1)), err)) return fail(err);
        done();
    } else if (cmd == L"mkdir") {
        std::wstring full;
        if (!notePath(0, full)) return;
        if (Exists(full)) return fail(L"Something with that name is already there.");
        MarkOwn(full);
        if (!MakeDirs(full)) return fail(ErrorText());
        done();
    } else if (cmd == L"rename") {
        std::wstring from, to;
        if (!notePath(0, from) || !notePath(1, to)) return;
        if (!Exists(from)) return fail(L"It isn't there any more.");
        bool caseOnly = _wcsicmp(from.c_str(), to.c_str()) == 0;
        if (!caseOnly && Exists(to)) return fail(L"Something with that name is already there.");
        MarkOwn(from);
        MarkOwn(to);
        if (!MoveFileExW(Long(from).c_str(), Long(to).c_str(), 0)) return fail(ErrorText());
        done();
    } else if (cmd == L"trash") {
        std::wstring full;
        if (!notePath(0, full)) return;
        bool isDir = false;
        if (!Exists(full, &isDir)) return fail(L"It isn't there any more.");
        std::wstring name = BaseName(arg(0));
        int r = Ask(L"Move “" + name + L"” to the Recycle Bin?",
                    isDir ? L"The folder and everything in it go to the Recycle Bin. You can restore them from there."
                          : L"You can restore it from the Recycle Bin.",
                    {{100, L"Move to Recycle Bin"}, {IDCANCEL, L"Cancel"}});
        if (r != 100) return done(L"false");
        MarkOwn(full);
        HRESULT hr = ShellOp(true, {full}, L"");
        if (FAILED(hr)) return fail(ErrorText(hr));
        done();
    } else if (cmd == L"list") {
        // The names in a folder, dot-files included (the inbox).
        std::wstring dir;
        if (!notePath(0, dir)) return;
        std::wstring out;
        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileExW(Long(dir + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, nullptr, 0);
        if (h != INVALID_HANDLE_VALUE) {
            do {
                std::wstring n = fd.cFileName;
                if (n == L"." || n == L".." || (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
                out += (out.empty() ? L"" : L",") + Json(n);
            } while (FindNextFileW(h, &fd));
            FindClose(h);
        }
        done(L"[" + out + L"]");
    } else if (cmd == L"remove") {
        // Only the app's own files: an inbox command once it's been applied.
        std::wstring rel = arg(0), full;
        if (rel.rfind(L".papernotes/", 0) != 0 || !notePath(0, full)) return fail(L"Not removable.");
        MarkOwn(full);
        DeleteFileW(Long(full).c_str());
        done();
    } else if (cmd == L"open" || cmd == L"reveal") {
        std::wstring full;
        if (!notePath(0, full)) return;
        if (!Exists(full)) return fail(L"It isn't there any more.");
        std::wstring sp = ShellPath(full);
        if (cmd == L"open") {
            if ((INT_PTR)ShellExecuteW(g_hwnd, nullptr, sp.c_str(), nullptr, nullptr, SW_SHOWNORMAL) <= 32)
                return fail(L"Windows has no app set to open this kind of file.");
        } else {
            PIDLIST_ABSOLUTE pidl = ILCreateFromPathW(sp.c_str());
            if (pidl) {
                SHOpenFolderAndSelectItems(pidl, 0, nullptr, 0);
                ILFree(pidl);
            } else {
                ShellExecuteW(g_hwnd, nullptr, L"explorer.exe", (L"/select,\"" + sp + L"\"").c_str(), nullptr, SW_SHOWNORMAL);
            }
        }
        done();
    } else if (cmd == L"external") {
        std::wstring url = arg(0);
        if (url.rfind(L"https://", 0) == 0 || url.rfind(L"http://", 0) == 0 || url.rfind(L"mailto:", 0) == 0)
            ShellExecuteW(g_hwnd, nullptr, url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
        done();
    } else if (cmd == L"import") {
        std::wstring dest;
        if (!notePath(0, dest)) return;
        ComPtr<IFileOpenDialog> dlg;
        if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&dlg)))) return fail(L"No file dialog");
        DWORD opts = 0;
        dlg->GetOptions(&opts);
        dlg->SetOptions(opts | FOS_ALLOWMULTISELECT | FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST);
        dlg->SetTitle(L"Add files to your study folder");
        dlg->SetOkButtonLabel(L"Add");
        if (dlg->Show(g_hwnd) != S_OK) return done(L"0");
        ComPtr<IShellItemArray> items;
        dlg->GetResults(&items);
        DWORD count = 0;
        items->GetCount(&count);
        std::vector<std::wstring> sources;
        for (DWORD i = 0; i < count; i++) {
            ComPtr<IShellItem> it;
            LPWSTR p = nullptr;
            if (SUCCEEDED(items->GetItemAt(i, &it)) && SUCCEEDED(it->GetDisplayName(SIGDN_FILESYSPATH, &p))) {
                sources.push_back(p);
                MarkOwn(dest + L"\\" + BaseName(p));
                CoTaskMemFree(p);
            }
        }
        MakeDirs(dest);
        HRESULT hr = ShellOp(false, sources, dest);
        if (FAILED(hr) && hr != HRESULT_FROM_WIN32(ERROR_CANCELLED)) return fail(ErrorText(hr));
        done(std::to_wstring(sources.size()));
    } else if (cmd == L"pickFolder") {
        ComPtr<IFileOpenDialog> dlg;
        if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&dlg)))) return fail(L"No folder dialog");
        DWORD opts = 0;
        dlg->GetOptions(&opts);
        dlg->SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dlg->SetTitle(L"Choose your Study Folder");
        dlg->SetOkButtonLabel(L"Use this folder");
        if (!g_notesDir.empty()) {
            ComPtr<IShellItem> start;
            if (SUCCEEDED(SHCreateItemFromParsingName(g_notesDir.c_str(), nullptr, IID_PPV_ARGS(&start)))) dlg->SetFolder(start.Get());
        }
        if (dlg->Show(g_hwnd) != S_OK) return done(L"false");
        ComPtr<IShellItem> item;
        LPWSTR p = nullptr;
        if (FAILED(dlg->GetResult(&item)) || FAILED(item->GetDisplayName(SIGDN_FILESYSPATH, &p))) return fail(L"That folder can't be used.");
        std::wstring path = p;
        CoTaskMemFree(p);
        done(L"true");
        SetStudyFolder(path);
    } else if (cmd == L"useFolder") {
        std::wstring path = arg(0);
        bool isDir = false;
        if (!Exists(path, &isDir) || !isDir) return fail(L"That folder isn't there.");
        done();
        SetStudyFolder(path);
    } else if (cmd == L"startup") {
        done(L"{\"runAtLogin\":" + std::wstring(RunAtLogin() ? L"true" : L"false") +
             L",\"showAtLogin\":" + (RegGetDword(L"ShowAtLogin", 0) ? L"true" : L"false") +
             L",\"closeToTray\":" + (RegGetDword(L"CloseToTray", 0) ? L"true" : L"false") + L"}");
    } else if (cmd == L"setStartup") {
        bool on = arg(1) == L"1";
        if (arg(0) == L"runAtLogin") SetRunAtLogin(on);
        else if (arg(0) == L"showAtLogin") RegSetDword(L"ShowAtLogin", on);
        else if (arg(0) == L"closeToTray") RegSetDword(L"CloseToTray", on);
        done();
    } else if (cmd == L"notify") {
        TrayNotify(arg(0), arg(1));
        done();
    } else if (cmd == L"claude") {
        std::wstring err;
        if (g_notesDir.empty()) return fail(L"Choose a study folder first.");
        if (!LaunchClaude(arg(1), err)) return fail(err);
        done();
    } else if (cmd == L"claudeStatus") {
        std::wstring cli = FindClaude(), node = FindNode();
        std::wstring cfg = ClaudeConfigText();
        bool connected = cfg.find(L"\"papernotes\"") != std::wstring::npos;
        done(L"{\"cli\":" + Json(cli) + L",\"node\":" + Json(node) + L",\"connected\":" + (connected ? L"true" : L"false") + L"}");
    } else if (cmd == L"claudeConnect") {
        std::wstring cli = FindClaude(), node = FindNode();
        if (cli.empty()) return fail(L"Claude Code isn't installed.");
        if (node.empty()) return fail(L"Node.js isn't installed; the PaperNotes tools need it.");
        std::wstring server = g_exeDir + L"\\mcp\\server.mjs";
        if (!Exists(server)) return fail(L"The PaperNotes MCP server is missing from the install.");
        SetCursor(LoadCursorW(nullptr, IDC_WAIT));
        RunHidden(cli, L"mcp remove papernotes -s user", 30000);
        int code = RunHidden(cli, L"mcp add papernotes -s user -- " + Quote(node) + L" " + Quote(server), 60000);
        if (code != 0) return fail(L"claude mcp add failed (exit " + std::to_wstring(code) + L").");
        done();
    } else if (cmd == L"backups") {
        std::vector<std::wstring> names;
        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileExW(Long(BackupDir() + L"\\*.pack").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, nullptr, 0);
        if (h != INVALID_HANDLE_VALUE) {
            do names.push_back(fd.cFileName); while (FindNextFileW(h, &fd));
            FindClose(h);
        }
        std::sort(names.rbegin(), names.rend());
        std::wstring out;
        for (auto& n : names) {
            std::vector<PackEntry> e;
            ReadPack(BackupDir() + L"\\" + n, e);
            unsigned long long bytes = 0;
            for (auto& x : e) bytes += x.size;
            out += (out.empty() ? L"" : L",") + std::wstring(L"{\"name\":") + Json(n) + L",\"files\":" + std::to_wstring(e.size()) +
                   L",\"bytes\":" + std::to_wstring(bytes) + L"}";
        }
        done(L"[" + out + L"]");
    } else if (cmd == L"backupNow") {
        unsigned long long bytes = 0;
        int n = MakeBackup(&bytes);
        if (n < 0) return fail(L"Couldn't write the backup.");
        done(L"{\"files\":" + std::to_wstring(n) + L",\"bytes\":" + std::to_wstring(bytes) + L"}");
    } else if (cmd == L"restoreBackup") {
        std::wstring name = arg(0), rel = arg(1), full;
        if (name.find_first_of(L"\\/:") != std::wstring::npos) return fail(L"Bad backup name.");
        std::wstring pack = BackupDir() + L"\\" + name;
        std::vector<PackEntry> entries;
        if (!ReadPack(pack, entries)) return fail(L"That backup can't be read.");
        bool any = false, single = false;
        for (auto& e : entries) {
            if (InPack(e, rel)) any = true;
            if (_wcsicmp(e.rel.c_str(), rel.c_str()) == 0) single = true;
        }
        if (!any) return fail(L"That backup has no copy of this.");
        std::wstring what = rel.empty() ? L"all your notes" : L"“" + BaseName(rel) + L"”";
        std::wstring day = name.substr(0, name.size() - 5);
        int r = Ask(L"Restore " + what + L" from " + day + L"?",
                    single ? L"Your current version is replaced by the one from that day."
                           : L"Every note in it goes back to how it was that day (and so do your tags, reminders and marks if you restore everything). Notes added since are kept.",
                    {{100, L"Restore"}, {IDCANCEL, L"Cancel"}});
        if (r != 100) return done(L"false");
        SetCursor(LoadCursorW(nullptr, IDC_WAIT));
        int n = PackExtract(pack, entries, rel, g_notesDir);
        if (n < 0) return fail(L"The backup could not be read.");
        done(std::to_wstring(n));
    } else if (cmd == L"ptyOpen") {
        // arg0 kind (shell | cmd | claude), arg1 cols, arg2 rows, arg3 Claude's first prompt
        std::wstring kind = arg(0), err, line;
        short cols = (short)std::max(20, _wtoi(arg(1).c_str())), rows = (short)std::max(5, _wtoi(arg(2).c_str()));
        if (kind == L"claude") {
            std::wstring claude = FindClaude();
            if (claude.empty()) return fail(L"Claude Code isn't installed (or isn't on PATH).");
            std::wstring p;
            for (wchar_t c : arg(3)) p += (c == L'"' ? L'\'' : (c == L'\n' || c == L'\r') ? L' ' : c);
            line = Quote(claude) + (p.empty() ? L"" : L" " + Quote(p));
            if (claude.size() > 4 && !_wcsicmp(claude.c_str() + claude.size() - 4, L".cmd")) line = L"cmd.exe /d /c \"" + line + L"\"";
        } else if (kind == L"cmd") {
            wchar_t sys[MAX_PATH];
            GetSystemDirectoryW(sys, MAX_PATH);
            line = Quote(std::wstring(sys) + L"\\cmd.exe");
        } else {
            line = Quote(DefaultShell()) + L" -NoLogo";
        }
        int ptyId = PtyOpen(line, g_notesDir.empty() ? g_exeDir : g_notesDir, cols, rows, err);
        if (!ptyId) return fail(L"Couldn't start the terminal: " + err);
        done(std::to_wstring(ptyId));
    } else if (cmd == L"ptyWrite") {
        PtyWrite(_wtoi(arg(0).c_str()), Base64Decode(arg(1)));
        done();
    } else if (cmd == L"ptyResize") {
        PtyResize(_wtoi(arg(0).c_str()), (short)_wtoi(arg(1).c_str()), (short)_wtoi(arg(2).c_str()));
        done();
    } else if (cmd == L"ptyKill") {
        PtyKill(_wtoi(arg(0).c_str()));
        done();
    } else if (cmd == L"pickParent") {
        // Where a new library should go: returns the folder, changes nothing.
        ComPtr<IFileOpenDialog> dlg;
        if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&dlg)))) return fail(L"No folder dialog");
        DWORD opts = 0;
        dlg->GetOptions(&opts);
        dlg->SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dlg->SetTitle(L"Where should the new library go?");
        dlg->SetOkButtonLabel(L"Put it here");
        if (dlg->Show(g_hwnd) != S_OK) return done(L"\"\"");
        ComPtr<IShellItem> item;
        LPWSTR p = nullptr;
        if (FAILED(dlg->GetResult(&item)) || FAILED(item->GetDisplayName(SIGDN_FILESYSPATH, &p))) return done(L"\"\"");
        std::wstring path = p;
        CoTaskMemFree(p);
        done(Json(path));
    } else if (cmd == L"createLibrary") {
        // A new, empty library: make the folder and open it. The page fills
        // in the starter files and asks for your details once it reloads.
        std::wstring path = arg(0);
        if (path.size() < 4 || path[1] != L':') return fail(L"Choose a full folder path.");
        if (!MakeDirs(path)) return fail(ErrorText());
        done();
        SetStudyFolder(path);
    } else if (cmd == L"writeBinary") {
        // A small binary file (the profile picture), sent as base64.
        std::wstring full;
        if (!notePath(0, full)) return;
        std::string bytes = Base64Decode(arg(1));
        if ((bytes.empty() && !arg(1).empty()) || bytes.size() > 8u * 1024 * 1024) return fail(L"That file is unreadable or too big.");   // empty = clear it
        std::wstring err;
        if (!WriteUtf8(full, bytes, err)) return fail(err);
        done();
    } else if (cmd == L"writePdf") {
        // A PDF edited in PaperNotes (highlights, ink, text, pictures), as
        // base64. The first time a PDF is changed, the file as it was is kept
        // in .papernotes\originals, so the edits can always be taken back.
        std::wstring full, orig;
        if (!notePath(0, full)) return;
        if (_wcsicmp(PathFindExtensionW(full.c_str()), L".pdf")) return fail(L"Only PDFs are saved this way.");
        if (!Exists(full)) return fail(L"That PDF is not there any more.");
        std::string bytes = Base64Decode(arg(1));
        if (bytes.size() < 8 || bytes.compare(0, 5, "%PDF-") || bytes.size() > 512u * 1024 * 1024)
            return fail(L"That is not a PDF PaperNotes can save.");
        if (!PdfOriginal(full, orig)) return fail(L"That PDF is outside the study folder.");
        if (!Exists(orig)) {
            MakeDirs(Parent(orig));
            MarkOwn(orig);
            if (!CopyFileW(Long(full).c_str(), Long(orig).c_str(), TRUE))
                return fail(L"Could not keep a copy of the original first: " + ErrorText());
        }
        std::wstring err;
        if (!WriteUtf8(full, bytes, err)) return fail(err);
        done(L"true");
    } else if (cmd == L"pdfOriginal") {
        // Whether the PDF has a kept original (it has been changed in PaperNotes).
        std::wstring full, orig;
        if (!notePath(0, full)) return;
        done(PdfOriginal(full, orig) && Exists(orig) ? L"true" : L"false");
    } else if (cmd == L"restorePdf") {
        // Back to the PDF as it was before PaperNotes first changed it.
        std::wstring full, orig;
        if (!notePath(0, full)) return;
        if (!PdfOriginal(full, orig) || !Exists(orig)) return fail(L"There is no original of that PDF.");
        std::wstring tmp = full + L".pn-tmp";
        MarkOwn(full);
        MarkOwn(tmp);
        if (!CopyFileW(Long(orig).c_str(), Long(tmp).c_str(), FALSE) ||
            !MoveFileExW(Long(tmp).c_str(), Long(full).c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
            std::wstring err = ErrorText();
            DeleteFileW(Long(tmp).c_str());
            return fail(err);
        }
        MarkOwn(orig);
        DeleteFileW(Long(orig).c_str());
        done(L"true");
    } else if (cmd == L"musicInfo") {
        done(L"{\"dir\":" + Json(MusicDir()) + L",\"acp\":" + std::to_wstring(GetACP()) + L"}");
    } else if (cmd == L"musicScan") {
        // Every file under the music folder as [rel, 0, size, mtime]; the page
        // keeps the ones it can play.
        std::wstring dir = MusicDir(), all;
        if (dir.empty() || !Exists(dir)) return done(L"[]");
        ScanInto(dir, all, true, false);
        done(L"[" + all + L"]");
    } else if (cmd == L"pickMusic") {
        ComPtr<IFileOpenDialog> dlg;
        if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&dlg)))) return fail(L"No folder dialog");
        DWORD opts = 0;
        dlg->GetOptions(&opts);
        dlg->SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dlg->SetTitle(L"Choose your music folder");
        dlg->SetOkButtonLabel(L"Use this folder");
        if (dlg->Show(g_hwnd) != S_OK) return done(L"\"\"");
        ComPtr<IShellItem> item;
        LPWSTR p = nullptr;
        if (FAILED(dlg->GetResult(&item)) || FAILED(item->GetDisplayName(SIGDN_FILESYSPATH, &p))) return done(L"\"\"");
        std::wstring path = p;
        CoTaskMemFree(p);
        RegSetKeyValueW(HKEY_CURRENT_USER, kRegKey, L"MusicFolder", REG_SZ, path.c_str(), (DWORD)((path.size() + 1) * sizeof(wchar_t)));
        done(Json(path));
    } else if (cmd == L"updateDownload") {
        // Fetch a new installer from this project's GitHub releases, off the
        // UI thread, and check it is exactly the file the release lists:
        // the size, and its SHA-256 when GitHub gives one. Only URLs under
        // kReleaseUrl are accepted, so the page can't make the app download
        // anything else.   args: url, size, sha256 (hex, may be empty)
        std::wstring url = arg(0), sha = arg(2);
        unsigned long long size = _wcstoui64(arg(1).c_str(), nullptr, 10);
        std::wstring name = url.substr(url.find_last_of(L'/') + 1);
        if (url.rfind(kReleaseUrl, 0) != 0 || name.rfind(L"PaperNotes-Setup-", 0) != 0 ||
            name.size() < 22 || _wcsicmp(name.c_str() + name.size() - 4, L".exe") != 0 ||
            name.find_first_of(L"\\:?#%") != std::wstring::npos)
            return fail(L"That isn't a PaperNotes release.");
        std::wstring dir = UpdateDir();
        MakeDirs(dir);
        std::wstring dest = dir + L"\\" + name;
        std::wstring rid = id;
        std::thread([rid, url, dest, size, sha]() {
            CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
            UpdateProgress progress;
            DeleteFileW(dest.c_str());
            HRESULT hr = URLDownloadToFileW(nullptr, url.c_str(), dest.c_str(), 0, &progress);
            auto* r = new AsyncReply{rid, false, L""};
            WIN32_FILE_ATTRIBUTE_DATA fa{};
            unsigned long long got = 0;
            if (SUCCEEDED(hr) && GetFileAttributesExW(dest.c_str(), GetFileExInfoStandard, &fa))
                got = ((unsigned long long)fa.nFileSizeHigh << 32) | fa.nFileSizeLow;
            if (FAILED(hr)) r->json = Json(L"The download failed. Check your internet connection and try again.");
            else if (size && got != size) r->json = Json(L"The download was incomplete. Try again.");
            else if (!sha.empty() && _wcsicmp(Sha256File(dest).c_str(), sha.c_str()) != 0)
                r->json = Json(L"The download doesn't match the release (SHA-256). It wasn't run.");
            else { r->ok = true; r->json = Json(dest); }
            if (!r->ok) DeleteFileW(dest.c_str());
            CoUninitialize();
            PostMessageW(g_hwnd, WM_APP_REPLY, 0, (LPARAM)r);
        }).detach();
    } else if (cmd == L"updateRun") {
        // Run a downloaded installer silently and quit; it upgrades in place
        // (your library and settings are never part of it) and starts
        // PaperNotes again when it's done.
        std::wstring path = arg(0);
        std::wstring dir = UpdateDir() + L"\\";
        if (path.rfind(dir, 0) != 0 || path.find(L"..") != std::wstring::npos || !Exists(path)) return fail(L"No downloaded update.");
        SHELLEXECUTEINFOW sei{sizeof(sei)};
        sei.fMask = SEE_MASK_NOASYNC;
        sei.hwnd = g_hwnd;
        sei.lpFile = path.c_str();
        sei.lpParameters = L"/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /RELAUNCH=1";
        sei.nShow = SW_SHOWNORMAL;
        if (!ShellExecuteExW(&sei)) return fail(L"The installer couldn't start.");
        done();
        PostMessageW(g_hwnd, WM_APP_QUIT, 0, 0);   // saves and closes, like Quit in the tray
    } else if (cmd == L"pickRelax") {
        // Relax mode's video: one you choose, or ("reset") the one that ships.
        if (arg(0) == L"reset") { RegDeleteKeyValueW(HKEY_CURRENT_USER, kRegKey, L"RelaxVideo"); return done(L"\"\""); }
        ComPtr<IFileOpenDialog> dlg;
        if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&dlg)))) return fail(L"No file dialog");
        COMDLG_FILTERSPEC types[] = {{L"Videos", L"*.mp4;*.webm;*.m4v;*.mov"}};
        dlg->SetFileTypes(1, types);
        DWORD opts = 0;
        dlg->GetOptions(&opts);
        dlg->SetOptions(opts | FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST);
        dlg->SetTitle(L"Choose a video for Relax mode");
        dlg->SetOkButtonLabel(L"Use this video");
        if (dlg->Show(g_hwnd) != S_OK) return done(L"\"\"");
        ComPtr<IShellItem> item;
        LPWSTR p = nullptr;
        if (FAILED(dlg->GetResult(&item)) || FAILED(item->GetDisplayName(SIGDN_FILESYSPATH, &p))) return done(L"\"\"");
        std::wstring path = p;
        CoTaskMemFree(p);
        RegSetKeyValueW(HKEY_CURRENT_USER, kRegKey, L"RelaxVideo", REG_SZ, path.c_str(), (DWORD)((path.size() + 1) * sizeof(wchar_t)));
        done(Json(path));
    } else if (cmd == L"relaxInfo") {
        done(Json(RegGetString(L"RelaxVideo")));
    } else if (cmd == L"revealMusic") {
        // No file: open the folder itself.
        if (arg(0).empty()) { std::wstring d = MusicDir(); if (Exists(d)) ShellExecuteW(g_hwnd, L"open", d.c_str(), nullptr, nullptr, SW_SHOWNORMAL); return done(); }
        std::wstring full;
        if (!Resolve(MusicDir(), arg(0), full) || !Exists(full)) return fail(L"It isn't there any more.");
        PIDLIST_ABSOLUTE pidl = ILCreateFromPathW(ShellPath(full).c_str());
        if (pidl) { SHOpenFolderAndSelectItems(pidl, 0, nullptr, 0); ILFree(pidl); }
        done();
    } else if (cmd == L"menu") {
        // arg 0,1: x,y in client pixels (or -1 for the cursor); then items
        // "id\x1Elabel\x1Eflags" with flags d = disabled, - = separator.
        POINT pt;
        int x = _wtoi(arg(0).c_str()), y = _wtoi(arg(1).c_str());
        if (x < 0 || y < 0) GetCursorPos(&pt);
        else { pt = {x, y}; ClientToScreen(g_cmdHwnd, &pt); }
        HMENU m = CreatePopupMenu();
        std::map<int, HMENU> subs;
        for (size_t i = 4; i < a.size(); i++) {
            auto it = Split(a[i], L'\x1E');
            std::wstring flags = it.size() > 2 ? it[2] : L"";
            int parent = it.size() > 3 ? _wtoi(it[3].c_str()) : 0;
            HMENU into = parent && subs.count(parent) ? subs[parent] : m;
            if (flags.find(L'-') != std::wstring::npos) { AppendMenuW(into, MF_SEPARATOR, 0, nullptr); continue; }
            if (flags.find(L'm') != std::wstring::npos) {
                HMENU sub = CreatePopupMenu();
                subs[_wtoi(it[0].c_str())] = sub;
                AppendMenuW(into, MF_POPUP, (UINT_PTR)sub, it.size() > 1 ? it[1].c_str() : L"");
                continue;
            }
            UINT f = MF_STRING;
            if (flags.find(L'd') != std::wstring::npos) f |= MF_GRAYED;
            if (flags.find(L'c') != std::wstring::npos) f |= MF_CHECKED;
            AppendMenuW(into, f, _wtoi(it[0].c_str()), it.size() > 1 ? it[1].c_str() : L"");
        }
        SetForegroundWindow(g_cmdHwnd);
        int chosen = TrackPopupMenuEx(m, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY, pt.x, pt.y, g_cmdHwnd, nullptr);
        DestroyMenu(m);
        done(std::to_wstring(chosen));
    } else if (cmd == L"chrome") {
        bool dark = arg(0) == L"1";
        COLORREF cap = RGB(_wtoi(arg(1).c_str()), _wtoi(arg(2).c_str()), _wtoi(arg(3).c_str()));
        COLORREF txt = RGB(_wtoi(arg(4).c_str()), _wtoi(arg(5).c_str()), _wtoi(arg(6).c_str()));
        ApplyChrome(g_cmdHwnd, dark, cap, txt);
        done();
    } else if (cmd == L"dirty") {
        // Unsaved work in the main window, or in a popped-out one.
        if (popped) { popped->dirty = arg(0) == L"1"; popped->dirtyName = arg(1); }
        else { g_dirty = arg(0) == L"1"; g_dirtyName = arg(1); }
        done();
    } else if (cmd == L"quit" && popped) {
        // From a popped-out window: close that window, not PaperNotes.
        popped->dirty = false;
        PostMessageW(popped->hwnd, WM_CLOSE, 0, 0);
        done();
    } else if (cmd == L"openWindow") {
        if (!OpenWindow(arg(0))) return fail(L"The window could not be opened.");
        done();
    } else if (cmd == L"webOpen") {
        // A website in a tab (main window only): https only, nothing local.
        if (popped) return fail(L"Websites open in the main window.");
        if (arg(1).rfind(L"https://", 0) != 0) return fail(L"Only https:// websites can open here.");
        if (!PaneOpen(arg(0), arg(1))) return fail(L"The website could not be opened.");
        done();
    } else if (cmd == L"webPlace") {
        // x, y, width, height in the window's pixels; a width of 0 hides it.
        auto it = g_panes.find(arg(0));
        if (it == g_panes.end()) return fail(L"No such website tab.");
        int x = _wtoi(arg(1).c_str()), y = _wtoi(arg(2).c_str()), w = _wtoi(arg(3).c_str()), hgt = _wtoi(arg(4).c_str());
        it->second.visible = w > 0 && hgt > 0;
        if (it->second.visible) it->second.bounds = {x, y, x + w, y + hgt};
        PaneApply(it->second);
        done();
    } else if (cmd == L"webGo") {
        auto it = g_panes.find(arg(0));
        if (it == g_panes.end() || !it->second.view) return fail(L"No such website tab.");
        auto& v = it->second.view;
        const std::wstring& to = arg(1);
        if (to == L"back") v->GoBack();
        else if (to == L"forward") v->GoForward();
        else if (to == L"reload") v->Reload();
        else if (to.rfind(L"https://", 0) == 0) v->Navigate(to.c_str());
        else return fail(L"Only https:// websites can open here.");
        done();
    } else if (cmd == L"webClose") {
        auto it = g_panes.find(arg(0));
        if (it != g_panes.end()) {
            if (it->second.ctl) it->second.ctl->Close();
            if (it->second.box) DestroyWindow(it->second.box);
            g_panes.erase(it);
        }
        done();
    } else if (cmd == L"dragOut") {
        // Drag a note or file out of PaperNotes, onto the desktop or into
        // Explorer: always a copy, so nothing leaves the study folder. The page
        // started this from a drag; Windows takes it from here until the drop.
        std::wstring full;
        if (!notePath(0, full)) return;
        if (!Exists(full)) return fail(L"It isn't there any more.");
        DWORD effect = DragOut(full, arg(1));
        done(effect & DROPEFFECT_COPY ? L"\"copy\"" : L"\"none\"");
    } else if (cmd == L"quit") {
        g_quitting = true;
        PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
        done();
    } else if (cmd == L"folder") {
        ShellExecuteW(g_hwnd, nullptr, ShellPath(g_notesDir).c_str(), nullptr, nullptr, SW_SHOWNORMAL);
        done();
    } else if (cmd == L"devtools") {
        if (g_dev) g_view->OpenDevToolsWindow();
        done();
    } else {
        fail(L"Unknown command " + cmd);
    }
}

// ── watching the notes folder ───────────────────────────────────────────
static std::mutex g_changeMx;
static std::vector<std::wstring> g_changes;
static bool g_overflow = false;

static void WatchLoop() {
    g_watchDir = CreateFileW(Long(g_notesDir).c_str(), FILE_LIST_DIRECTORY, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                             nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, nullptr);
    if (g_watchDir == INVALID_HANDLE_VALUE) return;
    std::vector<BYTE> buf(64 * 1024);
    while (!g_watchStop) {
        DWORD got = 0;
        // Names, sizes and write times only: OneDrive rewrites attributes
        // on its own all day, and none of that is a change to the notes.
        BOOL ok = ReadDirectoryChangesW(g_watchDir, buf.data(), (DWORD)buf.size(), TRUE,
                                        FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_DIR_NAME |
                                            FILE_NOTIFY_CHANGE_SIZE | FILE_NOTIFY_CHANGE_LAST_WRITE,
                                        &got, nullptr, nullptr);
        if (!ok || g_watchStop) break;
        std::lock_guard<std::mutex> l(g_changeMx);
        if (got == 0) { g_overflow = true; }
        else {
            for (auto* n = (FILE_NOTIFY_INFORMATION*)buf.data();;
                 n = (FILE_NOTIFY_INFORMATION*)((BYTE*)n + n->NextEntryOffset)) {
                g_changes.emplace_back(n->FileName, n->FileNameLength / sizeof(wchar_t));
                if (!n->NextEntryOffset) break;
            }
        }
        PostMessageW(g_hwnd, WM_APP_CHANGED, 0, 0);
    }
}

static void FlushChanges() {
    std::vector<std::wstring> list;
    bool overflow;
    {
        std::lock_guard<std::mutex> l(g_changeMx);
        list.swap(g_changes);
        overflow = g_overflow;
        g_overflow = false;
    }
    std::wstring json;
    int n = 0;
    for (auto& rel : list) {
        if (IsOwn(g_notesDir + L"\\" + rel)) continue;
        if (rel.size() > 7 && rel.compare(rel.size() - 7, 7, L".pn-tmp") == 0) continue;
        std::wstring r = rel;
        for (auto& c : r) if (c == L'\\') c = L'/';
        if (n++) json += L",";
        json += Json(r);
        if (n > 200) { overflow = true; break; }
    }
    if (!n && !overflow) return;
    PostAll(L"{\"event\":\"changed\",\"overflow\":" + std::wstring(overflow ? L"true" : L"false") + L",\"paths\":[" + json + L"]}");
}

// ── window ──────────────────────────────────────────────────────────────
static void SavePlacement() {
    WINDOWPLACEMENT wp{sizeof(wp)};
    if (GetWindowPlacement(g_hwnd, &wp))
        RegSetKeyValueW(HKEY_CURRENT_USER, kRegKey, L"Window", REG_BINARY, &wp, sizeof(wp));
}

static void RestorePlacement(int show) {
    WINDOWPLACEMENT wp{};
    DWORD sz = sizeof(wp);
    if (RegGetValueW(HKEY_CURRENT_USER, kRegKey, L"Window", RRF_RT_REG_BINARY, nullptr, &wp, &sz) == ERROR_SUCCESS &&
        sz == sizeof(wp) && wp.length == sizeof(wp)) {
        // Only if it still lands on a monitor that exists.
        if (MonitorFromRect(&wp.rcNormalPosition, MONITOR_DEFAULTTONULL)) {
            if (wp.showCmd == SW_SHOWMINIMIZED) wp.showCmd = SW_SHOWNORMAL;
            if (show != SW_SHOWDEFAULT && show != SW_SHOWNORMAL) wp.showCmd = show;
            SetWindowPlacement(g_hwnd, &wp);
            return;
        }
    }
    ShowWindow(g_hwnd, show);
}

// Everything a PaperNotes page needs from its WebView, the main window's
// and every window opened from it: the app and the notes served from one
// origin, the line to the host, and nothing that can leave the app.
static void SetupAppView(ComPtr<ICoreWebView2> view, HWND owner) {
    ComPtr<ICoreWebView2Settings> s;
    view->get_Settings(&s);
    s->put_AreDevToolsEnabled(g_dev);
    s->put_IsStatusBarEnabled(FALSE);
    s->put_AreDefaultContextMenusEnabled(TRUE);
    ComPtr<ICoreWebView2Settings3> s3;
    if (SUCCEEDED(s.As(&s3))) s3->put_AreBrowserAcceleratorKeysEnabled(g_dev);
    // The PDF viewer's Save buttons would start a download, which this app
    // never allows; the PDF is a file in the study folder already.
    ComPtr<ICoreWebView2Settings7> s7;
    if (SUCCEEDED(s.As(&s7)))
        s7->put_HiddenPdfToolbarItems(static_cast<COREWEBVIEW2_PDF_TOOLBAR_ITEMS>(
            COREWEBVIEW2_PDF_TOOLBAR_ITEMS_SAVE | COREWEBVIEW2_PDF_TOOLBAR_ITEMS_SAVE_AS));
    ComPtr<ICoreWebView2Settings4> s4;
    if (SUCCEEDED(s.As(&s4))) { s4->put_IsGeneralAutofillEnabled(FALSE); s4->put_IsPasswordAutosaveEnabled(FALSE); }

    view->AddWebResourceRequestedFilter((std::wstring(kOrigin) + L"*").c_str(),
                                          COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
    EventRegistrationToken t;
    view->add_WebResourceRequested(
        Callback<ICoreWebView2WebResourceRequestedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
                Serve(args);
                return S_OK;
            }).Get(), &t);

    // Anything that tries to leave the app opens in the browser instead.
    view->add_NavigationStarting(
        Callback<ICoreWebView2NavigationStartingEventHandler>(
            [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                LPWSTR u = nullptr;
                args->get_Uri(&u);
                std::wstring url = u ? u : L"";
                CoTaskMemFree(u);
                if (url.rfind(kOrigin, 0) != 0) {
                    args->put_Cancel(TRUE);
                    if (url.rfind(L"http", 0) == 0 || url.rfind(L"mailto:", 0) == 0)
                        ShellExecuteW(g_hwnd, nullptr, url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                }
                return S_OK;
            }).Get(), &t);
    view->add_NewWindowRequested(
        Callback<ICoreWebView2NewWindowRequestedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                args->put_Handled(TRUE);
                LPWSTR u = nullptr;
                args->get_Uri(&u);
                std::wstring url = u ? u : L"";
                CoTaskMemFree(u);
                std::wstring content = std::wstring(kOrigin) + L"content/";
                if (url.rfind(content, 0) == 0) {
                    // A note's own file link: open it the Windows way.
                    std::wstring rel = url.substr(content.size()), full;
                    size_t cut = rel.find_first_of(L"?#");
                    if (cut != std::wstring::npos) rel.resize(cut);
                    if (Resolve(g_notesDir, PercentDecode(rel), full) && Exists(full))
                        ShellExecuteW(g_hwnd, nullptr, ShellPath(full).c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                } else if (url.rfind(L"http", 0) == 0 || url.rfind(L"mailto:", 0) == 0) {
                    ShellExecuteW(g_hwnd, nullptr, url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                }
                return S_OK;
            }).Get(), &t);
    // Saved Brightspace pages sit in iframes; their links leave the same way.
    view->add_FrameNavigationStarting(
        Callback<ICoreWebView2NavigationStartingEventHandler>(
            [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                LPWSTR u = nullptr;
                args->get_Uri(&u);
                std::wstring url = u ? u : L"";
                CoTaskMemFree(u);
                if (url.rfind(kOrigin, 0) != 0 && url.rfind(L"about:", 0) != 0) {
                    args->put_Cancel(TRUE);
                    if (url.rfind(L"http", 0) == 0)
                        ShellExecuteW(g_hwnd, nullptr, url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                }
                return S_OK;
            }).Get(), &t);
    view->add_WebMessageReceived(
        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                LPWSTR m = nullptr;
                if (SUCCEEDED(args->TryGetWebMessageAsString(&m)) && m) {
                    std::wstring msg = m;
                    CoTaskMemFree(m);
                    Command(msg);
                }
                return S_OK;
            }).Get(), &t);
    view->add_DocumentTitleChanged(
        Callback<ICoreWebView2DocumentTitleChangedEventHandler>(
            [owner](ICoreWebView2* v, IUnknown*) -> HRESULT {
                LPWSTR title = nullptr;
                v->get_DocumentTitle(&title);
                if (title && *title) SetWindowTextW(owner, title);
                CoTaskMemFree(title);
                return S_OK;
            }).Get(), &t);
    // Downloads would land in Downloads with no way back; the page
    // offers "Open" and "Show in folder" instead.
    ComPtr<ICoreWebView2_4> v4;
    if (SUCCEEDED(view.As(&v4)))
        v4->add_DownloadStarting(
            Callback<ICoreWebView2DownloadStartingEventHandler>(
                [](ICoreWebView2*, ICoreWebView2DownloadStartingEventArgs* args) -> HRESULT {
                    args->put_Cancel(TRUE);
                    return S_OK;
                }).Get(), &t);
}

static void CreateWebView() {
    std::wstring udf = g_dataDir + L"\\WebView2";
    CreateCoreWebView2EnvironmentWithOptions(
        nullptr, udf.c_str(), nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT {
                if (FAILED(hr) || !env) {
                    Ask(L"PaperNotes needs the Microsoft Edge WebView2 Runtime.",
                        L"It is part of Windows 11 and is normally already installed. Install it from "
                        L"https://developer.microsoft.com/microsoft-edge/webview2 and start PaperNotes again.",
                        {{IDOK, L"Close"}}, TD_ERROR_ICON);
                    PostQuitMessage(1);
                    return S_OK;
                }
                g_env = env;
                env->CreateCoreWebView2Controller(
                    g_hwnd, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                                [](HRESULT hr, ICoreWebView2Controller* ctl) -> HRESULT {
                                    if (FAILED(hr) || !ctl) { PostQuitMessage(1); return S_OK; }
                                    g_controller = ctl;
                                    ctl->get_CoreWebView2(&g_view);

                                    ComPtr<ICoreWebView2Controller2> ctl2;
                                    if (SUCCEEDED(ctl->QueryInterface(IID_PPV_ARGS(&ctl2)))) {
                                        COLORREF c = RegGetDword(L"Caption", RGB(0xEF, 0xEB, 0xE4));
                                        ctl2->put_DefaultBackgroundColor({255, GetRValue(c), GetGValue(c), GetBValue(c)});
                                    }
                                    RECT rc;
                                    GetClientRect(g_hwnd, &rc);
                                    ctl->put_Bounds(rc);

                                    SetupAppView(g_view, g_hwnd);

                                    g_view->Navigate((std::wstring(kOrigin) + L"index.html").c_str());
                                    StartWatcher();
                                    return S_OK;
                                }).Get());
                return S_OK;
            }).Get());
}

static void StartWatcher() {
    if (g_notesDir.empty() || g_watcher.joinable()) return;
    g_watchStop = false;
    g_watcher = std::thread(WatchLoop);
}

static void StopWatcher() {
    g_watchStop = true;
    if (g_watchDir != INVALID_HANDLE_VALUE) CancelIoEx(g_watchDir, nullptr);
    if (g_watcher.joinable()) g_watcher.join();
    if (g_watchDir != INVALID_HANDLE_VALUE) CloseHandle(g_watchDir);
    g_watchDir = INVALID_HANDLE_VALUE;
}

static bool g_closeReady = false;

static LRESULT CALLBACK WndProc(HWND h, UINT msg, WPARAM w, LPARAM l) {
    if (msg == g_taskbarCreated && g_taskbarCreated) { TrayAdd(); return 0; }
    switch (msg) {
        case WM_SIZE:
            if (g_controller) {
                RECT rc;
                GetClientRect(h, &rc);
                g_controller->put_Bounds(rc);
            }
            return 0;
        case WM_MOVE:
        case WM_MOVING:
            if (g_controller) g_controller->NotifyParentWindowPositionChanged();
            for (auto& [k, pane] : g_panes)
                if (pane.ctl) pane.ctl->NotifyParentWindowPositionChanged();
            return 0;
        case WM_SETFOCUS:
            if (g_controller) g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
            return 0;
        case WM_GETMINMAXINFO: {
            UINT dpi = GetDpiForWindow(h);
            auto* mm = (MINMAXINFO*)l;
            mm->ptMinTrackSize = {MulDiv(560, dpi, 96), MulDiv(420, dpi, 96)};
            return 0;
        }
        case WM_APP_CHANGED:
            // Coalesce bursts (a OneDrive sync, an unzip) into one refresh.
            SetTimer(h, TIMER_CHANGED, 600, nullptr);
            return 0;
        case WM_APP_PTY:
            PtyDeliver((PtyChunk*)l);
            return 0;
        case WM_APP_REPLY:
            // From a worker thread: download progress (w = 1) or a finished reply.
            if (w == 1) {
                auto* p = (ProgressEvent*)l;
                Post(L"{\"event\":\"update-progress\",\"done\":" + std::to_wstring(p->done) + L",\"total\":" + std::to_wstring(p->total) + L"}");
                delete p;
            } else {
                auto* r = (AsyncReply*)l;
                Reply(r->id, r->ok, r->json);
                delete r;
            }
            return 0;
        case WM_APP_SHOW:
            ShowMain();
            return 0;
        case WM_APP_QUIT:
            g_quitting = true;
            PostMessageW(h, WM_CLOSE, 0, 0);
            return 0;
        case WM_APP_TRAY:
            switch (LOWORD(l)) {
                case NIN_SELECT:
                case NIN_KEYSELECT:
                case NIN_BALLOONUSERCLICK:
                    ShowMain();
                    break;
                case WM_CONTEXTMENU: {
                    HMENU m = CreatePopupMenu();
                    AppendMenuW(m, MF_STRING, 1, L"Open PaperNotes");
                    AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
                    AppendMenuW(m, MF_STRING, 2, L"Quit");
                    SetMenuDefaultItem(m, 1, FALSE);
                    SetForegroundWindow(h);
                    int c = TrackPopupMenuEx(m, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY, GET_X_LPARAM(w), GET_Y_LPARAM(w), h, nullptr);
                    DestroyMenu(m);
                    if (c == 1) ShowMain();
                    if (c == 2) { g_quitting = true; PostMessageW(h, WM_CLOSE, 0, 0); }
                    break;
                }
            }
            return 0;
        case WM_TIMER:
            if (w == TIMER_CHANGED) { KillTimer(h, TIMER_CHANGED); FlushChanges(); }
            if (w == TIMER_BACKUP) { KillTimer(h, TIMER_BACKUP); BackupIfDue(); SetTimer(h, TIMER_BACKUP, 3 * 3600 * 1000, nullptr); }
            if (w == TIMER_CLOSE) { KillTimer(h, TIMER_CLOSE); g_closeReady = true; PostMessageW(h, WM_CLOSE, 0, 0); }
            return 0;
        case WM_QUERYENDSESSION:
            g_quitting = true;
            return TRUE;
        case WM_CLOSE:
            // Keep running in the notification area, if that's the setting.
            if (!g_quitting && RegGetDword(L"CloseToTray", 0)) {
                Post(L"{\"event\":\"before-close\"}");
                SavePlacement();
                ShowWindow(h, SW_HIDE);
                return 0;
            }
            if (g_dirty && !g_closeReady && g_view) {
                ShowMain();
                int r = Ask(L"Save your changes to “" + g_dirtyName + L"”?",
                            L"If you don't save, the changes are lost.",
                            {{100, L"Save"}, {101, L"Don't save"}, {IDCANCEL, L"Cancel"}}, TD_INFORMATION_ICON);
                if (r == 100) { Post(L"{\"event\":\"save-then-quit\"}"); return 0; }
                if (r != 101) { g_quitting = false; return 0; }
                g_dirty = false;
            }
            // Give the page a moment to write what it remembers.
            if (!g_closeReady && g_view) {
                Post(L"{\"event\":\"before-close\"}");
                SetTimer(h, TIMER_CLOSE, 400, nullptr);
                return 0;
            }
            SavePlacement();
            DestroyWindow(h);
            return 0;
        case WM_DESTROY:
            TrayRemove();
            PtyKillAll();
            StopWatcher();
            for (auto& [k, pane] : g_panes)
                if (pane.ctl) pane.ctl->Close();
            g_panes.clear();
            while (!g_wins.empty()) DestroyWindow(g_wins.begin()->second.hwnd);
            if (g_controller) g_controller->Close();
            g_controller.Reset();
            g_view.Reset();
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(h, msg, w, l);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR cmdLine, int show) {
    g_dev = wcsstr(cmdLine, L"/dev") != nullptr;
    if (g_dev) {
        kClass = L"PaperNotesDevWindow";
        kRegKey = L"Software\\PaperNotes\\Dev";
    }
    const bool atLogin = wcsstr(cmdLine, L"/login") != nullptr;

    // One window: a second launch brings the first one forward (even from
    // the notification area).
    HANDLE mutex = CreateMutexW(nullptr, TRUE, g_dev ? L"PaperNotes.Dev" : L"PaperNotes.SingleInstance");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        if (HWND other = FindWindowW(kClass, nullptr)) {
            DWORD pid = 0;
            GetWindowThreadProcessId(other, &pid);
            AllowSetForegroundWindow(pid);
            if (!atLogin) PostMessageW(other, WM_APP_SHOW, 0, 0);
        }
        return 0;
    }

    OleInitialize(nullptr);   // COM as before, plus drag and drop
    INITCOMMONCONTROLSEX icc{sizeof(icc), ICC_STANDARD_CLASSES};
    InitCommonControlsEx(&icc);

    wchar_t buf[MAX_PATH * 4];
    GetModuleFileNameW(nullptr, buf, ARRAYSIZE(buf));
    g_exeDir = Parent(buf);
    g_appDir = g_exeDir + L"\\app";
    PWSTR known = nullptr;
    SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &known);
    g_dataDir = std::wstring(known) + (g_dev ? L"\\PaperNotes-Dev" : L"\\PaperNotes");
    CoTaskMemFree(known);
    MakeDirs(g_dataDir);

    // The study folder the user chose. None yet (or it has gone): the page
    // shows the welcome screen and asks.
    g_notesDir = RegGetString(L"NotesFolder");
    while (g_notesDir.size() > 3 && g_notesDir.back() == L'\\') g_notesDir.pop_back();
    bool isDir = false;
    if (!g_notesDir.empty() && (!Exists(g_notesDir, &isDir) || !isDir)) g_notesDir.clear();
    if (!g_notesDir.empty()) {
        MakeDirs(g_notesDir + L"\\.papernotes\\inbox");
        WriteFolderHint();
    }

    WNDCLASSEXW wc{sizeof(wc)};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = inst;
    wc.hIcon = LoadIconW(inst, MAKEINTRESOURCEW(IDI_APP));
    wc.hIconSm = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON),
                                   GetSystemMetrics(SM_CYSMICON), 0);
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    COLORREF cap = RegGetDword(L"Caption", RGB(0xEF, 0xEB, 0xE4));
    wc.hbrBackground = CreateSolidBrush(cap);
    wc.lpszClassName = kClass;
    RegisterClassExW(&wc);
    if (g_dev) kPopClass = L"PaperNotesDevPopWindow";
    wc.lpfnWndProc = PopProc;
    wc.lpszClassName = kPopClass;
    RegisterClassExW(&wc);
    // The window a website in a tab lives in (no background: the site paints it).
    WNDCLASSEXW pc{sizeof(pc)};
    pc.lpfnWndProc = DefWindowProcW;
    pc.hInstance = inst;
    pc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    pc.lpszClassName = kPaneClass;
    RegisterClassExW(&pc);

    // A sensible first size: 80% of the work area, centred.
    RECT wa;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    int ww = (wa.right - wa.left) * 8 / 10, wh = (wa.bottom - wa.top) * 85 / 100;
    g_hwnd = CreateWindowExW(0, kClass, L"PaperNotes", WS_OVERLAPPEDWINDOW, wa.left + ((wa.right - wa.left) - ww) / 2,
                             wa.top + ((wa.bottom - wa.top) - wh) / 2, ww, wh, nullptr, nullptr, inst, nullptr);
    {
        BOOL dark = RegGetDword(L"Dark", 0);
        DwmSetWindowAttribute(g_hwnd, 20, &dark, sizeof(dark));
        DwmSetWindowAttribute(g_hwnd, 35, &cap, sizeof(cap));
    }
    g_taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
    TrayAdd();

    // Started by Windows at sign-in with "show the window" off: stay in the
    // notification area until clicked.
    if (atLogin && !RegGetDword(L"ShowAtLogin", 0)) {
        // nothing shown
    } else {
        RestorePlacement(show);
        UpdateWindow(g_hwnd);
    }

    CreateWebView();
    // The day's backup, once things have settled.
    SetTimer(g_hwnd, TIMER_BACKUP, 90 * 1000, nullptr);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    CoUninitialize();
    ReleaseMutex(mutex);
    return (int)msg.wParam;
}
