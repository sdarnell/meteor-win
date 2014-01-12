// Executable to launch meteor after bootstrapping the local warehouse
//
// Copyright 2013 Stephen Darnell

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Text;
using System.Threading;

[assembly: AssemblyTitle("Meteor bootstrapper and launcher")]
[assembly: AssemblyDescription("Downloads the Meteor bootstrap package and launches it")]
[assembly: AssemblyCompany("Stephen Darnell")]
[assembly: AssemblyProduct("Meteor")]
[assembly: AssemblyCopyright("Copyright 2013 Stephen Darnell")]
[assembly: AssemblyVersion("0.2.0.1")]
[assembly: AssemblyFileVersion("0.2.0.1")]

namespace LaunchMeteor
{
    class Program
    {
        private const string BOOTSTRAP_URL = "https://win-install.meteor.com/bootstrap/meteor-bootstrap-Windows_i686.tar.gz";

        private const string METEOR_WAREHOUSE_DIR = "METEOR_WAREHOUSE_DIR";

        private static bool looksLikeNewConsole = false;
        private static int consoleWindowWidth = 80;

        private static void InitialiseConsoleInfo()
        {
            // Try/catch needed when not connected to a console
            try
            {
                looksLikeNewConsole = Console.CursorLeft == 0 && Console.CursorTop == 0;
                consoleWindowWidth = Console.WindowWidth;
            } catch {}
        }

        static void Main(string[] args)
        {
            InitialiseConsoleInfo();

            // Avoid console vanishing without warning if invoked from a non-console app
            AppDomain.CurrentDomain.UnhandledException += (sender, handlerArgs) =>
                {
                    Console.WriteLine("Unexpected exception: {0}", handlerArgs.ExceptionObject);
                    Exit(1);
                };

            // Check if we're running from a git checkout
            var root = AppDomain.CurrentDomain.BaseDirectory;
            if (Directory.Exists(Path.Combine(root, ".git")) &&
                Directory.Exists(Path.Combine(root, "dev_bundle\\lib\\node_modules")) &&
                File.Exists(Path.Combine(root, "tools\\meteor.js")) &&
                File.Exists(Path.Combine(root, "dev_bundle\\bin\\node.exe")))
            {
                Environment.SetEnvironmentVariable("NODE_PATH", Path.Combine(root, "dev_bundle\\lib\\node_modules"));
                Exec(Path.Combine(root, "dev_bundle\\bin\\node.exe"), Path.Combine(root, "tools\\meteor.js"), args);
            }

            // Otherwise use the warehouse (bootstrapping it if necessary)
            var warehouse = Environment.GetEnvironmentVariable(METEOR_WAREHOUSE_DIR);
            if (warehouse == null)
            {
                var home = Environment.GetEnvironmentVariable("LOCALAPPDATA") ??
                           Environment.GetEnvironmentVariable("APPDATA");
                warehouse = Path.Combine(home, ".meteor");
                Environment.SetEnvironmentVariable(METEOR_WAREHOUSE_DIR, warehouse);
            }

            if (!File.Exists(Path.Combine(warehouse, "meteor.bat")))
            {
                if (Directory.Exists(warehouse))
                {
                    Console.WriteLine("'{0}' exists, but does not contain a meteor.bat", warehouse);
                    Console.WriteLine("\nRemove it and try again.");
                    Exit(1);
                }
                BootstrapWarehouse(warehouse);
            }

            // Find latest tools in the warehouse and start meteor from there
            var latest = File.ReadAllText(Path.Combine(warehouse, "tools\\latest")).Trim();
            var tools = Path.Combine(Path.Combine(warehouse, "tools"), latest);

            Environment.SetEnvironmentVariable("NODE_PATH", Path.Combine(tools, "lib\\node_modules"));
            Exec(Path.Combine(tools, "bin\\node.exe"), Path.Combine(tools, "tools\\meteor.js"), args);
        }

        #region Executing child processes

        private static void Exec(string command, string extra, string[] args)
        {
            if (extra != null)
            {
                var list = new List<string>(args);
                list.Insert(0, extra);
                args = list.ToArray();
            }
            string commandLine = string.Join(" ", Array.ConvertAll<string, string>(args, QuoteArg));
            if (!File.Exists(command))
            {
                Console.WriteLine("Unable to find executable for command:");
                Console.WriteLine("  {0} {1}", command, commandLine);
                Exit(1);
            }
            var child = Process.Start(new ProcessStartInfo(command, commandLine) { UseShellExecute = false });
            child.WaitForExit();
            Exit(child.ExitCode);
        }

        private static string QuoteArg(string unquoted)
        {
            if (unquoted.Length > 0 && unquoted.IndexOfAny(" \t\n\v\"".ToCharArray()) == -1)
                return unquoted;
            var result = new StringBuilder("\"");
            int slashes = 0;
            foreach (var ch in unquoted)
            {
                if (ch == '"') // Double up any slashes and escape the quote
                {
                    while (slashes-- >= 0) result.Append('\\');
                }
                result.Append(ch);
                slashes = (ch == '\\') ? slashes + 1 : 0;
            }
            return result.Append('"').ToString();
        }

        public static void Exit(int exitCode)
        {
            if (looksLikeNewConsole)
            {
                Console.WriteLine("\nPlease press any key to exit.");
                Console.ReadKey(true);
            }
            Environment.Exit(exitCode);
        }

        #endregion

        #region Boostrap the warehouse

        private static void BootstrapWarehouse(string warehouse)
        {
            Console.WriteLine("Downloading initial Meteor files...");
            DownloadDataCompletedEventArgs download = null;
            var complete = new AutoResetEvent(false);
            var barWidth = Console.WindowWidth - 5;
            using (var client = new WebClient())
            {
                if (client.Proxy != null)
                {
                    client.Proxy.Credentials = CredentialCache.DefaultCredentials;
                }
                client.UseDefaultCredentials = true;
                client.DownloadProgressChanged += (sender, e) =>
                    {
                        var sb = new StringBuilder();
                        sb.AppendFormat("\r{0:00} ", e.ProgressPercentage);
                        int blobs = (barWidth * e.ProgressPercentage) / 100;
                        for (int i = 0; i < barWidth; i++) sb.Append(i < blobs ? '#' : '-');
                        Console.Write(sb.ToString());
                    };
                client.DownloadDataCompleted += (sender, e) =>
                    {
                        download = e;
                        complete.Set();
                    };
                client.DownloadDataAsync(new Uri(BOOTSTRAP_URL));
            }
            complete.WaitOne();
            if (download.Error != null)
                throw download.Error;

            if (download.Result.Length < 10 * 1024 * 1024 ||
                (download.Result[0] != 0x1f || download.Result[1] != 0x8b))
            {
                Console.WriteLine("Unexpected data returned from: {0}", BOOTSTRAP_URL);
                Exit(1);
            }

            Console.WriteLine("   \rDownload complete ({0:#.#} MB)", download.Result.Length / (1024.0 * 1024.0));
            Console.WriteLine("Extracting files to {0}", warehouse);

            var stream = new MemoryStream(download.Result);
            download = null;

            var tempDir = warehouse + "~";
            if (File.Exists(tempDir))
                File.Delete(tempDir);
            DirectoryDelete(tempDir);

            try
            {
                var regex = new Regex(@"^\.meteor\\");
                ExtractTgz(stream, tempDir, p => regex.Replace(p, ""));

                Directory.Move(tempDir, warehouse);
            }
            catch
            {
                DirectoryDelete(tempDir);
                throw;
            }
            Console.WriteLine("Files extracted successfully\n");

            var path = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) ?? string.Empty;
            var paths = path.Split(';');
            if (!Array.Exists(paths, p => p.Equals(warehouse, StringComparison.OrdinalIgnoreCase)))
            {
                Console.WriteLine("Updating PATH to include {0}", warehouse);
                path += ((path.Length > 0) ? ";" : "") + warehouse;
                Environment.SetEnvironmentVariable("PATH", path, EnvironmentVariableTarget.User);
            }
        }

        private static void DirectoryDelete(string path)
        {
            for (int attempt = 1; Directory.Exists(path) && attempt <= 5; attempt++)
            {
                Console.WriteLine("Deleting directory: {0}", path);
                try { Directory.Delete(path, true); } catch {}
                if (Directory.Exists(path))
                    Thread.Sleep(1000);
            }

            // Throw the exception
            if (Directory.Exists(path))
                Directory.Delete(path, true);
        }

        #endregion

        #region Tar file extraction

        public static void ExtractTgz(string archive, string targetDirectory)
        {
            using (var fileStream = File.OpenRead(archive))
            {
                ExtractTgz(fileStream, targetDirectory, p => p);
            }
        }

        public static void ExtractTgz(Stream stream, string directory, Func<string, string> transform)
        {
            int totalFiles = 0, totalData = 0;
            var buffer = new byte[512];
            using (var decompressed = new GZipStream(stream, CompressionMode.Decompress))
            {
                string longName = null;
                for (int n; (n = decompressed.Read(buffer, 0, buffer.Length)) > 0; )
                {
                    if (n != buffer.Length)
                        throw new InvalidDataException("Unexpected end of TAR file");

                    if (TarField(buffer, 257, 5) != "ustar") continue;

                    var type = (TarType)buffer[156];
                    var length = Convert.ToInt32(TarField(buffer, 124, 12).Trim(), 8);
                    var link = TarField(buffer, 157, 100);
                    var path = longName ?? Path.Combine(TarField(buffer, 345, 155), TarField(buffer, 0, 100));
                    longName = null;
                    if (type == TarType.LongName)
                    {
                        var data = new MemoryStream(length);
                        for (; length > 0; length -= buffer.Length)
                        {
                            if (decompressed.Read(buffer, 0, buffer.Length) != buffer.Length)
                                throw new InvalidDataException("Unexpected end of TAR file");
                            data.Write(buffer, 0, Math.Min(length, buffer.Length));
                        }
                        longName = TarField(data.ToArray(), 0, (int)data.Length);
                        continue;
                    }

                    //Console.WriteLine("{0} {1} {2}", type, length.ToString().PadLeft(9), path);
                    if (type == TarType.AltReg || type == TarType.Reg || type == TarType.Contig ||
                        type == TarType.Sym || type == TarType.Lnk)
                    {
                        if (((++totalFiles) & 0xF) == 0) Console.Write(".");

                        path = path.Replace('/', '\\');
                        if (("\\" + path + "\\").Contains("\\..\\"))
                            throw new InvalidDataException("Filenames containing '..' are not allowed");

                        path = Path.Combine(directory, transform(path));
                        try
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(path));
                            using (var fstream = new FileStream(path, FileMode.CreateNew))
                            {
                                if (type == TarType.Lnk || type == TarType.Sym)
                                {
                                    var data = Encoding.UTF8.GetBytes(link);
                                    fstream.Write(data, 0, data.Length);
                                    length = 0;
                                }

                                totalData += length;
                                for (; length > 0; length -= buffer.Length)
                                {
                                    if (decompressed.Read(buffer, 0, buffer.Length) != buffer.Length)
                                        throw new InvalidDataException("Unexpected end of TAR file");
                                    fstream.Write(buffer, 0, Math.Min(length, buffer.Length));
                                }
                            }
                        }
                        catch
                        {
                            Console.WriteLine();
                            Console.WriteLine("Error processing path: {0}", path);
                            throw;
                        }
                    }
                }
                Console.WriteLine("\nExtracted {0} files ({1:#.#} MB)", totalFiles, totalData / (1024.0 * 1024.0));
            }
        }

        private enum TarType : int { AltReg = 0, Reg = '0', Lnk = '1', Sym = '2', Chr = '3', Blk = '4', Dir = '5', Fifo = '6', Contig = '7', LongName = 'L' }

        private static string TarField(byte[] buffer, int start, int len)
        {
            var str = Encoding.UTF8.GetString(buffer, start, len);
            int pos = str.IndexOf('\0');
            return pos < 0 ? str : str.Substring(0, pos);
        }

        #endregion
    }
}
