# github#129 -- the half of focus-check.mjs that has to be a window.
#
# The theft is only PERMITTED when the run is started by the process holding the foreground, so a
# faithful check cannot just launch a harness and watch: launched from a session that is not in
# front, Windows refuses the activation and every run measures clean. This owns a real window,
# takes the keyboard, and spawns the harness itself, which puts the harness in exactly the
# privilege chain it is in when a person starts it from their terminal.
#
# It polls GetForegroundWindow rather than hooking EVENT_SYSTEM_FOREGROUND on purpose. The event
# fires on the attempt: measured, one fired for a harness window while GetForegroundWindow still
# named the original window for the whole run. The event counts tries; the poll counts thefts.
param([Parameter(Mandatory = $true)][string]$ArgLine,
      [Parameter(Mandatory = $true)][string]$Log,
      [string]$Out = '',
      [string]$WorkDir = '.')
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace Win -Name Standin -MemberDefinition @'
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
function Describe($h) {
  $q = 0; [void][Win.Standin]::GetWindowThreadProcessId($h, [ref] $q)
  $sb = New-Object System.Text.StringBuilder 160; [void][Win.Standin]::GetWindowText($h, $sb, 160)
  $n = '?'; try { $n = (Get-Process -Id $q -ErrorAction Stop).ProcessName } catch { }
  "$n($q) '$($sb.ToString())'"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'vault-graph focus check -- stands in for the terminal that started the run'
$form.Width = 760; $form.Height = 150
$form.StartPosition = 'Manual'; $form.Left = 40; $form.Top = 40
$form.Show(); $form.Activate()
[System.Windows.Forms.Application]::DoEvents()
$me = $form.Handle

[void][Win.Standin]::SetForegroundWindow($me)
if ([Win.Standin]::GetForegroundWindow() -ne $me) {
  $q = 0
  $held = [Win.Standin]::GetWindowThreadProcessId([Win.Standin]::GetForegroundWindow(), [ref] $q)
  $tid = [Win.Standin]::GetCurrentThreadId()
  [void][Win.Standin]::AttachThreadInput($tid, $held, $true)
  [void][Win.Standin]::BringWindowToTop($me)
  [void][Win.Standin]::SetForegroundWindow($me)
  [void][Win.Standin]::AttachThreadInput($tid, $held, $false)
}
Start-Sleep -Milliseconds 250
[System.Windows.Forms.Application]::DoEvents()
if ([Win.Standin]::GetForegroundWindow() -ne $me) {
  "ABORT could not take the keyboard; it is held by $(Describe ([Win.Standin]::GetForegroundWindow()))" |
    Set-Content $Log -Encoding utf8
  $form.Close(); exit 2
}

# CreateProcess, not ShellExecute: the harness must be OUR child for the chain to be faithful
$parts = $ArgLine -split '\s+'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $parts[0]
$psi.Arguments = ($parts[1..($parts.Count - 1)] -join ' ')
$psi.WorkingDirectory = (Resolve-Path $WorkDir).Path
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$child = [System.Diagnostics.Process]::Start($psi)
$stdout = $child.StandardOutput.ReadToEndAsync()
$stderr = $child.StandardError.ReadToEndAsync()

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$events = New-Object System.Collections.Generic.List[object]
$events.Add([pscustomobject]@{ ms = 0; hwnd = $me; desc = (Describe $me) })
$last = $me
while (-not $child.HasExited -and $sw.Elapsed.TotalSeconds -lt 900) {
  $f = [Win.Standin]::GetForegroundWindow()
  if ($f -ne $last) { $last = $f; $events.Add([pscustomobject]@{ ms = $sw.ElapsedMilliseconds; hwnd = $f; desc = (Describe $f) }) }
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 20
}
$total = $sw.ElapsedMilliseconds
if ($Out) { ($stdout.Result + "`n" + $stderr.Result) | Set-Content $Out -Encoding utf8 }

$away = 0; $steals = 0; $longest = 0
for ($i = 1; $i -lt $events.Count; $i++) {
  $prev = $events[$i - 1]
  if ($prev.hwnd -ne $me) {
    $d = $events[$i].ms - $prev.ms
    $away += $d
    if ($d -gt $longest) { $longest = $d }
  }
  if ($events[$i].hwnd -ne $me -and $prev.hwnd -eq $me) { $steals++ }
}
$tail = $events[$events.Count - 1]
if ($tail.hwnd -ne $me) {
  $d = $total - $tail.ms
  $away += $d
  if ($d -gt $longest) { $longest = $d }
}
$lines = New-Object System.Collections.Generic.List[string]
foreach ($e in $events) { $lines.Add(("EVENT {0} {1}" -f $e.ms, $e.desc)) }
$lines.Add("RESULT steals=$steals away_ms=$away longest_ms=$longest run_ms=$total kept=$($tail.hwnd -eq $me) exit=$($child.ExitCode)")
$lines | Set-Content $Log -Encoding utf8
$form.Close()
