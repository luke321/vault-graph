# Move the OPERATING SYSTEM's mouse pointer, one line of "x y" at a time on stdin.
#
#   echo "400 300" | powershell -File scripts/cursor.ps1
#
# Exists because CDP input never moves the OS cursor -- it is delivered straight to the
# renderer -- so a screen recording of a CDP-driven demo shows every effect and no arrow.
# gdigrab draws the real cursor when -draw_mouse is 1, so moving the real cursor in step
# with the CDP pointer puts a visible arrow in the video.
#
# WHY A LONG-LIVED PROCESS: a glide across the window is ~40 positions, and spawning
# PowerShell per position costs ~80ms each -- the pointer would crawl and the video would
# be minutes long. One process reading stdin keeps a move at 16ms per step.
#
# Coordinates are PHYSICAL screen pixels, absolute. The caller owns the conversion from
# page coordinates; this only moves the pointer.
#
# It really does take the mouse. Anything the user is doing with it while a demo runs
# will fight this, which is why demo.mjs treats it as opt-in (--cursor) rather than as
# the default.

Add-Type -Namespace Win -Name Cur -MemberDefinition @'
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
'@

# Line-buffered read. [Console]::In.ReadLine() blocks until the next line, and returns
# $null on stdin close, which is how the parent asks this to exit -- no signal handling
# and nothing to clean up.
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $line = $line.Trim()
  if (-not $line) { continue }
  if ($line -eq 'quit') { break }
  $p = $line -split '[\s,]+'
  if ($p.Count -lt 2) { continue }
  $x = 0; $y = 0
  if ([int]::TryParse($p[0], [ref] $x) -and [int]::TryParse($p[1], [ref] $y)) {
    [void][Win.Cur]::SetCursorPos($x, $y)
  }
}
