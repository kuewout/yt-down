import platform
import subprocess
from pathlib import Path


class FolderPickerError(RuntimeError):
    pass


def pick_directory(initial_path: str | None = None) -> str | None:
    system = platform.system()
    if system == "Darwin":
        return _pick_directory_macos(initial_path)
    if system == "Windows":
        return _pick_directory_windows(initial_path)
    return _pick_directory_linux(initial_path)


def _pick_directory_macos(initial_path: str | None) -> str | None:
    script_lines = ['set promptText to "Select playlist download folder"']
    if initial_path:
        script_lines.append(
            f'set defaultFolder to POSIX file "{_escape_applescript_text(initial_path)}"'
        )
        script_lines.append(
            "set pickedFolder to choose folder with prompt promptText default location defaultFolder"
        )
    else:
        script_lines.append("set pickedFolder to choose folder with prompt promptText")
    script_lines.append("POSIX path of pickedFolder")

    command = ["osascript"]
    for line in script_lines:
        command.extend(["-e", line])

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        if "User canceled" in result.stderr:
            return None
        raise FolderPickerError(
            result.stderr.strip() or "Failed to open macOS folder picker"
        )

    selected = result.stdout.strip()
    return _normalize_selected_path(selected)


def _pick_directory_windows(initial_path: str | None) -> str | None:
    initial_literal = (
        _escape_powershell_single_quote(initial_path) if initial_path else None
    )
    initial_block = ""
    if initial_literal:
        initial_block = (
            f"$initialPath = '{initial_literal}'\n"
            "if (Test-Path -LiteralPath $initialPath) {\n"
            "  $dialog.SelectedPath = $initialPath\n"
            "}\n"
        )

    script = (
        "Add-Type -AssemblyName System.Windows.Forms\n"
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog\n"
        '$dialog.Description = "Select playlist download folder"\n'
        "$dialog.ShowNewFolderButton = $true\n"
        f"{initial_block}"
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {\n"
        "  Write-Output $dialog.SelectedPath\n"
        "}\n"
    )

    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise FolderPickerError(
            result.stderr.strip() or "Failed to open Windows folder picker"
        )

    selected = result.stdout.strip()
    if not selected:
        return None
    return _normalize_selected_path(selected)


def _pick_directory_linux(initial_path: str | None) -> str | None:
    commands: list[list[str]] = []
    if initial_path:
        commands.append(
            [
                "zenity",
                "--file-selection",
                "--directory",
                "--filename",
                f"{str(Path(initial_path).expanduser())}/",
                "--title",
                "Select playlist download folder",
            ]
        )
        commands.append(
            [
                "kdialog",
                "--getexistingdirectory",
                str(Path(initial_path).expanduser()),
                "--title",
                "Select playlist download folder",
            ]
        )
    else:
        commands.append(
            [
                "zenity",
                "--file-selection",
                "--directory",
                "--title",
                "Select playlist download folder",
            ]
        )
        commands.append(["kdialog", "--getexistingdirectory", "."])

    for command in commands:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            continue

        if result.returncode == 0:
            return _normalize_selected_path(result.stdout.strip())
        if result.returncode == 1:
            return None

    raise FolderPickerError(
        "No supported folder picker found. Install zenity or kdialog."
    )


def _normalize_selected_path(path_text: str) -> str | None:
    if not path_text:
        return None
    return str(Path(path_text).expanduser().resolve())


def _escape_applescript_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _escape_powershell_single_quote(value: str) -> str:
    return value.replace("'", "''")
