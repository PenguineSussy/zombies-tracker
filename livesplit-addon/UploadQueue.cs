using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace LiveSplit.ZombiesTracker
{
    // No credentials in the queue. DPAPI also protects checkpoint history at rest.
    public sealed class UploadQueue : IDisposable
    {
        readonly object gate = new object();
        readonly List<Snapshot> queue;
        readonly string file;
        readonly HttpClient http;
        readonly Uri endpoint;
        readonly CancellationTokenSource cancel = new CancellationTokenSource();
        readonly FileStream owner;
        Task worker;
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16000000 };
        volatile bool sending, disposed, blocked;
        static readonly HashSet<string> owners = new HashSet<string>();
        readonly string ownerKey;
        public volatile string Status = "Ready";
        public int Count { get { lock (gate) return queue.Count; } }
        public static Uri ValidateServer(string value)
        {
            Uri uri;
            if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.AbsolutePath != "/" ||
                (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback)))
                throw new InvalidOperationException("Use an HTTPS server origin such as https://doctormonty.beer (HTTP allowed only on localhost).");
            return uri;
        }
        public UploadQueue(string server, string token, string directory) : this(server, token, directory, null) { }
#if TESTING
        public
#else
        private
#endif
        UploadQueue(string server, string token, string directory, HttpMessageHandler handler)
        {
            var origin = ValidateServer(server);
            if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Enter your private runner key.");
            string hash;
            using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(origin.AbsoluteUri + "|" + token))).Replace("-", "");
            ownerKey = hash;
            lock (owners) { if (!owners.Add(hash)) throw new InvalidOperationException("This runner already has a Zombies Tracker component in this LiveSplit process."); }
            try
            {
                // File ownership is released safely even when LiveSplit disposes on
                // a different thread. A named Mutex is owned by its creating thread.
                string locks = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZombiesTracker", "Locks");
                Directory.CreateDirectory(locks);
                owner = new FileStream(Path.Combine(locks, hash + ".lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
                Directory.CreateDirectory(directory);
                file = Path.Combine(directory, hash + ".queue");
                queue = File.Exists(file) ? json.Deserialize<List<Snapshot>>(Encoding.UTF8.GetString(Protection.Unprotect(File.ReadAllBytes(file)))) : new List<Snapshot>();
                foreach (var item in queue) item.suppressAlerts = true;
                endpoint = new Uri(origin, "/api/ingest");
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                http = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(10) };
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Trim());
            }
            catch { if (owner != null) owner.Dispose(); lock (owners) owners.Remove(hash); throw; }
        }
        void Save()
        {
            byte[] bytes = Protection.Protect(Encoding.UTF8.GetBytes(json.Serialize(queue)));
            File.WriteAllBytes(file + ".tmp", bytes);
            if (File.Exists(file)) File.Replace(file + ".tmp", file, null); else File.Move(file + ".tmp", file);
        }
        public void Enqueue(Snapshot snapshot)
        {
            lock (gate)
            {
                if (disposed) return;
                if (queue.Count >= 10000) throw new InvalidOperationException("Upload queue full. Reconnect before continuing; new updates are not being saved.");
                queue.Add(snapshot);
                try { Save(); } catch { queue.RemoveAt(queue.Count - 1); throw; }
            }
            Flush();
        }
        public void Clear()
        {
            lock (gate)
            {
                if (disposed) return;
                if (sending) throw new InvalidOperationException("Upload is in progress. Wait a moment before clearing.");
                queue.Clear(); Save(); blocked = false; Status = "Queue cleared. Reset LiveSplit before starting a new attempt.";
            }
        }
        public void Flush()
        {
            lock (gate) { if (sending || disposed || blocked || queue.Count == 0) return; sending = true;
            worker = Task.Run(async delegate {
                try
                {
                    while (!cancel.IsCancellationRequested)
                    {
                        Snapshot item;
                        lock (gate) { if (disposed) break; if (queue.Count == 0) { Status = "Connected"; break; } item = queue[0]; }
                        string body;
                        lock (gate) body = json.Serialize(item);
                        using (var content = new StringContent(body, Encoding.UTF8, "application/json"))
                        using (var response = await http.PostAsync(endpoint, content, cancel.Token).ConfigureAwait(false))
                        {
                            if (!response.IsSuccessStatusCode)
                            {
                                int code = (int)response.StatusCode;
                                if (code == 400 || code == 401 || code == 403 || code == 409 || (code >= 300 && code < 400))
                                {
                                    lock (gate) blocked = true;
                                    Status = "Upload stopped (HTTP " + code + "). Check runner key, Direct source, and category. Queue kept; see installation guide.";
                                }
                                else Status = "Server unavailable (HTTP " + code + "); saved locally, retrying.";
                                break;
                            }
                        }
                        lock (gate)
                        {
                            // A replacement may already own the persisted queue.
                            // Never acknowledge or save after releasing ownership.
                            if (disposed) break;
                            queue.RemoveAt(0);
                            try { Save(); } catch { queue.Insert(0, item); throw; }
                        }
                    }
                }
                catch (Exception) { if (!disposed) Status = "Offline or storage error; queue retained, retrying."; }
                finally { lock (gate) sending = false; }
            }); }
        }
        public void Dispose()
        {
            Task pending;
            lock (gate) {
                if (disposed) return;
                disposed = true;
                pending = worker;
                owner.Dispose();
                lock (owners) owners.Remove(ownerKey);
            }
            // Cancellation callbacks and network disposal must not block LiveSplit's
            // UI. Already-saved items are replayed safely by the next instance.
            Task.Run(async delegate {
                try { cancel.Cancel(); http.Dispose(); if (pending != null) await pending.ConfigureAwait(false); }
                catch { /* Shutdown must not surface network cancellation errors. */ }
                finally { cancel.Dispose(); }
            });
        }
    }
}

