use super::super::scripts::escape_ps_single_quoted;
use super::super::staging::normalize_windows_editor_import_path;

#[cfg(target_os = "windows")]
pub(super) fn build_capcut_ui_import_ps(media_paths: &[String]) -> String {
    let files = media_paths
        .iter()
        .map(|p| normalize_windows_editor_import_path(p))
        .map(|p| format!("'{}'", escape_ps_single_quoted(&p)))
        .collect::<Vec<_>>()
        .join(",\n    ");

    let template = r#"$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName UIAutomationClient | Out-Null
Add-Type -AssemblyName UIAutomationTypes | Out-Null
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public class Win32CapCut {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    public const int SW_RESTORE = 9;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
}
'@ -ErrorAction SilentlyContinue

$paths = @(
    __FILES__
)

function Get-CapCutProcesses {
    return @(Get-Process -Name 'CapCut*' -ErrorAction SilentlyContinue | Where-Object {
        ($_.ProcessName -like 'CapCut*') -and ($_.ProcessName -notmatch 'Service|Update|Crash|Helper')
    })
}

function Get-CapCutWindow {
    $procs = Get-CapCutProcesses
    $procIds = @($procs | Select-Object -ExpandProperty Id)
    if (-not $procIds -or $procIds.Count -eq 0) {
        return $null
    }

    $script:capCutProcessById = @{}
    foreach ($proc in $procs) {
        $script:capCutProcessById[[int]$proc.Id] = [string]$proc.ProcessName
    }

    $script:windowMatches = New-Object 'System.Collections.Generic.List[object]'
    $callback = [Win32CapCut+EnumWindowsProc] {
        param([IntPtr]$hWnd, [IntPtr]$lParam)

        if (-not [Win32CapCut]::IsWindowVisible($hWnd)) {
            return $true
        }

        $procId = [uint32]0
        [void][Win32CapCut]::GetWindowThreadProcessId($hWnd, [ref]$procId)
        if ($procIds -notcontains [int]$procId) {
            return $true
        }

        $classSb = New-Object System.Text.StringBuilder 256
        [void][Win32CapCut]::GetClassName($hWnd, $classSb, $classSb.Capacity)
        $className = $classSb.ToString()
        if ($className -eq '#32770') {
            return $true
        }

        $len = [Win32CapCut]::GetWindowTextLength($hWnd)
        $title = ''
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder ($len + 1)
            [void][Win32CapCut]::GetWindowText($hWnd, $sb, $sb.Capacity)
            $title = $sb.ToString().Trim()
        }

        $script:windowMatches.Add([pscustomobject]@{
            Handle = $hWnd
            Title = $title
            ProcessId = [int]$procId
            ProcessName = [string]$script:capCutProcessById[[int]$procId]
            ClassName = $className
        }) | Out-Null
        return $true
    }

    [void][Win32CapCut]::EnumWindows($callback, [IntPtr]::Zero)
    if ($script:windowMatches.Count -eq 0) {
        return $null
    }

    return ($script:windowMatches | Sort-Object -Property @{
        Expression = {
            $t = [string]$_.Title
            $lower = $t.ToLowerInvariant()
            $procName = ([string]$_.ProcessName).ToLowerInvariant()
            if (($procName -eq 'capcut') -and ($lower -match 'untitled|sans titre|project|projet|capcut')) { 6 }
            elseif ($lower -match 'untitled|sans titre|project|projet') { 5 }
            elseif ($lower -match 'capcut') { 4 }
            elseif ($procName -eq 'capcut') { 3 }
            elseif ($t.Length -gt 0) { 2 }
            else { 1 }
        }
    }, @{
        Expression = { $_.Title.Length }
    } -Descending | Select-Object -First 1)
}

function Get-ProcessDialogWindow([int]$targetProcessId) {
    $targetProcessIds = @(Get-CapCutProcesses | Select-Object -ExpandProperty Id)
    if (-not $targetProcessIds -or $targetProcessIds.Count -eq 0) {
        $targetProcessIds = @($targetProcessId)
    }

    $script:dialogMatches = New-Object 'System.Collections.Generic.List[object]'
    $callback = [Win32CapCut+EnumWindowsProc] {
        param([IntPtr]$hWnd, [IntPtr]$lParam)

        if (-not [Win32CapCut]::IsWindowVisible($hWnd)) {
            return $true
        }

        $procId = [uint32]0
        [void][Win32CapCut]::GetWindowThreadProcessId($hWnd, [ref]$procId)
        if ($targetProcessIds -notcontains [int]$procId) {
            return $true
        }

        $classSb = New-Object System.Text.StringBuilder 256
        [void][Win32CapCut]::GetClassName($hWnd, $classSb, $classSb.Capacity)
        $className = $classSb.ToString()
        if ($className -ne '#32770') {
            return $true
        }

        $len = [Win32CapCut]::GetWindowTextLength($hWnd)
        $title = ''
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder ($len + 1)
            [void][Win32CapCut]::GetWindowText($hWnd, $sb, $sb.Capacity)
            $title = $sb.ToString().Trim()
        }

        $script:dialogMatches.Add([pscustomobject]@{
            Handle = $hWnd
            Title = $title
            ProcessId = [int]$procId
            ClassName = $className
        }) | Out-Null
        return $true
    }

    [void][Win32CapCut]::EnumWindows($callback, [IntPtr]::Zero)
    if ($script:dialogMatches.Count -eq 0) {
        return $null
    }

    return ($script:dialogMatches | Sort-Object -Property @{
        Expression = { $_.Title.Length }
    } -Descending | Select-Object -First 1)
}

function Set-CapCutForeground($window) {
    if ([Win32CapCut]::IsIconic($window.Handle)) {
        [Win32CapCut]::ShowWindow($window.Handle, [Win32CapCut]::SW_RESTORE) | Out-Null
        Start-Sleep -Milliseconds 300
    }

    [Win32CapCut]::SetForegroundWindow($window.Handle) | Out-Null
    [Win32CapCut]::BringWindowToTop($window.Handle) | Out-Null
    Start-Sleep -Milliseconds 350
}

function Click-Point([int]$x, [int]$y) {
    [Win32CapCut]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 80
    [Win32CapCut]::mouse_event([Win32CapCut]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [Win32CapCut]::mouse_event([Win32CapCut]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Get-AutomationRoot($window) {
    return [System.Windows.Automation.AutomationElement]::FromHandle($window.Handle)
}

function Find-ElementByRegex($root, [string[]]$patterns) {
    if (-not $root) {
        return $null
    }

    $all = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )

    foreach ($element in $all) {
        try {
            $name = [string]$element.Current.Name
            $automationId = [string]$element.Current.AutomationId
            $controlType = [string]$element.Current.ControlType.ProgrammaticName
            $text = ($name + ' ' + $automationId + ' ' + $controlType).ToLowerInvariant()
            foreach ($pattern in $patterns) {
                if ($text -match $pattern) {
                    return $element
                }
            }
        } catch {
        }
    }

    return $null
}

function Invoke-AutomationElement($element) {
    if (-not $element) {
        return $false
    }

    try {
        $invoke = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $invoke.Invoke()
        Start-Sleep -Milliseconds 600
        return $true
    } catch {
    }

    try {
        $element.SetFocus()
        $rect = $element.Current.BoundingRectangle
        if ($rect.Width -gt 1 -and $rect.Height -gt 1) {
            Click-Point ([int]($rect.Left + ($rect.Width / 2))) ([int]($rect.Top + ($rect.Height / 2)))
            Start-Sleep -Milliseconds 600
            return $true
        }
    } catch {
    }

    return $false
}

function Wait-CapCutImportDialog([int]$targetProcessId, [int]$attempts, [int]$delayMs) {
    for ($i = 0; $i -lt $attempts; $i++) {
        $dialog = Get-ProcessDialogWindow $targetProcessId
        if ($dialog) {
            return $dialog
        }
        Start-Sleep -Milliseconds $delayMs
    }

    return $null
}

function Click-CapCutImportFallback($window) {
    $rect = New-Object 'Win32CapCut+RECT'
    if ([Win32CapCut]::GetWindowRect($window.Handle, [ref]$rect)) {
        # CapCut's import button lives in the upper-left media panel in current desktop builds.
        Click-Point ($rect.Left + 130) ($rect.Top + 155)
        Start-Sleep -Milliseconds 700
        return $true
    }
    return $false
}

function Open-CapCutImportDialog($window) {
    Set-CapCutForeground $window
    $root = Get-AutomationRoot $window

    [System.Windows.Forms.SendKeys]::SendWait('^i')
    Start-Sleep -Milliseconds 350
    if (Wait-CapCutImportDialog $window.ProcessId 4 150) {
        return $true
    }

    $importPatterns = @(
        '(^|\s)import($|\s)',
        'import\s*media',
        'media\s*import',
        'add\s*media',
        'import\s*from\s*device',
        'upload\s*media',
        '(^|\s)importer($|\s)',
        'importer.*m.dia',
        'm.dia.*importer',
        'ajouter.*m.dia',
        'm.dia.*ajouter'
    )

    $newProjectPatterns = @(
        'new\s*project',
        'create\s*project',
        'start\s*creating',
        'start\s*editing',
        'blank\s*project',
        'untitled\s*project',
        'nouveau\s*projet',
        'cr.er\s*un\s*projet',
        'creer\s*un\s*projet',
        'commencer.*montage',
        'projet\s*vierge'
    )

    $importButton = Find-ElementByRegex $root $importPatterns
    if (-not $importButton) {
        $newProjectButton = Find-ElementByRegex $root $newProjectPatterns
        if ($newProjectButton) {
            [void](Invoke-AutomationElement $newProjectButton)
            Start-Sleep -Milliseconds 3000
            Set-CapCutForeground $window
            $root = Get-AutomationRoot $window
            $importButton = Find-ElementByRegex $root $importPatterns
        }
    }

    if ($importButton) {
        return (Invoke-AutomationElement $importButton)
    }

    return (Click-CapCutImportFallback $window)
}

function Set-DialogFileName($dialog, [string]$value) {
    try {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($dialog.Handle)
        $dialogRect = New-Object 'Win32CapCut+RECT'
        $hasDialogRect = [Win32CapCut]::GetWindowRect($dialog.Handle, [ref]$dialogRect)
        $minInputTop = [double]::NegativeInfinity
        if ($hasDialogRect) {
            $dialogHeight = [Math]::Max(1, $dialogRect.Bottom - $dialogRect.Top)
            $minInputTop = $dialogRect.Top + ($dialogHeight * 0.55)
        }

        $condition = New-Object System.Windows.Automation.PropertyCondition -ArgumentList @(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit
        )
        $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        $candidates = New-Object 'System.Collections.Generic.List[object]'

        foreach ($edit in $edits) {
            try {
                $name = ([string]$edit.Current.Name).ToLowerInvariant()
                $rect = $edit.Current.BoundingRectangle
                if ($hasDialogRect -and $rect.Top -lt $minInputTop) {
                    continue
                }
                $score = 0
                if ($name -match 'file\s*name|nom.*fichier|filename') {
                    $score += 100
                }
                if ($hasDialogRect) {
                    $score += [int][Math]::Max(0, $rect.Bottom - $minInputTop)
                }
                if ($rect.Width -gt 120) {
                    $score += 10
                }
                $candidates.Add([pscustomobject]@{
                    Element = $edit
                    Score = $score
                    Bottom = $rect.Bottom
                }) | Out-Null
            } catch {
            }
        }

        $target = $candidates |
            Sort-Object -Property @{ Expression = { $_.Score } }, @{ Expression = { $_.Bottom } } -Descending |
            Select-Object -First 1

        if ($target) {
            $valuePattern = $target.Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            $valuePattern.SetValue($value)
            return $true
        }
    } catch {
    }

    return $false
}

function Submit-DialogValue($dialog, [string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $false
    }

    [Win32CapCut]::SetForegroundWindow($dialog.Handle) | Out-Null
    Start-Sleep -Milliseconds 150

    if (-not (Set-DialogFileName $dialog $value)) {
        [System.Windows.Forms.SendKeys]::SendWait('%n')
        Start-Sleep -Milliseconds 120
        [System.Windows.Forms.Clipboard]::SetText($value)
        [System.Windows.Forms.SendKeys]::SendWait('^a')
        Start-Sleep -Milliseconds 80
        [System.Windows.Forms.SendKeys]::SendWait('^v')
        Start-Sleep -Milliseconds 220
    }

    [System.Windows.Forms.SendKeys]::SendWait('~')
    Start-Sleep -Milliseconds 350
    return $true
}

function Wait-DialogClosed([int]$targetProcessId, [int]$attempts, [int]$delayMs) {
    for ($i = 0; $i -lt $attempts; $i++) {
        $openDialog = Get-ProcessDialogWindow $targetProcessId
        if (-not $openDialog) {
            return $true
        }
        Start-Sleep -Milliseconds $delayMs
    }

    return $false
}

foreach ($p in $paths) {
    if (-not (Test-Path -LiteralPath $p)) {
        throw ('File not found: ' + $p)
    }
}

$window = Get-CapCutWindow
if (-not $window) {
    throw 'AMVERGE_NO_WINDOW: CapCut window not found. CapCut may still be loading.'
}

if (-not (Open-CapCutImportDialog $window)) {
    throw 'AMVERGE_NO_PROJECT: Open or create a CapCut project first.'
}

$dialog = $null
for ($i = 0; $i -lt 40; $i++) {
    $dialog = Get-ProcessDialogWindow $window.ProcessId
    if ($dialog) {
        break
    }
    Start-Sleep -Milliseconds 150
}

if (-not $dialog) {
    throw 'AMVERGE_NO_PROJECT: CapCut import dialog did not open. Open or create a CapCut project first.'
}

[Win32CapCut]::SetForegroundWindow($dialog.Handle) | Out-Null
Start-Sleep -Milliseconds 250

$fileNamePayload = ($paths | ForEach-Object { '"' + ($_.Replace('"', '""')) + '"' }) -join ' '
[void](Submit-DialogValue $dialog $fileNamePayload)

if (-not (Wait-DialogClosed $window.ProcessId 50 150)) {
    $stillOpen = Get-ProcessDialogWindow $window.ProcessId
    $stillOpenTitle = if ($stillOpen) { [string]$stillOpen.Title } else { '' }
    throw ('AMVERGE_INVALID_FILENAME: CapCut import dialog stayed open after path submit. Dialog=' + $stillOpenTitle)
}

Write-Output 'CapCut media import complete.'
"#;

    template.replace("__FILES__", &files)
}
