# github#129 -- a stdin-driven hand for the foreground window, in the shape of win-input.ps1.
# One command per line, one reply line per command:
#   fg                       the window holding the keyboard now: "<hwnd> <pid>"
#   handback <hwnd> <pid>    put <hwnd> back IF the keyboard is currently held by <pid> or one of
#                            its descendants; replies already | foreign | plain | attach | failed
#   quit
#
# Only "belongs to a process this run spawned" is restored, so someone who switched away on
# purpose mid-run is left alone -- the guard is for the window that took the keyboard without
# being asked, not for whatever happens to be in front.
$ErrorActionPreference = 'Stop'
Add-Type -Namespace Win -Name Focus -MemberDefinition @'
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@

function Foreground-Pid {
  $h = [Win.Focus]::GetForegroundWindow()
  $q = 0
  [void][Win.Focus]::GetWindowThreadProcessId($h, [ref] $q)
  return @($h, [int]$q)
}

# Chrome's window does not always belong to the process we spawned -- it re-execs, and Electron
# splits too -- so "ours" means that pid or anything under it.
function Descendants-Of([int]$root) {
  $kids = @{}
  foreach ($p in Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId) {
    $parent = [int]$p.ParentProcessId
    if (-not $kids.ContainsKey($parent)) { $kids[$parent] = New-Object System.Collections.Generic.List[int] }
    $kids[$parent].Add([int]$p.ProcessId)
  }
  $seen = New-Object System.Collections.Generic.HashSet[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  [void]$seen.Add($root); $queue.Enqueue($root)
  while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    if ($kids.ContainsKey($cur)) {
      foreach ($k in $kids[$cur]) { if ($seen.Add($k)) { $queue.Enqueue($k) } }
    }
  }
  return $seen
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim() -split '\s+'
  try {
    switch ($p[0]) {
      'fg' {
        $f = Foreground-Pid
        [Console]::Out.WriteLine("$([int64]$f[0]) $($f[1])")
      }
      'handback' {
        $target = [IntPtr][int64]$p[1]
        $ours = [int]$p[2]
        if (-not [Win.Focus]::IsWindow($target)) { [Console]::Out.WriteLine('failed'); break }
        $f = Foreground-Pid
        if ($f[0] -eq $target) { [Console]::Out.WriteLine('already'); break }
        if (-not (Descendants-Of $ours).Contains([int]$f[1])) { [Console]::Out.WriteLine('foreign'); break }

        # The harness sits in the same foreground-privilege chain as the window that just took
        # the keyboard -- it was spawned by the process that held it -- so the plain call is
        # usually granted. AttachThreadInput is for when it is not: see record-demo.ps1, which
        # measured SetForegroundWindow being refused to a genuinely background process.
        [void][Win.Focus]::SetForegroundWindow($target)
        if ([Win.Focus]::GetForegroundWindow() -eq $target) { [Console]::Out.WriteLine('plain'); break }
        $q = 0
        $thief = [Win.Focus]::GetWindowThreadProcessId([Win.Focus]::GetForegroundWindow(), [ref] $q)
        $me = [Win.Focus]::GetCurrentThreadId()
        [void][Win.Focus]::AttachThreadInput($me, $thief, $true)
        [void][Win.Focus]::BringWindowToTop($target)
        [void][Win.Focus]::SetForegroundWindow($target)
        [void][Win.Focus]::AttachThreadInput($me, $thief, $false)
        if ([Win.Focus]::GetForegroundWindow() -eq $target) { [Console]::Out.WriteLine('attach') }
        else { [Console]::Out.WriteLine('failed') }
      }
      'quit' { exit 0 }
      default { [Console]::Out.WriteLine('ERR unknown ' + $p[0]) }
    }
  } catch { [Console]::Out.WriteLine('ERR ' + $_.Exception.Message) }
}
