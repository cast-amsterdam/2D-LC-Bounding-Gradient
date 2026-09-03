using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;

namespace BG2DLCLauncher;

internal static class Program
{
    private const string ResourceName = "BG2DLC.AppBundle.zip";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr window, string text, string caption, uint type);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            if (args.Any(argument => argument.Equals("--verify", StringComparison.OrdinalIgnoreCase)))
            {
                using Stream verificationBundle = assembly.GetManifestResourceStream(ResourceName)
                    ?? throw new InvalidOperationException("The embedded application bundle is missing.");
                using ZipArchive verificationArchive = new(verificationBundle, ZipArchiveMode.Read);
                bool complete = verificationArchive.GetEntry("index.html") is not null
                    && verificationArchive.GetEntry("assets/bg2dlc.js") is not null
                    && verificationArchive.GetEntry("assets/bg2dlc.css") is not null;
                return complete ? 0 : 2;
            }

            string version = assembly.GetName().Version?.ToString(3) ?? "current";
            string appDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "2D-LC Bounding Gradient",
                version);
            string indexPath = Path.Combine(appDirectory, "index.html");
            string readyMarker = Path.Combine(appDirectory, ".ready");

            if (!File.Exists(indexPath) || !File.Exists(readyMarker))
            {
                Directory.CreateDirectory(appDirectory);
                using Stream bundle = assembly.GetManifestResourceStream(ResourceName)
                    ?? throw new InvalidOperationException("The embedded application bundle is missing.");
                using ZipArchive archive = new(bundle, ZipArchiveMode.Read);
                archive.ExtractToDirectory(appDirectory, overwriteFiles: true);
                File.WriteAllText(readyMarker, version);
            }

            Process.Start(new ProcessStartInfo(indexPath) { UseShellExecute = true });
            return 0;
        }
        catch (Exception exception)
        {
            MessageBox(IntPtr.Zero, exception.Message, "2D-LC Bounding Gradient", 0x10);
            return 1;
        }
    }
}
