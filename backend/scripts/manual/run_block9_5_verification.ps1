$ErrorActionPreference = "Stop"

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$blockNamespace = "block9_5_$timestamp"

$env:SOLA_VERIFICATION_NAMESPACE = $blockNamespace

if (-not $env:SOLA_BASE_URL) {
    $env:SOLA_BASE_URL = "http://127.0.0.1:8000"
}

$env:RATE_LIMIT_BACKEND = "memory"
$env:AUTH_RATE_LIMIT_WINDOW_SECONDS = "300"
$env:AUTH_REGISTER_ATTEMPTS_PER_IP = "200"
$env:AUTH_REGISTER_ATTEMPTS_PER_IDENTIFIER = "200"
$env:AUTH_LOGIN_ATTEMPTS_PER_IP = "200"
$env:AUTH_LOGIN_ATTEMPTS_PER_IDENTIFIER = "200"
$env:AUTH_REFRESH_ATTEMPTS_PER_IP = "200"
$env:AUTH_REFRESH_ATTEMPTS_PER_IDENTIFIER = "200"

$root = (Get-Location).Path
$logsDir = Join-Path $root "test_reports\block9_5_$timestamp"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$combinedLog = Join-Path $logsDir "00_block9_5_full_report.log"
$summaryLog = Join-Path $logsDir "00_block9_5_summary.txt"

$steps = @(
    @{
        Name = "Assistant 9.5 Governance Boundaries"
        LogFile = "01_assistant_block9_5_governance_boundaries.log"
        Command = "python -u -m scripts.manual.test_assistant_block9_governance_boundaries"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${blockNamespace}_governance_boundaries"
        }
    },
    @{
        Name = "Assistant 9.5 Action Revalidation"
        LogFile = "02_assistant_block9_5_action_revalidation.log"
        Command = "python -u -m scripts.manual.test_assistant_block9_action_revalidation"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${blockNamespace}_action_revalidation"
        }
    }
)

function Write-Header {
    param(
        [string]$Title,
        [string]$TargetFile
    )

@"
============================================================
$Title
============================================================

"@ | Out-File -FilePath $TargetFile -Append -Encoding utf8
}

function Append-Text {
    param(
        [string]$Text,
        [string]$TargetFile
    )

    $Text | Out-File -FilePath $TargetFile -Append -Encoding utf8
}

function Build-CommandPrefix {
    param(
        [hashtable]$EnvironmentOverrides
    )

    if ($null -eq $EnvironmentOverrides -or $EnvironmentOverrides.Count -eq 0) {
        return ""
    }

    $parts = @()

    foreach ($entry in $EnvironmentOverrides.GetEnumerator()) {
        $name = [string]$entry.Key
        $value = [string]$entry.Value
        $escapedValue = $value.Replace('"', '\"')
        $parts += "set `"$name=$escapedValue`""
    }

    return ($parts -join " && ") + " && "
}

function Run-StepCommand {
    param(
        [string]$Command,
        [hashtable]$EnvironmentOverrides
    )

    $commandPrefix = Build-CommandPrefix -EnvironmentOverrides $EnvironmentOverrides
    $wrappedCommand = $commandPrefix + $Command + " 2>&1"

    $outputLines = & cmd.exe /d /c $wrappedCommand
    $exitCode = $LASTEXITCODE

    $outputText = ""
    if ($null -ne $outputLines) {
        $outputText = ($outputLines | Out-String)
    }

    return @{
        OutputText = $outputText
        ExitCode   = $exitCode
    }
}

Write-Header -Title "BLOCK 9.5 VERIFICATION START" -TargetFile $combinedLog
Write-Header -Title "BLOCK 9.5 VERIFICATION SUMMARY" -TargetFile $summaryLog

Append-Text -Text ("BLOCK VERIFICATION NAMESPACE: " + $blockNamespace + "`r`n") -TargetFile $combinedLog
Append-Text -Text ("BLOCK VERIFICATION NAMESPACE: " + $blockNamespace + "`r`n") -TargetFile $summaryLog

$failedSteps = @()

foreach ($step in $steps) {
    $stepLog = Join-Path $logsDir $step.LogFile

    Write-Header -Title $step.Name -TargetFile $stepLog
    Write-Header -Title $step.Name -TargetFile $combinedLog

    Append-Text -Text ("COMMAND: " + $step.Command + "`r`n") -TargetFile $stepLog
    Append-Text -Text ("COMMAND: " + $step.Command + "`r`n") -TargetFile $combinedLog

    if ($step.Environment.Count -gt 0) {
        $envDescription = ($step.Environment.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "; "
        Append-Text -Text ("ENVIRONMENT: " + $envDescription + "`r`n") -TargetFile $stepLog
        Append-Text -Text ("ENVIRONMENT: " + $envDescription + "`r`n") -TargetFile $combinedLog
    }

    $result = Run-StepCommand -Command $step.Command -EnvironmentOverrides $step.Environment
    $output = $result.OutputText
    $exitCode = $result.ExitCode

    if ([string]::IsNullOrWhiteSpace($output)) {
        $output = "(no output)`r`n"
    }

    Append-Text -Text $output -TargetFile $stepLog
    Append-Text -Text $output -TargetFile $combinedLog

    if ($exitCode -eq 0) {
        $statusLine = "STATUS: PASSED"
    }
    else {
        $statusLine = "STATUS: FAILED (exit code $exitCode)"
        $failedSteps += $step.Name
    }

    Append-Text -Text ("`r`n" + $statusLine + "`r`n") -TargetFile $stepLog
    Append-Text -Text ("`r`n" + $statusLine + "`r`n") -TargetFile $combinedLog
    Append-Text -Text ($step.Name + " -> " + $statusLine) -TargetFile $summaryLog
}

if ($failedSteps.Count -eq 0) {
    Write-Header -Title "BLOCK 9.5 VERIFICATION COMPLETED SUCCESSFULLY" -TargetFile $combinedLog
    Append-Text -Text "OVERALL STATUS: PASSED" -TargetFile $summaryLog

    Write-Host ""
    Write-Host "Block 9.5 verification completed successfully."
    Write-Host "Logs folder: $logsDir"
    Write-Host "Combined report: $combinedLog"
    Write-Host "Summary report: $summaryLog"
    exit 0
}
else {
    Write-Header -Title "BLOCK 9.5 VERIFICATION COMPLETED WITH FAILURES" -TargetFile $combinedLog
    Append-Text -Text ("OVERALL STATUS: FAILED`r`nFAILED STEPS: " + ($failedSteps -join ", ")) -TargetFile $summaryLog

    Write-Host ""
    Write-Host "Block 9.5 verification completed with failures."
    Write-Host "Logs folder: $logsDir"
    Write-Host "Combined report: $combinedLog"
    Write-Host "Summary report: $summaryLog"
    Write-Host "Failed steps: $($failedSteps -join ', ')"
    exit 1
}