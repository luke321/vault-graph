# github#72 -- a stdin-driven hand for a recording harness: the real Windows cursor and
# button, so what the capture shows is what a person would have done. One command per
# line, one reply line per command:
#   rect <pid>      the DWM frame of that process's main window: "L T R B" (no border sliver)
#   move <x> <y>    put the cursor at that screen point
#   down / up       press / release the left button where the cursor is
#   pos             where the cursor is: "x y"
#   quit
$ErrorActionPreference = 'Stop'
Add-Type -Namespace Win -Name Input -MemberDefinition @'
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
'@
$MOVE = 0x0001; $LEFTDOWN = 0x0002; $LEFTUP = 0x0004
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim() -split '\s+'
  try {
    switch ($p[0]) {
      'rect' {
        $proc = Get-Process -Id ([int]$p[1])
        $h = $proc.MainWindowHandle
        if ($h -eq [IntPtr]::Zero) { [Console]::Out.WriteLine('ERR no window'); break }
        $r = New-Object Win.Input+RECT
        $ok = ([Win.Input]::DwmGetWindowAttribute($h, 9, [ref] $r, [Runtime.InteropServices.Marshal]::SizeOf($r)) -eq 0)
        if (-not $ok) { $null = [Win.Input]::GetWindowRect($h, [ref] $r) }
        [Console]::Out.WriteLine("$($r.L) $($r.T) $($r.R) $($r.B)")
      }
      'move' {
        # SetCursorPos places the cursor but injects no input; the two relative nudges are real
        # mouse input at the target, so the window under it sees a mousemove, then we re-place
        # in case pointer acceleration turned a 1px nudge into something else
        $x = [int]$p[1]; $y = [int]$p[2]
        $null = [Win.Input]::SetCursorPos($x, $y)
        [Win.Input]::mouse_event($MOVE, 1, 0, 0, [UIntPtr]::Zero)
        [Win.Input]::mouse_event($MOVE, [uint32]::MaxValue, 0, 0, [UIntPtr]::Zero)
        $q = New-Object Win.Input+POINT; $null = [Win.Input]::GetCursorPos([ref] $q)
        if ($q.X -ne $x -or $q.Y -ne $y) { $null = [Win.Input]::SetCursorPos($x, $y); $null = [Win.Input]::GetCursorPos([ref] $q) }
        [Console]::Out.WriteLine("$($q.X) $($q.Y)")
      }
      'down' { [Win.Input]::mouse_event($LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero); [Console]::Out.WriteLine('ok') }
      'up'   { [Win.Input]::mouse_event($LEFTUP, 0, 0, 0, [UIntPtr]::Zero); [Console]::Out.WriteLine('ok') }
      'pos'  { $q = New-Object Win.Input+POINT; $null = [Win.Input]::GetCursorPos([ref] $q); [Console]::Out.WriteLine("$($q.X) $($q.Y)") }
      'quit' { exit 0 }
      default { [Console]::Out.WriteLine('ERR unknown ' + $p[0]) }
    }
  } catch { [Console]::Out.WriteLine('ERR ' + $_.Exception.Message) }
}
