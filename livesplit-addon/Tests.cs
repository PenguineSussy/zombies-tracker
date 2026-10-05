using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Xml;
using LiveSplit.Model;
using LiveSplit.ZombiesTracker;

class Tests
{
    static int assertions;
    static void Check(bool condition, string name) { assertions++; if (!condition) throw new Exception("FAIL: " + name); }
    static Detection Detect(string title, params string[] names)
    { return Detector.Detect("Call of Duty: Black Ops III", title, "", new Dictionary<string,string>(), names, ""); }
    static void Pump(int ms) { var until = DateTime.UtcNow.AddMilliseconds(ms); while (DateTime.UtcNow < until) { Application.DoEvents(); Thread.Sleep(10); } }
    [STAThread] static int Main(string[] args)
    {
        try
        {
            foreach (var map in Detector.Maps.Where(m => m.Enabled)) Check(Detect(map.Name + " No Gums Solo").Map == map.Id, "map " + map.Name);
            Check(Detect("DE - No Gums - Solo").Map == "der-eisendrache", "abbreviation");
            Check(!Detect("Moon + Origins").Success, "conflict");
            Check(!Detect("Kino der Toten").Success, "disabled");
            Check(!Detect("Easter Egg", "Bow", "Power", "Boss").Success, "generic splits");
            Check(Detect("Easter Egg", "Lightning Bow", "Wisps").Map == "der-eisendrache", "distinctive pair");
            Check(!Detect("Easter Egg", "Lightning Bow", "Wisps", "KT4", "Masamune").Success, "signature conflict");
            Check(Detect("Der Eisendrache Solo 2P").NonSolo, "contradictory multiplayer");
            Check(Detect("Der Eisendrache Co-op").NonSolo, "coop");
            Check(!Detector.Detect("Call of Duty Black Ops II", "Origins", "", new Dictionary<string,string>(), new string[0], "").Success, "wrong game");
            Check(Detector.Detect("BO3", "Easter Egg", "", new Dictionary<string,string>{{"Map","Moon"}}, new string[0], "").Map == "moon", "metadata");
            Check(Detector.Detect("BO3", "Easter Egg", "Origins - Mega Gums", new Dictionary<string,string>(), new string[0], "").Map == "origins", "filename");
            foreach (var category in Detector.Categories) Check(Detector.Category(new[]{"DE " + category + " Solo"}, "") == category, "category " + category);
            Check(Detector.Category(new[]{"No Gums Mega Gums"}, "") == null, "category conflict");
            Check(Detector.Category(new[]{"any route"}, "") == null, "any without percent");
            bool rejected = false; try { UploadQueue.ValidateServer("http://example.com"); } catch { rejected = true; } Check(rejected, "https required");
            rejected = false; try { UploadQueue.ValidateServer("https://host.example/path"); } catch { rejected = true; } Check(rejected, "origin required");
            var run = new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory()); run.GameName = "Call of Duty: Black Ops III"; run.CategoryName = "Der Eisendrache - No Gums - Solo";
            run.Add(new Segment("Bow Done")); run.Add(new Segment("Crackle")); run.Add(new Segment("Boss"));
            var state = new LiveSplitState(run, null, null, null, null);
            var model = new TimerModel { CurrentState = state };
            var profile = new RunProfile { map = "der-eisendrache", category = "No Gums", players = 1, timing = "RealTime" };
            var aliases = new Dictionary<string,string>{{"bow done","bow"}};
            model.Start(); Pump(40); model.Split();
            state.CurrentTimingMethod = TimingMethod.GameTime;
            var sample = Protocol.Capture(state, profile, "test-attempt", 1, false, false, aliases);
            Check(sample.splits.Count == 1 && sample.splits[0].name == "bow" && sample.splits[0].ms > 0, "actual split / alias / RTA despite GameTime display");
            model.SkipSplit(); sample = Protocol.Capture(state, profile, "test-attempt", 2, false, false, aliases);
            Check(!sample.complete && sample.splits.Count == 1, "skip incomplete");
            model.UndoSplit(); model.UndoSplit(); sample = Protocol.Capture(state, profile, "test-attempt", 3, false, false, aliases);
            Check(sample.splits.Count == 0, "undo removes checkpoints");
            model.Reset(false); sample = Protocol.Capture(state, profile, "test-reset", 1, false, false, aliases);
            Check(sample.phase == "NotRunning" && sample.splits.Count == 0 && sample.index == -1, "reset");
            if (args.Length == 2)
            {
                using (var component = new TrackerComponent(state))
                {
                    var doc = new XmlDocument(); var root = doc.CreateElement("Settings"); doc.AppendChild(root);
                    Action<string,string> set = (k,v) => { var n=doc.CreateElement(k); n.InnerText=v; root.AppendChild(n); };
                    set("Enabled","True"); set("Server",args[0]);
                    set("ProtectedToken",Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes(args[1]))));
                    set("Aliases","{\"Bow Done\":\"bow\"}"); component.SetSettings(root);
                    Pump(200); model.Start(); Pump(100); model.Split(); model.Pause(); Pump(100); model.Pause();
                    model.SkipSplit(); model.UndoSplit(); Pump(100); model.Split(); Pump(100); model.Split(); Pump(300);
                    var exported = component.GetSettings(new XmlDocument()).OuterXml;
                    Check(!exported.Contains(args[1]), "key not stored as raw text in layout");
                    model.Reset(false); Pump(500);
                }
                string queueDir = Path.Combine(Path.GetTempPath(), "ZombiesTracker-Tests-Replay");
                using (var queue = new UploadQueue(args[0], args[1], queueDir))
                {
                    bool duplicate = false;
                    try { using (var other = new UploadQueue(args[0], args[1], queueDir)) { } } catch { duplicate = true; }
                    Check(duplicate, "duplicate component blocked");
                    var pending = Protocol.Capture(state, profile, "offline-attempt", 1, false, false, aliases);
                    queue.Enqueue(pending); Pump(200); Check(queue.Count == 1, "503 keeps event in queue");
                }
                using (var recovered = new UploadQueue(args[0], args[1], queueDir))
                {
                    Check(recovered.Count == 1, "pending event recovered from disk");
                    recovered.Flush(); Pump(500); Check(recovered.Count == 0, "recovered event acknowledged");
                }
            }
            Console.WriteLine("PASS " + assertions + " addon assertions"); return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}


