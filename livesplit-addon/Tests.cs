using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Net;
using System.Net.Http;
using System.Windows.Forms;
using System.Xml;
using LiveSplit.Model;
using LiveSplit.ZombiesTracker;

class Tests
{
    sealed class DelayedUpload : HttpMessageHandler {
        public readonly TaskCompletionSource<HttpResponseMessage> Response = new TaskCompletionSource<HttpResponseMessage>();
        public readonly ManualResetEvent Started = new ManualResetEvent(false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
            Started.Set(); return Response.Task; // Deliberately ignores cancellation.
        }
    }
    static void UseLayout(LiveSplitState state, TrackerComponent component) {
        state.Layout = new LiveSplit.UI.Layout { Settings=new LiveSplit.Options.SettingsFactories.StandardLayoutSettingsFactory().Create() };
        if(component!=null)state.Layout.LayoutComponents.Add(new LiveSplit.UI.Components.LayoutComponent("LiveSplit.ZombiesTracker.dll",component));
    }
    static int assertions;
    static void Check(bool condition, string name) { assertions++; if (!condition) throw new Exception("FAIL: " + name); }
    static Detection Detect(string title, params string[] names)
    { return Detector.Detect("Call of Duty: Black Ops III", title, "", new Dictionary<string,string>(), names, ""); }
    static void Pump(int ms) { var until = DateTime.UtcNow.AddMilliseconds(ms); while (DateTime.UtcNow < until) { Application.DoEvents(); Thread.Sleep(10); } }
    [STAThread] static int Main(string[] args)
    {
        try
        {
            var factory = new Factory();
            Check(factory.Version == new Version(AddonUpdates.InstalledVersion), "factory and upload versions agree");
            Check(factory.XMLURL == factory.UpdateURL + "update.LiveSplit.ZombiesTracker.xml", "updater manifest URL");
            var manifest = new XmlDocument();
            manifest.Load(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "../update/update.LiveSplit.ZombiesTracker.xml"));
            var release = UpdateManager.Update.Parse(manifest.DocumentElement.FirstChild);
            Check(release.Version == factory.Version, "LiveSplit parses release manifest version");
            Check(release.FileChanges.Count == 1 && release.FileChanges[0].Path == "Components/LiveSplit.ZombiesTracker.dll" && release.FileChanges[0].Status == UpdateManager.ChangeStatus.Changed, "updater replaces only tracker DLL");
            var aliasRows=new[]{new SplitLink{Map="der-eisendrache",Source="My split",Target="Rocket"},new SplitLink{Map="revelations",Source="My split",Target="Exit"}};
            Check(ManualAliases.Resolve(aliasRows,"der-eisendrache",new[]{"My split","R7"},new[]{"Bow","Crackle"})[0]=="Rocket","manual alias overrides autosplitter");
            Check(ManualAliases.Resolve(aliasRows,"der-eisendrache",new[]{"My split","R7"},new[]{"Bow","Crackle"})[1]=="Crackle","unmapped split retains automatic hint");
            Check(ManualAliases.Resolve(aliasRows,"revelations",new[]{"My split"},null)[0]=="Exit","aliases are map scoped");
            Check(!ManualAliases.Targets("origins").Contains("Fire Dupe"),"removed milestones stay removed");
            Check(ManualAliases.Targets("super-easter-egg").Contains("Der Eisendrache - Rocket"),"Super EE has map-prefixed checkpoints");
            var superLinks=ManualAliases.Core.Select((id,i)=>new SplitLink{Map="super-easter-egg",Source="Custom "+i,Target=Detector.Maps.First(m=>m.Id==id).Name+" - Complete"}).ToArray();
            Check(Detector.Detect("Super Easter Egg","","",new Dictionary<string,string>(),superLinks.Select(r=>r.Source),"",superLinks).Success,"custom Super EE completion aliases pass detection");
            bool collision=false;try{ManualAliases.Resolve(aliasRows,"der-eisendrache",new[]{"My split","Rocket"},null);}catch{collision=true;}Check(collision,"duplicate mapped checkpoints blocked");
            using(var editor=new AliasEditor()){editor.LoadLinks(aliasRows);Check(editor.Read().Count==2,"alias editor roundtrip retains every map");}
            Check(AddonUpdates.Describe("0.2.8","0.2.9","0.2.7").Contains("is available"),"optional update notice");
            Check(AddonUpdates.Describe("0.2.6","0.2.9","0.2.7").Contains("Important update"),"important update notice");
            Check(AddonUpdates.Describe("0.2.10","0.2.9","0.2.7").Contains("up to date"),"numeric version ordering");
            bool invalidRelease=false;try{AddonUpdates.Describe("0.2.8","bad","0.2.7");}catch{invalidRelease=true;}Check(invalidRelease,"invalid manifest rejected");
            foreach(var map in Detector.Maps.Where(m=>m.Enabled&&m.Id!="super-easter-egg"))
                Check(Detector.Detect(map.Name,"","",new Dictionary<string,string>(),new string[0],"").Map==map.Id,"map-only title "+map.Id);
            Check(Detector.RunCategory("","","der-eisendrache")=="Mega Gums","empty category defaults Mega");
            Check(Detector.RunCategory("","","ascension")=="Any%","Any only category default");
            Check(Detector.RunCategory("No Gums Mega Gums","","der-eisendrache")==null,"conflict not defaulted");
            Check(Detector.RunCategory("Typo","","der-eisendrache")==null,"nonempty unknown category not defaulted");
            var settings=new XmlDocument();settings.LoadXml("<Settings><Split>True</Split><CustomSettings><Setting id='zm_castle'>True</Setting><Setting id='Bow'>False</Setting><Setting id='Rocket Test TP'>True</Setting><Setting id='First TP'>True</Setting></CustomSettings></Settings>");
            var order=new Dictionary<int,string>{{0,"Bow"},{1,"Rocket Test TP"},{2,"First TP"}};
            Check(AutosplitBridge.Select(order,settings.DocumentElement,"zm_castle",2).SequenceEqual(new[]{"Rocket Test TP","First TP"}),"selected ASL order");
            Check(AutosplitBridge.Select(order,settings.DocumentElement,"zm_castle",3)==null,"extra manual split disables index mapping");
            Check(AutosplitBridge.Select(order,settings.DocumentElement,"zm_zod",2)==null,"other map cannot borrow settings");
            Check(AutosplitBridge.Compatible("der-eisendrache",new[]{"Penguine Eats Bread","TP"},new[]{"Rocket Test TP","First TP"}),"custom names with consistent anchors");
            Check(!AutosplitBridge.Compatible("der-eisendrache",new[]{"Bow","TP"},new[]{"Rocket Test TP","First TP"}),"contradictory named anchor rejected");
            foreach (var map in Detector.Maps.Where(m => m.Enabled && m.Id != "super-easter-egg")) Check(Detect(map.Name + " Any% Solo").Map == map.Id, "map " + map.Name);
            Check(!Detector.CategoriesForMap("zetsubou-no-shima").Contains("No Gums"), "ZNS category restriction");
            Check(!Detector.CategoriesForMap("super-easter-egg").Contains("No Gums"), "Super EE category restriction");
            Check(Detector.CategoriesForMap("ascension").SequenceEqual(new[]{"Any%"}) && Detector.CategoriesForMap("shangri-la").SequenceEqual(new[]{"Any%"}), "Any percent only maps");
            var superSplits = new[]{"SOE - Complete", "The Giant - Complete", "DE - Bow", "DE - Complete", "ZNS - Complete", "GK - Complete", "Revelations - Complete"};
            Check(Detect("Super Easter Egg - Classic Gums - Solo", superSplits).Map == "super-easter-egg", "six map detection");
            Check(!Detect("Super EE", superSplits.Where(n => !n.StartsWith("The Giant")).ToArray()).Success, "Giant required");
            Check(Detector.ValidateSuper(superSplits.Reverse().ToArray()) != null, "Revelations must end run");
            Check(Detector.ValidateSuper(superSplits.Concat(new[]{"Bow"}).ToArray()) != null, "prefix required");
            Check(Detector.Stage("DE - Bow", false) == "der-eisendrache" && Detector.Stage("DE - Bow", true) == null, "checkpoint not completion");
            Check(Detect("DE - No Gums - Solo").Map == "der-eisendrache", "abbreviation");
            Check(!Detect("Moon + Origins").Success, "conflict");
            Check(!Detect("Kino der Toten").Success, "disabled");
            Check(!Detect("Easter Egg", "Bow", "Power", "Boss").Success, "generic splits");
            Check(Detect("Easter Egg", "Lightning Bow", "Wisps").Map == "der-eisendrache", "distinctive pair");
            Check(!Detect("Easter Egg", "Lightning Bow", "Wisps", "KT4", "Masamune").Success, "signature conflict");
            Check(Detect("Der Eisendrache Solo 2P").NonSolo, "contradictory multiplayer");
            Check(Detect("Der Eisendrache Co-op").NonSolo, "coop");
            Check(!Detector.Detect("Call of Duty Black Ops II", "Origins", "", new Dictionary<string,string>(), new string[0], "").Success, "wrong game");
            foreach (var game in new[]{"", "Call of Duty: Black Ops 4", "Call of Duty: Black Ops II", "Minecraft", "BO3 custom game"})
                foreach (var selected in new[]{"", "der-eisendrache"})
                    Check(!Detector.Detect(game, "Der Eisendrache Mega Gums", "DE", new Dictionary<string,string>(), new[]{"Lightning Bow", "Wisps"}, selected).Success, "reject unsupported game despite BO3 map hints/override: " + game);
            foreach (var game in new[]{"BO3", "Black Ops 3", "Black Ops III", "Call of Duty: Black Ops III"})
                Check(Detector.Detect(game,"DE Mega Gums","",new Dictionary<string,string>(),new string[0],"der-eisendrache").Success,"supported game with matching override: " + game);
            Check(!Detector.Detect("BO3","Dead of the Night","",new Dictionary<string,string>(),new[]{"Power","Boss"},"der-eisendrache").Success,"unknown map cannot inherit override");
            Check(!Detector.Detect("BO3","Kino der Toten","",new Dictionary<string,string>(),new string[0],"der-eisendrache").Success,"disabled map cannot inherit override");
            Check(!Detector.Detect("BO3","Origins","",new Dictionary<string,string>(),new string[0],"der-eisendrache").Success,"stale override cannot relabel supported map");
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
            run.AttemptCount = 34324;
            var countProbe = Protocol.Capture(state, new RunProfile { map="der-eisendrache", category="No Gums", players=1, timing="RealTime" }, "count-probe", 1, false, false);
            Check(countProbe.addonVersion==AddonUpdates.InstalledVersion,"snapshots report addon version");
            Check(countProbe.attemptCount == 34324 && run.AttemptCount == 34324, "saved attempt count captured without mutation");
            var model = new TimerModel { CurrentState = state };
            using(var settingsProbe=new TrackerComponent(state)) {
                var settingsDoc=new XmlDocument(); settingsDoc.LoadXml("<Settings><Enabled>False</Enabled><ProtectedToken>" + Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes("synthetic-test-key"))) + "</ProtectedToken></Settings>");
                var linksNode=settingsDoc.CreateElement("SplitAliases");linksNode.InnerText=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(aliasRows);settingsDoc.DocumentElement.AppendChild(linksNode);
                settingsProbe.SetSettings(settingsDoc.DocumentElement);
                var settingsPanel=(SettingsPanel)settingsProbe.GetSettingsControl(LiveSplit.UI.LayoutMode.Vertical);
                settingsPanel.RestoreAliasMap("der-eisendrache");
                var selectionXml=settingsProbe.GetSettings(new XmlDocument());
                Check(selectionXml["AliasEditorMap"].InnerText=="der-eisendrache","alias editor selection saved in layout");
                using(var reopened=new TrackerComponent(state)) {
                    reopened.SetSettings(selectionXml);
                    var reopenedPanel=(SettingsPanel)reopened.GetSettingsControl(LiveSplit.UI.LayoutMode.Vertical);
                    Check(reopenedPanel.AliasMap=="der-eisendrache","alias selection restored in replacement layout");
                    reopenedPanel.RestoreAliasMap("super-easter-egg");
                    Check(settingsPanel.AliasMap=="der-eisendrache","alias selection stays separate between layouts");
                    reopened.SetSettings(selectionXml);
                    Check(reopenedPanel.AliasMap=="der-eisendrache","switching back restores saved map rather than Super EE");
                    Check(reopened.GetSettings(new XmlDocument())["SplitAliases"].InnerText==selectionXml["SplitAliases"].InnerText,"restoring selection preserves aliases");
                }
                Check(settingsProbe.GetSettings(new XmlDocument())["SplitAliases"].InnerText.Contains("Rocket"),"manual aliases survive settings XML");
                string saved=settingsProbe.GetSettings(new XmlDocument()).OuterXml;
                Check(saved==settingsProbe.GetSettings(new XmlDocument()).OuterXml, "unchanged settings keep identical encrypted XML across render checks");
                settingsProbe.SetSettings(settingsProbe.GetSettings(new XmlDocument()));
                Check(saved==settingsProbe.GetSettings(new XmlDocument()).OuterXml, "layout settings roundtrip preserves encrypted XML");
                var layout=new LiveSplit.UI.Layout { Settings=new LiveSplit.Options.SettingsFactories.StandardLayoutSettingsFactory().Create() };
                layout.LayoutComponents.Add(new LiveSplit.UI.Components.LayoutComponent("LiveSplit.ZombiesTracker.dll",settingsProbe));
                var saver=new LiveSplit.UI.LayoutSavers.XMLLayoutSaver();
                int hash=saver.CreateLayoutNode(null,null,layout);
                for(int i=0;i<60;i++) if(hash!=saver.CreateLayoutNode(null,null,layout)) throw new Exception("Layout hash changed on render poll");
                Check(true,"LiveSplit layout hash stable across 60 render polls");
                settingsDoc.DocumentElement["ProtectedToken"].InnerText=Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes("replacement-test-key")));
                settingsProbe.SetSettings(settingsDoc.DocumentElement);
                Check(hash!=saver.CreateLayoutNode(null,null,layout),"changed key invalidates settings hash");
                var replacementXml=settingsProbe.GetSettings(new XmlDocument());
                Check(Encoding.UTF8.GetString(Protection.Unprotect(Convert.FromBase64String(replacementXml["ProtectedToken"].InnerText)))=="replacement-test-key","saved key updates correctly");
            }
            var profile = new RunProfile { map = "der-eisendrache", category = "No Gums", players = 1, timing = "RealTime" };
            var historyRun = new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory());
            historyRun.Add(new Segment("Rocket")); historyRun.Add(new Segment("R7")); historyRun.Add(new Segment("End"));
            historyRun[0].PersonalBestSplitTime = new Time { RealTime = TimeSpan.FromSeconds(355) };
            historyRun[0].BestSegmentTime = new Time { RealTime = TimeSpan.FromSeconds(334) };
            historyRun[1].PersonalBestSplitTime = new Time { RealTime = TimeSpan.FromSeconds(438) };
            historyRun[1].BestSegmentTime = new Time { RealTime = TimeSpan.FromSeconds(60) };
            historyRun[2].PersonalBestSplitTime = new Time { RealTime = TimeSpan.FromSeconds(1625) };
            historyRun[0].SegmentHistory[1] = new Time { RealTime = TimeSpan.FromSeconds(340) };
            historyRun[1].SegmentHistory[1] = new Time { RealTime = TimeSpan.FromSeconds(65) };
            historyRun[1].SegmentHistory[2] = new Time { RealTime = TimeSpan.FromSeconds(1) };
            historyRun[0].SegmentHistory[3] = new Time();
            historyRun[1].SegmentHistory[3] = new Time { RealTime = TimeSpan.FromSeconds(410) };
            var history = Protocol.ReadRecords(historyRun);
            Check(history.splits[0].name == "Rocket" && history.splits[0].bestSplitMs == 334000 && history.splits[0].bestSegmentMs == 334000, "Rocket best is gold, not PB comparison");
            Check(history.splits[1].bestSplitMs == 405000 && history.splits[1].bestSegmentMs == 60000, "cumulative history and segment are independent; missing prefix excluded");
            Check(history.splits[0].pbSplitMs == (long)historyRun[0].PersonalBestSplitTime.RealTime.Value.TotalMilliseconds, "PB checkpoint stays separate from best split and gold");
            Check(history.pbMs == 1625000, "PB from final Personal Best comparison");
            Check(historyRun[0].PersonalBestSplitTime.RealTime.Value.TotalSeconds == 355 && historyRun[0].BestSegmentTime.RealTime.Value.TotalSeconds == 334, "record reading does not mutate comparisons");
            model.Start(); Pump(40); model.Split();
            state.CurrentTimingMethod = TimingMethod.GameTime;
            var sample = Protocol.Capture(state, profile, "test-attempt", 1, false, false);
            Check(sample.splits.Count == 1 && sample.splits[0].name == "Bow Done" && sample.splits[0].ms > 0, "original split name / RTA despite GameTime display");
            model.Pause();
            sample = Protocol.Capture(state, profile, "test-attempt", 2, false, false);
            Check(sample.elapsedMs == (long)Math.Round(state.CurrentTime.RealTime.Value.TotalMilliseconds), "paused elapsed equals LiveSplit RTA exactly");
            Pump(40); Check(Protocol.Capture(state, profile, "test-attempt", 3, false, false).elapsedMs == sample.elapsedMs, "no independent clock during pause");
            model.Pause();
            model.SkipSplit(); sample = Protocol.Capture(state, profile, "test-attempt", 2, false, false);
            Check(!sample.complete && sample.splits.Count == 1, "skip incomplete");
            model.UndoSplit(); model.UndoSplit(); sample = Protocol.Capture(state, profile, "test-attempt", 3, false, false);
            Check(sample.splits.Count == 0, "undo removes checkpoints");
            model.Reset(false); sample = Protocol.Capture(state, profile, "test-reset", 1, false, false);
            Check(sample.phase == "NotRunning" && sample.splits.Count == 0 && sample.index == -1, "reset");
            string lifecycleDir=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ZombiesTracker-Lifecycle-"+Guid.NewGuid());
            var delayed=new DelayedUpload();
            string lifecycleKey=Guid.NewGuid().ToString();
            var oldQueue=new UploadQueue("http://localhost:1",lifecycleKey,lifecycleDir,delayed);
            oldQueue.Enqueue(sample);
            Check(delayed.Started.WaitOne(2000),"stalled upload started");
            Exception closeError=null;
            var closer=new Thread(delegate(){try{oldQueue.Dispose();oldQueue.Dispose();}catch(Exception ex){closeError=ex;}}){IsBackground=true};
            closer.Start();Check(closer.Join(1000),"close never waits for stalled HTTP upload");Check(closeError==null,"dispose is idempotent and safe from another thread");
            using(var replacementQueue=new UploadQueue("http://localhost:1",lifecycleKey,lifecycleDir)) {
                Check(replacementQueue.Count==1,"replacement immediately recovers pending upload");
                delayed.Response.SetResult(new HttpResponseMessage(HttpStatusCode.OK));
                Pump(150);
                Check(replacementQueue.Count==1,"late completion cannot acknowledge replacement queue");
            }
            using(var reopenedQueue=new UploadQueue("http://localhost:1",lifecycleKey,lifecycleDir))Check(reopenedQueue.Count==1,"late old response cannot overwrite persisted queue");
            using(var firstLayout=new TrackerComponent(state))using(var secondLayout=new TrackerComponent(state)) {
                var activeField=typeof(TrackerComponent).GetField("activated",BindingFlags.NonPublic|BindingFlags.Instance);
                UseLayout(state,firstLayout);Pump(1200);
                Check((bool)activeField.GetValue(firstLayout),"timer activates current layout without rendering callback");
                Check(!(bool)activeField.GetValue(secondLayout),"timer leaves editor clone inactive");
                state.Layout.LayoutComponents.Add(new LiveSplit.UI.Components.LayoutComponent("LiveSplit.ZombiesTracker.dll",secondLayout));
                secondLayout.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                Pump(1200);
                Check(!(bool)activeField.GetValue(secondLayout) && (bool)activeField.GetValue(firstLayout),"duplicate in same layout cannot steal ownership");
                UseLayout(state,secondLayout);secondLayout.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                Check(!(bool)activeField.GetValue(firstLayout),"switching layouts deactivates previous component");
                UseLayout(state,null);Pump(1100);
                Check(!(bool)activeField.GetValue(secondLayout),"layout without addon stops old tracker");
                UseLayout(state,firstLayout);firstLayout.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                Check((bool)activeField.GetValue(firstLayout),"returning to saved layout reactivates tracker");
                var newRun=new Run(new LiveSplit.Model.Comparisons.StandardComparisonGeneratorsFactory());
                newRun.GameName=run.GameName;newRun.CategoryName=run.CategoryName;newRun.Add(new Segment("Rocket"));
                state.Run=newRun;
                typeof(TrackerComponent).GetField("frozen",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(firstLayout,"old-file");
                typeof(TrackerComponent).GetMethod("Capture",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(firstLayout,new object[]{false,false});
                Check(typeof(TrackerComponent).GetField("frozen",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(firstLayout)==null,"loading another split file clears previous attempt fingerprint");
                Check(ReferenceEquals(state.Run,newRun),"tracker never replaces the selected split file");
                state.Run=run;
            }
            if (args.Length == 2)
            {
                using (var component = new TrackerComponent(state))
                {
                    var doc = new XmlDocument(); var root = doc.CreateElement("Settings"); doc.AppendChild(root);
                    Action<string,string> set = (k,v) => { var n=doc.CreateElement(k); n.InnerText=v; root.AppendChild(n); };
                    set("Enabled","True"); set("Server",args[0]);
                    set("ProtectedToken",Convert.ToBase64String(Protection.Protect(Encoding.UTF8.GetBytes(args[1]))));
                    set("Aliases","{\"Bow Done\":\"bow\"}"); component.SetSettings(root);
                    Check(component.GetSettings(new XmlDocument())["Aliases"] == null, "legacy aliases are discarded on save");
                    using(var editorClone = new TrackerComponent(state)) {
                        editorClone.SetSettings(root);
                        Check(editorClone.GetSettings(new XmlDocument())["Enabled"].InnerText == "True", "editor clone keeps enabled settings without claiming uploader");
                    }
                    UseLayout(state,component);component.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                    Pump(200); model.Start(); Pump(100);
                    var idField=typeof(TrackerComponent).GetField("id",BindingFlags.NonPublic|BindingFlags.Instance);
                    string beforeSettings=(string)idField.GetValue(component);
                    component.SetSettings(component.GetSettings(new XmlDocument()));
                    Check((string)idField.GetValue(component)==beforeSettings, "confirming unchanged settings preserves active attempt");
                    Check(state.CurrentPhase==TimerPhase.Running && state.CurrentSplitIndex==0, "settings roundtrip never changes timer state");
                    using(var replacement=new TrackerComponent(state)) {
                    replacement.SetSettings(component.GetSettings(new XmlDocument()));
                    UseLayout(state,replacement);replacement.Update(null,state,0,0,LiveSplit.UI.LayoutMode.Vertical);
                    Check((string)idField.GetValue(replacement)==beforeSettings, "layout replacement preserves attempt identity");
                    model.Split(); model.Pause(); Pump(100); model.Pause();
                    model.SkipSplit(); model.UndoSplit(); Pump(100); model.Split(); Pump(100); model.Split(); Pump(300);
                    var exported = component.GetSettings(new XmlDocument()).OuterXml;
                    Check(!exported.Contains(args[1]), "key not stored as raw text in layout");
                    model.Reset(false); Pump(500);
                    }
                }
                string queueDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ZombiesTracker-Tests-Replay");
                using (var queue = new UploadQueue(args[0], args[1], queueDir))
                {
                    bool duplicate = false;
                    try { using (var other = new UploadQueue(args[0], args[1], queueDir)) { } } catch { duplicate = true; }
                    Check(duplicate, "duplicate component blocked");
                    var pending = Protocol.Capture(state, profile, "offline-attempt", 1, false, false);
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






