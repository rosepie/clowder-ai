using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        bool createdNew;
        using (var mutex = new Mutex(true, @"Local\ClowderAI.WebView2Desktop", out createdNew))
        {
            if (!createdNew)
            {
                MessageBox.Show(
                    "Clowder AI is already running.",
                    "Clowder AI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }
}

internal sealed class LauncherForm : Form
{
    private readonly object _logLock = new object();
    private readonly NotifyIcon _notifyIcon;
    private readonly Label _statusLabel;
    private readonly string _projectRoot;
    private readonly string _logFilePath;
    private readonly string _runtimeStatePath;
    private Process _serviceHostProcess;
    private bool _serviceStartedByLauncher;
    private bool _exitRequested;
    private bool _trayHintShown;
    private string _frontendUrl;
    private WebView2 _webView;

    public LauncherForm()
    {
        _projectRoot = ResolveProjectRoot();
        _logFilePath = Path.Combine(_projectRoot, "logs", "desktop-launcher.log");
        _runtimeStatePath = Path.Combine(_projectRoot, ".cat-cafe", "run", "windows", "runtime-state.json");
        Directory.CreateDirectory(Path.GetDirectoryName(_logFilePath) ?? _projectRoot);
        _frontendUrl = BuildFrontendUrl();

        Text = "Clowder AI";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 640);
        ClientSize = new Size(1440, 960);
        WindowState = FormWindowState.Maximized;
        Icon = ResolveAppIcon();
        _notifyIcon = CreateNotifyIcon();

        _statusLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 14f, FontStyle.Regular),
            Text = "Preparing Clowder AI...",
            AutoEllipsis = true,
        };

        Controls.Add(_statusLabel);
        Shown += async (_, __) => await InitializeAsync();
        FormClosing += OnFormClosing;
        FormClosed += (_, __) => DisposeNotifyIcon();
    }

    private async Task InitializeAsync()
    {
        try
        {
            UpdateStatus("Checking local workspace services...");
            AppendLog("Launcher boot started.");
            TryRefreshFrontendUrlFromRuntimeState();

            if (!await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                UpdateStatus("Starting local services...");
                StartManagedServices();
                _serviceStartedByLauncher = true;
            }
            else
            {
                AppendLog("Frontend already running - reusing existing services.");
            }

            UpdateStatus("Waiting for UI...");
            await WaitForFrontendAsync(TimeSpan.FromMinutes(2)).ConfigureAwait(true);

            UpdateStatus("Opening desktop window...");
            await InitializeWebViewAsync().ConfigureAwait(true);
            AppendLog("Desktop window ready.");
        }
        catch (Exception ex)
        {
            AppendLog("Launcher failed: " + ex);
            MessageBox.Show(
                this,
                ex.Message + Environment.NewLine + Environment.NewLine + "See log: " + _logFilePath,
                "Clowder AI",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            RequestExit();
        }
    }

    private static string ResolveProjectRoot()
    {
        return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private string BuildFrontendUrl()
    {
        if (TryRefreshFrontendUrlFromRuntimeState())
        {
            return _frontendUrl;
        }

        var port = ReadPortFromEnv("FRONTEND_PORT", 3003);
        return "http://127.0.0.1:" + port + "/";
    }

    private Icon ResolveAppIcon()
    {
        try
        {
            return Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch
        {
            return SystemIcons.Application;
        }
    }

    private NotifyIcon CreateNotifyIcon()
    {
        var contextMenu = new ContextMenuStrip();
        contextMenu.Items.Add("Open Clowder AI", null, (_, __) => RestoreFromTray());
        contextMenu.Items.Add("Exit", null, (_, __) => RequestExit());

        var notifyIcon = new NotifyIcon
        {
            Text = "Clowder AI",
            Visible = true,
            Icon = Icon ?? SystemIcons.Application,
            ContextMenuStrip = contextMenu,
        };
        notifyIcon.DoubleClick += (_, __) => RestoreFromTray();
        return notifyIcon;
    }

    private void DisposeNotifyIcon()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }

    private void OnFormClosing(object sender, FormClosingEventArgs eventArgs)
    {
        if (!_exitRequested && eventArgs.CloseReason == CloseReason.UserClosing)
        {
            eventArgs.Cancel = true;
            HideToTray();
            return;
        }

        _notifyIcon.Visible = false;
        StopManagedServices();
    }

    private void HideToTray()
    {
        ShowInTaskbar = false;
        WindowState = FormWindowState.Minimized;
        Hide();
        _notifyIcon.Visible = true;
        if (!_trayHintShown)
        {
            _notifyIcon.ShowBalloonTip(
                2500,
                "Clowder AI",
                "Clowder AI is still running here. Use the tray icon menu to exit.",
                ToolTipIcon.Info
            );
            _trayHintShown = true;
        }
    }

    private void RestoreFromTray()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)RestoreFromTray);
            return;
        }

        Show();
        ShowInTaskbar = true;
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void RequestExit()
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke((Action)RequestExit);
            return;
        }

        if (_exitRequested)
        {
            return;
        }

        _exitRequested = true;
        ShowInTaskbar = true;
        Close();
    }

    private int ReadPortFromEnv(string key, int fallback)
    {
        try
        {
            var envPath = Path.Combine(_projectRoot, ".env");
            if (!File.Exists(envPath))
            {
                return fallback;
            }

            foreach (var rawLine in File.ReadAllLines(envPath))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
                {
                    continue;
                }

                var separatorIndex = line.IndexOf('=');
                if (separatorIndex <= 0)
                {
                    continue;
                }

                var candidateKey = line.Substring(0, separatorIndex).Trim();
                if (!string.Equals(candidateKey, key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var value = line.Substring(separatorIndex + 1).Trim().Trim('"').Trim('\'');
                int port;
                if (int.TryParse(value, out port) && port > 0)
                {
                    return port;
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading .env: " + ex.Message);
        }

        return fallback;
    }

    private bool TryRefreshFrontendUrlFromRuntimeState()
    {
        string runtimeUrl;
        if (TryReadRuntimeStateValue("FrontendUrl", out runtimeUrl) && !string.IsNullOrWhiteSpace(runtimeUrl))
        {
            _frontendUrl = runtimeUrl.Trim();
            return true;
        }

        string runtimePort;
        if (TryReadRuntimeStateValue("WebPort", out runtimePort))
        {
            int port;
            if (int.TryParse(runtimePort, out port) && port > 0)
            {
                _frontendUrl = "http://127.0.0.1:" + port + "/";
                return true;
            }
        }

        return false;
    }

    private bool TryReadRuntimeStateValue(string key, out string value)
    {
        value = null;
        try
        {
            if (!File.Exists(_runtimeStatePath))
            {
                return false;
            }

            var content = File.ReadAllText(_runtimeStatePath);
            var pattern =
                "\"" + Regex.Escape(key) + "\"\\s*:\\s*(?:\"(?<text>(?:\\\\.|[^\"])*)\"|(?<number>\\d+)|null)";
            var match = Regex.Match(content, pattern);
            if (!match.Success)
            {
                return false;
            }

            if (match.Groups["text"].Success)
            {
                value = Regex.Unescape(match.Groups["text"].Value);
                return true;
            }

            if (match.Groups["number"].Success)
            {
                value = match.Groups["number"].Value;
                return true;
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading runtime state: " + ex.Message);
        }

        return false;
    }

    private void StartManagedServices()
    {
        var startScript = Path.Combine(_projectRoot, "scripts", "start-windows.ps1");
        if (!File.Exists(startScript))
        {
            throw new FileNotFoundException("Missing startup script: " + startScript);
        }

        var info = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + startScript + "\" -Quick",
            WorkingDirectory = _projectRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        _serviceHostProcess = new Process
        {
            StartInfo = info,
            EnableRaisingEvents = true,
        };

        _serviceHostProcess.OutputDataReceived += (_, eventArgs) =>
        {
            if (!string.IsNullOrEmpty(eventArgs.Data))
            {
                AppendLog("[start] " + eventArgs.Data);
            }
        };

        _serviceHostProcess.ErrorDataReceived += (_, eventArgs) =>
        {
            if (!string.IsNullOrEmpty(eventArgs.Data))
            {
                AppendLog("[start:err] " + eventArgs.Data);
            }
        };

        _serviceHostProcess.Exited += (_, __) =>
        {
            AppendLog("Service host exited with code " + _serviceHostProcess.ExitCode + ".");
        };

        if (!_serviceHostProcess.Start())
        {
            throw new InvalidOperationException("Failed to start local services.");
        }

        _serviceHostProcess.BeginOutputReadLine();
        _serviceHostProcess.BeginErrorReadLine();
        AppendLog("Started service host via start-windows.ps1.");
    }

    private async Task WaitForFrontendAsync(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            TryRefreshFrontendUrlFromRuntimeState();
            if (await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                return;
            }

            if (_serviceStartedByLauncher && _serviceHostProcess != null && _serviceHostProcess.HasExited)
            {
                throw new InvalidOperationException(
                    "Local services exited before the UI became ready. Check " + _logFilePath + " for details."
                );
            }

            await Task.Delay(1000).ConfigureAwait(true);
        }

        throw new TimeoutException("Timed out waiting for the frontend at " + _frontendUrl);
    }

    private Task<bool> IsFrontendReadyAsync()
    {
        return Task.Run(() =>
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(_frontendUrl);
                request.Method = "GET";
                request.Timeout = 1500;
                request.ReadWriteTimeout = 1500;
                request.AllowAutoRedirect = true;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        });
    }

    private async Task InitializeWebViewAsync()
    {
        var userDataFolder = Path.Combine(_projectRoot, ".cat-cafe", "webview2");
        Directory.CreateDirectory(userDataFolder);

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = userDataFolder,
            },
        };

        Controls.Clear();
        Controls.Add(_webView);

        await _webView.EnsureCoreWebView2Async().ConfigureAwait(true);
        _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
        _webView.CoreWebView2.ProcessFailed += (_, eventArgs) =>
        {
            AppendLog("WebView2 process failed: " + eventArgs.ProcessFailedKind);
        };
        _webView.Source = new Uri(_frontendUrl);
    }

    private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs eventArgs)
    {
        eventArgs.Handled = true;
        try
        {
            Process.Start(new ProcessStartInfo(eventArgs.Uri) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            AppendLog("Failed to open external link: " + ex.Message);
        }
    }

    private void StopManagedServices()
    {
        try
        {
            var stopScript = Path.Combine(_projectRoot, "scripts", "stop-windows.ps1");
            if (File.Exists(stopScript))
            {
                var stopInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + stopScript + "\"",
                    WorkingDirectory = _projectRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                using (var stopProcess = Process.Start(stopInfo))
                {
                    if (stopProcess != null && !stopProcess.WaitForExit(15000))
                    {
                        stopProcess.Kill();
                    }
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed stopping services cleanly: " + ex.Message);
        }
        finally
        {
            try
            {
                if (_serviceHostProcess != null && !_serviceHostProcess.HasExited)
                {
                    _serviceHostProcess.Kill();
                    _serviceHostProcess.WaitForExit(5000);
                }
            }
            catch (Exception ex)
            {
                AppendLog("Failed terminating service host: " + ex.Message);
            }
        }
    }

    private void UpdateStatus(string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)(() => UpdateStatus(message)));
            return;
        }

        _statusLabel.Text = message;
        AppendLog(message);
    }

    private void AppendLog(string message)
    {
        lock (_logLock)
        {
            File.AppendAllText(
                _logFilePath,
                DateTime.Now.ToString("u") + " " + message + Environment.NewLine
            );
        }
    }
}
