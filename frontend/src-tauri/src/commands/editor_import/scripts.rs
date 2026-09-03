use std::fs;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use super::staging::normalize_windows_editor_import_path;

#[cfg(target_os = "windows")]
pub(crate) fn escape_jsx_double_quoted(raw: &str) -> String {
    raw.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\r', "\\r")
        .replace('\n', "\\n")
}

pub(crate) fn runtime_temp_path(prefix: &str, extension: &str) -> Result<PathBuf, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let mut path = script_runtime_dir();
    fs::create_dir_all(&path).map_err(|e| {
        format!(
            "Failed to create script runtime directory ({}): {e}",
            path.display()
        )
    })?;

    path.push(format!(
        "{prefix}_{}_{}.{}",
        std::process::id(),
        ts,
        extension
    ));

    Ok(path)
}

pub(crate) fn write_temp_script(prefix: &str, extension: &str, content: &str) -> Result<PathBuf, String> {
    let path = runtime_temp_path(prefix, extension)?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write temp script {}: {e}", path.display()))?;
    Ok(path)
}

pub(crate) fn script_runtime_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data)
                .join("AMVerge")
                .join("runtime_scripts");
        }
    }

    std::env::temp_dir().join("amverge").join("runtime_scripts")
}

#[cfg(target_os = "windows")]
pub(crate) fn build_editor_ui_import_ps(
    media_paths: &[String],
    process_name: &str,
    editor_name: &str,
    no_window_error: &str,
    no_project_error: &str,
    window_title_match_expression: &str,
    project_ready_expression: &str,
    dialog_reject_expression: &str,
) -> String {
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
public class Win32Focus {{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {{
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }}
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern int GetDlgCtrlID(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool SetDlgItemText(IntPtr hDlg, int nIDDlgItem, string lpString);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam);
    public const int SW_RESTORE = 9;
    public const uint WM_SETTEXT = 0x000C;
    public const uint WM_USER = 0x0400;
    public const uint CDM_FIRST = WM_USER + 100;
    public const uint CDM_SETCONTROLTEXT = CDM_FIRST + 4;
}}
'@ -ErrorAction SilentlyContinue

$paths = @(
    __FILES__
)

$CDLG_CMB13 = 0x47C
$CDLG_EDT1 = 0x480
$COMMON_EDIT_CLASSES = @('edit', 'combobox', 'comboboxex32', 'richedit20w')

function Get-EditorWindow([string]$processName) {{
    $procs = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
    if ((-not $procs -or $procs.Count -eq 0) -and $processName.Contains('*')) {{
        $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {{ $_.ProcessName -like $processName }})
    }}
    $procIds = @($procs | Select-Object -ExpandProperty Id)
    if (-not $procIds -or $procIds.Count -eq 0) {{
        return $null
    }}

    $script:windowMatches = New-Object 'System.Collections.Generic.List[object]'
    $callback = [Win32Focus+EnumWindowsProc] {{
        param([IntPtr]$hWnd, [IntPtr]$lParam)

        if (-not [Win32Focus]::IsWindowVisible($hWnd)) {{
            return $true
        }}

        $len = [Win32Focus]::GetWindowTextLength($hWnd)
        if ($len -le 0) {{
            return $true
        }}

        $sb = New-Object System.Text.StringBuilder ($len + 1)
        [void][Win32Focus]::GetWindowText($hWnd, $sb, $sb.Capacity)
        $title = $sb.ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($title)) {{
            return $true
        }}

        $titleLower = $title.ToLowerInvariant()
        if (-not (__WINDOW_TITLE_MATCH_EXPRESSION__)) {{
            return $true
        }}

        $procId = [uint32]0
        [void][Win32Focus]::GetWindowThreadProcessId($hWnd, [ref]$procId)
        if ($procIds -contains [int]$procId) {{
            $classSb = New-Object System.Text.StringBuilder 256
            [void][Win32Focus]::GetClassName($hWnd, $classSb, $classSb.Capacity)
            $className = $classSb.ToString()
            if ($className -eq '#32770') {{
                return $true
            }}

            $script:windowMatches.Add([pscustomobject]@{{
                Handle = $hWnd
                Title = $title
                ProcessId = [int]$procId
                ClassName = $className
            }}) | Out-Null
        }}

        return $true
    }}

    [void][Win32Focus]::EnumWindows($callback, [IntPtr]::Zero)
    if ($script:windowMatches.Count -eq 0) {{
        return $null
    }}

    $best = $script:windowMatches |
        Sort-Object -Property @{{
            Expression = {{
                $t = $_.Title.ToLowerInvariant()
                if (($t -match '\.aep') -and ($t -notmatch 'untitled|sans titre')) {{ 5 }}
                elseif ($t -match '\.prproj') {{ 5 }}
                elseif ($t -match 'home|accueil') {{ 0 }}
                elseif ($t -match 'untitled|sans titre') {{ 1 }}
                elseif ($t -match 'project|projet') {{ 2 }}
                else {{ 2 }}
            }}
        }}, @{{
            Expression = {{ $_.Title.Length }}
        }} -Descending |
        Select-Object -First 1

    return $best
}}

function Get-ProcessDialogWindow([int]$targetProcessId) {{
    $script:dialogMatches = New-Object 'System.Collections.Generic.List[object]'
    $callback = [Win32Focus+EnumWindowsProc] {{
        param([IntPtr]$hWnd, [IntPtr]$lParam)

        if (-not [Win32Focus]::IsWindowVisible($hWnd)) {{
            return $true
        }}

        $procId = [uint32]0
        [void][Win32Focus]::GetWindowThreadProcessId($hWnd, [ref]$procId)
        if ([int]$procId -ne $targetProcessId) {{
            return $true
        }}

        $classSb = New-Object System.Text.StringBuilder 256
        [void][Win32Focus]::GetClassName($hWnd, $classSb, $classSb.Capacity)
        $className = $classSb.ToString()
        if ($className -ne '#32770') {{
            return $true
        }}

        $len = [Win32Focus]::GetWindowTextLength($hWnd)
        $title = ''
        if ($len -gt 0) {{
            $sb = New-Object System.Text.StringBuilder ($len + 1)
            [void][Win32Focus]::GetWindowText($hWnd, $sb, $sb.Capacity)
            $title = $sb.ToString().Trim()
        }}

        $script:dialogMatches.Add([pscustomobject]@{{
            Handle = $hWnd
            Title = $title
            ProcessId = [int]$procId
            ClassName = $className
        }}) | Out-Null

        return $true
    }}

    [void][Win32Focus]::EnumWindows($callback, [IntPtr]::Zero)
    if ($script:dialogMatches.Count -eq 0) {{
        return $null
    }}

    return ($script:dialogMatches | Sort-Object -Property @{{
        Expression = {{ $_.Title.Length }}
    }} -Descending | Select-Object -First 1)
}}

function Test-IsForegroundProcess([int]$targetProcessId) {{
    $foreground = [Win32Focus]::GetForegroundWindow()
    if ($foreground -eq [IntPtr]::Zero) {{
        return $false
    }}

    $foregroundProcessId = [uint32]0
    [void][Win32Focus]::GetWindowThreadProcessId($foreground, [ref]$foregroundProcessId)
    return ([int]$foregroundProcessId -eq $targetProcessId)
}}

function Set-EditorForeground([IntPtr]$hwnd, [int]$targetProcessId) {{
    if ([Win32Focus]::IsIconic($hwnd)) {{
        [Win32Focus]::ShowWindow($hwnd, [Win32Focus]::SW_RESTORE) | Out-Null
        Start-Sleep -Milliseconds 250
    }}

    [Win32Focus]::SetForegroundWindow($hwnd) | Out-Null
    [Win32Focus]::BringWindowToTop($hwnd) | Out-Null
    Start-Sleep -Milliseconds 250

    if (Test-IsForegroundProcess $targetProcessId) {{
        return $true
    }}

    try {{
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.AppActivate($targetProcessId)
    }} catch {{
    }}
    Start-Sleep -Milliseconds 250

    if (Test-IsForegroundProcess $targetProcessId) {{
        return $true
    }}

    $foreground = [Win32Focus]::GetForegroundWindow()
    $scratch = [uint32]0
    $foregroundThread = [Win32Focus]::GetWindowThreadProcessId($foreground, [ref]$scratch)
    $appThread = [Win32Focus]::GetWindowThreadProcessId($hwnd, [ref]$scratch)

    if ($foregroundThread -ne $appThread) {{
        [Win32Focus]::AttachThreadInput($foregroundThread, $appThread, $true) | Out-Null
        [Win32Focus]::SetForegroundWindow($hwnd) | Out-Null
        [Win32Focus]::BringWindowToTop($hwnd) | Out-Null
        [Win32Focus]::AttachThreadInput($foregroundThread, $appThread, $false) | Out-Null
        Start-Sleep -Milliseconds 250
    }}

    return (Test-IsForegroundProcess $targetProcessId)
}}

function Set-DialogFileName($dialog, [string]$value) {{
    if ([string]::IsNullOrWhiteSpace($value)) {{
        return $false
    }}

    # Explorer-style API contract way.
    foreach ($controlId in @($CDLG_EDT1, $CDLG_CMB13)) {{
        try {{
            [void][Win32Focus]::SendMessage(
                $dialog.Handle,
                [Win32Focus]::CDM_SETCONTROLTEXT,
                [IntPtr]$controlId,
                $value
            )
        }} catch {{
        }}
    }}

    # Prefer native Win32 control IDs for Explorer-style file dialogs:
    # cmb13 (0x47C) and edt1 (0x480).
    foreach ($controlId in @($CDLG_EDT1, $CDLG_CMB13)) {{
        try {{
            $ctrl = [Win32Focus]::GetDlgItem($dialog.Handle, $controlId)
            if ($ctrl -ne [IntPtr]::Zero) {{
                [void][Win32Focus]::SendMessage($ctrl, [Win32Focus]::WM_SETTEXT, [IntPtr]::Zero, $value)
                if ([Win32Focus]::SetDlgItemText($dialog.Handle, $controlId, $value)) {{
                    return $true
                }}
                return $true
            }}
        }} catch {{
        }}
    }}

    # Fallback: scan child controls and write to Edit/Combo controls directly.
    try {{
        $script:candidateHandles = New-Object 'System.Collections.Generic.List[object]'
        $enumChild = [Win32Focus+EnumWindowsProc] {{
            param([IntPtr]$hWnd, [IntPtr]$lParam)
            try {{
                $classSb = New-Object System.Text.StringBuilder 256
                [void][Win32Focus]::GetClassName($hWnd, $classSb, $classSb.Capacity)
                $cls = $classSb.ToString().ToLowerInvariant()
                if ($COMMON_EDIT_CLASSES -contains $cls) {{
                    $script:candidateHandles.Add($hWnd) | Out-Null
                }}
            }} catch {{
            }}
            return $true
        }}
        [void][Win32Focus]::EnumChildWindows($dialog.Handle, $enumChild, [IntPtr]::Zero)

        for ($i = 0; $i -lt $script:candidateHandles.Count; $i++) {{
            $h = $script:candidateHandles.Item($i)
            try {{
                [void][Win32Focus]::SendMessage($h, [Win32Focus]::WM_SETTEXT, [IntPtr]::Zero, $value)
                $id = [Win32Focus]::GetDlgCtrlID($h)
                if ($id -gt 0) {{
                    if ([Win32Focus]::SetDlgItemText($dialog.Handle, $id, $value)) {{
                        return $true
                    }}
                }}
            }} catch {{
            }}
        }}
    }} catch {{
    }}

    try {{
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($dialog.Handle)
        if (-not $root) {{
            return $false
        }}

        $dialogRect = New-Object 'Win32Focus+RECT'
        $hasDialogRect = [Win32Focus]::GetWindowRect($dialog.Handle, [ref]$dialogRect)
        $minInputTop = [double]::NegativeInfinity
        if ($hasDialogRect) {{
            $dialogHeight = [Math]::Max(1, $dialogRect.Bottom - $dialogRect.Top)
            $minInputTop = $dialogRect.Top + ($dialogHeight * 0.55)
        }}

        $condition = New-Object System.Windows.Automation.PropertyCondition -ArgumentList @(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit
        )
        $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        if (-not $edits -or $edits.Count -eq 0) {{
            return $false
        }}

        $target = $null
        $bestScore = [double]::NegativeInfinity
        for ($i = 0; $i -lt $edits.Count; $i++) {{
            $edit = $edits.Item($i)
            if (-not $edit) {{
                continue
            }}

            $score = 0.0
            try {{
                $name = ([string]$edit.Current.Name).ToLowerInvariant()
                if ($name -match 'file\s*name|nom.*fichier|filename') {{
                    $score += 1000
                }}
            }} catch {{
            }}

            try {{
                $automationId = ([string]$edit.Current.AutomationId).ToLowerInvariant()
                if ($automationId -match '^(1148|1152)$') {{
                    $score += 2000
                }}
                if ($automationId -match 'file|name') {{
                    $score += 400
                }}
            }} catch {{
            }}

            try {{
                $rect = $edit.Current.BoundingRectangle
                if ($hasDialogRect -and $rect.Top -lt $minInputTop) {{
                    continue
                }}
                $score += [double]$rect.Bottom
                if ($rect.Width -gt 120) {{
                    $score += 100
                }}
            }} catch {{
            }}

            if ($score -gt $bestScore) {{
                $bestScore = $score
                $target = $edit
            }}
        }}

        if (-not $target) {{
            return $false
        }}

        $valuePattern = $target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if (-not $valuePattern) {{
            return $false
        }}
        $valuePattern.SetValue($value)
        return $true
    }} catch {{
    }}

    return $false
}}

function Submit-DialogValue($dialog, [string]$value) {{
    [Win32Focus]::SetForegroundWindow($dialog.Handle) | Out-Null
    Start-Sleep -Milliseconds 120

    if (-not (Set-DialogFileName $dialog $value)) {{
        throw ('AMVERGE_FILENAME_FIELD_NOT_FOUND: Unable to target "File name" field for path: ' + $value)
    }}

    [System.Windows.Forms.SendKeys]::SendWait('~')
    Start-Sleep -Milliseconds 260
}}

$window = Get-EditorWindow '__PROCESS_NAME__'
if (-not $window) {{
    throw '__NO_WINDOW_ERROR__'
}}

$title = [string]$window.Title
$titleLower = $title.ToLowerInvariant()
$projectReady = __PROJECT_READY_EXPRESSION__
if (-not $projectReady) {{
    throw ('__NO_PROJECT_ERROR__ (window title: ' + $title + ')')
}}

if (-not (Set-EditorForeground $window.Handle $window.ProcessId)) {{
    throw 'AMVERGE_FOCUS_FAILED: Could not bring __EDITOR_NAME__ to foreground.'
}}

# --- Import each file via Ctrl+I shortcut ---
foreach ($p in $paths) {{
    if (-not (Test-Path -LiteralPath $p)) {{
        throw ('File not found: ' + $p)
    }}

    if (-not (Set-EditorForeground $window.Handle $window.ProcessId)) {{
        throw 'AMVERGE_FOCUS_FAILED: Could not keep __EDITOR_NAME__ in foreground.'
    }}

    # Open Import dialog
    [System.Windows.Forms.SendKeys]::SendWait('^i')
    Start-Sleep -Milliseconds 200

    $dialog = $null
    for ($i = 0; $i -lt 18; $i++) {{
        $dialog = Get-ProcessDialogWindow $window.ProcessId
        if ($dialog) {{
            break
        }}
        Start-Sleep -Milliseconds 120
    }}

    if (-not $dialog) {{
        throw '__NO_PROJECT_ERROR__'
    }}

    $dialogTitleLower = [string]$dialog.Title
    $dialogTitleLower = $dialogTitleLower.ToLowerInvariant()
    if (__DIALOG_REJECT_EXPRESSION__) {{
        throw ('__NO_PROJECT_ERROR__ (dialog title: ' + $dialog.Title + ')')
    }}

    Submit-DialogValue $dialog $p

    for ($i = 0; $i -lt 30; $i++) {{
        $stillOpen = Get-ProcessDialogWindow $window.ProcessId
        if (-not $stillOpen) {{
            break
        }}
        Start-Sleep -Milliseconds 120
    }}

    if ($stillOpen) {{
        $stillOpenTitle = [string]$stillOpen.Title
        throw ('AMVERGE_INVALID_FILENAME: Import dialog stayed open after path submit. Path=' + $p + '; Dialog=' + $stillOpenTitle)
    }}

    Start-Sleep -Milliseconds 350
}}

Write-Output '__EDITOR_NAME__ import complete.'
"#;

    let normalized_template = template.replace("{{", "{").replace("}}", "}");

    normalized_template
        .replace("__FILES__", &files)
        .replace("__PROCESS_NAME__", process_name)
        .replace("__EDITOR_NAME__", editor_name)
        .replace("__NO_WINDOW_ERROR__", no_window_error)
        .replace("__NO_PROJECT_ERROR__", no_project_error)
        .replace(
            "__WINDOW_TITLE_MATCH_EXPRESSION__",
            window_title_match_expression,
        )
        .replace("__PROJECT_READY_EXPRESSION__", project_ready_expression)
        .replace("__DIALOG_REJECT_EXPRESSION__", dialog_reject_expression)
}

#[cfg(target_os = "windows")]
pub(crate) fn escape_ps_single_quoted(raw: &str) -> String {
    raw.replace('\'', "''")
}
