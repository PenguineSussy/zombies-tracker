using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace LiveSplit.ZombiesTracker
{
    public sealed class AddonUpdates : IDisposable
    {
        public const string InstalledVersion = "1.0.2";
        public const string DownloadUrl = "https://doctormonty.beer/downloads/Zombies-Tracker-LiveSplit.zip";
        sealed class Release { public string latestVersion { get; set; } public string minimumVersion { get; set; } }
        readonly HttpClient http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(8), MaxResponseContentBufferSize = 8192 };
        Task<string> pending;
        DateTime nextCheck = DateTime.MinValue;
        string origin;
        public string Status = "Addon " + InstalledVersion + " - update check pending.";
        public static string Describe(string installed, string latest, string minimum)
        {
            Version current, available, required;
            if (!Version.TryParse(installed, out current) || !Version.TryParse(latest, out available) || !Version.TryParse(minimum, out required) || required > available)
                throw new InvalidOperationException("Invalid update information.");
            if(current < required) return "Important update: addon " + latest + " is available (installed " + installed + "). Update after your run for compatibility fixes.";
            if(current < available) return "Addon " + latest + " is available (installed " + installed + "). Update after your run.";
            return "Addon " + installed + " - up to date.";
        }
        async Task<string> Fetch(Uri server)
        {
            try {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                var response = await http.GetAsync(new Uri(server, "/api/addon-release")).ConfigureAwait(false);
                using(response) {
                    response.EnsureSuccessStatusCode();
                    var release = new JavaScriptSerializer().Deserialize<Release>(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
                    return Describe(InstalledVersion, release.latestVersion, release.minimumVersion);
                }
            } catch { return "Addon " + InstalledVersion + " - update check unavailable; tracking is unaffected."; }
        }
        public void Tick(string server)
        {
            // Results are applied by the existing UI timer. No layout settings are changed.
            if(pending != null) { if(!pending.IsCompleted) return; Status=pending.Result; pending=null; }
            if(origin != server) { origin=server; nextCheck=DateTime.MinValue; }
            if(DateTime.UtcNow < nextCheck) return;
            nextCheck=DateTime.UtcNow.AddHours(6);
            try { pending=Fetch(UploadQueue.ValidateServer(server)); }
            catch { Status="Update check unavailable: check the tracker server address."; }
        }
        public void Dispose() { http.Dispose(); }
    }
}
