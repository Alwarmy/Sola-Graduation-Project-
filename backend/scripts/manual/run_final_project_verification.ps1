$ErrorActionPreference = "Stop"

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$baseVerificationNamespace = "final_$timestamp"

$env:SOLA_VERIFICATION_NAMESPACE = $baseVerificationNamespace

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
$logsDir = Join-Path $root "test_reports\final_verification_$timestamp"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$combinedLog = Join-Path $logsDir "00_final_full_report.log"
$summaryLog = Join-Path $logsDir "00_final_summary.txt"

$steps = @(
    @{
        Name = "Alembic Upgrade Head"
        LogFile = "01_alembic_upgrade_head.log"
        Command = "alembic upgrade head"
        Environment = @{}
    },
    @{
        Name = "Full Pytest Suite"
        LogFile = "02_full_pytest_suite.log"
        Command = "python -u -m pytest"
        Environment = @{}
    },
    @{
        Name = "Platform Integrated End To End"
        LogFile = "03_platform_integrated_end_to_end.log"
        Command = "python -u -m scripts.manual.test_platform_integrated_end_to_end"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${baseVerificationNamespace}_platform_e2e"
        }
    },
    @{
        Name = "Platform Full System Regression"
        LogFile = "04_platform_full_system_regression.log"
        Command = "python -u -m scripts.manual.test_platform_full_system_regression"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${baseVerificationNamespace}_platform_regression"
        }
    },
    @{
        Name = "Assistant Block9 Verification"
        LogFile = "05_assistant_block9_verification.log"
        Command = "powershell -ExecutionPolicy Bypass -File .\scripts\manual\run_block9_verification.ps1"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${baseVerificationNamespace}_block9"
        }
    },
    @{
        Name = "Assistant Block9.5 Verification"
        LogFile = "06_assistant_block9_5_verification.log"
        Command = "powershell -ExecutionPolicy Bypass -File .\scripts\manual\run_block9_5_verification.ps1"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${baseVerificationNamespace}_block9_5"
        }
    },
    @{
        Name = "Assistant Block9.6 Verification"
        LogFile = "07_assistant_block9_6_verification.log"
        Command = "powershell -ExecutionPolicy Bypass -File .\scripts\manual\run_block9_6_verification.ps1"
        Environment = @{
            SOLA_VERIFICATION_NAMESPACE = "${baseVerificationNamespace}_block9_6"
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

Write-Header -Title "FINAL PROJECT VERIFICATION START" -TargetFile $combinedLog
Write-Header -Title "FINAL PROJECT VERIFICATION SUMMARY" -TargetFile $summaryLog

Append-Text -Text ("VERIFICATION NAMESPACE: " + $baseVerificationNamespace + "`r`n") -TargetFile $combinedLog
Append-Text -Text ("VERIFICATION NAMESPACE: " + $baseVerificationNamespace + "`r`n") -TargetFile $summaryLog

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
    Write-Header -Title "FINAL PROJECT VERIFICATION COMPLETED SUCCESSFULLY" -TargetFile $combinedLog
    Append-Text -Text "OVERALL STATUS: PASSED" -TargetFile $summaryLog

    Write-Host ""
    Write-Host "Final project verification completed successfully."
    Write-Host "Logs folder: $logsDir"
    Write-Host "Combined report: $combinedLog"
    Write-Host "Summary report: $summaryLog"
    exit 0
}
else {
    Write-Header -Title "FINAL PROJECT VERIFICATION COMPLETED WITH FAILURES" -TargetFile $combinedLog
    Append-Text -Text ("OVERALL STATUS: FAILED`r`nFAILED STEPS: " + ($failedSteps -join ", ")) -TargetFile $summaryLog

    Write-Host ""
    Write-Host "Final project verification completed with failures."
    Write-Host "Logs folder: $logsDir"
    Write-Host "Combined report: $combinedLog"
    Write-Host "Summary report: $summaryLog"
    Write-Host "Failed steps: $($failedSteps -join ', ')"
    exit 1
}